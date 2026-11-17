import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { num } from '../lib/format.js';
import { FoodToken, Loading } from '../components/bits.jsx';

export default function Landing() {
  const { user } = useAuth();
  const [listings, setListings] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api('/listings').then((d) => setListings(d.listings)).catch(() => setListings([]));
    api('/reports/summary').then(setSummary).catch(() => {});
  }, []);

  const donorCta = user?.role === 'donor' ? '/donor/new' : '/register?role=donor';

  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>Surplus food, collected while it's still good.</h1>
            <p className="hero-lede">
              Messes, caterers and wedding halls list what's left over. Verified NGOs and volunteers nearby
              claim it and pick it up, usually within the hour.
            </p>
            <div className="row hero-cta">
              <Link to={donorCta} className="btn btn-primary">List surplus food</Link>
              <Link to="/browse" className="btn btn-ghost">Find food to collect</Link>
            </div>
            <p className="hero-note">Free for donors. Claiming is open to verified groups only.</p>
          </div>

          <div className="board" aria-live="polite">
            <div className="board-head">
              <h2>Waiting for pickup</h2>
              <span className="live">Live</span>
            </div>
            {!listings && <Loading />}
            {listings?.length === 0 && (
              <div className="empty"><h3>Nothing waiting right now</h3><p className="muted">New listings appear here as soon as a donor posts them.</p></div>
            )}
            {listings?.slice(0, 4).map((l) => <FoodToken key={l.listing_id} l={l} />)}
            {listings?.length > 4 && (
              <Link to="/browse" className="btn btn-ghost">See all {listings.length} on the map</Link>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>How a pickup works</h2>
            <p>No delivery fleet. The group that claims the food comes to collect it, and a pickup code confirms the handover.</p>
          </div>
          <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li className="step">
              <div className="step-n">1</div>
              <h3>List what's left</h3>
              <p>Say what it is, how many it feeds, and until when it's safe to eat. Your pickup point goes on the map.</p>
            </li>
            <li className="step">
              <div className="step-n">2</div>
              <h3>A verified group claims it</h3>
              <p>Only NGOs and volunteers whose documents we've checked can claim. The first to claim gets it, along with a 4-digit pickup code.</p>
            </li>
            <li className="step">
              <div className="step-n">3</div>
              <h3>They collect from you</h3>
              <p>Message each other on WhatsApp to arrange the handover. Enter their code when they arrive to mark it collected.</p>
            </li>
          </ol>
        </div>
      </section>

      {summary && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head"><h2>So far</h2></div>
            <div className="tally">
              <div><b>{num(summary.meals_rescued)}</b><span>servings collected instead of thrown away</span></div>
              <div><b>{num(summary.rescues)}</b><span>pickups completed</span></div>
              <div><b>{num(summary.meals_available_now)}</b><span>servings waiting right now</span></div>
              <div><b>{num(summary.verified_claimers)}</b><span>verified NGOs and volunteers</span></div>
            </div>
            <p style={{ marginTop: 24 }}><Link to="/impact">See the full impact report</Link></p>
          </div>
        </section>
      )}

      <footer className="footer">
        <div className="wrap spread">
          <span>Food Rescue. An Advanced SQL project.</span>
          <span>Map data from OpenStreetMap</span>
        </div>
      </footer>
    </main>
  );
}
