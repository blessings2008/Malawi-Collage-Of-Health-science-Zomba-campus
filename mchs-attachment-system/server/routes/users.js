const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();
router.use(requireAuth);

// GET /api/users/me — current user profile (any authenticated role)
router.get('/me', async (req, res) => {
  res.json(req.user);
});

// GET /api/users — list all staff (super_admin only)
router.get('/', requireRole('super_admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role, is_active, created_at')
    .order('full_name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/users — create a new staff account (super_admin only)
// Creates the Supabase auth user + profile row together.
router.post('/', requireRole('super_admin'), async (req, res) => {
  const { email, password, fullName, role } = req.body;
  if (!email || !password || !fullName || !role) {
    return res.status(400).json({ error: 'email, password, fullName, and role are required.' });
  }
  if (!['super_admin', 'admin', 'lecturer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(fullName).trim();
  if (!normalizedEmail || !normalizedName || String(password).length < 8) {
    return res.status(400).json({ error: 'Email and full name are required, and password must be at least 8 characters.' });
  }

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });

  if (authError) return res.status(400).json({ error: authError.message });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: authUser.user.id, full_name: fullName.trim(), email: email.trim().toLowerCase(), role })
    .select()
    .single();

  if (profileError) {
    // Avoid leaving an orphaned Supabase Auth account when profile creation fails.
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  await logAction({
    user: req.user,
    action: `created ${role} account for ${normalizedName} (${normalizedEmail})`,
    entityType: 'user',
    entityId: profile.id,
  });

  res.status(201).json(profile);
});

// PUT /api/users/:id — update role / active status (super_admin only)
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { role, isActive, fullName } = req.body;

  if (role !== undefined && !['super_admin', 'admin', 'lecturer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be a boolean.' });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .eq('id', req.params.id)
    .single();

  if (existingError) return res.status(404).json({ error: 'User not found.' });

  if (existing.id === req.user.id && (isActive === false || role === 'admin' || role === 'lecturer')) {
    return res.status(400).json({ error: 'You cannot deactivate or demote your own account.' });
  }

  const nextRole = role ?? existing.role;
  const nextActive = isActive ?? existing.is_active;

  if (existing.role === 'super_admin' && (nextRole !== 'super_admin' || !nextActive)) {
    const { count, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .eq('is_active', true);

    if (countError) return res.status(500).json({ error: 'Could not verify active Super Admin count.' });
    if ((count || 0) <= 1) {
      return res.status(400).json({ error: 'At least one active Super Admin must remain.' });
    }
  }

  const normalizedName = fullName === undefined ? existing.full_name : String(fullName).trim();
  if (!normalizedName) return res.status(400).json({ error: 'Full name cannot be empty.' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { is_active: isActive }),
      ...(fullName !== undefined && { full_name: fullName }),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `updated user account for ${data.full_name}`,
    entityType: 'user',
    entityId: data.id,
    changes: {
      before: { role: existing.role, is_active: existing.is_active, full_name: existing.full_name },
      after: { role: data.role, is_active: data.is_active, full_name: data.full_name },
    },
  });

  res.json(data);
});

module.exports = router;
