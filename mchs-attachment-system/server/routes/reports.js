const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const REPORT_TYPES = {
  district: 'District Allocation List',
  student: 'Student Allocation List',
  cohort: 'Cohort Allocation Report',
  year: 'Year-Based Allocation Report',
  rotation: 'Complete Rotation History',
  unallocated: 'Unallocated Students Report',
  capacity: 'District Capacity Report',
};

/**
 * Fetches the raw dataset for a given report type + filters.
 * Shared by both the PDF and Excel exporters so the two formats
 * never drift from each other.
 */
async function fetchReportData(type, { periodId, cohortId, year, districtId }) {
  if (type === 'capacity') {
    const { data: districts } = await supabaseAdmin.from('districts').select('*').order('name');
    const { data: allocations } = periodId
      ? await supabaseAdmin
          .from('allocations')
          .select('district_id')
          .eq('attachment_period_id', periodId)
          .eq('status', 'Allocated')
      : { data: [] };

    const counts = (allocations || []).reduce((acc, a) => {
      if (a.district_id) acc[a.district_id] = (acc[a.district_id] || 0) + 1;
      return acc;
    }, {});

    return districts.map((d) => ({
      district: d.name,
      region: d.region,
      capacity: d.capacity,
      allocated: counts[d.id] || 0,
      available: Math.max(0, d.capacity - (counts[d.id] || 0)),
    }));
  }

  let query = supabaseAdmin
    .from('allocations')
    .select(
      '*, students(student_number, full_name, gender, year_of_study, cohort_id, cohorts(name)), districts(name), attachment_periods(name)'
    );

  if (periodId) query = query.eq('attachment_period_id', periodId);
  if (districtId) query = query.eq('district_id', districtId);
  if (type === 'unallocated') query = query.eq('status', 'Unallocated');

  const { data, error } = await query;
  if (error) throw error;

  let rows = data;
  if (cohortId) rows = rows.filter((r) => r.students?.cohort_id === cohortId);
  if (year) rows = rows.filter((r) => r.students?.year_of_study === year);

  return rows.map((r) => ({
    studentNumber: r.students?.student_number,
    studentName: r.students?.full_name,
    gender: r.students?.gender,
    year: r.students?.year_of_study,
    cohort: r.students?.cohorts?.name,
    district: r.districts?.name || 'Unallocated',
    period: r.attachment_periods?.name,
    status: r.status,
    rotationStatus: r.rotation_status,
  }));
}

// GET /api/reports/:type/excel?periodId=&cohortId=&year=&districtId=
router.get('/:type/excel', async (req, res) => {
  const { type } = req.params;
  if (!REPORT_TYPES[type]) return res.status(400).json({ error: 'Unknown report type.' });

  try {
    const rows = await fetchReportData(type, req.query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(REPORT_TYPES[type].slice(0, 31));

    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'Malawi College of Health Sciences — Zomba Campus';
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = REPORT_TYPES[type];
    sheet.getCell('A2').font = { bold: true, size: 12 };

    sheet.getCell('A3').value = `Date Generated: ${new Date().toLocaleDateString('en-GB')}`;
    sheet.getCell('A4').value = `Prepared By: ${req.user.full_name}`;
    sheet.addRow([]);

    const headerRowIndex = 6;
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      sheet.getRow(headerRowIndex).values = columns.map((c) =>
        c.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
      );
      sheet.getRow(headerRowIndex).font = { bold: true };
      rows.forEach((row) => sheet.addRow(Object.values(row)));
      sheet.columns.forEach((col) => {
        col.width = 20;
      });
    } else {
      sheet.getCell(`A${headerRowIndex}`).value = 'No records found for the selected filters.';
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${type}_report.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/:type/pdf?periodId=&cohortId=&year=&districtId=
router.get('/:type/pdf', async (req, res) => {
  const { type } = req.params;
  if (!REPORT_TYPES[type]) return res.status(400).json({ error: 'Unknown report type.' });

  try {
    const rows = await fetchReportData(type, req.query);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_report.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('Malawi College of Health Sciences — Zomba Campus');
    doc.fontSize(13).text(REPORT_TYPES[type]);
    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    doc.text(`Date Generated: ${new Date().toLocaleDateString('en-GB')}    Prepared By: ${req.user.full_name}`);
    doc.moveDown(1);
    doc.fillColor('#000000');

    if (rows.length === 0) {
      doc.fontSize(11).text('No records found for the selected filters.');
    } else {
      const columns = Object.keys(rows[0]);
      const colWidth = (doc.page.width - 80) / columns.length;

      const drawRow = (values, isHeader) => {
        const y = doc.y;
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        values.forEach((v, i) => {
          doc.text(String(v ?? ''), 40 + i * colWidth, y, { width: colWidth - 5 });
        });
        doc.moveDown(0.6);
      };

      drawRow(
        columns.map((c) => c.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())),
        true
      );
      doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.3);

      rows.forEach((row) => {
        if (doc.y > doc.page.height - 60) doc.addPage();
        drawRow(Object.values(row), false);
      });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
