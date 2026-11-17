import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { ah } from '../util.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const rows = await query(
    `SELECT notification_id, listing_id, type, message, created_at, read_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 50`,
    [req.user.id]
  );
  const unread = rows.filter((n) => !n.read_at).length;
  res.json({ notifications: rows, unread });
}));

r.post('/read-all', ah(async (req, res) => {
  await query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

export default r;
