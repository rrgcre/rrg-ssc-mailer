'use strict';
/*
 * pgboot.js — synchronous boot loader for the Postgres store.
 *
 * The FullServe app reads and writes its data SYNCHRONOUSLY at module-load time
 * (seed routines run before app.listen). node-postgres is asynchronous, so we
 * cannot load the initial snapshot inline. Instead pgstore.init() runs THIS file
 * as a short-lived child process with execSync: it connects, ensures the table
 * exists, selects every store row, prints them as one JSON array to stdout, and
 * exits. The parent parses that array into its in-memory cache — a fully
 * synchronous boot — then keeps its own async pool for write-through.
 *
 * Output contract (stdout, single line):
 *   {"ok":true,"rows":[{"name":"people.json","json":"[...]"}, ...]}
 * On failure it prints {"ok":false,"error":"..."} and exits non-zero so the
 * parent's try/catch falls back to SQLite/JSON files exactly as before.
 */
const { Client } = require('pg');

function sslOpt() {
  const mode = String(process.env.PGSSL || '').toLowerCase();
  if (mode === 'disable' || mode === 'off' || mode === 'false') return false;
  // Render (and most managed Postgres) require SSL; their certs are not in the
  // system trust store, so we accept them without verification. Set PGSSL=disable
  // for a local, non-SSL server.
  return { rejectUnauthorized: false };
}

(async function () {
  const conn = process.env.DATABASE_URL || '';
  if (!conn) { process.stdout.write(JSON.stringify({ ok: false, error: 'no DATABASE_URL' })); process.exit(2); }
  const client = new Client({ connectionString: conn, ssl: sslOpt(), connectionTimeoutMillis: 10000, statement_timeout: 20000 });
  try {
    await client.connect();
    await client.query('CREATE TABLE IF NOT EXISTS stores (name TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())');
    const r = await client.query('SELECT name, json FROM stores');
    process.stdout.write(JSON.stringify({ ok: true, rows: r.rows }));
    await client.end();
    process.exit(0);
  } catch (e) {
    try { await client.end(); } catch (_) {}
    process.stdout.write(JSON.stringify({ ok: false, error: (e && e.message) || String(e) }));
    process.exit(1);
  }
})();
