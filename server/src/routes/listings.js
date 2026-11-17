import { Router } from 'express';
import { query, call, callWithOut } from '../db.js';
import { optionalAuth, requireRole, requireAuth } from '../middleware/auth.js';
import { ah, HttpError } from '../util.js';
import { waLink, donorToClaimerText } from '../services/whatsapp.js';

const r = Router();

// Browse available food. With lat/lng: nearest first (sp_nearby_listings).
r.get('/', optionalAuth, ah(async (req, res) => {
  const { lat, lng, radius = 15, food_type } = req.query;
  const type = ['veg', 'non_veg', 'vegan'].includes(food_type) ? food_type : null;

  let rows;
  if (lat && lng) {
    rows = await call('sp_nearby_listings', [Number(lat), Number(lng), Number(radius), type]);
  } else {
    rows = await query(
      `SELECT * FROM v_available_listings WHERE (? IS NULL OR food_type = ?) ORDER BY minutes_left`,
      [type, type]
    );
  }
  res.json({ listings: rows });
}));

// Donor's own listings, newest first, with whoever is collecting.
r.get('/mine', requireRole('donor'), ah(async (req, res) => {
  const rows = await query(
    `SELECT l.*,
            TIMESTAMPDIFF(MINUTE, NOW(), l.expires_at) AS minutes_left,
            c.claim_id, c.pickup_deadline, c.claimed_at, c.picked_up_at,
            COALESCE(u.org_name, u.full_name) AS claimant_name, u.role AS claimant_role
       FROM food_listings l
       LEFT JOIN claims c ON c.claim_id = (
             SELECT c2.claim_id FROM claims c2
              WHERE c2.listing_id = l.listing_id AND c2.status IN ('active','completed')
              ORDER BY c2.claimed_at DESC LIMIT 1)
       LEFT JOIN users u ON u.user_id = c.claimant_id
      WHERE l.donor_id = ?
      ORDER BY FIELD(l.status, 'claimed', 'available', 'picked_up', 'expired', 'cancelled'), l.created_at DESC
      LIMIT 200`,
    [req.user.id]
  );
  res.json({ listings: rows });
}));

r.get('/:id', optionalAuth, ah(async (req, res) => {
  const [listing] = await query(
    `SELECT l.listing_id, l.title, l.description, l.food_type, l.category, l.quantity_servings,
            l.prepared_at, l.expires_at, l.pickup_address, l.lat, l.lng, l.pickup_notes, l.status,
            l.created_at, l.donor_id, TIMESTAMPDIFF(MINUTE, NOW(), l.expires_at) AS minutes_left,
            COALESCE(u.org_name, u.full_name) AS donor_name,
            (SELECT COUNT(*) FROM food_listings x WHERE x.donor_id = l.donor_id AND x.status = 'picked_up') AS donor_rescues
       FROM food_listings l JOIN users u ON u.user_id = l.donor_id
      WHERE l.listing_id = ?`,
    [req.params.id]
  );
  if (!listing) throw new HttpError(404, 'Listing not found');

  // If the viewer is the active claimer, include their claim (with code).
  let myClaim = null;
  if (req.user) {
    [myClaim] = await query(
      `SELECT claim_id, status, pickup_code, pickup_deadline, claimed_at, picked_up_at
         FROM claims WHERE listing_id = ? AND claimant_id = ?
        ORDER BY claimed_at DESC LIMIT 1`,
      [req.params.id, req.user.id]
    );
  }
  res.json({ listing, myClaim: myClaim || null });
}));

r.get('/:id/history', requireAuth, ah(async (req, res) => {
  const rows = await query(
    `SELECT old_status, new_status, changed_at FROM status_log WHERE listing_id = ? ORDER BY changed_at`,
    [req.params.id]
  );
  res.json({ history: rows });
}));

r.post('/', requireRole('donor'), ah(async (req, res) => {
  const b = req.body;
  const [donor] = await query('SELECT address, lat, lng FROM users WHERE user_id = ?', [req.user.id]);
  const lat = b.lat ?? donor.lat;
  const lng = b.lng ?? donor.lng;
  if (lat == null || lng == null) throw new HttpError(400, 'Set the pickup location on the map');
  if (!b.title || !b.food_type || !b.quantity_servings || !b.prepared_at || !b.expires_at) {
    throw new HttpError(400, 'Fill in what the food is, type, servings, prepared time and safe-until time');
  }

  const result = await query(
    `INSERT INTO food_listings (donor_id, title, description, food_type, category, quantity_servings,
                                prepared_at, expires_at, pickup_address, lat, lng, pickup_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, b.title.trim(), b.description || null, b.food_type, b.category || 'cooked',
     Number(b.quantity_servings), new Date(b.prepared_at), new Date(b.expires_at),
     b.pickup_address || donor.address, lat, lng, b.pickup_notes || null]
  );
  res.status(201).json({ listing_id: result.insertId });
}));

r.post('/:id/cancel', requireRole('donor'), ah(async (req, res) => {
  await query('CALL sp_cancel_listing(?, ?)', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// Donor enters the code the claimer shows them.
r.post('/:id/confirm-pickup', requireRole('donor'), ah(async (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!/^\d{4}$/.test(code)) throw new HttpError(400, 'Enter the 4-digit pickup code');
  await query('CALL sp_confirm_pickup(?, ?, ?)', [req.params.id, req.user.id, code]);
  res.json({ ok: true });
}));

// Claim: NGO / volunteer. Concurrency is handled inside sp_claim_listing.
r.post('/:id/claim', requireRole('ngo', 'volunteer'), ah(async (req, res) => {
  const windowMin = Math.min(Math.max(Number(req.body.window_minutes) || 45, 15), 120);
  const out = await callWithOut(
    'sp_claim_listing',
    [req.params.id, req.user.id, windowMin],
    ['claim_id', 'pickup_code', 'pickup_deadline']
  );
  res.status(201).json(out);
}));

// Donor: contact the person collecting (only while a claim is active).
r.get('/:id/contact', requireRole('donor'), ah(async (req, res) => {
  const [c] = await query(
    'SELECT * FROM v_claim_contacts WHERE listing_id = ? AND donor_id = ?',
    [req.params.id, req.user.id]
  );
  if (!c) throw new HttpError(404, 'Contact details appear once someone claims this listing');
  res.json({
    name: c.claimant_name,
    person: c.claimant_person,
    phone: c.claimant_phone,
    whatsapp: waLink(c.claimant_phone, donorToClaimerText(c)),
    pickup_deadline: c.pickup_deadline,
  });
}));

export default r;
