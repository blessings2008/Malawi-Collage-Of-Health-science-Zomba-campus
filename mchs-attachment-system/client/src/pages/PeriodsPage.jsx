import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Modal, Spinner, EmptyState } from '../components/ui';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLES = {
  Current: 'bg-teal-50 text-teal-700',
  Upcoming: 'bg-medblue-50 text-medblue-600',
  Completed: 'bg-surface-muted text-navy-500',
};

export default function PeriodsPage() {
  const { isAdmin } = useAuth();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/api/periods').then(setPeriods).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const grouped = {
    Current: periods.filter((p) => p.status === 'Current'),
    Upcoming: periods.filter((p) => p.status === 'Upcoming'),
    Completed: periods.filter((p) => p.status === 'Completed'),
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Attachment Periods</h1>
          <p className="text-navy-400 mt-1">Manage clinical attachment periods and their allocation status.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + Create Attachment Period
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : periods.length === 0 ? (
        <EmptyState title="No attachment periods yet" message="Create your first attachment period to begin allocations." />
      ) : (
        ['Current', 'Upcoming', 'Completed'].map((section) =>
          grouped[section].length === 0 ? null : (
            <div key={section}>
              <h3 className="font-bold text-navy-800 mb-3">{section} Period{grouped[section].length > 1 ? 's' : ''}</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[section].map((p) => (
                  <div key={p.id} className="card p-5">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-bold text-navy-900">{p.name}</p>
                      <span className={`badge ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                    </div>
                    <p className="text-xs text-navy-400 mb-3">{formatDate(p.start_date)} – {formatDate(p.end_date)}</p>
                    <div className="text-sm text-navy-600 space-y-1 mb-4">
                      <p>{p.totalStudents} Students · {p.allocatedStudents} Allocated</p>
                      {p.is_locked && <p className="text-gold-600 font-semibold text-xs">🔒 Locked (Finalized)</p>}
                    </div>
                    {isAdmin && !p.is_locked && (
                      <button
                        className="btn-secondary !px-3 !py-1.5 text-xs"
                        onClick={() => { setEditing(p); setModalOpen(true); }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )
      )}

      {isAdmin && (
        <PeriodModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          period={editing}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function PeriodModal({ open, onClose, period, onSaved }) {
  const [form, setForm] = useState({
    name: '', startDate: '', endDate: '', academicYear: new Date().getFullYear(), status: 'Upcoming',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (period) {
      setForm({
        name: period.name,
        startDate: period.start_date,
        endDate: period.end_date,
        academicYear: period.academic_year,
        status: period.status,
      });
    } else {
      setForm({ name: '', startDate: '', endDate: '', academicYear: new Date().getFullYear(), status: 'Upcoming' });
    }
  }, [period, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { ...form, academicYear: Number(form.academicYear) };
      if (period) {
        await api.put(`/api/periods/${period.id}`, payload);
      } else {
        await api.post('/api/periods', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={period ? 'Edit Attachment Period' : 'Create Attachment Period'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Period Name</label>
          <input
            required
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Attachment Period 2 — 2026"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start Date</label>
            <input required type="date" className="input" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input required type="date" className="input" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Academic Year</label>
            <input required type="number" className="input" value={form.academicYear} onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option>Upcoming</option>
              <option>Current</option>
              <option>Completed</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : period ? 'Save Changes' : 'Create Period'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
