const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { notify } = require('../services/notificationService');
const { runAllocation } = require('../services/allocationEngine');

const router = express.Router();
router.use(requireAuth);

/**
 * Builds the visit-history set for each student (all districts they have
 * ever had an "Allocated" or "Locked" allocation in, across ALL periods).
 */
async function buildVisitHistory(studentIds) {
  const { data, error } = await supabaseAdmin
    .from('allocations')
    .select('student_id, district_id, status')
    .in('student_id', studentIds)
    .in('status', ['Allocated', 'Locked'])
    .not('district_id', 'is', null);

  if (error) throw error;

  const historyMap = new Map();
  for (const row of data) {
    if (!historyMap.has(row.student_id)) historyMap.set(row.student_id, []);
    historyMap.get(row.student_id).push(row.district_id);
  }
  return historyMap;
}

// POST /api/allocations/run — STEP 5: Generate Smart Allocation (preview only, not persisted)
// Body: { yearOfStudy?, cohortIds?: [], allEligible?: bool, attachmentPeriodId, districtIds: [],
//         rules: { avoidRepetition, balanceGender } }
router.post('/run', requireRole('admin', 'super_admin'), async (req, res) => {
  const { yearOfStudy, cohortIds, allEligible, attachmentPeriodId, districtIds, rules = {} } = req.body;

  if (!attachmentPeriodId || !districtIds?.length) {
    return res.status(400).json({ error: 'attachmentPeriodId and districtIds are required.' });
  }

  const { data: period, error: periodError } = await supabaseAdmin
    .from('attachment_periods')
    .select('is_locked, name')
    .eq('id', attachmentPeriodId)
    .single();

  if (periodError) return res.status(404).json({ error: 'Attachment period not found.' });
  if (period.is_locked) {
    return res.status(423).json({ error: 'This attachment period is finalized and locked.' });
  }

  // STEP 1 — select eligible students
  let studentQuery = supabaseAdmin.from('students').select('*').eq('is_active', true);
  if (!allEligible) {
    if (yearOfStudy) studentQuery = studentQuery.eq('year_of_study', yearOfStudy);
    if (cohortIds?.length) studentQuery = studentQuery.in('cohort_id', cohortIds);
  }
  const { data: students, error: studentsError } = await studentQuery;
  if (studentsError) return res.status(500).json({ error: studentsError.message });

  if (students.length === 0) {
    return res.status(400).json({ error: 'No eligible students matched the selection.' });
  }

  // STEP 3 — selected districts with capacity
  const { data: districts, error: districtsError } = await supabaseAdmin
    .from('districts')
    .select('*')
    .in('id', districtIds)
    .eq('is_active', true);
  if (districtsError) return res.status(500).json({ error: districtsError.message });

  // Account for anything already allocated in this district for this period
  const { data: existingAllocs } = await supabaseAdmin
    .from('allocations')
    .select('district_id')
    .eq('attachment_period_id', attachmentPeriodId)
    .eq('status', 'Allocated')
    .in('district_id', districtIds);

  const alreadyAllocatedByDistrict = (existingAllocs || []).reduce((acc, a) => {
    acc[a.district_id] = (acc[a.district_id] || 0) + 1;
    return acc;
  }, {});

  const districtInputs = districts.map((d) => ({
    id: d.id,
    name: d.name,
    capacity: d.capacity,
    alreadyAllocated: alreadyAllocatedByDistrict[d.id] || 0,
  }));

  // Build rotation history
  const historyMap = await buildVisitHistory(students.map((s) => s.id));

  const studentInputs = students.map((s) => ({
    id: s.id,
    studentNumber: s.student_number,
    fullName: s.full_name,
    gender: s.gender,
    yearOfStudy: s.year_of_study,
    cohortId: s.cohort_id,
    visitedDistrictIds: historyMap.get(s.id) || [],
  }));

  // STEP 4 + 5 — apply rules and run the engine
  const { results, summary } = runAllocation(studentInputs, districtInputs, {
    avoidRepetition: rules.avoidRepetition !== false,
    balanceGender: rules.balanceGender !== false,
  });

  // Enrich results with names for the review table (STEP 6)
  const studentById = new Map(students.map((s) => [s.id, s]));
  const districtById = new Map(districts.map((d) => [d.id, d]));
  const previousDistrictMap = new Map();
  for (const [studentId, visited] of historyMap.entries()) {
    previousDistrictMap.set(studentId, visited[visited.length - 1]);
  }

  const enrichedResults = results.map((r) => {
    const student = studentById.get(r.studentId);
    const district = r.districtId ? districtById.get(r.districtId) : null;
    const prevDistrictId = previousDistrictMap.get(r.studentId);
    return {
      studentId: r.studentId,
      studentNumber: student.student_number,
      studentName: student.full_name,
      gender: student.gender,
      yearOfStudy: student.year_of_study,
      cohortId: student.cohort_id,
      previousDistrict: prevDistrictId ? districtById.get(prevDistrictId)?.name || null : null,
      newDistrict: district?.name || null,
      newDistrictId: r.districtId,
      rotationStatus: r.rotationStatus,
      rotationReason: r.rotationReason,
    };
  });

  res.json({
    attachmentPeriodId,
    preview: true,
    results: enrichedResults,
    summary,
  });
});

