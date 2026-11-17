import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../util.js';
import { waLink, claimerToDonorText } from '../services/whatsapp.js';

const r = Router();
const claimer = requireRole('ngo', 'volunteer');

r.get('/mine', claimer, ah(async (req, res) => {
  const rows = await query(
    `SELECT c.claim_id, c.status, c.pickup_code, c.pickup_deadline, c.claimed_at, c.picked_up_at,
            l.listing_id, l.title, l.food_type, l.quantity_servings, l.pickup_address, l.lat, l.lng,
            COALESCE(d.org_name, d.full_name) AS donor_name,
            f.rating
       FROM claims c
       JOIN food_listings l ON l.listing_id = c.listing_id
       JOIN users d ON d.user_id = l.donor_id
       LEFT JOIN feedback f ON f.claim_id = c.claim_id
      WHERE c.claimant_id = ?
      ORDER BY (c.status = 'active') DESC, c.claimed_at DESC
      LIMIT 200`,
    [req.user.id]
  );
  res.json({ claims: rows });
}));

// Claimer: WhatsApp link to the donor. Reads ONLY from v_claim_contacts,
// so it works only for the claimer's own active claim.
r.get('/:id/contact', claimer, ah(async (req, res) => {
  const [c] = await query(
    'SELECT * FROM v_claim_contacts WHERE claim_id = ? AND claimant_id = ?',
    [req.params.id, req.user.id]
  );
  if (!c) throw new HttpError(404, 'Contact details are only shown for your active claims');
  res.json({
    name: c.donor_name,
    phone: c.donor_phone,
    whatsapp: waLink(c.donor_phone, claimerToDonorText(c)),
    maps: `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`,
  });
}));

r.post('/:id/cancel', claimer, ah(async (req, res) => {
  await query('CALL sp_cancel_claim(?, ?)', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

r.post('/:id/feedback', claimer, ah(async (req, res) => {
  const [own] = await query('SELECT claim_id FROM claims WHERE claim_id = ? AND claimant_id = ?', [
    req.params.id, req.user.id,
  ]);
  if (!own) throw new HttpError(404, 'Claim not found');
  await query('INSERT INTO feedback (claim_id, rating, comment) VALUES (?, ?, ?)', [
    req.params.id, Number(req.body.rating), req.body.comment || null,
  ]);
  res.status(201).json({ ok: true });
}));

export default r;
