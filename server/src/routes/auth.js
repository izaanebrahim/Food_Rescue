import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { ah, HttpError } from '../util.js';

const r = Router();

const PUBLIC_FIELDS = `user_id, full_name, email, phone, role, org_name, address, lat, lng,
  verification_status, no_show_count, suspended_until, created_at`;

r.post('/register', ah(async (req, res) => {
  const { full_name, email, phone, password, role, org_name, address, lat, lng } = req.body;
  if (!full_name || !email || !phone || !password || !role) {
    throw new HttpError(400, 'Fill in name, email, phone, password and account type');
  }
  if (!['donor', 'ngo', 'volunteer'].includes(role)) throw new HttpError(400, 'Choose donor, NGO or volunteer');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`; // Indian number without code

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role, org_name, address, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [full_name.trim(), email, digits, hash, role, org_name?.trim() || null, address || null, lat ?? null, lng ?? null]
  );
  const [user] = await query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE user_id = ?`, [result.insertId]);
  res.status(201).json({ token: signToken(user), user });
}));

r.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const [row] = await query(`SELECT ${PUBLIC_FIELDS}, password_hash FROM users WHERE email = ?`, [
    String(email || '').trim().toLowerCase(),
  ]);
  if (!row || !(await bcrypt.compare(password || '', row.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  delete row.password_hash;
  res.json({ token: signToken(row), user: row });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  const [user] = await query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE user_id = ?`, [req.user.id]);
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user });
}));

r.patch('/me', requireAuth, ah(async (req, res) => {
  const { address, lat, lng, org_name } = req.body;
  await query(
    `UPDATE users SET address = COALESCE(?, address), lat = COALESCE(?, lat), lng = COALESCE(?, lng),
            org_name = COALESCE(?, org_name) WHERE user_id = ?`,
    [address ?? null, lat ?? null, lng ?? null, org_name ?? null, req.user.id]
  );
  const [user] = await query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE user_id = ?`, [req.user.id]);
  res.json({ user });
}));

export default r;
