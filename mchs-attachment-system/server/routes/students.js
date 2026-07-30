const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const YEAR_SEMESTER_VALUES = [
  'Year 1 - Semester 1',
  'Year 1 - Semester 2',
  'Year 2 - Semester 1',
  'Year 2 - Semester 2',
  'Year 3 - Semester 1',
  'Year 3 - Semester 2',
];
const PROGRAM_VALUES = ['Nursing and Midwifery', 'Certificate in Midwifery Technicians'];

router.use(requireAuth);

// GET /api/students — searchable, filterable list
router.get('/', async (req, res) => {
  const { search, year, cohortId, gender, districtId, status, periodId } = req.query;

  let query = supabaseAdmin
    .from('students')
    .select('*, cohorts(name)')
    .eq('is_active', true)
    .order('student_number');

  if (year) query = query.eq('year_of_study', year);
  if (cohortId) query = query.eq('cohort_id', cohortId);
  if (gender) query = query.eq('gender', gender);
  if (search) query = query.or(`full_name.ilike.%${search}%,student_number.ilike.%${search}%`);

  const { data: students, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Attach allocation status/district for the requested period — explicit
  // ?periodId= takes priority (e.g. right after a manual allocation for an
  // Upcoming period); otherwise fall back to whichever period is "Current".
  let targetPeriodId = periodId || null;
  if (!targetPeriodId) {
    const { data: currentPeriod } = await supabaseAdmin
      .from('attachment_periods')
      .select('id')
      .eq('status', 'Current')
      .maybeSingle();
    targetPeriodId = currentPeriod?.id || null;
  }

  let allocMap = {};
  if (targetPeriodId) {
    const { data: allocations } = await supabaseAdmin
      .from('allocations')
      .select('student_id, district_id, status, districts(name)')
      .eq('attachment_period_id', targetPeriodId);

    allocMap = (allocations || []).reduce((acc, a) => {
      acc[a.student_id] = a;
      return acc;
    }, {});
  }

  let enriched = students.map((s) => ({
    ...s,
    cohortName: s.cohorts?.name || null,
    currentDistrict: allocMap[s.id]?.districts?.name || null,
    currentDistrictId: allocMap[s.id]?.district_id || null,
    allocationStatus: allocMap[s.id]?.status || 'Unallocated',
  }));

  if (districtId) enriched = enriched.filter((s) => s.currentDistrictId === districtId);
  if (status) enriched = enriched.filter((s) => s.allocationStatus === status);

  res.json(enriched);
});

// GET /api/students/:id — full profile
router.get('/:id', async (req, res) => {
  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('*, cohorts(name, intake_year)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Student not found.' });
  res.json(student);
});

