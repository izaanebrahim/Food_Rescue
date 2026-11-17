// End-to-end checks against a running server (npm run dev in another terminal).
// Run on a fresh database:  npm run db:setup  then  npm test
// Every check calls the real API, which calls the real procedures,
// triggers and views in MySQL.

const BASE = process.env.API_URL || 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  pass  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`); }
}

const login = async (who) =>
  (await req('/auth/login', { method: 'POST', body: { email: `${who}@foodrescue.local`, password: 'password123' } })).data.token;

async function main() {
  console.log(`Food Rescue smoke test against ${BASE}\n`);

  const health = await req('/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error('Server is not reachable. Start it with npm run dev first.');
    process.exit(1);
  }

  console.log('Authentication and roles');
  const bad = await req('/auth/login', { method: 'POST', body: { email: 'mess@foodrescue.local', password: 'wrong' } });
  check('wrong password is refused with 401', bad.status === 401);
  const [donor, annam, kai, divya, admin, steps, arjun] = await Promise.all(
    ['mess', 'annam', 'kaikoduppom', 'divya', 'admin', 'littlesteps', 'arjun'].map(login));
  check('demo accounts can log in', donor && annam && kai && divya && admin);
  check('protected route without login returns 401', (await req('/claims/mine')).status === 401);
  check('donor cannot open the admin queue (403)', (await req('/admin/verifications', { token: donor })).status === 403);

  console.log('\nListings and nearby search');
  const now = Date.now();
  const created = await req('/listings', {
    method: 'POST', token: donor,
    body: { title: 'Smoke test pongal', food_type: 'veg', quantity_servings: 25,
            prepared_at: new Date(now - 20 * 60e3).toISOString(), expires_at: new Date(now + 3 * 3600e3).toISOString() },
  });
  check('donor can list food', created.status === 201, JSON.stringify(created.data));
  const id = created.data.listing_id;

  const tooSoon = await req('/listings', {
    method: 'POST', token: donor,
    body: { title: 'Nearly spoiled', food_type: 'veg', quantity_servings: 5,
            prepared_at: new Date(now - 60 * 60e3).toISOString(), expires_at: new Date(now + 20 * 60e3).toISOString() },
  });
  check('trigger rejects food with under 60 minutes of safe time', tooSoon.status === 400 && /60 more minutes/.test(tooSoon.data.error));

  const ngoList = await req('/listings', {
    method: 'POST', token: annam,
    body: { title: 'x', food_type: 'veg', quantity_servings: 5, prepared_at: new Date(now).toISOString(), expires_at: new Date(now + 3 * 3600e3).toISOString() },
  });
  check('an NGO cannot list food (403)', ngoList.status === 403);

  const near = await req('/listings?lat=12.8231&lng=80.0444&radius=10');
  const sorted = near.data.listings.every((l, i, a) => i === 0 || a[i - 1].distance_km <= l.distance_km);
  check('sp_nearby_listings returns results closest first', near.status === 200 && near.data.listings.length > 0 && sorted);
  check('new listing appears in the nearby results', near.data.listings.some((l) => l.listing_id === id));

  console.log('\nVerification gate');
  const unverified = await req(`/listings/${id}/claim`, { method: 'POST', token: divya, body: {} });
  check('unverified volunteer cannot claim', unverified.status === 400 && /verified/.test(unverified.data.error));

  console.log('\nConcurrent claims (race condition)');
  // Four verified claimers press "Claim" at the same instant.
  const racers = [annam, kai, steps, arjun];
  const race = await Promise.all(
    racers.map((t) => req(`/listings/${id}/claim`, { method: 'POST', token: t, body: { window_minutes: 45 } })));
  const winners = race.filter((r) => r.status === 201);
  check('exactly one of four simultaneous claims succeeds', winners.length === 1, race.map((r) => r.status).join(','));
  check('the other three get "already claimed"',
    race.filter((r) => r.status === 400 && /already claimed/.test(r.data.error)).length === 3);
  const win = winners[0]?.data;
  const winToken = racers[race.findIndex((r) => r.status === 201)];
  const loseToken = racers.find((t) => t !== winToken);
  check('winner receives a 4-digit pickup code', /^\d{4}$/.test(win?.pickup_code || ''));

  console.log('\nContact privacy and WhatsApp');
  const contact = await req(`/claims/${win.claim_id}/contact`, { token: winToken });
  check('claimer gets a wa.me link to the donor', contact.status === 200 && contact.data.whatsapp.startsWith('https://wa.me/919000000002?text='));
  check('pickup code is inside the WhatsApp message', decodeURIComponent(contact.data.whatsapp).includes(win.pickup_code));
  const peek = await req(`/claims/${win.claim_id}/contact`, { token: loseToken });
  check('another NGO cannot see the donor contact (404)', peek.status === 404);
  const donorSide = await req(`/listings/${id}/contact`, { token: donor });
  check('donor gets a wa.me link to the claimer', donorSide.status === 200 && donorSide.data.whatsapp.startsWith('https://wa.me/'));

  console.log('\nPickup confirmation');
  const wrong = await req(`/listings/${id}/confirm-pickup`, { method: 'POST', token: donor, body: { code: win.pickup_code === '0000' ? '1111' : '0000' } });
  check('wrong pickup code is refused', wrong.status === 400 && /does not match/.test(wrong.data.error));
  const ok = await req(`/listings/${id}/confirm-pickup`, { method: 'POST', token: donor, body: { code: win.pickup_code } });
  check('correct pickup code marks it collected', ok.status === 200);
  const after = await req(`/listings/${id}`);
  check('listing status is now picked_up', after.data.listing.status === 'picked_up');
  const hist = await req(`/listings/${id}/history`, { token: donor });
  const path = hist.data.history.map((h) => h.new_status).join(' > ');
  check('status_log trigger recorded available > claimed > picked_up', path === 'available > claimed > picked_up', path);
  const notes = await req('/notifications', { token: donor });
  check('donor was notified of the claim and the pickup', notes.data.notifications.filter((n) => n.listing_id === id).length >= 2);
  const fb = await req(`/claims/${win.claim_id}/feedback`, { method: 'POST', token: winToken, body: { rating: 5 } });
  check('claimer can rate a completed pickup', fb.status === 201);
  const fb2 = await req(`/claims/${win.claim_id}/feedback`, { method: 'POST', token: winToken, body: { rating: 4 } });
  check('second rating for the same pickup is refused (UNIQUE)', fb2.status === 409);

  console.log('\nAdmin review');
  const queue = await req('/admin/verifications', { token: admin });
  const divyaReq = queue.data.requests.find((r) => r.email === 'divya@foodrescue.local');
  check('pending request appears in the admin queue', !!divyaReq);
  const noReason = await req(`/admin/verifications/${divyaReq.request_id}/review`, { method: 'POST', token: admin, body: { decision: 'rejected' } });
  check('rejecting without a reason is refused', noReason.status === 400);
  const approve = await req(`/admin/verifications/${divyaReq.request_id}/review`, { method: 'POST', token: admin, body: { decision: 'approved' } });
  check('admin approves the volunteer', approve.status === 200);
  const me = await req('/auth/me', { token: divya });
  check('volunteer is now verified', me.data.user.verification_status === 'verified');

  console.log('\nReports (views)');
  const summary = await req('/reports/summary');
  check('v_platform_summary returns totals', summary.data.meals_rescued > 0);
  const daily = await req('/reports/daily');
  check('v_daily_rescues_30d returns 30 days (recursive CTE)', daily.data.rows.length === 30);
  const monthly = await req('/reports/monthly');
  const m = monthly.data.rows;
  check('v_monthly_impact running total equals the sum of months', m.at(-1).meals_running_total === m.reduce((s, r) => s + r.meals_rescued, 0));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
