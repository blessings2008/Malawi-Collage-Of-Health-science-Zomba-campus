import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui';

export default function ManualAllocationRulesPage() {
  const [students, setStudents] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [rules, setRules] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [districtId, setDistrictId] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [studentData, districtData, ruleData] = await Promise.all([
        api.get('/api/students'),
        api.get('/api/districts'),
        api.get('/api/allocations/manual-rules'),
      ]);
      setStudents(studentData);
      setDistricts(districtData.filter((d) => d.is_active));
      setRules(ruleData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      (s.student_number + ' ' + s.full_name).toLowerCase().includes(q)
    );
  }, [students, search]);

  const resetForm = () => {
    setSelectedStudents([]);
    setDistrictId('');
    setNote('');
    setSearch('');
    setEditing(null);
    setError('');
  };

  const toggleStudent = (id) => {
    setSelectedStudents((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const selectAllVisible = () => {
    const ids = filteredStudents.map((s) => s.id);
    setSelectedStudents((current) => [...new Set([...current, ...ids])]);
  };

  const save = async () => {
    setError('');
    if (selectedStudents.length < 2) {
      setError('Select at least two students.');
      return;
    }
    if (!districtId) {
      setError('Select the district they should be allocated to.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.put('/api/allocations/manual-rules/' + editing.id, {
          studentIds: selectedStudents,
          districtId,
          note,
          isActive: editing.is_active,
        });
      } else {
        await api.post('/api/allocations/manual-rules', {
          studentIds: selectedStudents,
          districtId,
          note,
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const editRule = (rule) => {
    setEditing(rule);
    setSelectedStudents(rule.students.map((s) => s.id));
    setDistrictId(rule.district_id);
    setNote(rule.note || '');
    setSearch('');
    setError('');
  };

  const toggleRule = async (rule) => {
    try {
      await api.put('/api/allocations/manual-rules/' + rule.id, { isActive: !rule.is_active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteRule = async (rule) => {
    if (!window.confirm('Remove this manual allocation rule? Students will return to normal allocation logic on future runs.')) return;
    try {
      await api.del('/api/allocations/manual-rules/' + rule.id);
      if (editing?.id === rule.id) resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={36} /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide font-semibold text-medblue-500">Super Admin</p>
        <h1 className="text-2xl font-bold text-navy-900 mt-1">Manual Allocation Rules</h1>
        <p className="text-navy-400 mt-1 max-w-3xl">
          Privately control groups of students that must be allocated to the same district
          during future allocation runs. This does not permanently place them.
        </p>
      </div>

      <div className="bg-gold-50 border border-gold-100 rounded-xl p-4 text-sm text-gold-800">
        <strong>How this works:</strong> active rules override normal allocation ranking for
        the selected students. No student notification is generated for the rule. The
        administrative action is recorded in the audit log.
      </div>

      <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-bold text-navy-900">{editing ? 'Edit Rule' : 'Create Rule'}</h2>
              <p className="text-xs text-navy-400 mt-1">
                {editing ? 'Changes apply to future allocation runs.' : 'Select two or more students.'}
              </p>
            </div>
            {editing && <button className="btn-secondary text-xs" onClick={resetForm}>Cancel</button>}
          </div>

          <label className="label">District</label>
          <select className="input mb-5" value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
            <option value="">Select district…</option>
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <label className="label">Students ({selectedStudents.length} selected)</label>
          <input
            className="input mb-3"
            placeholder="Search by student number or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex justify-between items-center mb-2 text-xs">
            <button className="text-medblue-600 font-semibold" onClick={selectAllVisible}>Select visible</button>
            <button className="text-navy-400" onClick={() => setSelectedStudents([])}>Clear selection</button>
          </div>

          <div className="border border-surface-border rounded-lg max-h-80 overflow-y-auto">
            {filteredStudents.map((student) => (
              <label key={student.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 border-surface-border cursor-pointer hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={selectedStudents.includes(student.id)}
                  onChange={() => toggleStudent(student.id)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-800 truncate">{student.full_name}</p>
                  <p className="text-xs text-navy-400">{student.student_number} · {student.year_of_study}</p>
                </div>
              </label>
            ))}
            {filteredStudents.length === 0 && <p className="p-5 text-sm text-navy-400 text-center">No students found.</p>}
          </div>

          <label className="label mt-5">Internal note <span className="font-normal text-navy-400">(optional)</span></label>
          <textarea
            className="input min-h-20 resize-y"
            placeholder="Optional reason or administrative note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {error && <p className="text-sm text-rose-600 mt-4">{error}</p>}

          <div className="flex justify-end mt-5">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Manual Rule'}
            </button>
          </div>
        </div>

        <div className="card p-6">
          <div className="mb-5">
            <h2 className="font-bold text-navy-900">Current Rules</h2>
            <p className="text-xs text-navy-400 mt-1">{rules.length} rule(s) configured</p>
          </div>

          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className={'border rounded-xl p-4 ' + (rule.is_active ? 'border-teal-200' : 'border-surface-border opacity-70')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy-800">{rule.district_name}</p>
                    <p className="text-xs text-navy-400 mt-0.5">
                      {rule.students.length} students · {rule.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <span className={'text-[11px] font-bold px-2 py-1 rounded-full ' + (rule.is_active ? 'bg-teal-50 text-teal-700' : 'bg-surface-muted text-navy-400')}>
                    {rule.is_active ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {rule.students.map((student) => (
                    <span key={student.id} className="text-[11px] bg-surface-muted rounded-md px-2 py-1 text-navy-600">
                      {student.student_number || student.full_name}
                    </span>
                  ))}
                </div>

                {rule.note && <p className="text-xs text-navy-500 mt-3">{rule.note}</p>}

                <div className="flex gap-2 mt-4 pt-3 border-t border-surface-border">
                  <button className="btn-secondary text-xs" onClick={() => editRule(rule)}>Edit</button>
                  <button className="btn-secondary text-xs" onClick={() => toggleRule(rule)}>
                    {rule.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="text-xs font-semibold text-rose-600 px-3" onClick={() => deleteRule(rule)}>Delete</button>
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <div className="text-center py-10 text-sm text-navy-400">No manual rules yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
