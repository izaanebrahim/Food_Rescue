// Background jobs.
// MySQL events (db/05_events.sql) already release missed pickups and
// expire old food. This runs the same procedures every minute as a
// fallback, in case event_scheduler is OFF on someone's machine —
// calling them twice is harmless. It also delivers WhatsApp copies
// of new notifications.

import { query } from '../db.js';
import { cloudApiEnabled, sendWhatsApp } from '../services/whatsapp.js';

async function runHousekeeping() {
  await query('CALL sp_release_missed_pickups()');
  await query('CALL sp_expire_listings()');
}

async function dispatchWhatsApp() {
  const pending = await query(
    `SELECT n.notification_id, n.message, u.phone
       FROM notifications n JOIN users u ON u.user_id = n.user_id
      WHERE n.wa_status = 'pending'
      ORDER BY n.notification_id LIMIT 25`
  );
  if (!pending.length) return;

  if (!cloudApiEnabled()) {
    await query(
      `UPDATE notifications SET wa_status = 'skipped' WHERE notification_id IN (?)`,
      [pending.map((p) => p.notification_id)]
    );
    return;
  }

  for (const n of pending) {
    try {
      await sendWhatsApp(n.phone, `Food Rescue: ${n.message}`);
      await query(`UPDATE notifications SET wa_status = 'sent' WHERE notification_id = ?`, [n.notification_id]);
    } catch (err) {
      console.warn(`[whatsapp] ${err.message}`);
      await query(`UPDATE notifications SET wa_status = 'failed' WHERE notification_id = ?`, [n.notification_id]);
    }
  }
}

export function startScheduler() {
  const tick = async () => {
    try {
      await runHousekeeping();
      await dispatchWhatsApp();
    } catch (err) {
      console.warn(`[scheduler] ${err.message}`);
    }
  };
  tick();
  setInterval(tick, 60_000);
  // Deliver WhatsApp copies quickly after a claim instead of waiting a minute.
  setInterval(() => dispatchWhatsApp().catch(() => {}), 10_000);
}
