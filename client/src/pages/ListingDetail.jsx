import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES, STATUS, dateTime, duration, minutesUntil, time } from '../lib/format.js';
import { Badge, Diet, ErrorNote, Freshness, Loading, WhatsAppIcon, useNow, useToast } from '../components/bits.jsx';
import { SpotMap } from '../components/MapView.jsx';

function Countdown({ to }) {
  useNow(15000);
  const m = minutesUntil(to);
  return <div className="countdown">{m > 0 ? `${duration(m)} left` : 'Deadline passed'}</div>;
}

function ClaimPanel({ listing, myClaim, onChange, toast }) {
  const { user } = useAuth();
  const [windowMin, setWindowMin] = useState(45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contact, setContact] = useState(null);
  const [rating, setRating] = useState(0);

  const active = myClaim?.status === 'active';

  useEffect(() => {
    if (!active) return;
    api(`/claims/${myClaim.claim_id}/contact`).then(setContact).catch(() => {});
  }, [active, myClaim?.claim_id]);

  const act = async (fn, okMsg) => {
    setBusy(true); setError('');
    try { await fn(); if (okMsg) toast(okMsg); await onChange(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!user) {
    return (
      <div className="panel stack">
        <h3>Want to collect this?</h3>
        <p className="muted">Log in with a verified NGO or volunteer account to claim it.</p>
        <div className="row"><Link to="/login" className="btn btn-primary">Log in</Link><Link to="/register?role=ngo" className="btn btn-ghost">Sign up</Link></div>
      </div>
    );
  }

  if (active) {
    return (
      <div className="stack">
        <div className="code-card">
          <p>Your pickup code</p>
          <div className="code" aria-label={`Pickup code ${myClaim.pickup_code.split('').join(' ')}`}>{myClaim.pickup_code}</div>
          <p>Show this to {listing.donor_name} when you collect. Collect by {time(myClaim.pickup_deadline)}.</p>
          <div style={{ margin: '18px 0' }}><Countdown to={myClaim.pickup_deadline} /></div>
          <div className="row">
            {contact && (
              <a className="btn btn-wa" href={contact.whatsapp} target="_blank" rel="noreferrer"><WhatsAppIcon />Message on WhatsApp</a>
            )}
            {contact && <a className="btn btn-ghost" href={contact.maps} target="_blank" rel="noreferrer">Directions</a>}
          </div>
        </div>
        <ErrorNote error={error} />
        <p className="faint">
          Can't make it? Cancel now so someone else can collect it. Missing the deadline three times pauses claiming for a day.
        </p>
        <button className="btn btn-danger btn-sm" disabled={busy}
                onClick={() => act(() => api(`/claims/${myClaim.claim_id}/cancel`, { method: 'POST' }), 'Claim cancelled')}>
          Cancel my claim
        </button>
      </div>
    );
  }

  if (myClaim?.status === 'completed') {
    return (
      <div className="panel stack">
        <Badge status="completed" />
        <h3>You collected this {dateTime(myClaim.picked_up_at)}</h3>
        <p className="muted">How was the handover?</p>
        <div className="row" role="group" aria-label="Rating out of 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`btn btn-sm ${rating >= n ? 'btn-turmeric' : 'btn-ghost'}`} onClick={() => setRating(n)} aria-pressed={rating === n}>{n}</button>
          ))}
        </div>
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-sm" disabled={!rating || busy}
                onClick={() => act(() => api(`/claims/${myClaim.claim_id}/feedback`, { method: 'POST', body: { rating } }), 'Thanks for the feedback')}>
          Send rating
        </button>
      </div>
    );
  }

  if (listing.status !== 'available') {
    return (
      <div className="panel">
        <h3>{listing.status === 'claimed' ? 'Someone is already collecting this' : `This listing is ${STATUS[listing.status].toLowerCase()}`}</h3>
        <p className="muted" style={{ marginTop: 8 }}><Link to="/browse">See other food nearby</Link></p>
      </div>
    );
  }

  if (!['ngo', 'volunteer'].includes(user.role)) {
    return (
      <div className="panel"><h3>Only NGOs and volunteers can claim food</h3>
        <p className="muted" style={{ marginTop: 8 }}>You're logged in as a {user.role}.</p></div>
    );
  }

  if (user.verification_status !== 'verified') {
    return (
      <div className="panel stack">
        <Badge status={user.verification_status} />
        <h3>Get verified to claim food</h3>
        <p className="muted">
          {user.verification_status === 'pending'
            ? 'Your documents are with an admin. You can claim as soon as they approve them.'
            : 'Donors only hand food to groups we have checked. Upload your registration or ID to get started.'}
        </p>
        {user.verification_status !== 'pending' && <Link to="/verify" className="btn btn-primary">Upload documents</Link>}
      </div>
    );
  }

  const latest = Math.min(120, Math.max(15, minutesUntil(listing.expires_at)));
  return (
    <div className="panel stack" style={{ '--gap': '18px' }}>
      <h3>Claim and collect</h3>
      <label className="field"><span>When can you collect it?</span>
        <select className="select" value={Math.min(windowMin, latest)} onChange={(e) => setWindowMin(+e.target.value)}>
          {[20, 30, 45, 60, 90, 120].filter((m) => m <= latest).map((m) => <option key={m} value={m}>Within {duration(m)}</option>)}
        </select>
        <small className="hint">If you don't arrive by then, the food goes back on the map for others.</small>
      </label>
      <ErrorNote error={error} />
      <button className="btn btn-turmeric btn-block" disabled={busy}
              onClick={() => act(() => api(`/listings/${listing.listing_id}/claim`, { method: 'POST', body: { window_minutes: windowMin } }), 'Claimed. Your pickup code is ready.')}>
        {busy ? 'Claiming' : `Claim ${listing.quantity_servings} servings`}
      </button>
      <p className="faint">After you claim, you'll get a pickup code and a WhatsApp button to contact {listing.donor_name}.</p>
    </div>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [toastNode, toast] = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api(`/listings/${id}`);
      setData(d);
      if (user) api(`/listings/${id}/history`).then((h) => setHistory(h.history)).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  }, [id, user]);

  useEffect(() => { load(); }, [load]);
  // Pick up a fresh verification status when the page opens.
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <main className="wrap page"><ErrorNote error={error} /></main>;
  if (!data) return <main className="wrap page"><Loading /></main>;
  const l = data.listing;

  return (
    <main className="wrap page">
      <p style={{ marginBottom: 18 }}><Link to="/browse" className="faint">Back to food near you</Link></p>
      <div className="detail">
        <div className="stack" style={{ '--gap': '22px' }}>
          <div className="stack" style={{ '--gap': '12px' }}>
            <div className="row"><Badge status={l.status} /><Diet type={l.food_type} /></div>
            <h1 style={{ fontSize: 'clamp(32px,4.4vw,52px)' }}>{l.title}</h1>
            <p className="muted" style={{ fontSize: 19 }}>
              {l.quantity_servings} servings from {l.donor_name}
              {l.donor_rescues > 0 && <span className="faint"> &nbsp;({l.donor_rescues} earlier pickups)</span>}
            </p>
          </div>
          {l.status === 'available' && <Freshness expires={l.expires_at} prepared={l.prepared_at} />}
          {l.description && <p>{l.description}</p>}
          <dl className="facts">
            <div><dt>Type</dt><dd>{CATEGORIES[l.category]}</dd></div>
            <div><dt>Prepared</dt><dd>{dateTime(l.prepared_at)}</dd></div>
            <div><dt>Safe until</dt><dd>{dateTime(l.expires_at)}</dd></div>
            <div><dt>Listed</dt><dd>{dateTime(l.created_at)}</dd></div>
          </dl>
          <div className="stack" style={{ '--gap': '10px' }}>
            <h3>Pickup point</h3>
            <p>{l.pickup_address}</p>
            {l.pickup_notes && <p className="muted">{l.pickup_notes}</p>}
            <div className="mini-map"><SpotMap lat={l.lat} lng={l.lng} label={l.pickup_address} /></div>
          </div>
          {history.length > 0 && (
            <div className="stack" style={{ '--gap': '8px' }}>
              <h3>History</h3>
              <ol className="timeline">
                {history.map((h, i) => (
                  <li key={i}><span>{h.old_status ? `${STATUS[h.old_status]} to ${STATUS[h.new_status].toLowerCase()}` : `Listed as ${STATUS[h.new_status].toLowerCase()}`}</span><time>{dateTime(h.changed_at)}</time></li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <ClaimPanel listing={l} myClaim={data.myClaim} onChange={load} toast={toast} />
      </div>
      {toastNode}
    </main>
  );
}
