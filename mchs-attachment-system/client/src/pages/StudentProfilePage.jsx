import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Spinner, StatusBadge } from '../components/ui';

export default function StudentProfilePage() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get(`/api/students/${id}`), api.get(`/api/students/${id}/history`)])
      .then(([s, h]) => {
        setStudent(s);
        setHistory(h);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20"><Spinner size={32} /></div>
    );
  }

  if (!student) {
    return <p className="text-navy-500">Student not found.</p>;
  }

  const initials = student.full_name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');

  return (
    <div className="space-y-6">
      <Link to="/students" className="text-sm text-medblue-600 font-semibold hover:underline">
        ← Back to Students
      </Link>

      <div className="card p-6 flex items-start gap-5 flex-wrap">
        <div className="w-20 h-20 rounded-2xl bg-navy-800 text-white flex items-center justify-center text-2xl font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl font-bold text-navy-900">{student.full_name}</h1>
          <p className="text-navy-400 font-mono text-sm">{student.student_number}</p>
          <div className="grid sm:grid-cols-3 gap-x-6 gap-y-2 mt-4 text-sm">
            <InfoRow label="Gender" value={student.gender} />
            <InfoRow label="Year of Study" value={student.year_of_study} />
            <InfoRow label="Cohort / Intake" value={student.cohorts?.name} />
            <InfoRow label="Program" value={student.program} />
            <InfoRow label="Phone" value={student.phone || '—'} />
            <InfoRow label="Email" value={student.email || '—'} />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-navy-400 font-semibold">Districts Previously Visited</p>
          <p className="text-3xl font-bold text-teal-600 mt-1">{history?.districtsVisited ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-navy-400 font-semibold">Districts Not Yet Visited</p>
          <p className="text-3xl font-bold text-navy-700 mt-1">{history?.districtsNotYetVisited ?? 0}</p>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-bold text-navy-900 mb-4">Clinical Attachment History</h3>
        {!history?.history?.length ? (
          <p className="text-navy-400 text-sm">No attachment history recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-navy-400 border-b border-surface-border">
                  <th className="px-3 py-2">Attachment Period</th>
                  <th className="px-3 py-2">District</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Rotation</th>
                </tr>
              </thead>
              <tbody>
                {history.history.map((h, i) => (
                  <tr key={i} className="border-b border-surface-border last:border-0">
                    <td className="px-3 py-2.5 text-navy-700 font-medium">{h.period}</td>
                    <td className="px-3 py-2.5 text-navy-600">{h.district || '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={h.allocationStatus} /></td>
                    <td className="px-3 py-2.5 text-navy-500 text-xs">{h.rotationStatus || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-navy-400 text-xs uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-navy-800 font-medium">{value}</p>
    </div>
  );
}