// POST /api/allocations/commit — persist a previewed allocation (still not finalized/locked)
// Body: { attachmentPeriodId, results: [ same shape as /run response.results ] }
router.post('/commit', requireRole('admin', 'super_admin'), async (req, res) => {
  const { attachmentPeriodId, results } = req.body;
  if (!attachmentPeriodId || !results?.length) {
    return res.status(400).json({ error: 'attachmentPeriodId and results are required.' });
  }

  const rows = results.map((r) => ({
    student_id: r.studentId,
    attachment_period_id: attachmentPeriodId,
    district_id: r.newDistrictId,
    status: r.newDistrictId ? 'Allocated' : 'Unallocated',
    rotation_status: r.rotationStatus,
    rotation_reason: r.rotationReason,
  }));

  const { data, error } = await supabaseAdmin
    .from('allocations')
    .upsert(rows, { onConflict: 'student_id,attachment_period_id' })
    .select();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `generated allocation for ${rows.length} student(s)`,
    entityType: 'allocation',
    entityId: attachmentPeriodId,
    changes: { count: rows.length },
  });

  const unallocated = rows.filter((r) => r.status === 'Unallocated');

  await notify({
    type: 'allocation_generated',
    title: 'Allocation Successfully Generated',
    message: `${rows.length} students processed, ${rows.length - unallocated.length} allocated.`,
    relatedEntityType: 'period',
    relatedEntityId: attachmentPeriodId,
  });

  if (unallocated.length > 0) {
    await notify({
      type: 'students_unallocated',
      title: 'Some Students Remain Unallocated',
      message: `${unallocated.length} student(s) could not be placed in this run.`,
      relatedEntityType: 'period',
      relatedEntityId: attachmentPeriodId,
    });
  }

  res.json({ committed: data.length, unallocated: unallocated.length });
});

