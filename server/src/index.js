import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pool } from './db.js';
import { errorHandler } from './util.js';
import { startScheduler } from './jobs/scheduler.js';
import { cloudApiEnabled } from './services/whatsapp.js';
import auth from './routes/auth.js';
import listings from './routes/listings.js';
import claims from './routes/claims.js';
import verification from './routes/verification.js';
import admin from './routes/admin.js';
import reports from './routes/reports.js';
import notifications from './routes/notifications.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  const [[row]] = await pool.query('SELECT NOW() AS db_time, @@event_scheduler AS event_scheduler');
  res.json({ ok: true, ...row, whatsapp_cloud_api: cloudApiEnabled() });
});

app.use('/api/auth', auth);
app.use('/api/listings', listings);
app.use('/api/claims', claims);
app.use('/api/verification', verification);
app.use('/api/admin', admin);
app.use('/api/reports', reports);
app.use('/api/notifications', notifications);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No such API route' }));

// If the React app has been built (npm run build in client/), serve it too,
// so the whole project runs from one port.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);

pool.query('SELECT 1')
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Food Rescue API running on http://localhost:${PORT}`);
      console.log(`WhatsApp Cloud API: ${cloudApiEnabled() ? 'on' : 'off (click-to-chat links only)'}`);
    });
    startScheduler();
  })
  .catch((err) => {
    console.error('Could not connect to MySQL:', err.message);
    console.error('Check server/.env and that the database exists (npm run db:setup).');
    process.exit(1);
  });
