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

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return res.status(400).json({ error: authError.message });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: authUser.user.id, full_name: fullName, email, role })
    .select()
    .single();

  if (profileError) return res.status(400).json({ error: profileError.message });

  await logAction({
    user: req.user,
    action: `created ${role} account for ${fullName} (${email})`,
    entityType: 'user',
    entityId: profile.id,
  });

  res.status(201).json(profile);
});

// PUT /api/users/:id — update role / active status (super_admin only)
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { role, isActive, fullName } = req.body;

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
  });

  res.json(data);
});

module.exports = router;
