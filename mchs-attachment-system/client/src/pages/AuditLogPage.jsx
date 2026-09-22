import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Spinner, EmptyState } from '../components/ui';

function formatDateTime(d) {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = entityType ? `?entityType=${entityType}` : '';
    setError('');
    api.get(`/api/audit-log${params}`).then(setEntries).catch((err) => setError(err.message || 'Failed to load audit log.')).finally(() => setLoading(false));
  }, [entityType]);

  const clearLog = async () => {
    if (!entries.length) return;
    if (!window.confirm('Clear the audit log? This permanently removes the recorded audit entries.')) return;
    setClearing(true);
    setError('');
    try {
      await api.delete('/api/audit-log');
      setEntries([]);
    } catch (err) {
      setError(err.message || 'Failed to clear audit log.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Audit Log</h1>
          <p className="text-navy-400 mt-1">Full accountability trail of administrative actions.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input !w-auto" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All Activity</option>
          <option value="student">Students</option>
          <option value="cohort">Cohorts</option>
          <option value="district">Districts</option>
          <option value="period">Attachment Periods</option>
          <option value="allocation">Allocations</option>
          <option value="user">User Accounts</option>
          </select>
          <button type="button" className="btn-secondary !px-4 !py-2" onClick={clearLog} disabled={clearing || !entries.length}>
            {clearing ? 'Clearing...' : 'Clear Log'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={28} /></div>
        ) : entries.length === 0 ? (
          <EmptyState title="No activity recorded" />
        ) : (
          <ul className="divide-y divide-surface-border">
            {entries.map((e) => (
              <li key={e.id} className="px-5 py-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-navy-50 text-navy-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {e.user_name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy-800">
                    <span className="font-semibold">{e.user_name}</span> {e.action}
                  </p>
                  <p className="text-xs text-navy-400 mt-0.5">{formatDateTime(e.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
