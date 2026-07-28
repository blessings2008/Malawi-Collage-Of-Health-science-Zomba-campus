import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Modal, Spinner, EmptyState } from '../components/ui';

const ROLES = ['lecturer', 'admin', 'super_admin'];
const ROLE_LABELS = { lecturer: 'Lecturer', admin: 'Administrator', super_admin: 'Super Administrator' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/api/users').then(setUsers).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleActive = async (u) => {
    await api.put(`/api/users/${u.id}`, { isActive: !u.is_active });
    load();
  };

  const changeRole = async (u, role) => {
    await api.put(`/api/users/${u.id}`, { role });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">User Management</h1>
          <p className="text-navy-400 mt-1">Manage staff accounts and role-based access.</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Add User</button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={28} /></div>
        ) : users.length === 0 ? (
          <EmptyState title="No staff accounts yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-navy-400 border-b border-surface-border">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-3 font-medium text-navy-800">{u.full_name}</td>
                  <td className="px-4 py-3 text-navy-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      className="input !py-1.5 !text-xs !w-auto"
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.is_active ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-600'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs font-semibold text-medblue-600 hover:underline" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddUserModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
    </div>
  );
}

function AddUserModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'lecturer' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/api/users', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input required className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
        </div>
        <div>
          <label className="label">Email</label>
          <input required type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className="label">Temporary Password</label>
          <input required type="password" minLength={8} className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create Account'}</button>
        </div>
      </form>
    </Modal>
  );
}
