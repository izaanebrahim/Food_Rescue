import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FOOD_TYPES, STATUS, duration, freshness } from '../lib/format.js';

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1F4D33" />
      <path d="M8 19c0-5 4-9 9-9h7v2c0 5-4 9-9 9H8z" fill="#E3A616" />
      <path d="M8 24c4-6 8-9 14-11" stroke="#1F4D33" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Diet({ type }) {
  return <span className={`diet ${type}`}><i aria-hidden="true" />{FOOD_TYPES[type]}</span>;
}

export function Badge({ status, children }) {
  return <span className={`badge badge-${status}`}>{children || STATUS[status] || status}</span>;
}

/** Re-render every `ms` so countdowns stay current. */
export function useNow(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function Freshness({ expires, prepared }) {
  useNow();
  const f = freshness(expires, prepared);
  const label = f.left <= 0 ? 'Past safe time' : `Safe for ${duration(f.left)} more`;
  return (
    <div className={`fresh ${f.level}`}>
      <div className="fresh-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.pct)} aria-label="Time left before the food is no longer safe">
        <span style={{ width: `${f.pct}%` }} />
      </div>
      <span className="fresh-label">{label}</span>
    </div>
  );
}

export function FoodToken({ l, to = `/listings/${l.listing_id}`, onHover }) {
  const Tag = to ? Link : 'div';
  return (
    <Tag to={to} className={`token ${l.status === 'claimed' ? 'is-claimed' : ''}`}
         onMouseEnter={() => onHover?.(l.listing_id)} onMouseLeave={() => onHover?.(null)}>
      <div className="token-stub">
        <b>{l.quantity_servings}</b>
        <small>servings</small>
      </div>
      <div className="token-body">
        <div className="token-title">{l.title}</div>
        <div className="token-meta">
          <span>{l.donor_name}</span>
          {l.distance_km != null && <span>{l.distance_km < 1 ? `${Math.round(l.distance_km * 1000)} m` : `${Number(l.distance_km).toFixed(1)} km`}</span>}
          <Diet type={l.food_type} />
        </div>
        <Freshness expires={l.expires_at} prepared={l.prepared_at} />
      </div>
    </Tag>
  );
}

export function Loading({ label = 'Loading' }) {
  return <div className="loading" role="status"><div className="spinner" />{label}</div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="alert alert-error" role="alert">{error}</div>;
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [node, setMsg];
}

export function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.5-.7-2.2-1.4-.6-.5-1-1.2-1.2-1.6-.1-.2 0-.4.1-.5l.4-.5.3-.5v-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 1.8.8 2.5.8 3.4.7.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}
