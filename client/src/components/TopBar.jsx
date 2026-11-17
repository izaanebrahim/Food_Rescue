import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { ROLES } from '../lib/format.js';
import { Logo } from './bits.jsx';

const LINKS = {
  guest: [['/browse', 'Find food'], ['/impact', 'Impact']],
  donor: [['/donor', 'My listings'], ['/donor/new', 'List food'], ['/impact', 'Impact']],
  ngo: [['/browse', 'Find food'], ['/claims', 'My pickups'], ['/verify', 'Verification'], ['/impact', 'Impact']],
  volunteer: [['/browse', 'Find food'], ['/claims', 'My pickups'], ['/verify', 'Verification'], ['/impact', 'Impact']],
  admin: [['/admin', 'Verification queue'], ['/admin/users', 'Users'], ['/impact', 'Impact']],
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () => api('/notifications').then((d) => alive && setUnread(d.unread)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [user, loc.pathname]);

  const links = LINKS[user?.role || 'guest'];

  return (
    <header className="topbar">
      <div className="wrap">
        <Link to="/" className="brand"><Logo />Food Rescue</Link>
        <nav className={`nav ${open ? 'open' : ''}`} aria-label="Main">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/donor' || to === '/admin'}>{label}</NavLink>
          ))}
        </nav>
        <div className="topbar-end">
          {user ? (
            <>
              <Link to="/notifications" className="bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <div className="who">
                {user.org_name || user.full_name}
                <small>{ROLES[user.role]}{user.role !== 'donor' && user.role !== 'admin' && user.verification_status !== 'verified' ? ', not verified yet' : ''}</small>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { logout(); nav('/'); }}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm guest-signup">Sign up</Link>
            </>
          )}
          <button className="icon-btn menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}
