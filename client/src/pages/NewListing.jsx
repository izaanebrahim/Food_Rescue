import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES, toLocalInput } from '../lib/format.js';
import { ErrorNote } from '../components/bits.jsx';
import { LocationPicker } from '../components/MapView.jsx';

export default function NewListing() {
  const { user } = useAuth();
  const nav = useNavigate();
  const now = Date.now();
  const [f, setF] = useState({
    title: '', description: '', food_type: 'veg', category: 'cooked', quantity_servings: '',
    prepared_at: toLocalInput(now - 30 * 60000), expires_at: toLocalInput(now + 4 * 3600000),
    pickup_address: user.address || '', pickup_notes: '',
  });
  const [spot, setSpot] = useState(user.lat ? { lat: user.lat, lng: user.lng } : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const safeFor = (h) => setF({ ...f, expires_at: toLocalInput(Date.now() + h * 3600000) });

  const submit = async (e) => {
    e.preventDefault();
    if (!spot) { setError('Click the map to set the pickup point'); return; }
    setBusy(true); setError('');
    try {
      await api('/listings', {
        method: 'POST',
        body: {
          ...f,
          quantity_servings: Number(f.quantity_servings),
          prepared_at: new Date(f.prepared_at).toISOString(),
          expires_at: new Date(f.expires_at).toISOString(),
          lat: spot.lat, lng: spot.lng,
        },
      });
      nav('/donor', { state: { posted: true } });
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>List surplus food</h1>
        <p className="muted">Nearby verified NGOs and volunteers see it straight away. Be honest about the safe-until time; it decides how long the listing stays up.</p>
      </div>
      <form className="panel stack" style={{ '--gap': '22px' }} onSubmit={submit}>
        <ErrorNote error={error} />
        <label className="field"><span>What is it?</span>
          <input className="input" required maxLength={120} placeholder="Veg biryani with raita" value={f.title} onChange={set('title')} />
        </label>

        <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field" style={{ marginBottom: 6 }}><span>Food type</span></legend>
          {[['veg', 'Veg'], ['non_veg', 'Non-veg'], ['vegan', 'Vegan']].map(([v, t]) => (
            <label key={v}><input type="radio" name="food_type" value={v} checked={f.food_type === v} onChange={set('food_type')} /><strong>{t}</strong></label>
          ))}
        </fieldset>

        <div className="grid-2">
          <label className="field"><span>Kind of food</span>
            <select className="select" value={f.category} onChange={set('category')}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span>How many people does it feed?</span>
            <input className="input" type="number" min={1} max={5000} required placeholder="40" value={f.quantity_servings} onChange={set('quantity_servings')} />
          </label>
        </div>

        <div className="grid-2">
          <label className="field"><span>Prepared at</span>
            <input className="input" type="datetime-local" required value={f.prepared_at} onChange={set('prepared_at')} />
          </label>
          <label className="field"><span>Safe to eat until</span>
            <input className="input" type="datetime-local" required value={f.expires_at} onChange={set('expires_at')} />
            <span className="row" style={{ gap: 6 }}>
              {[2, 4, 6, 12].map((h) => <button type="button" key={h} className="btn btn-ghost btn-sm" onClick={() => safeFor(h)}>{h} h from now</button>)}
            </span>
          </label>
        </div>
        {f.category === 'cooked' && <p className="faint" style={{ marginTop: -8 }}>Cooked food must be safe for at least another hour, and can be listed for at most 12 hours after it was made.</p>}

        <label className="field"><span>Details</span>
          <textarea className="textarea" maxLength={500} placeholder="What's included, how it's packed, allergens" value={f.description} onChange={set('description')} />
        </label>

        <label className="field"><span>Pickup address</span>
          <input className="input" required value={f.pickup_address} onChange={set('pickup_address')} />
        </label>
        <div className="field">
          <span>Pickup point on the map</span>
          <LocationPicker value={spot} onChange={setSpot} />
          <small className="hint">Click or drag the pin to the exact gate or entrance.</small>
        </div>
        <label className="field"><span>Notes for whoever collects</span>
          <input className="input" maxLength={255} placeholder="Back gate, ask for Ravi. Bring containers." value={f.pickup_notes} onChange={set('pickup_notes')} />
        </label>

        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Listing' : 'List food'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => nav('/donor')}>Cancel</button>
        </div>
      </form>
    </main>
  );
}
