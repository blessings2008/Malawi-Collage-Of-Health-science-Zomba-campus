const { supabaseAdmin } = require('../lib/supabase');

/**
 * Records an entry in the audit log.
 * @param {object} params
 * @param {object} params.user - req.user (id, full_name)
 * @param {string} params.action - human-readable description, e.g.
 *   "moved student MCHS-0241 from Ntcheu to Zomba"
 * @param {string} params.entityType - 'student' | 'allocation' | 'cohort' | 'district' | 'period' | 'user'
 * @param {string} [params.entityId]
 * @param {object} [params.changes] - arbitrary before/after diff
 */
async function logAction({ user, action, entityType, entityId = null, changes = null }) {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    user_id: user?.id ?? null,
    user_name: user?.full_name ?? 'System',
    action,
    entity_type: entityType,
    entity_id: entityId,
    changes,
  });

  if (error) {
    // Never let audit logging failures break the primary operation —
    // log to console so it's visible in Render logs, but don't throw.
    // eslint-disable-next-line no-console
    console.error('[audit] Failed to write audit entry:', error.message);
  }
}

module.exports = { logAction };
