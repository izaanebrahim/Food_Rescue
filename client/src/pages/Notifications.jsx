import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { Empty, ErrorNote, Loading } from '../components/bits.jsx';

export default function Notifications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/notifications')
      .then((d) => { setData(d); if (d.unread) api('/notifications/read-all', { method: 'POST' }).catch(() => {}); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1 style={{ fontSize: 'clamp(32px,4vw,44px)' }}>Notifications</h1></div>
      <ErrorNote error={error} />
      {!data && <Loading />}
      {data?.notifications.length === 0 && <Empty title="No notifications yet">Claims, pickups and verification updates show up here.</Empty>}
      {data?.notifications.length > 0 && (
        <div className="panel" style={{ padding: 0 }}>
          {data.notifications.map((n) => (
            <div key={n.notification_id} className={`notif ${n.read_at ? '' : 'unread'}`}>
              <span />
              <p>{n.listing_id ? <Link to={`/listings/${n.listing_id}`} style={{ textDecoration: 'none' }}>{n.message}</Link> : n.message}</p>
              <time dateTime={n.created_at}>{ago(n.created_at)}</time>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
