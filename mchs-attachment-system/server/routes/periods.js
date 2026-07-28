const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();
router.use(requireAuth);

// GET /api/periods — list all, with allocation stats
router.get('/', async (req, res) => {
  const { data: periods, error } = await supabaseAdmin
    .from('attachment_periods')
    .select('*')
    .order('start_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const { data: allocations, error: allocError } = await supabaseAdmin
    .from('allocations')
    .select('attachment_period_id, status');

  if (allocError) return res.status(500).json({ error: allocError.message });

  const withStats = periods.map((p) => {
    const periodAllocations = allocations.filter((a) => a.attachment_period_id === p.id);
    return {
      ...p,
      totalStudents: periodAllocations.length,
      allocatedStudents: periodAllocations.filter((a) => a.status === 'Allocated' || a.status === 'Locked').length,
      unallocatedStudents: periodAllocations.filter((a) => a.status === 'Unallocated').length,
    };
  });

  res.json(withStats);
});

// GET /api/periods/current — convenience endpoint for dashboard header
router.get('/current', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('attachment_periods')
    .select('*')
    .eq('status', 'Current')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

// POST /api/periods — create (admin+)
router.post('/', requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, startDate, endDate, academicYear, status } = req.body;
  if (!name || !startDate || !endDate || !academicYear) {
    return res.status(400).json({ error: 'name, startDate, endDate, and academicYear are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('attachment_periods')
    .insert({
      name,
      start_date: startDate,
      end_date: endDate,
      academic_year: academicYear,
      status: status || 'Upcoming',
      created_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `created attachment period "${name}"`,
    entityType: 'period',
    entityId: data.id,
  });

  res.status(201).json(data);
});

// PUT /api/periods/:id — edit (admin+)
router.put('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('attachment_periods')
    .select('is_locked, name')
    .eq('id', req.params.id)
    .single();

  if (fetchErr) return res.status(404).json({ error: 'Attachment period not found.' });
  if (existing.is_locked) {
    return res.status(423).json({ error: 'This period is locked and cannot be edited.' });
  }

  const { name, startDate, endDate, academicYear, status } = req.body;

  const { data, error } = await supabaseAdmin
    .from('attachment_periods')
    .update({
      ...(name !== undefined && { name }),
      ...(startDate !== undefined && { start_date: startDate }),
      ...(endDate !== undefined && { end_date: endDate }),
      ...(academicYear !== undefined && { academic_year: academicYear }),
      ...(status !== undefined && { status }),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `updated attachment period "${data.name}"`,
    entityType: 'period',
    entityId: data.id,
  });

  res.json(data);
});

module.exports = router;
