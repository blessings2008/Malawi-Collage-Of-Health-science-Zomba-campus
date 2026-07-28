import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Modal, Spinner, EmptyState, CapacityBadge, ProgressBar } from '../components/ui';

const REGIONS = ['Northern Region', 'Central Region', 'Southern Region'];

export default function DistrictsPage() {
  const { isAdmin } = useAuth();
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/api/districts').then(setDistricts).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleActive = async (id) => {
    await api.post(`/api/districts/${id}/toggle-active`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">District Management</h1>
          <p className="text-navy-400 mt-1">Configure clinical attachment districts and their capacities.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + Add District
          </button>
        )}
      </div>

      <DistrictMapPreview districts={districts} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : districts.length === 0 ? (
        <EmptyState title="No districts configured" message="Add your first district to begin allocations." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {districts.map((d) => {
            const ratio = d.capacity > 0 ? d.currentAllocated / d.capacity : 0;
            return (
              <div key={d.id} className="card p-5">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-bold text-navy-900 uppercase tracking-wide text-sm">{d.name}</p>
                  <CapacityBadge status={d.capacityStatus} />
                </div>
                <p className="text-xs text-navy-400 mb-3">{d.region}</p>
                <p className="text-sm text-navy-600 mb-1.5">
                  {d.currentAllocated} / {d.capacity} Students
                </p>
                <ProgressBar percent={ratio * 100} color={ratio >= 1 ? 'gold' : 'teal'} />
                <p className="text-xs text-navy-400 mt-2 mb-4">{d.availableSpaces} spaces remaining</p>
                {!d.is_active && (
                  <p className="text-xs text-rose-500 font-semibold mb-2">Inactive — excluded from allocations</p>
                )}
                {isAdmin && (
                  <div className="flex gap-2 text-xs flex-wrap">
                    <button className="btn-secondary !px-3 !py-1.5" onClick={() => { setEditing(d); setModalOpen(true); }}>
                      Edit
                    </button>
                    <button className="btn-secondary !px-3 !py-1.5" onClick={() => toggleActive(d.id)}>
                      {d.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <DistrictModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          district={editing}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// Lightweight orientation map — approximate positions on a stylized Malawi outline.
// Not a substitute for allocation management, per spec; purely visual.
function DistrictMapPreview({ districts }) {
  if (districts.length === 0) return null;
  const withCoords = districts.filter((d) => d.latitude && d.longitude);

  return (
    <div className="card p-5">
      <h3 className="font-bold text-navy-900 mb-1">District Map — Malawi</h3>
      <p className="text-xs text-navy-400 mb-4">Visual orientation only. Use the cards below to manage capacity.</p>
      <div className="relative bg-navy-50 rounded-xl h-64 overflow-hidden border border-navy-100">
        {withCoords.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-navy-300 text-sm">
            Add latitude/longitude to districts to plot them here.
          </div>
        ) : (
          withCoords.map((d) => {
            // Rough normalization of Malawi's lat/lng bounds to the preview box.
            const latMin = -17.2, latMax = -9.4, lngMin = 32.6, lngMax = 35.9;
            const x = ((d.longitude - lngMin) / (lngMax - lngMin)) * 100;
            const y = (1 - (d.latitude - latMin) / (latMax - latMin)) * 100;
            return (
              <div
                key={d.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div className="w-3 h-3 rounded-full bg-medblue-500 border-2 border-white shadow" />
                <span className="text-[10px] font-semibold text-navy-700 bg-white/80 px-1 rounded mt-0.5">
                  {d.name}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DistrictModal({ open, onClose, district, onSaved }) {
  const [form, setForm] = useState({ name: '', region: REGIONS[0], capacity: 20, latitude: '', longitude: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (district) {
      setForm({
        name: district.name,
        region: district.region,
        capacity: district.capacity,
        latitude: district.latitude || '',
        longitude: district.longitude || '',
      });
    } else {
      setForm({ name: '', region: REGIONS[0], capacity: 20, latitude: '', longitude: '' });
    }
  }, [district, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        region: form.region,
        capacity: Number(form.capacity),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      };
      if (district) {
        await api.put(`/api/districts/${district.id}`, payload);
      } else {
        await api.post('/api/districts', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={district ? 'Edit District' : 'Add District'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">District Name</label>
          <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Region</label>
          <select className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Capacity</label>
          <input
            required
            type="number"
            min="0"
            className="input"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Latitude (optional)</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.latitude}
              onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
              placeholder="-15.386"
            />
          </div>
          <div>
            <label className="label">Longitude (optional)</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.longitude}
              onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
              placeholder="35.331"
            />
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : district ? 'Save Changes' : 'Add District'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
