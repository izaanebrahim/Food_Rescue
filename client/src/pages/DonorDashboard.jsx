import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { dateTime, duration, minutesUntil, num, time } from '../lib/format.js';
import { Badge, Diet, Empty, ErrorNote, Loading, WhatsAppIcon, useNow, useToast } from '../components/bits.jsx';

function ClaimedRow({ l, onDone, toast }) {
  useNow(15000);
  const [code, setCode] = useState('');
  const [contact, setContact] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/listings/${l.listing_id}/contact`).then(setContact).catch(() => {}); }, [l.listing_id]);

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/listings/${l.listing_id}/confirm-pickup`, { method: 'POST', body: { code } });
      toast(`Marked collected. ${l.quantity_servings} servings rescued.`);
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const left = minutesUntil(l.pickup_deadline);
  return (
    <div className="stack" style={{ '--gap': '12px', marginTop: 14 }}>
      <div className="alert alert-warn">
        <strong>{l.claimant_name}</strong> is coming to collect.{' '}
        {left > 0 ? `They have ${duration(left)} (until ${time(l.pickup_deadline)}).` : 'Their time is up; if they do not arrive it will be relisted automatically.'}
      </div>
      <div className="row">
        <form className="code-entry" onSubmit={confirm}>
          <label className="sr-only" htmlFor={`code-${l.listing_id}`}>Pickup code</label>
          <input id={`code-${l.listing_id}`} className="input" inputMode="numeric" maxLength={4} placeholder="0000"
                 value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button className="btn btn-primary" disabled={code.length !== 4 || busy}>Confirm pickup</button>
        </form>
        {contact && <a className="btn btn-wa" href={contact.whatsapp} target="_blank" rel="noreferrer"><WhatsAppIcon />Message {contact.person.split(' ')[0]}</a>}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

function Row({ l, reload, toast }) {
  const [busy, setBusy] = useState(false);
  const withdraw = async () => {
    if (!window.confirm(`Withdraw "${l.title}"? It will be removed from the map.`)) return;
    setBusy(true);
    try { await api(`/listings/${l.listing_id}/cancel`, { method: 'POST' }); toast('Listing withdrawn'); reload(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const open = l.status === 'available' || l.status === 'claimed';
  return (
    <div className="lrow">
      <div>
        <div className="row" style={{ gap: 10 }}>
          <h3><Link to={`/listings/${l.listing_id}`} style={{ textDecoration: 'none' }}>{l.title}</Link></h3>
          <Badge status={l.status} />
        </div>
        <div className="meta">
          <span>{l.quantity_servings} servings</span>
          <Diet type={l.food_type} />
          {open && <span>{l.minutes_left > 0 ? `Safe for ${duration(l.minutes_left)}` : 'Past safe time'}</span>}
          {l.status === 'picked_up' && <span>Collected by {l.claimant_name}, {dateTime(l.picked_up_at)}</span>}
          {!open && l.status !== 'picked_up' && <span>Listed {dateTime(l.created_at)}</span>}
        </div>
        {l.status === 'claimed' && <ClaimedRow l={l} onDone={reload} toast={toast} />}
      </div>
      {open && <button className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>Withdraw</button>}
    </div>
  );
}

const TABS = [
  ['open', 'Open', (l) => l.status === 'available' || l.status === 'claimed'],
  ['done', 'Collected', (l) => l.status === 'picked_up'],
  ['closed', 'Expired or withdrawn', (l) => l.status === 'expired' || l.status === 'cancelled'],
];

export default function DonorDashboard() {
  const { user } = useAuth();
  const loc = useLocation();
  const [listings, setListings] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [toastNode, toast] = useToast();

  const load = useCallback(() => api('/listings/mine').then((d) => setListings(d.listings)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (loc.state?.posted) toast('Listed. Nearby NGOs and volunteers can see it now.'); }, []); // eslint-disable-line

  const collected = listings?.filter((l) => l.status === 'picked_up') || [];
  const thisMonth = collected.filter((l) => new Date(l.picked_up_at).getMonth() === new Date().getMonth());
  const shown = listings?.filter(TABS.find((t) => t[0] === tab)[2]) || [];

  return (
    <main className="wrap page">
      <div className="page-head spread">
        <div>
          <h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>{user.org_name || user.full_name}</h1>
          {listings && (
            <p className="muted">
              {num(collected.reduce((s, l) => s + l.quantity_servings, 0))} servings collected from you in total,{' '}
              {num(thisMonth.reduce((s, l) => s + l.quantity_servings, 0))} this month.
            </p>
          )}
        </div>
        <Link to="/donor/new" className="btn btn-primary">List food</Link>
      </div>

      <ErrorNote error={error} />
      <div className="tabs" role="tablist">
        {TABS.map(([k, label, f]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}<span className="count">{listings ? listings.filter(f).length : ''}</span>
          </button>
        ))}
      </div>

      {!listings && <Loading />}
      {listings && shown.length === 0 && (
        tab === 'open'
          ? <Empty title="Nothing listed right now" action={<Link to="/donor/new" className="btn btn-primary">List food</Link>}>When you have food left over, list it here and nearby groups will see it straight away.</Empty>
          : <Empty title="Nothing here yet" />
      )}
      {shown.length > 0 && (
        <div className="panel" style={{ padding: 0 }}>
          {shown.map((l) => <Row key={l.listing_id} l={l} reload={load} toast={toast} />)}
        </div>
      )}
      {toastNode}
    </main>
  );
}
