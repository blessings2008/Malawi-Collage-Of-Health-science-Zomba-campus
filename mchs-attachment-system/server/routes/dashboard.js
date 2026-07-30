const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard — headline stats + district distribution for the current period
router.get('/', async (req, res) => {
  const { data: currentPeriod } = await supabaseAdmin
    .from('attachment_periods')
    .select('*')
    .eq('status', 'Current')
    .maybeSingle();

  const { count: totalStudents } = await supabaseAdmin
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: activeCohorts } = await supabaseAdmin
    .from('cohorts')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: availableDistricts } = await supabaseAdmin
    .from('districts')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  let allocatedStudents = 0;
  let unallocatedStudents = 0;
  let districtDistribution = [];

  if (currentPeriod) {
    const { data: allocations } = await supabaseAdmin
      .from('allocations')
      .select('status, district_id, districts(name, capacity)')
      .eq('attachment_period_id', currentPeriod.id);

    allocatedStudents = (allocations || []).filter((a) => a.status === 'Allocated' || a.status === 'Locked').length;
    unallocatedStudents = (allocations || []).filter((a) => a.status === 'Unallocated').length;

    const grouped = new Map();
    for (const a of allocations || []) {
      if (!a.district_id) continue;
      const key = a.district_id;
      if (!grouped.has(key)) {
        grouped.set(key, { districtId: key, name: a.districts?.name, capacity: a.districts?.capacity, count: 0 });
      }
      grouped.get(key).count += 1;
    }
    districtDistribution = [...grouped.values()].sort((a, b) => b.count - a.count);
  }

  const totalForPeriod = allocatedStudents + unallocatedStudents;

  res.json({
    currentPeriod,
    stats: {
      totalStudents: totalStudents || 0,
      activeCohorts: activeCohorts || 0,
      availableDistricts: availableDistricts || 0,
      allocatedStudents,
      unallocatedStudents,
    },
    allocationProgress: {
      allocated: allocatedStudents,
      total: totalForPeriod,
      percentComplete: totalForPeriod > 0 ? Math.round((allocatedStudents / totalForPeriod) * 1000) / 10 : 0,
    },
    districtDistribution,
  });
});

module.exports = router;
