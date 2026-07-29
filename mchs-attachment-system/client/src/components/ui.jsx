import { useEffect } from 'react';

export function StatCard({ label, value, sublabel, icon, accent = 'navy' }) {
  const accentMap = {
    navy: 'bg-navy-50 text-navy-700',
    teal: 'bg-teal-50 text-teal-600',
    gold: 'bg-gold-50 text-gold-600',
    medblue: 'bg-medblue-50 text-medblue-600',
  };
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-navy-900 mt-1">{value}</p>
        {sublabel && <p className="text-xs text-navy-400 mt-1">{sublabel}</p>}
      </div>
      {icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>{icon}</div>
      )}
    </div>
  );
}

export function CapacityBadge({ status }) {
  const map = {
    available: { label: 'Available', cls: 'bg-teal-50 text-teal-700' },
    nearly_full: { label: 'Nearly Full', cls: 'bg-gold-50 text-gold-600' },
    full: { label: 'Full', cls: 'bg-navy-100 text-navy-600' },
    over_capacity: { label: 'Over Capacity', cls: 'bg-rose-50 text-rose-600' },
    unknown: { label: 'Not Set', cls: 'bg-surface-muted text-navy-400' },
  };
  const s = map[status] || map.unknown;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function StatusBadge({ status }) {
  const map = {
    Allocated: 'bg-teal-50 text-teal-700',
    Unallocated: 'bg-rose-50 text-rose-600',
    Locked: 'bg-navy-100 text-navy-700',
  };
  return <span className={`badge ${map[status] || 'bg-surface-muted text-navy-500'}`}>{status}</span>;
}

export function RotationBadge({ status }) {
  if (!status) return <span className="text-navy-300 text-xs">—</span>;
  if (status === 'New District') {
    return <span className="badge bg-teal-50 text-teal-700">● New District</span>;
  }
  return <span className="badge bg-gold-50 text-gold-600">▲ Repeat Allocation</span>;
}

export function Spinner({ size = 20 }) {
  return (
    <svg
      className="animate-spin text-medblue-500"
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"
      />
    </svg>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-navy-700 font-semibold">{title}</p>
      {message && <p className="text-navy-400 text-sm mt-1">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} card p-6 max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold text-navy-900">{title}</h3>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-700 text-xl leading-none">
            &times;
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ percent, color = 'teal' }) {
  const colorMap = { teal: 'bg-teal-500', gold: 'bg-gold-500', medblue: 'bg-medblue-500' };
  return (
    <div className="w-full h-2.5 rounded-full bg-surface-muted overflow-hidden">
      <div
        className={`h-full rounded-full ${colorMap[color]} transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
