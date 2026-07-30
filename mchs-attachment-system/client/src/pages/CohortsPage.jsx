import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Modal, Spinner, EmptyState } from '../components/ui';
import { YEARS } from '../lib/constants';

export default function CohortsPage() {
  const { isAdmin } = useAuth();
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/api/cohorts').then(setCohorts).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const archive = async (id) => {
    if (!confirm('Archive this cohort? It will be hidden from active allocations.')) return;
    await api.post(`/api/cohorts/${id}/archive`);
    load();
  };

  const unarchive = async (id) => {
    await api.post(`/api/cohorts/${id}/unarchive`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Cohorts</h1>
          <p className="text-navy-400 mt-1">Manage student intakes and cohort groupings.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + Create Cohort
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : cohorts.length === 0 ? (
        <EmptyState title="No cohorts yet" message="Create your first cohort to begin organizing students." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohorts.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-navy-900">{c.name}</p>
                  <p className="text-xs text-navy-400">Intake Year: {c.intake_year}</p>
                </div>
                <span className={`badge ${c.is_active ? 'bg-teal-50 text-teal-700' : 'bg-surface-muted text-navy-400'}`}>
                  {c.is_active ? 'Active' : 'Archived'}
                </span>
              </div>
              <div className="space-y-1 text-sm text-navy-600 mb-4">
                {YEARS.map((y) => (
                  <p key={y} className="flex justify-between">
                    <span>{y}</span>
                    <span className="font-semibold">{c.yearBreakdown?.[y] ?? 0}</span>
                  </p>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap text-xs">
                <Link to={`/students?cohortId=${c.id}`} className="btn-secondary !px-3 !py-1.5">View Students</Link>
                {isAdmin && (
                  <>
                    <button
                      className="btn-secondary !px-3 !py-1.5"
                      onClick={() => { setEditing(c); setModalOpen(true); }}
                    >
                      Edit
                    </button>
                    {c.is_active ? (
                      <button className="btn-secondary !px-3 !py-1.5 !text-rose-600" onClick={() => archive(c.id)}>
                        Archive
                      </button>
                    ) : (
                      <button className="btn-secondary !px-3 !py-1.5 !text-teal-600" onClick={() => unarchive(c.id)}>
                        Unarchive
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <CohortModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          cohort={editing}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function CohortModal({ open, onClose, cohort, onSaved }) {
  const [name, setName] = useState(cohort?.name || '');
  const [intakeYear, setIntakeYear] = useState(cohort?.intake_year || new Date().getFullYear());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(cohort?.name || '');
    setIntakeYear(cohort?.intake_year || new Date().getFullYear());
  }, [cohort, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (cohort) {
        await api.put(`/api/cohorts/${cohort.id}`, { name, intakeYear: Number(intakeYear) });
      } else {
        await api.post('/api/cohorts', { name, intakeYear: Number(intakeYear) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={cohort ? 'Edit Cohort' : 'Create Cohort'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Cohort Name</label>
          <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="2024 Intake" />
        </div>
        <div>
          <label className="label">Intake Year</label>
          <input
            required
            type="number"
            className="input"
            value={intakeYear}
            onChange={(e) => setIntakeYear(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : cohort ? 'Save Changes' : 'Create Cohort'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
