const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/audit-log — super_admin + admin only
router.get('/', requireRole('super_admin'), async (req, res) => {
  const { entityType, limit = 100 } = req.query;

  let query = supabaseAdmin
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 100, 500));

  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// DELETE /api/audit-log — permanently clear the audit trail (super_admin only)
router.delete('/', requireRole('super_admin'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('audit_log')
    .delete()
    .not('id', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ cleared: true });
});

module.exports = router;
