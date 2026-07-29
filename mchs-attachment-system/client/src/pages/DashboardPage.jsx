import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
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

  const cards = [
    {
      label: 'Total Students',
      value: stats.totalStudents ?? 0,
      accent: 'navy',
      onClick: () => navigate('/students'),
    },
    {
      label: 'Active Cohorts',
      value: stats.activeCohorts ?? 0,
      accent: 'medblue',
      onClick: () => navigate('/cohorts'),
    },
    {
      label: 'Students Allocated',
      value: stats.allocatedStudents ?? 0,
      accent: 'teal',
      onClick: () => navigate('/students?status=Allocated'),
    },
    {
      label: 'Students Unallocated',
      value: stats.unallocatedStudents ?? 0,
      accent: 'gold',
      onClick: () => navigate('/students?status=Unallocated'),
    },
  ];

  const accentMap = {
    navy: 'bg-navy-50 text-navy-700 group-hover:bg-navy-100',
    medblue: 'bg-medblue-50 text-medblue-600 group-hover:bg-medblue-100',
    teal: 'bg-teal-50 text-teal-600 group-hover:bg-teal-100',
    gold: 'bg-gold-50 text-gold-600 group-hover:bg-gold-100',
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">
          {greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-navy-400 mt-1">Here's an overview of your clinical attachment allocations.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={c.onClick}
            className="card p-5 text-left group hover:shadow-cardHover transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">{c.label}</p>
                <p className="text-3xl font-bold text-navy-900 mt-2">{c.value}</p>
              </div>
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${accentMap[c.accent]}`}
              >
                →
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
