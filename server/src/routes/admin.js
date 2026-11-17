import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../util.js';
import { UPLOAD_DIR } from './verification.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/verifications', ah(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = await query(
    `SELECT v.request_id, v.document_type, v.document_ref, v.document_path IS NOT NULL AS has_file,
            v.status, v.remarks, v.submitted_at, v.reviewed_at,
            u.user_id, u.full_name, u.org_name, u.role, u.email, u.phone, u.address, u.created_at AS joined_at,
            (SELECT COUNT(*) FROM verification_requests p
              WHERE p.user_id = u.user_id AND p.status = 'rejected') AS previous_rejections
       FROM verification_requests v JOIN users u ON u.user_id = v.user_id
      WHERE v.status = ?
      ORDER BY v.submitted_at ${status === 'pending' ? 'ASC' : 'DESC'}
      LIMIT 200`,
    [status]
  );
  res.json({ requests: rows });
}));

r.get('/verifications/:id/document', ah(async (req, res) => {
  const [row] = await query('SELECT document_path FROM verification_requests WHERE request_id = ?', [
    req.params.id,
  ]);
  if (!row?.document_path) throw new HttpError(404, 'No file was uploaded with this request');
  const file = path.join(UPLOAD_DIR, path.basename(row.document_path));
  if (!fs.existsSync(file)) throw new HttpError(404, 'File is missing from server/uploads');
  res.sendFile(file);
}));

r.post('/verifications/:id/review', ah(async (req, res) => {
  const { decision, remarks } = req.body;
  await query('CALL sp_review_verification(?, ?, ?, ?)', [
    req.params.id, req.user.id, decision, remarks || null,
  ]);
  res.json({ ok: true });
}));

r.get('/users', ah(async (_req, res) => {
  const rows = await query(
    `SELECT u.user_id, u.full_name, u.org_name, u.role, u.email, u.phone, u.verification_status,
            u.no_show_count, u.suspended_until, u.created_at,
            COUNT(DISTINCT l.listing_id) AS listings, COUNT(DISTINCT c.claim_id) AS claims
       FROM users u
       LEFT JOIN food_listings l ON l.donor_id = u.user_id
       LEFT JOIN claims c ON c.claimant_id = u.user_id
      GROUP BY u.user_id
      ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
}));

export default r;
