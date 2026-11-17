// Creates the food_rescue database by running every file in ../db in order.
// Understands the DELIMITER command, so the same .sql files also run
// unchanged in MySQL Workbench or the mysql command-line client.
//
//   npm run db:setup        (drops and recreates the database with demo data)
//   npm run db:setup -- --no-seed   (schema only, no demo data)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../db');
const skipSeed = process.argv.includes('--no-seed');

function splitStatements(sql) {
  const lines = sql.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let delimiter = ';';
  let buf = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed === '') {
      continue;
    }
    const m = trimmed.match(/^DELIMITER\s+(\S+)$/i);
    if (m) {
      delimiter = m[1];
      continue;
    }
    buf += line + '\n';
    if (trimmed.endsWith(delimiter)) {
      const stmt = buf.trimEnd().slice(0, -delimiter.length).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  const files = fs.readdirSync(dbDir)
    .filter((f) => /^\d{2}_.*\.sql$/.test(f))
    .filter((f) => !(skipSeed && f.includes('seed')))
    .filter((f) => !f.includes('demo_queries'))
    .sort();

  for (const file of files) {
    const statements = splitStatements(fs.readFileSync(path.join(dbDir, file), 'utf8'));
    process.stdout.write(`  ${file.padEnd(28)} `);
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        console.error(`\n\nFailed in ${file}:\n${stmt.slice(0, 300)}\n\n${err.message}`);
        process.exit(1);
      }
    }
    console.log(`${statements.length} statements`);
  }

  try {
    await conn.query('SET GLOBAL event_scheduler = ON');
    console.log('  event scheduler            on');
  } catch {
    console.log('  event scheduler            could not be switched on (needs SUPER/SYSTEM_VARIABLES_ADMIN).');
    console.log('                             The backend runs the same jobs every minute, so the app still works.');
  }

  await conn.end();
  console.log('\nDatabase food_rescue is ready.');
  if (!skipSeed) console.log('Demo accounts use the password: password123');
}

main().catch((err) => {
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('MySQL rejected the username or password. Check DB_USER and DB_PASSWORD in server/.env');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('Could not reach MySQL. Is the MySQL80 service running? Check DB_HOST and DB_PORT in server/.env');
  } else {
    console.error(err);
  }
  process.exit(1);
});
