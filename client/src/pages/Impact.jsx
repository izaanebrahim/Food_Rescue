import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ROLES, duration, num } from '../lib/format.js';
import { Loading } from '../components/bits.jsx';

const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

function Source({ children }) {
  return <p className="faint" style={{ marginTop: 12, fontSize: 13 }}>Source: <code>{children}</code></p>;
}

export default function Impact() {
  const [d, setD] = useState(null);

  useEffect(() => {
    Promise.all(['summary', 'daily', 'monthly', 'top-donors', 'reliability', 'speed'].map((r) => api(`/reports/${r}`)))
      .then(([summary, daily, monthly, donors, reliability, speed]) =>
        setD({ summary, daily: daily.rows, monthly: monthly.rows, donors: donors.rows, reliability: reliability.rows, speed }))
      .catch(() => setD({ failed: true }));
  }, []);

  if (!d) return <main className="wrap page"><Loading /></main>;
  if (d.failed) return <main className="wrap page"><div className="alert alert-error">Could not load the reports. Is the server running?</div></main>;

  const maxDay = Math.max(1, ...d.daily.map((x) => x.meals));
  const last30 = d.daily.reduce((s, x) => s + Number(x.meals), 0);
  const maxDonor = Math.max(1, ...d.donors.map((x) => x.meals_rescued));

  return (
    <main className="wrap page">
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(32px,4vw,48px)' }}>Impact</h1>
        <p className="muted">Every number here is calculated live in MySQL from the pickups recorded on Food Rescue.</p>
      </div>

      <div className="tally" style={{ marginBottom: 48 }}>
        <div><b>{num(d.summary.meals_rescued)}</b><span>servings collected</span></div>
        <div><b>{num(d.summary.rescues)}</b><span>pickups completed</span></div>
        <div><b>{d.speed.avg_total ? duration(d.speed.avg_total) : 'n/a'}</b><span>average from listing to pickup</span></div>
        <div><b>{num(d.summary.expired_listings)}</b><span>listings that expired uncollected</span></div>
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="spread"><h2 style={{ fontSize: 22 }}>Last 30 days</h2><span className="muted">{num(last30)} servings</span></div>
        <div className="bars" role="img" aria-label={`Servings collected per day over the last 30 days, ${num(last30)} in total`}>
          {d.daily.map((x) => <div key={x.day} style={{ height: `${(x.meals / maxDay) * 100}%` }} title={`${new Date(x.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${x.meals} servings`} />)}
        </div>
        <div className="bars-axis">
          <span>{new Date(d.daily[0]?.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          <span>Today</span>
        </div>
        <Source>v_daily_rescues_30d (recursive CTE calendar)</Source>
      </section>

      <div className="cols-2">
        <section className="panel">
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>Top donors</h2>
          {d.donors.map((x) => (
            <div key={x.donor_id} className="hbar">
              <span>{x.donor_rank}. {x.donor_name}</span>
              <div className="track"><span style={{ width: `${(x.meals_rescued / maxDonor) * 100}%` }} /></div>
              <span className="num">{num(x.meals_rescued)}</span>
            </div>
          ))}
          <Source>v_top_donors (RANK, share of total)</Source>
        </section>

        <section className="panel">
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>By month</h2>
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Month</th><th className="num">Servings</th><th className="num">Change</th><th className="num">Running total</th></tr></thead>
              <tbody>
                {d.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{monthName(m.month)}</td>
                    <td className="num">{num(m.meals_rescued)}</td>
                    <td className="num" style={{ color: m.change_vs_last_month < 0 ? 'var(--chilli)' : undefined }}>
                      {m.change_vs_last_month == null ? '' : `${m.change_vs_last_month > 0 ? '+' : ''}${num(m.change_vs_last_month)}`}
                    </td>
                    <td className="num">{num(m.meals_running_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Source>v_monthly_impact (SUM OVER, LAG)</Source>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 22, marginBottom: 16 }}>Who turns up</h2>
        <div className="table-wrap" style={{ border: 0 }}>
          <table>
            <thead><tr><th>Rank</th><th>NGO or volunteer</th><th className="num">Collected</th><th className="num">Missed</th><th className="num">Missed %</th><th className="num">Avg time to collect</th></tr></thead>
            <tbody>
              {d.reliability.map((r) => (
                <tr key={r.claimant_id}>
                  <td>{r.pickup_rank}</td>
                  <td>{r.claimant_name} <span className="faint">{ROLES[r.role]}</span></td>
                  <td className="num">{r.completed}</td>
                  <td className="num">{r.missed}</td>
                  <td className="num">{r.no_show_pct}%</td>
                  <td className="num">{r.avg_minutes_to_pickup ? `${r.avg_minutes_to_pickup} min` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Source>v_claimer_reliability (DENSE_RANK)</Source>
      </section>
    </main>
  );
}
