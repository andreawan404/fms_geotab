import React, { useEffect } from 'react';
import { useApp } from '../AppContext.jsx';

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="tms-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`tms-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="tms-modal-head">
          <h3>{title}</h3>
          <button className="tms-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="tms-modal-body">{children}</div>
        {footer && <div className="tms-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const STATUS_CLS = { planned: 'gray', in_progress: 'blue', completed: 'green', missed: 'amber', deviated: 'red' };
export function StatusBadge({ status }) {
  const { t } = useApp();
  if (!status) return <span className="tms-badge gray">-</span>;
  return <span className={`tms-badge ${STATUS_CLS[status] || 'gray'}`}>{t(`status.${status}`)}</span>;
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`tms-field ${className}`}>
      <span className="tms-field-label">{label}</span>
      {children}
      {hint && <span className="tms-hint">{hint}</span>}
    </label>
  );
}

export function Spinner({ text }) {
  return (
    <div className="tms-spinner">
      <span className="tms-dot" />
      {text}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="tms-empty">{children}</div>;
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="tms-toasts">
      {toasts.map((x) => (
        <div key={x.id} className={`tms-toast ${x.kind}`}>{x.message}</div>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = '' }) {
  return (
    <div className={`tms-kpi ${tone}`}>
      <div className="tms-kpi-v">{value}</div>
      <div className="tms-kpi-l">{label}</div>
      {sub && <div className="tms-kpi-s">{sub}</div>}
    </div>
  );
}

export function download(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}
