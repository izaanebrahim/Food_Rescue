import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_rescue',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  // MySQL and Node run on the same laptop, so both use its local time zone.
  timezone: process.env.DB_TIMEZONE || 'local',
});

/** Run a query and return the rows. */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * CALL a stored procedure that has OUT parameters.
 * outNames are read back with SELECT on the same connection.
 *   callWithOut('sp_claim_listing', [id, user, 45], ['claim_id','code','deadline'])
 */
export async function callWithOut(proc, inParams, outNames) {
  const conn = await pool.getConnection();
  try {
    const outVars = outNames.map((n) => `@out_${n}`);
    const placeholders = [...inParams.map(() => '?'), ...outVars].join(', ');
    await conn.query(`CALL ${proc}(${placeholders})`, inParams);
    const [[row]] = await conn.query(
      `SELECT ${outVars.map((v, i) => `${v} AS ${outNames[i]}`).join(', ')}`
    );
    return row;
  } finally {
    conn.release();
  }
}

/** CALL a procedure and return its first result set. */
export async function call(proc, params = []) {
  const [results] = await pool.query(
    `CALL ${proc}(${params.map(() => '?').join(', ')})`,
    params
  );
  return Array.isArray(results[0]) ? results[0] : [];
}
