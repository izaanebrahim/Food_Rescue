import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { dateTime } from '../lib/format.js';
import { Badge, ErrorNote, Loading } from '../components/bits.jsx';

const DOCS = {
  ngo: [['ngo_darpan', 'NGO Darpan ID', 'TN/2020/0123456'], ['ngo_registration', 'Trust or society registration', 'Registration number']],
  volunteer: [['college_id', 'College ID card', 'Register number'], ['govt_id', 'Government ID', 'Last 4 digits only, e.g. XXXX-1234']],
};

export default function Verify() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [type, setType] = useState(DOCS[user.role][0][0]);
  const [ref, setRef] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/verification/me').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const form = new FormData();
    form.append('document_type', type);
    form.append('document_ref', ref);
    if (file) form.append('document', file);
    try { await api('/verification', { method: 'POST', form }); await load(); await refresh(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (!data) return <main className="wrap page"><Loading /></main>;
  const { status, requests } = data;
  const latest = requests[0];
  const canSubmit = status === 'unverified' || status === 'rejected';

  return (
    <main className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div className="row" style={{ marginBottom: 12 }}><Badge status={status} /></div>
        <h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>
          {status === 'verified' ? 'You are verified' : status === 'pending' ? 'Documents in review' : 'Verify your account'}
        </h1>
        <p className="muted">
          {status === 'verified' && 'You can claim food. Donors see your name before handing it over.'}
          {status === 'pending' && 'An admin checks every NGO and volunteer before they can claim food. You will get a notification as soon as it is done.'}
          {status === 'unverified' && 'Donors hand food only to groups we have checked. Upload one document; an admin usually reviews it within a day.'}
          {status === 'rejected' && 'Your last submission was not approved. Read the reason below and submit again.'}
        </p>
      </div>

      {status === 'verified' && <Link to="/browse" className="btn btn-primary">Find food near you</Link>}

      {latest?.status === 'rejected' && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}><strong>Reason:</strong> {latest.remarks}</div>
      )}

      {canSubmit && (
        <form className="panel stack" style={{ '--gap': '20px' }} onSubmit={submit}>
          <ErrorNote error={error} />
          <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field" style={{ marginBottom: 6 }}><span>Document</span></legend>
            {DOCS[user.role].map(([v, t]) => (
              <label key={v}><input type="radio" name="doc" value={v} checked={type === v} onChange={() => setType(v)} /><strong>{t}</strong></label>
            ))}
          </fieldset>
          <label className="field"><span>{user.role === 'ngo' ? 'Registration or Darpan number' : 'ID number'}</span>
            <input className="input" required maxLength={60} placeholder={DOCS[user.role].find((d) => d[0] === type)[2]} value={ref} onChange={(e) => setRef(e.target.value)} />
          </label>
          <label className="field"><span>Upload a photo or PDF</span>
            <input className="input" type="file" required accept=".pdf,.jpg,.jpeg,.png" style={{ paddingTop: 10 }} onChange={(e) => setFile(e.target.files[0])} />
            <small className="hint">PDF, JPG or PNG, up to 5 MB. For a government ID, cover all but the last 4 digits.</small>
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting' : 'Submit for review'}</button>
        </form>
      )}

      {requests.length > 0 && (
        <>
          <h2 style={{ fontSize: 22, margin: '36px 0 12px' }}>Submissions</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Document</th><th>Number</th><th>Submitted</th><th>Result</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.request_id}>
                    <td>{Object.values(DOCS).flat().find((d) => d[0] === r.document_type)?.[1]}</td>
                    <td>{r.document_ref}</td>
                    <td>{dateTime(r.submitted_at)}</td>
                    <td><Badge status={r.status} /></td>
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
