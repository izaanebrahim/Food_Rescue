import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorNote } from '../components/bits.jsx';
import { LocationPicker } from '../components/MapView.jsx';

function Side() {
  return (
    <aside className="auth-side">
      <div>
        <h2>Good food shouldn't end up in the bin.</h2>
        <p>Food Rescue connects kitchens around Kattankulathur with the people who can get it to someone hungry, the same day.</p>
      </div>
      <ul>
        <li>Donors list surplus in under a minute</li>
        <li>NGOs and volunteers are verified before they can claim</li>
        <li>Contact happens on WhatsApp, only after a claim</li>
      </ul>
    </aside>
  );
}

const DEMO = [
  ['Donor', 'mess@foodrescue.local'],
  ['NGO', 'annam@foodrescue.local'],
  ['Volunteer', 'arjun@foodrescue.local'],
  ['Unverified volunteer', 'divya@foodrescue.local'],
  ['Admin', 'admin@foodrescue.local'],
];

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await login(email, password);
      nav(loc.state?.from || homeFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <Side />
      <div className="auth-main">
        <form className="auth-form stack" style={{ '--gap': '18px' }} onSubmit={submit}>
          <div>
            <h2>Log in</h2>
            <p className="muted" style={{ marginTop: 6 }}>New here? <Link to="/register">Create an account</Link></p>
          </div>
          <ErrorNote error={error} />
          <label className="field"><span>Email</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field"><span>Password</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Logging in' : 'Log in'}</button>

          <div className="demo">
            <strong>Demo accounts</strong> (password <code>password123</code>)
            <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
              {DEMO.map(([label, em]) => (
                <div key={em}>{label}: <button type="button" onClick={() => { setEmail(em); setPassword('password123'); }}>{em}</button></div>
              ))}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

const ROLE_OPTIONS = [
  ['donor', 'I have surplus food', 'Restaurant, mess, caterer, hall or home'],
  ['ngo', 'We run an NGO', 'Shelter, orphanage, food bank or trust'],
  ['volunteer', 'I want to volunteer', 'Collect food and take it where it is needed'],
];

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({
    role: params.get('role') || 'donor', full_name: '', org_name: '', email: '', phone: '', password: '', address: '',
  });
  const [spot, setSpot] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setSpot({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => setError('Location permission was denied. Click on the map instead.')
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await register({ ...f, lat: spot?.lat, lng: spot?.lng });
      nav(u.role === 'donor' ? '/donor' : '/verify', { replace: true });
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const orgLabel = f.role === 'ngo' ? 'Organisation name' : f.role === 'donor' ? 'Business or place name' : null;

  return (
    <main className="auth">
      <Side />
      <div className="auth-main">
        <form className="auth-form stack" style={{ '--gap': '18px' }} onSubmit={submit}>
          <div>
            <h2>Create an account</h2>
            <p className="muted" style={{ marginTop: 6 }}>Already have one? <Link to="/login">Log in</Link></p>
          </div>
          <ErrorNote error={error} />

          <fieldset className="choice choice-list" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Account type</legend>
            {ROLE_OPTIONS.map(([v, t, s]) => (
              <label key={v}>
                <input type="radio" name="role" value={v} checked={f.role === v} onChange={set('role')} />
                <strong>{t}</strong><small>{s}</small>
              </label>
            ))}
          </fieldset>

          {f.role !== 'donor' && (
            <div className="alert alert-warn">You'll upload a registration certificate or ID after signing up. You can claim food once an admin approves it.</div>
          )}

          <label className="field"><span>{f.role === 'ngo' ? 'Contact person' : 'Your name'}</span>
            <input className="input" required autoComplete="name" value={f.full_name} onChange={set('full_name')} />
          </label>
          {orgLabel && (
            <label className="field"><span>{orgLabel}</span>
              <input className="input" required={f.role === 'ngo'} value={f.org_name} onChange={set('org_name')} placeholder={f.role === 'donor' ? 'Optional' : ''} />
            </label>
          )}
          <div className="grid-2">
            <label className="field"><span>Email</span>
              <input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
            </label>
            <label className="field"><span>WhatsApp number</span>
              <input className="input" type="tel" required inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={f.phone} onChange={set('phone')} />
            </label>
          </div>
          <label className="field"><span>Password</span>
            <input className="input" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} />
            <small className="hint">At least 8 characters</small>
          </label>
          <label className="field"><span>{f.role === 'donor' ? 'Usual pickup address' : 'Address'}</span>
            <input className="input" value={f.address} onChange={set('address')} placeholder="Street, area" />
          </label>
          <div className="field">
            <div className="spread"><span style={{ fontWeight: 700, fontSize: 15 }}>Location on the map</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}>Use my location</button></div>
            <LocationPicker value={spot} onChange={setSpot} height={220} />
            <small className="hint">{spot ? `Set to ${spot.lat}, ${spot.lng}` : 'Click the map to place your pin. Used to show food near you.'}</small>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating account' : 'Create account'}</button>
        </form>
      </div>
    </main>
  );
}
