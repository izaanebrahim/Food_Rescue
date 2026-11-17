import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { dateTime, duration, minutesUntil, num, time } from '../lib/format.js';
import { Badge, Diet, Empty, ErrorNote, Loading, useNow } from '../components/bits.jsx';

export default function MyClaims() {
  useNow(15000);
  const { user } = useAuth();
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/claims/mine').then((d) => setClaims(d.claims)).catch((e) => setError(e.message)); }, []);

  const active = claims?.filter((c) => c.status === 'active') || [];
  const past = claims?.filter((c) => c.status !== 'active') || [];
  const served = past.filter((c) => c.status === 'completed').reduce((s, c) => s + c.quantity_servings, 0);

  return (
    <main className="wrap page">
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>My pickups</h1>
        {claims && <p className="muted">{num(served)} servings collected by {user.org_name || 'you'} so far.</p>}
      </div>
      <ErrorNote error={error} />
      {!claims && <Loading />}

      {claims && active.length === 0 && (
        <Empty title="Nothing to collect right now" action={<Link to="/browse" className="btn btn-primary">Find food near you</Link>} />
      )}

      {active.map((c) => (
        <Link key={c.claim_id} to={`/listings/${c.listing_id}`} className="code-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, textDecoration: 'none', marginBottom: 12 }}>
          <div>
            <p>Collect from {c.donor_name}</p>
            <h3 style={{ color: '#f4f7f1', margin: '6px 0' }}>{c.title}, {c.quantity_servings} servings</h3>
            <p>{c.pickup_address}. By {time(c.pickup_deadline)}, {minutesUntil(c.pickup_deadline) > 0 ? `${duration(minutesUntil(c.pickup_deadline))} left` : 'deadline passed'}.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p>Code</p>
            <div className="code" style={{ fontSize: 48 }}>{c.pickup_code}</div>
          </div>
        </Link>
      ))}

      {past.length > 0 && (
        <>
          <h2 style={{ fontSize: 24, margin: '40px 0 14px' }}>Earlier</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Food</th><th>From</th><th className="num">Servings</th><th>Claimed</th><th>Result</th></tr></thead>
              <tbody>
                {past.map((c) => (
                  <tr key={c.claim_id}>
                    <td><Link to={`/listings/${c.listing_id}`}>{c.title}</Link> <Diet type={c.food_type} /></td>
                    <td>{c.donor_name}</td>
                    <td className="num">{c.quantity_servings}</td>
                    <td>{dateTime(c.claimed_at)}</td>
                    <td><Badge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
