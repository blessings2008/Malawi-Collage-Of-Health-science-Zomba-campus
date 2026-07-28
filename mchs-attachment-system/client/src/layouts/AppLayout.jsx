import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◧', roles: ['super_admin', 'admin', 'lecturer'] },
  { to: '/students', label: 'Students', icon: '☰', roles: ['super_admin', 'admin', 'lecturer'] },
  { to: '/cohorts', label: 'Cohorts', icon: '▤', roles: ['super_admin', 'admin', 'lecturer'] },
  { to: '/districts', label: 'Districts', icon: '⬡', roles: ['super_admin', 'admin', 'lecturer'] },
  { to: '/periods', label: 'Attachment Periods', icon: '◷', roles: ['super_admin', 'admin', 'lecturer'] },
  { to: '/allocation-engine', label: 'Allocation Engine', icon: '⚙', roles: ['super_admin', 'admin'] },
  { to: '/reports', label: 'Reports', icon: '▦', roles: ['super_admin', 'admin', 'lecturer'] },
  { to: '/audit-log', label: 'Audit Log', icon: '≡', roles: ['super_admin', 'admin'] },
  { to: '/users', label: 'User Management', icon: '◎', roles: ['super_admin'] },
];

export default function AppLayout({ children }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.get('/api/notifications').then(setNotifications).catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(profile?.role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const markAllRead = async () => {
    await api.post('/api/notifications/read-all').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-navy-900 text-white flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-6 border-b border-white/10">
          <p className="text-xs uppercase tracking-wider text-medblue-200 font-semibold">
            Malawi College of Health Sciences
          </p>
          <p className="text-xs text-navy-300">Zomba Campus</p>
          <p className="text-base font-bold mt-2 leading-tight">Clinical Attachment Allocation System</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-medblue-600 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/10 text-xs text-navy-400 text-center">
          Designed &amp; Developed by <span className="text-navy-200 font-semibold">Tambala Technologies</span>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-surface-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-20">
          <button className="lg:hidden text-navy-700 text-xl" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center text-navy-700 hover:bg-navy-100"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gold-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 card p-3 max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-navy-800">Notifications</p>
                    <button onClick={markAllRead} className="text-xs text-medblue-500 font-semibold">
                      Mark all read
                    </button>
                  </div>
                  {notifications.length === 0 && (
                    <p className="text-sm text-navy-400 py-4 text-center">No notifications yet.</p>
                  )}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-3 py-2 rounded-lg mb-1 text-sm ${n.is_read ? 'bg-white' : 'bg-medblue-50'}`}
                    >
                      <p className="font-semibold text-navy-800">{n.title}</p>
                      <p className="text-navy-500 text-xs mt-0.5">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-medblue-100 text-medblue-700 font-bold flex items-center justify-center text-sm">
                {(profile?.full_name || '?')
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div className="hidden sm:block text-sm">
                <p className="font-semibold text-navy-800 leading-tight">{profile?.full_name}</p>
                <p className="text-navy-400 text-xs capitalize">{profile?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="btn-secondary !px-3 !py-2 text-xs">
              Sign Out
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
