import { useCallback, useEffect, useState } from 'react';
import { api, openProtectedFile } from '../lib/api.js';
import { ROLES, ago, dateTime } from '../lib/format.js';
import { Badge, Empty, ErrorNote, Loading, useToast } from '../components/bits.jsx';

const DOC_NAMES = { ngo_darpan: 'NGO Darpan ID', ngo_registration: 'Trust or society registration', college_id: 'College ID', govt_id: 'Government ID' };

function Request({ r, onDone, toast }) {
  const [remarks, setRemarks] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const review = async (decision) => {
    setBusy(true); setError('');
    try {
      await api(`/admin/verifications/${r.request_id}/review`, { method: 'POST', body: { decision, remarks } });
      toast(decision === 'approved' ? `${r.org_name || r.full_name} can now claim food` : 'Rejected. They have been told why.');
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <article className="panel stack" style={{ '--gap': '16px' }}>
      <div className="spread">
        <div>
          <h3>{r.org_name || r.full_name}</h3>
          <p className="faint">{ROLES[r.role]}{r.org_name ? `, contact ${r.full_name}` : ''}. Submitted {ago(r.submitted_at)}.</p>
        </div>
        {r.previous_rejections > 0 && <Badge status="rejected">{r.previous_rejections} earlier rejection{r.previous_rejections > 1 ? 's' : ''}</Badge>}
      </div>
      <dl className="kv">
        <dt>Document</dt><dd>{DOC_NAMES[r.document_type]}</dd>
        <dt>Number</dt><dd><strong>{r.document_ref}</strong></dd>
        <dt>Phone</dt><dd>+{r.phone}</dd>
        <dt>Email</dt><dd>{r.email}</dd>
        <dt>Address</dt><dd>{r.address || 'Not given'}</dd>
        <dt>Joined</dt><dd>{dateTime(r.joined_at)}</dd>
      </dl>
      {r.status === 'pending' && (
        <>
          <ErrorNote error={error} />
          {rejecting && (
            <label className="field"><span>Reason (they will see this)</span>
              <input className="input" autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Document is blurry; the registration number is not readable." />
            </label>
          )}
          <div className="row">
            {r.has_file ? (
              <button className="btn btn-ghost btn-sm" onClick={() => openProtectedFile(`/admin/verifications/${r.request_id}/document`).catch((e) => setError(e.message))}>Open document</button>
            ) : <span className="faint">No file attached (demo data)</span>}
            <span style={{ flex: 1 }} />
            {!rejecting ? (
              <>
                <button className="btn btn-danger btn-sm" onClick={() => setRejecting(true)}>Reject</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => review('approved')}>Approve</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>Back</button>
                <button className="btn btn-danger btn-sm" disabled={busy || !remarks.trim()} onClick={() => review('rejected')}>Reject with reason</button>
              </>
            )}
          </div>
        </>
      )}
      {r.status !== 'pending' && <p className="faint"><Badge status={r.status} /> {dateTime(r.reviewed_at)}{r.remarks ? `: ${r.remarks}` : ''}</p>}
    </article>
  );
}

export function AdminQueue() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [toastNode, toast] = useToast();

  const load = useCallback(() => {
    api(`/admin/verifications?status=${status}`).then((d) => setRows(d.requests)).catch((e) => setError(e.message));
    api('/reports/summary').then(setSummary).catch(() => {});
  }, [status]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <main className="wrap page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>Verification queue</h1>
        <p className="muted">Check that the organisation or person is real before they can claim food. Approving lets them claim straight away.</p>
      </div>
      <div className="tabs" role="tablist">
        {[['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)}>
            {label}{k === 'pending' && summary ? <span className="count">{summary.pending_verifications}</span> : null}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      {!rows && <Loading />}
      {rows?.length === 0 && <Empty title={status === 'pending' ? 'All caught up' : 'Nothing here'}>{status === 'pending' && 'New submissions will appear here.'}</Empty>}
      <div className="stack">{rows?.map((r) => <Request key={r.request_id} r={r} onDone={load} toast={toast} />)}</div>
      {toastNode}
    </main>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/admin/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message)); }, []);
  return (
    <main className="wrap page">
      <div className="page-head"><h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>Users</h1></div>
      <ErrorNote error={error} />
      {!users && <Loading />}
      {users && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Status</th><th className="num">Listings</th><th className="num">Claims</th><th className="num">Missed</th><th>Joined</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td><strong>{u.org_name || u.full_name}</strong><div className="faint">{u.email}</div></td>
                  <td>{ROLES[u.role]}</td>
                  <td>{new Date(u.suspended_until) > new Date() ? <Badge status="rejected">Paused</Badge> : <Badge status={u.verification_status} />}</td>
                  <td className="num">{u.listings || ''}</td>
                  <td className="num">{u.claims || ''}</td>
                  <td className="num">{u.no_show_count || ''}</td>
                  <td>{dateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