// GET /api/students/:id/history — clinical attachment history
router.get('/:id/history', async (req, res) => {
  const { data: history, error } = await supabaseAdmin
    .from('allocations')
    .select('*, attachment_periods(name, start_date, end_date, status), districts(name)')
    .eq('student_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const { data: allDistricts } = await supabaseAdmin
    .from('districts')
    .select('id')
    .eq('is_active', true);

  const visitedIds = new Set(history.filter((h) => h.district_id).map((h) => h.district_id));

  res.json({
    history: history.map((h) => ({
      period: h.attachment_periods?.name,
      startDate: h.attachment_periods?.start_date,
      endDate: h.attachment_periods?.end_date,
      periodStatus: h.attachment_periods?.status,
      district: h.districts?.name || null,
      allocationStatus: h.status,
      rotationStatus: h.rotation_status,
    })),
    districtsVisited: visitedIds.size,
    districtsNotYetVisited: Math.max(0, (allDistricts?.length || 0) - visitedIds.size),
  });
});

// POST /api/students — add one student (admin+)
router.post('/', requireRole('admin', 'super_admin'), async (req, res) => {
  const { studentNumber, fullName, gender, yearOfStudy, program, cohortId, phone, email } = req.body;

  if (!studentNumber || !fullName || !gender || !yearOfStudy || !cohortId) {
    return res.status(400).json({
      error: 'studentNumber, fullName, gender, yearOfStudy, and cohortId are required.',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('students')
    .insert({
      student_number: studentNumber,
      full_name: fullName,
      gender,
      year_of_study: yearOfStudy,
      program: program || PROGRAM_VALUES[0],
      cohort_id: cohortId,
      phone,
      email,
      created_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `added student ${data.student_number} (${data.full_name})`,
    entityType: 'student',
    entityId: data.id,
  });

  res.status(201).json(data);
});

// PUT /api/students/:id — edit (admin+)
router.put('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  const { fullName, gender, yearOfStudy, program, cohortId, phone, email, isActive } = req.body;

  const { data, error } = await supabaseAdmin
    .from('students')
    .update({
      ...(fullName !== undefined && { full_name: fullName }),
      ...(gender !== undefined && { gender }),
      ...(yearOfStudy !== undefined && { year_of_study: yearOfStudy }),
      ...(program !== undefined && { program }),
      ...(cohortId !== undefined && { cohort_id: cohortId }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(isActive !== undefined && { is_active: isActive }),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `updated student ${data.student_number} (${data.full_name})`,
    entityType: 'student',
    entityId: data.id,
  });

  res.json(data);
});

// DELETE /api/students/:id — permanently remove a student (admin+)
// This also removes their allocation history (cascades at the DB level).
// Use PUT with { isActive: false } instead if you only want to hide them.
router.delete('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('students')
    .select('student_number, full_name')
    .eq('id', req.params.id)
    .single();

  if (fetchError) return res.status(404).json({ error: 'Student not found.' });

  const { error } = await supabaseAdmin.from('students').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `deleted student ${existing.student_number} (${existing.full_name})`,
    entityType: 'student',
    entityId: req.params.id,
  });

  res.json({ deleted: true });
});

// GET /api/students/import/template — downloadable sample Excel template
router.get('/import/template', requireRole('admin', 'super_admin'), async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');

  sheet.columns = [
    { header: 'Student Number', key: 'studentNumber', width: 18 },
    { header: 'Full Name', key: 'fullName', width: 28 },
    { header: 'Gender (Male/Female/Other)', key: 'gender', width: 24 },
    { header: 'Year & Semester', key: 'yearOfStudy', width: 26 },
    { header: 'Program', key: 'program', width: 32 },
    { header: 'Cohort Name (must already exist)', key: 'cohortName', width: 30 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
  ];

  sheet.addRow({
    studentNumber: 'MCHS-0001',
    fullName: 'Example Student',
    gender: 'Female',
    yearOfStudy: 'Year 1 - Semester 1',
    program: 'Nursing and Midwifery',
    cohortName: '2024 Intake',
    phone: '0999000000',
    email: 'example@mchs.ac.mw',
  });

  const noteRow = sheet.addRow({
    studentNumber: '',
    fullName: '',
    gender: `Valid: ${['Male', 'Female', 'Other'].join(' / ')}`,
    yearOfStudy: `Valid: ${YEAR_SEMESTER_VALUES.join(' | ')}`,
    program: `Valid: ${PROGRAM_VALUES.join(' | ')}`,
  });
  noteRow.font = { italic: true, size: 8, color: { argb: 'FF888888' } };

  sheet.getRow(1).font = { bold: true };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="student_import_template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

// POST /api/students/import — bulk import from uploaded Excel file (admin+)
router.post('/import', requireRole('admin', 'super_admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];

  const { data: cohorts } = await supabaseAdmin.from('cohorts').select('id, name');
  const cohortByName = new Map((cohorts || []).map((c) => [c.name.trim().toLowerCase(), c.id]));

  const rows = [];
  const rowErrors = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const [studentNumber, fullName, gender, yearOfStudy, program, cohortName, phone, email] =
      row.values.slice(1);

    if (!studentNumber || !fullName) return; // skip blank rows

    const cohortId = cohortByName.get(String(cohortName || '').trim().toLowerCase());
    if (!cohortId) {
      rowErrors.push(`Row ${rowNumber}: cohort "${cohortName}" not found.`);
      return;
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      rowErrors.push(`Row ${rowNumber}: invalid gender "${gender}".`);
      return;
    }
    if (!YEAR_SEMESTER_VALUES.includes(yearOfStudy)) {
      rowErrors.push(`Row ${rowNumber}: invalid year/semester "${yearOfStudy}".`);
      return;
    }
    if (program && !PROGRAM_VALUES.includes(program)) {
      rowErrors.push(`Row ${rowNumber}: invalid program "${program}".`);
      return;
    }

    rows.push({
      student_number: String(studentNumber),
      full_name: String(fullName),
      gender,
      year_of_study: yearOfStudy,
      program: program || PROGRAM_VALUES[0],
      cohort_id: cohortId,
      phone: phone ? String(phone) : null,
      email: email ? String(email) : null,
      created_by: req.user.id,
    });
  });

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid rows found.', rowErrors });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('students')
    .upsert(rows, { onConflict: 'student_number' })
    .select();

  if (error) return res.status(400).json({ error: error.message, rowErrors });

  await logAction({
    user: req.user,
    action: `imported ${inserted.length} student(s) from Excel`,
    entityType: 'student',
  });

  res.json({ imported: inserted.length, rowErrors });
});

module.exports = router;
