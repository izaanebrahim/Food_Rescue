import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { num } from '../lib/format.js';
import { Empty, ErrorNote, FoodToken, Loading } from '../components/bits.jsx';
import { ListingsMap } from '../components/MapView.jsx';

const TYPES = [['', 'All'], ['veg', 'Veg'], ['non_veg', 'Non-veg'], ['vegan', 'Vegan']];
const SRM = { lat: 12.8231, lng: 80.0444 };

export default function Browse() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [radius, setRadius] = useState(15);
  const [me, setMe] = useState(user?.lat ? { lat: user.lat, lng: user.lng } : SRM);
  const [listings, setListings] = useState(null);
  const [error, setError] = useState('');
  const [hl, setHl] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api(`/listings?lat=${me.lat}&lng=${me.lng}&radius=${radius}${type ? `&food_type=${type}` : ''}`)
        .then((d) => { if (alive) { setListings(d.listings); setError(''); } })
        .catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [me, radius, type]);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setMe({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => setError('Location permission was denied, so distances are from your saved address.')
    );

  const isClaimer = user && ['ngo', 'volunteer'].includes(user.role);
  const total = listings?.reduce((s, l) => s + l.quantity_servings, 0) || 0;

  return (
    <main className="wrap page">
      <div className="page-head spread">
        <div>
          <h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>Food near you</h1>
          <p className="muted">
            {listings ? `${listings.length} listing${listings.length === 1 ? '' : 's'}, ${num(total)} servings within ${radius} km. Closest first.` : 'Finding food nearby'}
          </p>
        </div>
      </div>

      {isClaimer && user.verification_status !== 'verified' && (
        <div className="alert alert-warn" style={{ marginBottom: 18 }}>
          You can look around, but you can claim food only after your account is verified. <Link to="/verify">Upload your documents</Link>
        </div>
      )}

      <div className="filters">
        <div className="seg" role="group" aria-label="Food type">
          {TYPES.map(([v, label]) => (
            <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>{label}</button>
          ))}
        </div>
        <label className="sr-only" htmlFor="radius">Distance</label>
        <select id="radius" className="select" value={radius} onChange={(e) => setRadius(+e.target.value)}>
          {[3, 5, 10, 15, 25, 50].map((r) => <option key={r} value={r}>Within {r} km</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" style={{ height: 42 }} onClick={locate}>Use my location</button>
      </div>

      <ErrorNote error={error} />

      <div className="browse" style={{ marginTop: error ? 16 : 0 }}>
        <div className="browse-list">
          {!listings && <Loading />}
          {listings?.length === 0 && (
            <Empty title="No food in this area right now">
              Try a bigger distance, or check back in a while. Most listings go up around lunch and after dinner.
            </Empty>
          )}
          {listings?.map((l) => <FoodToken key={l.listing_id} l={l} onHover={setHl} />)}
        </div>
        <div className="browse-map">
          <ListingsMap listings={listings || []} me={me} highlight={hl} onSelect={(id) => nav(`/listings/${id}`)} />
        </div>
      </div>
    </main>
  );
}
