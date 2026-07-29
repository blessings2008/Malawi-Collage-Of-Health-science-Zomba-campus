import { useEffect, useState } from 'react';
import { api, triggerBlobDownload } from '../lib/api';
import { YEARS } from '../lib/constants';

const REPORT_TYPES = [
  { key: 'district', label: 'District Allocation List' },
  { key: 'student', label: 'Student Allocation List' },
  { key: 'cohort', label: 'Cohort Allocation Report' },
  { key: 'year', label: 'Year-Based Allocation Report' },
  { key: 'rotation', label: 'Complete Rotation History' },
  { key: 'unallocated', label: 'Unallocated Students Report' },
  { key: 'capacity', label: 'District Capacity Report' },
];

export default function ReportsPage() {
  const [periods, setPeriods] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [filters, setFilters] = useState({ periodId: '', cohortId: '', year: '', districtId: '' });
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/periods').then(setPeriods).catch(() => {});
    api.get('/api/cohorts').then(setCohorts).catch(() => {});
    api.get('/api/districts').then(setDistricts).catch(() => {});
  }, []);

  const buildQuery = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    return params.toString();
  };

  const download = async (typeKey, format) => {
    setDownloading(`${typeKey}-${format}`);
    setError('');
    try {
      const blob = await api.downloadBlob(`/api/reports/${typeKey}/${format}?${buildQuery()}`);
      triggerBlobDownload(blob, `${typeKey}_report.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">Reports</h1>
        <p className="text-navy-400 mt-1">Generate and export institutional allocation reports.</p>
      </div>

      <div className="card p-4 grid md:grid-cols-4 gap-3">
        <select className="input" value={filters.periodId} onChange={(e) => setFilters((f) => ({ ...f, periodId: e.target.value }))}>
          <option value="">All Attachment Periods</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={filters.cohortId} onChange={(e) => setFilters((f) => ({ ...f, cohortId: e.target.value }))}>
          <option value="">All Cohorts</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}>
          <option value="">All Years</option>
          {YEARS.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select className="input" value={filters.districtId} onChange={(e) => setFilters((f) => ({ ...f, districtId: e.target.value }))}>
          <option value="">All Districts</option>
          {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((r) => (
          <div key={r.key} className="card p-5">
            <p className="font-bold text-navy-900 mb-1">{r.label}</p>
            <p className="text-xs text-navy-400 mb-4">Malawi College of Health Sciences — Zomba Campus</p>
            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1 !py-2 text-xs"
                disabled={downloading === `${r.key}-pdf`}
                onClick={() => download(r.key, 'pdf')}
              >
                {downloading === `${r.key}-pdf` ? 'Preparing…' : 'Export PDF'}
              </button>
              <button
                className="btn-secondary flex-1 !py-2 text-xs"
                disabled={downloading === `${r.key}-excel`}
                onClick={() => download(r.key, 'excel')}
              >
                {downloading === `${r.key}-excel` ? 'Preparing…' : 'Export Excel'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
