const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();
router.use(requireAuth);

// GET /api/cohorts — list all cohorts with student counts by year
router.get('/', async (req, res) => {
  const { data: cohorts, error } = await supabaseAdmin
    .from('cohorts')
    .select('*')
    .order('intake_year', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const { data: students, error: studentsError } = await supabaseAdmin
    .from('students')
    .select('cohort_id, year_of_study')
    .eq('is_active', true);

  if (studentsError) return res.status(500).json({ error: studentsError.message });

  const withCounts = cohorts.map((cohort) => {
    const cohortStudents = students.filter((s) => s.cohort_id === cohort.id);
    return {
      ...cohort,
      studentCount: cohortStudents.length,
      yearBreakdown: {
        'Year 1': cohortStudents.filter((s) => s.year_of_study === 'Year 1').length,
        'Year 2': cohortStudents.filter((s) => s.year_of_study === 'Year 2').length,
        'Year 3': cohortStudents.filter((s) => s.year_of_study === 'Year 3').length,
      },
    };
  });

  res.json(withCounts);
});

// POST /api/cohorts — create (admin+)
router.post('/', requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, intakeYear } = req.body;
  if (!name || !intakeYear) {
    return res.status(400).json({ error: 'name and intakeYear are required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('cohorts')
    .insert({ name, intake_year: intakeYear, created_by: req.user.id })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `created cohort "${name}"`,
    entityType: 'cohort',
    entityId: data.id,
  });

  res.status(201).json(data);
});

// PUT /api/cohorts/:id — edit (admin+)
router.put('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, intakeYear, isActive } = req.body;

  const { data, error } = await supabaseAdmin
    .from('cohorts')
    .update({
      ...(name !== undefined && { name }),
      ...(intakeYear !== undefined && { intake_year: intakeYear }),
      ...(isActive !== undefined && { is_active: isActive }),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `updated cohort "${data.name}"`,
    entityType: 'cohort',
    entityId: data.id,
  });

  res.json(data);
});

// POST /api/cohorts/:id/archive — archive (admin+)
router.post('/:id/archive', requireRole('admin', 'super_admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('cohorts')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logAction({
    user: req.user,
    action: `archived cohort "${data.name}"`,
    entityType: 'cohort',
    entityId: data.id,
  });

  res.json(data);
});

// GET /api/cohorts/:id/students — view students in a cohort
router.get('/:id/students', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('cohort_id', req.params.id)
    .order('student_number');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
