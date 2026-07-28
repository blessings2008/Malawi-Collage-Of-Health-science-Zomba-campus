const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();
router.use(requireAuth);

// Shared capacity-status helper used by dashboard + district cards
function capacityStatus(current, capacity) {
  if (capacity <= 0) return 'unknown';
  const ratio = current / capacity;
  if (current > capacity) return 'over_capacity';
  if (ratio >= 1) return 'full';
  if (ratio >= 0.85) return 'nearly_full';
  return 'available';
}

// GET /api/districts — list with live allocation counts for the current period
router.get('/', async (req, res) => {
  const { data: districts, error } = await supabaseAdmin
    .from('districts')
    .select('*')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });

  const { data: currentPeriod } = await supabaseAdmin
    .from('attachment_periods')
    .select('id')
    .eq('status', 'Current')
    .maybeSingle();

  let allocationCounts = {};
  if (currentPeriod) {
    const { data: allocations } = await supabaseAdmin
      .from('allocations')
      .select('district_id')
      .eq('attachment_period_id', currentPeriod.id)
      .eq('status', 'Allocated');

    allocationCounts = (allocations || []).reduce((acc, a) => {
      if (a.district_id) acc[a.district_id] = (acc[a.district_id] || 0) + 1;
      return acc;
    }, {});
  }

  const withStats = districts.map((d) => {
    const current = allocationCounts[d.id] || 0;
    return {
      ...d,
      currentAllocated: current,
      availableSpaces: Math.max(0, d.capacity - current),
      capacityStatus: capacityStatus(current, d.capacity),
    };
  });

  res.json(withStats);
});

// POST /api/districts — create (admin+)
router.post('/', requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, region, capacity, latitude, longitude } = req.body;
  if (!name || !region || capacity === undefined) {
    return res.status(400).json({ error: 'name, region, and capacity are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('districts')
    .insert({ name, region, capacity, latitude, longitude, created_by: req.user.id })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `added district "${name}" (capacity ${capacity})`,
    entityType: 'district',
    entityId: data.id,
  });

  res.status(201).json(data);
});

// PUT /api/districts/:id — edit / set capacity (admin+)
router.put('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, region, capacity, isActive, latitude, longitude } = req.body;

  const { data, error } = await supabaseAdmin
    .from('districts')
    .update({
      ...(name !== undefined && { name }),
      ...(region !== undefined && { region }),
      ...(capacity !== undefined && { capacity }),
      ...(isActive !== undefined && { is_active: isActive }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `updated district "${data.name}"`,
    entityType: 'district',
    entityId: data.id,
  });

  res.json(data);
});

// POST /api/districts/:id/toggle-active — activate/deactivate (admin+)
router.post('/:id/toggle-active', requireRole('admin', 'super_admin'), async (req, res) => {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('districts')
    .select('is_active, name')
    .eq('id', req.params.id)
    .single();

  if (fetchError) return res.status(404).json({ error: 'District not found.' });

  const { data, error } = await supabaseAdmin
    .from('districts')
    .update({ is_active: !existing.is_active })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `${data.is_active ? 'activated' : 'deactivated'} district "${data.name}"`,
    entityType: 'district',
    entityId: data.id,
  });

  res.json(data);
});

module.exports = router;
