import { Router } from 'express';
import { query } from '../db.js';
import { ah } from '../util.js';

// Every report is a view in db/02_functions_views.sql.
const r = Router();

r.get('/summary', ah(async (_req, res) => {
  const [row] = await query('SELECT * FROM v_platform_summary');
  res.json(row);
}));

r.get('/monthly', ah(async (_req, res) => {
  res.json({ rows: await query('SELECT * FROM v_monthly_impact ORDER BY month') });
}));

r.get('/daily', ah(async (_req, res) => {
  res.json({ rows: await query('SELECT * FROM v_daily_rescues_30d ORDER BY day') });
}));

r.get('/top-donors', ah(async (_req, res) => {
  res.json({ rows: await query('SELECT * FROM v_top_donors ORDER BY donor_rank LIMIT 10') });
}));

r.get('/reliability', ah(async (_req, res) => {
  res.json({
    rows: await query('SELECT * FROM v_claimer_reliability WHERE total_claims > 0 ORDER BY pickup_rank, no_show_pct'),
  });
}));

r.get('/speed', ah(async (_req, res) => {
  const [avg] = await query(
    `SELECT ROUND(AVG(minutes_to_claim)) AS avg_to_claim,
            ROUND(AVG(minutes_to_pickup)) AS avg_to_pickup,
            ROUND(AVG(minutes_total)) AS avg_total
       FROM v_rescue_speed`
  );
  res.json(avg);
}));

export default r;
