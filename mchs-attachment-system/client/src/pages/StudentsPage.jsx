import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, triggerBlobDownload } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Modal, Spinner, StatusBadge, EmptyState } from '../components/ui';

const YEARS = ['Year 1', 'Year 2', 'Year 3'];
const GENDERS = ['Male', 'Female', 'Other'];

export default function StudentsPage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', year: '', cohortId: '', gender: '', status: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    try {
      const data = await api.get(`/api/students?${params.toString()}`);
      setStudents(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/api/cohorts').then(setCohorts).catch(() => {});
    api.get('/api/districts').then(setDistricts).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(loadStudents, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const downloadTemplate = async () => {
    const blob = await api.downloadBlob('/api/students/import/template');
    triggerBlobDownload(blob, 'student_import_template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Students</h1>
          <p className="text-navy-400 mt-1">Manage student records and view clinical attachment status.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              Import from Excel
            </button>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              + Add Student
            </button>
          </div>
        )}
      </div>

      <div className="card p-4 grid md:grid-cols-5 gap-3">
        <input
          className="input md:col-span-2"
          placeholder="Search by name or student ID…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <select className="input" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}>
          <option value="">All Years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="input"
          value={filters.cohortId}
          onChange={(e) => setFilters((f) => ({ ...f, cohortId: e.target.value }))}
        >
          <option value="">All Cohorts</option>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input" value={filters.gender} onChange={(e) => setFilters((f) => ({ ...f, gender: e.target.value }))}>
          <option value="">All Genders</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={28} /></div>
        ) : students.length === 0 ? (
          <EmptyState title="No students found" message="Try adjusting your filters, or add a new student." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-navy-400 border-b border-surface-border">
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Full Name</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Cohort</th>
                <th className="px-4 py-3">Current District</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-surface-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3 font-mono text-xs text-navy-500">{s.student_number}</td>
                  <td className="px-4 py-3 font-medium text-navy-800">{s.full_name}</td>
                  <td className="px-4 py-3 text-navy-500">{s.gender}</td>
                  <td className="px-4 py-3 text-navy-500">{s.year_of_study}</td>
                  <td className="px-4 py-3 text-navy-500">{s.cohortName}</td>
                  <td className="px-4 py-3 text-navy-500">{s.currentDistrict || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.allocationStatus} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/students/${s.id}`} className="text-medblue-600 font-semibold text-xs hover:underline">
                      View Profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin && (
        <AddStudentModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          cohorts={cohorts}
          onSaved={() => {
            setAddOpen(false);
            loadStudents();
          }}
        />
      )}

      {isAdmin && (
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onDownloadTemplate={downloadTemplate}
          onImported={() => {
            setImportOpen(false);
            loadStudents();
          }}
        />
      )}
    </div>
  );
}

function AddStudentModal({ open, onClose, cohorts, onSaved }) {
  const [form, setForm] = useState({
    studentNumber: '',
    fullName: '',
    gender: 'Female',
    yearOfStudy: 'Year 1',
    program: 'Clinical Medicine',
    cohortId: '',
    phone: '',
    email: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/api/students', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Student">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Student ID</label>
            <input
              required
              className="input"
              value={form.studentNumber}
              onChange={(e) => setForm((f) => ({ ...f, studentNumber: e.target.value }))}
              placeholder="MCHS-0241"
            />
          </div>
          <div>
            <label className="label">Full Name</label>
            <input
              required
              className="input"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Year of Study</label>
            <select className="input" value={form.yearOfStudy} onChange={(e) => setForm((f) => ({ ...f, yearOfStudy: e.target.value }))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Cohort</label>
            <select
              required
              className="input"
              value={form.cohortId}
              onChange={(e) => setForm((f) => ({ ...f, cohortId: e.target.value }))}
            >
              <option value="">Select cohort…</option>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Add Student'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDownloadTemplate, onImported }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) return;
    setError('');
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.postForm('/api/students/import', formData);
      setResult(res);
      setRowErrors(res.rowErrors || []);
    } catch (err) {
      setError(err.message);
      setRowErrors(err.payload?.rowErrors || []);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Students from Excel">
      <div className="space-y-4">
        <p className="text-sm text-navy-500">
          Upload a spreadsheet of students. Cohort names must already exist in the system.
        </p>
        <button className="text-sm font-semibold text-medblue-600 hover:underline" onClick={onDownloadTemplate}>
          ⬇ Download sample Excel template
        </button>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="input"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {result && (
          <div className="text-sm bg-teal-50 border border-teal-100 rounded-lg p-3 text-teal-700">
            Imported {result.imported} student(s) successfully.
          </div>
        )}
        {rowErrors.length > 0 && (
          <div className="text-xs bg-gold-50 border border-gold-100 rounded-lg p-3 text-gold-700 max-h-32 overflow-y-auto">
            {rowErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-secondary" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="btn-primary" disabled={!file || importing} onClick={handleImport}>
              {importing ? 'Importing…' : 'Import'}
            </button>
          )}
          {result && (
            <button className="btn-primary" onClick={onImported}>Done</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
