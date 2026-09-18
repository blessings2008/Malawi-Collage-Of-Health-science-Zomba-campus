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

// Builds the active Super Admin manual allocation map.
// If a student appears in more than one active rule, fail the allocation run
// instead of choosing a rule arbitrarily.
async function buildManualAssignments() {
  const { data: rules, error } = await supabaseAdmin
    .from('manual_allocation_rules')
    .select('id, district_id, manual_allocation_rule_students(student_id)')
    .eq('is_active', true);

  if (error) throw error;

  const assignments = new Map();
  for (const rule of rules || []) {
    for (const member of rule.manual_allocation_rule_students || []) {
      if (assignments.has(member.student_id) && assignments.get(member.student_id) !== rule.district_id) {
        const err = new Error('A student belongs to multiple active manual allocation rules with different districts.');
        err.code = 'MANUAL_RULE_CONFLICT';
        throw err;
      }
      assignments.set(member.student_id, rule.district_id);
    }
  }
  return assignments;
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

  // STEP 4 + 5 — apply normal rules plus active Super Admin manual rules.
  let manualAssignments;
  try {
    manualAssignments = await buildManualAssignments();
  } catch (err) {
    if (err.code === 'MANUAL_RULE_CONFLICT') {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Could not load manual allocation rules.' });
  }

  const { results, summary } = runAllocation(studentInputs, districtInputs, {
    avoidRepetition: rules.avoidRepetition !== false,
    balanceGender: rules.balanceGender !== false,
    manualAssignments,
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

// GET /api/allocations/manual-rules — Super Admin only
router.get('/manual-rules', requireRole('super_admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('manual_allocation_rules')
    .select('id, district_id, note, is_active, created_by, updated_by, created_at, updated_at, districts(name), manual_allocation_rule_students(student_id, students(student_number, full_name))')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json((data || []).map((rule) => ({
    ...rule,
    district_name: rule.districts?.name || 'Unknown district',
    students: (rule.manual_allocation_rule_students || []).map((m) => ({
      id: m.student_id,
      student_number: m.students?.student_number,
      full_name: m.students?.full_name,
    })),
  })));
});

// POST /api/allocations/manual-rules — create a future same-district rule
router.post('/manual-rules', requireRole('super_admin'), async (req, res) => {
  const { studentIds, districtId, note } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length < 2 || !districtId) {
    return res.status(400).json({ error: 'Select at least two students and a district.' });
  }

  const uniqueStudentIds = [...new Set(studentIds)];
  if (uniqueStudentIds.length < 2) {
    return res.status(400).json({ error: 'Select at least two different students.' });
  }

  const { data: district, error: districtError } = await supabaseAdmin
    .from('districts')
    .select('id, name, is_active')
    .eq('id', districtId)
    .single();
  if (districtError || !district?.is_active) {
    return res.status(400).json({ error: 'Selected district is not active.' });
  }

  const { data: students, error: studentError } = await supabaseAdmin
    .from('students')
    .select('id')
    .in('id', uniqueStudentIds)
    .eq('is_active', true);
  if (studentError || students?.length !== uniqueStudentIds.length) {
    return res.status(400).json({ error: 'One or more selected students are invalid or inactive.' });
  }

  const { data: conflicts } = await supabaseAdmin
    .from('manual_allocation_rule_students')
    .select('student_id, manual_allocation_rules!inner(id, district_id, is_active)')
    .in('student_id', uniqueStudentIds)
    .eq('manual_allocation_rules.is_active', true);

  if (conflicts?.length) {
    return res.status(409).json({
      error: 'One or more selected students already belong to an active manual allocation rule.',
      studentIds: conflicts.map((x) => x.student_id),
    });
  }

  const { data: rule, error: ruleError } = await supabaseAdmin
    .from('manual_allocation_rules')
    .insert({
      district_id: districtId,
      note: note?.trim() || null,
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single();

  if (ruleError) return res.status(400).json({ error: ruleError.message });

  const { error: membersError } = await supabaseAdmin
    .from('manual_allocation_rule_students')
    .insert(uniqueStudentIds.map((studentId) => ({ rule_id: rule.id, student_id: studentId })));

  if (membersError) {
    await supabaseAdmin.from('manual_allocation_rules').delete().eq('id', rule.id);
    return res.status(400).json({ error: membersError.message });
  }

  await logAction({
    user: req.user,
    action: `created manual same-district rule for ${uniqueStudentIds.length} student(s) → ${district.name}`,
    entityType: 'manual_allocation_rule',
    entityId: rule.id,
    changes: { studentIds: uniqueStudentIds, districtId, districtName: district.name, note: note?.trim() || null },
  });

  res.status(201).json({ ...rule, district_name: district.name, students: uniqueStudentIds });
});

// PUT /api/allocations/manual-rules/:id — change district, students, note, or status
router.put('/manual-rules/:id', requireRole('super_admin'), async (req, res) => {
  const { studentIds, districtId, note, isActive } = req.body;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('manual_allocation_rules')
    .select('id, district_id, is_active')
    .eq('id', req.params.id)
    .single();

  if (existingError) return res.status(404).json({ error: 'Manual allocation rule not found.' });

  const nextStudentIds = Array.isArray(studentIds) ? [...new Set(studentIds)] : null;
  if (nextStudentIds && nextStudentIds.length < 2) {
    return res.status(400).json({ error: 'A rule must contain at least two students.' });
  }

  const nextDistrictId = districtId || existing.district_id;
  const nextActive = typeof isActive === 'boolean' ? isActive : existing.is_active;

  if (nextActive) {
    const { data: district } = await supabaseAdmin
      .from('districts')
      .select('id, name, is_active')
      .eq('id', nextDistrictId)
      .single();
    if (!district?.is_active) return res.status(400).json({ error: 'Selected district is not active.' });

    if (nextStudentIds) {
      const { data: conflicts } = await supabaseAdmin
        .from('manual_allocation_rule_students')
        .select('student_id, rule_id')
        .in('student_id', nextStudentIds)
        .neq('rule_id', req.params.id);
      if (conflicts?.length) {
        const activeRuleIds = conflicts.map((x) => x.rule_id);
        const { data: activeRules } = await supabaseAdmin
          .from('manual_allocation_rules')
          .select('id')
          .in('id', activeRuleIds)
          .eq('is_active', true);
        if (activeRules?.length) {
          return res.status(409).json({
            error: 'One or more selected students already belong to another active manual allocation rule.',
            studentIds: conflicts.filter((x) => activeRules.some((r) => r.id === x.rule_id)).map((x) => x.student_id),
          });
        }
      }
    }
  }

  const updates = { updated_by: req.user.id, district_id: nextDistrictId, is_active: nextActive };
  if (typeof note === 'string') updates.note = note.trim() || null;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('manual_allocation_rules')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, districts(name)')
    .single();

  if (updateError) return res.status(400).json({ error: updateError.message });

  if (nextStudentIds) {
    const { error: deleteError } = await supabaseAdmin
      .from('manual_allocation_rule_students')
      .delete()
      .eq('rule_id', req.params.id);
    if (deleteError) return res.status(400).json({ error: deleteError.message });

    const { error: insertError } = await supabaseAdmin
      .from('manual_allocation_rule_students')
      .insert(nextStudentIds.map((studentId) => ({ rule_id: req.params.id, student_id: studentId })));
    if (insertError) return res.status(400).json({ error: insertError.message });
  }

  await logAction({
    user: req.user,
    action: `updated manual same-district rule ${req.params.id}`,
    entityType: 'manual_allocation_rule',
    entityId: req.params.id,
    changes: { studentIds: nextStudentIds, districtId: nextDistrictId, isActive: nextActive, note: updates.note },
  });

  res.json({ ...updated, district_name: updated.districts?.name || 'Unknown district' });
});

// DELETE /api/allocations/manual-rules/:id — remove rule
router.delete('/manual-rules/:id', requireRole('super_admin'), async (req, res) => {
  const { data: existing } = await supabaseAdmin
    .from('manual_allocation_rules')
    .select('id, district_id')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Manual allocation rule not found.' });

  const { error } = await supabaseAdmin
    .from('manual_allocation_rules')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `deleted manual same-district rule ${req.params.id}`,
    entityType: 'manual_allocation_rule',
    entityId: req.params.id,
    changes: { districtId: existing.district_id },
  });

  res.json({ deleted: true });
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