// GET /api/allocations/:periodId — view current allocation table for a period
router.get('/:periodId', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('allocations')
    .select('*, students(student_number, full_name, gender, year_of_study, cohort_id), districts(name)')
    .eq('attachment_period_id', req.params.periodId);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/allocations/:id/adjust — manual reassignment (admin+), with audit trail
// Body: { newDistrictId, confirmed: bool }
router.put('/:id/adjust', requireRole('admin', 'super_admin'), async (req, res) => {
  const { newDistrictId, confirmed } = req.body;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('allocations')
    .select('*, students(student_number, full_name), districts(name), attachment_periods(is_locked, name)')
    .eq('id', req.params.id)
    .single();

  if (fetchError) return res.status(404).json({ error: 'Allocation not found.' });
  if (existing.attachment_periods?.is_locked) {
    return res.status(423).json({ error: 'This allocation is finalized and locked.' });
  }

  // Check if the student previously visited the target district — surface the warning
  const { data: pastVisits } = await supabaseAdmin
    .from('allocations')
    .select('district_id, attachment_periods(name)')
    .eq('student_id', existing.student_id)
    .eq('district_id', newDistrictId)
    .in('status', ['Allocated', 'Locked']);

  if (pastVisits?.length > 0 && !confirmed) {
    return res.status(409).json({
      requiresConfirmation: true,
      warning: `This student was previously allocated to this district during: ${pastVisits
        .map((v) => v.attachment_periods?.name)
        .join(', ')}`,
    });
  }

  const { data: newDistrict } = await supabaseAdmin
    .from('districts')
    .select('name')
    .eq('id', newDistrictId)
    .single();

  const { data: updated, error } = await supabaseAdmin
    .from('allocations')
    .update({
      district_id: newDistrictId,
      status: 'Allocated',
      is_manual_override: true,
      rotation_status: pastVisits?.length > 0 ? 'Repeat Allocation' : 'New District',
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  const actionText = `moved student ${existing.students.student_number} from ${
    existing.districts?.name || 'Unallocated'
  } to ${newDistrict?.name}`;

  await logAction({
    user: req.user,
    action: actionText,
    entityType: 'allocation',
    entityId: updated.id,
    changes: { from: existing.district_id, to: newDistrictId },
  });

  await notify({
    type: 'manual_change',
    title: 'Manual Allocation Change',
    message: actionText,
    relatedEntityType: 'allocation',
    relatedEntityId: updated.id,
  });

  res.json(updated);
});

// POST /api/allocations/:periodId/finalize — lock the period (admin+)
router.post('/:periodId/finalize', requireRole('admin', 'super_admin'), async (req, res) => {
  const { data: allocations, error } = await supabaseAdmin
    .from('allocations')
    .select('id, status, district_id')
    .eq('attachment_period_id', req.params.periodId);

  if (error) return res.status(500).json({ error: error.message });

  const unallocated = allocations.filter((a) => a.status === 'Unallocated');
  if (unallocated.length > 0) {
    return res.status(422).json({
      error: 'Cannot finalize: unresolved unallocated students remain.',
      unallocatedCount: unallocated.length,
    });
  }

  const { error: updateError } = await supabaseAdmin
    .from('allocations')
    .update({
      status: 'Locked',
      finalized: true,
      finalized_at: new Date().toISOString(),
      finalized_by: req.user.id,
    })
    .eq('attachment_period_id', req.params.periodId);

  if (updateError) return res.status(400).json({ error: updateError.message });

  const { data: period, error: periodError } = await supabaseAdmin
    .from('attachment_periods')
    .update({ is_locked: true, locked_at: new Date().toISOString(), locked_by: req.user.id, status: 'Current' })
    .eq('id', req.params.periodId)
    .select()
    .single();

  if (periodError) return res.status(400).json({ error: periodError.message });

  await logAction({
    user: req.user,
    action: `finalized allocation for "${period.name}"`,
    entityType: 'period',
    entityId: period.id,
  });

  await notify({
    type: 'allocation_finalized',
    title: 'Allocation Finalized Successfully',
    message: `The allocation for "${period.name}" has been locked.`,
    relatedEntityType: 'period',
    relatedEntityId: period.id,
  });

  res.json({ finalized: true, period });
});

// POST /api/allocations/:periodId/unlock — super_admin only
router.post('/:periodId/unlock', requireRole('super_admin'), async (req, res) => {
  const { data: period, error } = await supabaseAdmin
    .from('attachment_periods')
    .update({ is_locked: false })
    .eq('id', req.params.periodId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin
    .from('allocations')
    .update({ status: 'Allocated' })
    .eq('attachment_period_id', req.params.periodId)
    .eq('status', 'Locked');

  await logAction({
    user: req.user,
    action: `unlocked allocation for "${period.name}"`,
    entityType: 'period',
    entityId: period.id,
  });

  res.json({ unlocked: true, period });
});

// POST /api/allocations/manual — directly assign or reassign a single student
// to a district for a given period, without running the full engine.
// Restricted to super_admin, as this bypasses the standard review workflow.
// Body: { studentId, attachmentPeriodId, districtId, confirmed }
router.post('/manual', requireRole('super_admin'), async (req, res) => {
  const { studentId, attachmentPeriodId, districtId, confirmed } = req.body;

  if (!studentId || !attachmentPeriodId || !districtId) {
    return res.status(400).json({ error: 'studentId, attachmentPeriodId, and districtId are required.' });
  }

  const { data: period, error: periodError } = await supabaseAdmin
    .from('attachment_periods')
    .select('is_locked, name')
    .eq('id', attachmentPeriodId)
    .single();

  if (periodError) return res.status(404).json({ error: 'Attachment period not found.' });
  if (period.is_locked) {
    return res.status(423).json({ error: 'This attachment period is finalized and locked.' });
  }

  const { data: student, error: studentError } = await supabaseAdmin
    .from('students')
    .select('student_number, full_name')
    .eq('id', studentId)
    .single();

  if (studentError) return res.status(404).json({ error: 'Student not found.' });

  const { data: district, error: districtError } = await supabaseAdmin
    .from('districts')
    .select('name, capacity')
    .eq('id', districtId)
    .single();

  if (districtError) return res.status(404).json({ error: 'District not found.' });

  // Warn if the student previously visited this district (same pattern as /adjust)
  const { data: pastVisits } = await supabaseAdmin
    .from('allocations')
    .select('district_id, attachment_periods(name)')
    .eq('student_id', studentId)
    .eq('district_id', districtId)
    .in('status', ['Allocated', 'Locked']);

  if (pastVisits?.length > 0 && !confirmed) {
    return res.status(409).json({
      requiresConfirmation: true,
      warning: `This student was previously allocated to this district during: ${pastVisits
        .map((v) => v.attachment_periods?.name)
        .join(', ')}`,
    });
  }

  // Warn (but don't block) if the district is already at or over capacity
  const { count: currentCount } = await supabaseAdmin
    .from('allocations')
    .select('*', { count: 'exact', head: true })
    .eq('attachment_period_id', attachmentPeriodId)
    .eq('district_id', districtId)
    .eq('status', 'Allocated');

  const { data: existingAllocation } = await supabaseAdmin
    .from('allocations')
    .select('id, district_id')
    .eq('student_id', studentId)
    .eq('attachment_period_id', attachmentPeriodId)
    .maybeSingle();

  const wasAlreadyInThisDistrict = existingAllocation?.district_id === districtId;
  if (!wasAlreadyInThisDistrict && (currentCount || 0) >= district.capacity && !confirmed) {
    return res.status(409).json({
      requiresConfirmation: true,
      warning: `${district.name} is already at capacity (${currentCount}/${district.capacity}). Assign anyway?`,
    });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('allocations')
    .upsert(
      {
        student_id: studentId,
        attachment_period_id: attachmentPeriodId,
        district_id: districtId,
        status: 'Allocated',
        is_manual_override: true,
        rotation_status: pastVisits?.length > 0 ? 'Repeat Allocation' : 'New District',
        rotation_reason: pastVisits?.length > 0 ? 'Manually assigned by super administrator.' : null,
      },
      { onConflict: 'student_id,attachment_period_id' }
    )
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  const actionText = `manually allocated student ${student.student_number} (${student.full_name}) to ${district.name}`;

  await logAction({
    user: req.user,
    action: actionText,
    entityType: 'allocation',
    entityId: updated.id,
    changes: { district_id: districtId },
  });

  await notify({
    type: 'manual_change',
    title: 'Manual Allocation',
    message: actionText,
    relatedEntityType: 'allocation',
    relatedEntityId: updated.id,
  });

  res.json(updated);
});

module.exports = router;
