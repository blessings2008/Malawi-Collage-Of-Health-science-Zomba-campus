const { supabaseAdmin } = require('../lib/supabase');

/**
 * Verifies the Supabase JWT sent as `Authorization: Bearer <token>`,
 * loads the matching profile (role, name, active flag), and attaches
 * it to req.user. Rejects disabled accounts.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token.' });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'No profile found for this account.' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    req.user = profile;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth] requireAuth error:', err);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

/**
 * Role gate. Usage: requireRole('admin', 'super_admin')
 * Per spec: lecturers are read-only (view/search/export); admin+ can write.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
