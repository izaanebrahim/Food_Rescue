import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../util.js';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, `u${req.user.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.pdf', '.jpg', '.jpeg', '.png'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new HttpError(400, 'Upload a PDF, JPG or PNG'), ok);
  },
});

const r = Router();
const claimer = requireRole('ngo', 'volunteer');

r.get('/me', claimer, ah(async (req, res) => {
  const requests = await query(
    `SELECT request_id, document_type, document_ref, status, remarks, submitted_at, reviewed_at
       FROM verification_requests WHERE user_id = ? ORDER BY submitted_at DESC`,
    [req.user.id]
  );
  const [u] = await query('SELECT verification_status FROM users WHERE user_id = ?', [req.user.id]);
  res.json({ status: u.verification_status, requests });
}));

r.post('/', claimer, upload.single('document'), ah(async (req, res) => {
  const { document_type, document_ref } = req.body;
  const allowed = req.user.role === 'ngo'
    ? ['ngo_registration', 'ngo_darpan']
    : ['govt_id', 'college_id'];
  if (!allowed.includes(document_type)) throw new HttpError(400, 'Choose a document type');
  if (!document_ref?.trim()) throw new HttpError(400, 'Enter the registration or ID number');
  if (!req.file) throw new HttpError(400, 'Attach the document');

  const [pending] = await query(
    `SELECT request_id FROM verification_requests WHERE user_id = ? AND status = 'pending'`,
    [req.user.id]
  );
  if (pending) throw new HttpError(409, 'Your documents are already waiting for review');

  await query(
    `INSERT INTO verification_requests (user_id, document_type, document_ref, document_path)
     VALUES (?, ?, ?, ?)`,
    [req.user.id, document_type, document_ref.trim(), req.file.filename]
  );
  res.status(201).json({ ok: true });
}));

export default r;
