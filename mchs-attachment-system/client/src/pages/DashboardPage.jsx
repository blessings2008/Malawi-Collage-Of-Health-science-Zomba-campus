import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatCard, ProgressBar, Spinner, CapacityBadge } from '../components/ui';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDateRange(start, end) {
  if (!start || !end) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(start).toLocaleDateString('en-GB', opts)} – ${new Date(end).toLocaleDateString('en-GB', opts)}`;
}

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/dashboard')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  const stats = data?.stats || {};
  const progress = data?.allocationProgress || { allocated: 0, total: 0, percentComplete: 0 };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">
          {greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-navy-400 mt-1">Here's an overview of your clinical attachment allocations.</p>
      </div>

      {data?.currentPeriod ? (
        <div className="card p-5 bg-navy-800 border-navy-800 text-white flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-medblue-200 font-semibold">Current Attachment Period</p>
            <p className="text-xl font-bold mt-1">{data.currentPeriod.name}</p>
            <p className="text-navy-300 text-sm mt-0.5">
              {formatDateRange(data.currentPeriod.start_date, data.currentPeriod.end_date)}
            </p>
          </div>
          <Link to="/periods" className="btn-secondary !bg-white/10 !text-white !border-white/20 hover:!bg-white/20">
            View Periods
          </Link>
        </div>
      ) : (
        <div className="card p-5 border-gold-100 bg-gold-50">
          <p className="text-gold-600 font-semibold text-sm">No active attachment period.</p>
          {isAdmin && (
            <Link to="/periods" className="text-sm text-navy-700 underline font-medium">
              Create one now
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Total Students" value={stats.totalStudents} accent="navy" />
        <StatCard label="Active Cohorts" value={stats.activeCohorts} accent="medblue" />
        <StatCard label="Available Districts" value={stats.availableDistricts} accent="teal" />
        <StatCard label="Allocated Students" value={stats.allocatedStudents} accent="teal" />
        <StatCard label="Unallocated Students" value={stats.unallocatedStudents} accent="gold" />
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-navy-900">Current Allocation Progress</h3>
          <span className="text-sm font-semibold text-navy-500">
            {progress.allocated} of {progress.total} Students Allocated
          </span>
        </div>
        <ProgressBar percent={progress.percentComplete} />
        <p className="text-right text-sm font-bold text-teal-600 mt-2">{progress.percentComplete}% Complete</p>
      </div>

      {isAdmin && (
        <div className="card p-6">
          <h3 className="font-bold text-navy-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Link to="/students" className="btn-secondary justify-start">+ Add Student</Link>
            <Link to="/cohorts" className="btn-secondary justify-start">+ Create Cohort</Link>
            <Link to="/districts" className="btn-secondary justify-start">+ Add District</Link>
            <Link to="/periods" className="btn-secondary justify-start">+ Create Attachment Period</Link>
            <Link to="/reports" className="btn-secondary justify-start">Generate Report</Link>
            <Link to="/allocation-engine" className="btn-gold justify-center font-bold">
              ⚙ Run Allocation
            </Link>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="font-bold text-navy-900 mb-4">Current District Distribution</h3>
        {(!data?.districtDistribution || data.districtDistribution.length === 0) && (
          <p className="text-navy-400 text-sm">No allocations recorded for the current period yet.</p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.districtDistribution?.map((d) => {
            const remaining = Math.max(0, d.capacity - d.count);
            const ratio = d.capacity > 0 ? d.count / d.capacity : 0;
            const status =
              d.count > d.capacity ? 'over_capacity' : ratio >= 1 ? 'full' : ratio >= 0.85 ? 'nearly_full' : 'available';
            return (
              <div key={d.districtId} className="border border-surface-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-navy-800">{d.name}</p>
                  <CapacityBadge status={status} />
                </div>
                <p className="text-sm text-navy-500 mb-2">
                  {d.count} / {d.capacity} Students
                </p>
                <ProgressBar percent={ratio * 100} color={status === 'over_capacity' ? 'gold' : 'teal'} />
                <p className="text-xs text-navy-400 mt-2">{remaining} spaces remaining</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
