'use strict';
/*
 * pgstore.js — Postgres BACKUP REPLICA for FullServe's records.
 *
 * The persistent-disk JSON files are the source of truth and the working store:
 * the app reads and writes them synchronously, exactly as it always has, so a
 * database hiccup can NEVER take the app offline or make it fall back. Postgres
 * is a durable, continuously-updated mirror that gives you managed backups /
 * point-in-time recovery and can restore the disk after a disk loss.
 *
 * This is the same proven pattern the object-storage layer (blobstore.js) uses
 * for binary files — disk-first, async replicate, restore-on-loss — applied to
 * the structured records.
 *
 *   - mirror(name, data): every store write is queued as an async UPSERT to
 *     Postgres (serialized, best-effort; failures are logged, never thrown).
 *   - reconcile(): on boot, push every disk store up to Postgres so the backup
 *     matches the live disk, and restore any store the disk is missing (or that
 *     the disk has emptied while Postgres still holds records) — disaster
 *     recovery. An empty disk store never overwrites a populated Postgres store.
 *
 * Config: DATABASE_URL (+ optional PGSSL=disable for a local non-SSL server).
 * Inert when DATABASE_URL is unset — the app runs on disk exactly as before.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null, DATA_DIR = '', READY = false, pending = 0;
// Boot gate: while true, mirror() is suppressed so the boot-time seed/backfill
// routines (which run against a possibly-wiped disk) can NEVER overwrite a
// populated Postgres store before the disk has been restored from it. Opened by
// bootRestore() once the disk cache has been rebuilt, with a failsafe timer so
// mirroring always resumes even if bootRestore is never signalled.
let bootGate = true;
let _init = Promise.resolve();
const chain = { p: Promise.resolve() };

function _sslOpt() {
  const m = String(process.env.PGSSL || '').toLowerCase();
  if (m === 'disable' || m === 'off' || m === 'false') return false;
  return { rejectUnauthorized: false };   // Render/managed Postgres present certs not in the system store
}
function _count(s) { try { const v = JSON.parse(s); return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0); } catch (e) { return 0; } }

function init(dataDir) {
  DATA_DIR = dataDir;
  if (!process.env.DATABASE_URL) { READY = false; return false; }
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: _sslOpt(), max: Number(process.env.PGPOOL_MAX || 6), idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    pool.on('error', e => console.error('[PG] idle client error: ' + (e && e.message)));
    _init = pool.query('CREATE TABLE IF NOT EXISTS stores (name TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())')
      .catch(e => console.error('[PG] ensure table failed: ' + (e && e.message)));
    READY = true;
    bootGate = true;
    // Failsafe: if bootRestore never signals (e.g. it is never called), resume
    // mirroring after 30s so the Postgres backup can never be left silently stale.
    try { var _g = setTimeout(function () { if (bootGate) { bootGate = false; console.warn('[PG] mirror gate auto-opened — boot restore was not signalled within 30s'); } }, 30000); if (_g && _g.unref) _g.unref(); } catch (e) {}
    return true;
  } catch (e) { console.error('[PG] init failed: ' + (e && e.message)); READY = false; return false; }
}
function ready() { return READY; }
function pendingCount() { return pending; }

// Queue an async UPSERT of one store. Serialized; best-effort (never throws).
// Suppressed while the boot gate is closed (see bootRestore) so a wiped-disk
// boot can't push empty/default seed data over a good Postgres backup.
function mirror(name, data) {
  if (!READY || bootGate) return;
  const json = JSON.stringify(data);
  pending++;
  chain.p = chain.p.then(() => _init).then(() => pool.query(
    'INSERT INTO stores(name, json, updated_at) VALUES($1, $2, now()) ON CONFLICT(name) DO UPDATE SET json = EXCLUDED.json, updated_at = now()',
    [name, json]
  )).catch(e => console.error('[PG] replicate failed for ' + name + ': ' + (e && e.message))).then(() => { pending--; });
}

function _diskStores() {
  try { return fs.readdirSync(DATA_DIR).filter(n => /\.json$/.test(n) && n.indexOf('.rescue-') < 0 && n.indexOf('.tmp') < 0 && n.indexOf('fullserve.db') < 0); }
  catch (e) { return []; }
}

// Boot reconcile — disk is the source of truth.
//  - push every disk store up to Postgres (backup matches live disk)
//  - restore pg→disk for any store the disk lacks, or has emptied while pg holds records
async function reconcile() {
  if (!READY) return { pushed: 0, restored: 0, skipped: true };
  await _init;
  const diskNames = _diskStores();
  const diskSet = new Set(diskNames);
  const pgRows = new Map();
  try { const r = await pool.query('SELECT name, json FROM stores'); r.rows.forEach(x => pgRows.set(x.name, x.json)); }
  catch (e) { console.error('[PG] reconcile list failed: ' + (e && e.message)); return { pushed: 0, restored: 0, error: (e && e.message) }; }
  const all = new Set([...diskNames, ...pgRows.keys()]);
  let pushed = 0, restored = 0;
  for (const name of all) {
    let diskJson = null;
    if (diskSet.has(name)) { try { diskJson = fs.readFileSync(path.join(DATA_DIR, name), 'utf8'); } catch (e) {} }
    const pgJson = pgRows.has(name) ? pgRows.get(name) : null;
    // Disaster restore: disk missing entirely, or disk emptied while Postgres holds ≥2 records.
    if (diskJson == null && pgJson != null) { try { fs.writeFileSync(path.join(DATA_DIR, name), pgJson); restored++; } catch (e) {} continue; }
    if (diskJson != null && pgJson != null && _count(diskJson) === 0 && _count(pgJson) >= 2) { try { fs.writeFileSync(path.join(DATA_DIR, name), pgJson); restored++; } catch (e) {} continue; }
    // Normal: disk is authoritative — push it up.
    if (diskJson != null) { try { await pool.query('INSERT INTO stores(name, json, updated_at) VALUES($1, $2, now()) ON CONFLICT(name) DO UPDATE SET json = EXCLUDED.json, updated_at = now()', [name, diskJson]); pushed++; } catch (e) {} }
  }
  return { pushed, restored };
}

// Manually resume mirroring (used if bootRestore is skipped or errors, so the
// backup never stays silently frozen).
function openGate() { bootGate = false; }

// Boot restore — Postgres is the system of record.
// Runs ONCE at startup, before the server serves requests. It rebuilds the disk
// cache from Postgres (Postgres wins for every populated store), then opens the
// mirror gate and seeds Postgres from any disk store it doesn't yet hold (first
// boot / newly-added stores). This makes a wiped ephemeral disk self-heal from
// Postgres before any seed/backfill/request can run, closing the boot-window
// race where a partial disk write could overwrite the good backup.
async function bootRestore() {
  if (!READY) { bootGate = false; return { skipped: true }; }
  await _init;
  const pgRows = new Map();
  try { const r = await pool.query('SELECT name, json FROM stores'); r.rows.forEach(x => pgRows.set(x.name, x.json)); }
  catch (e) { console.error('[PG] bootRestore list failed: ' + (e && e.message)); bootGate = false; return { restored: 0, pushed: 0, error: (e && e.message) }; }
  let restored = 0, pushed = 0;
  // Postgres authoritative: overwrite the disk cache with every populated PG store.
  for (const [name, pgJson] of pgRows) {
    if (pgJson != null && _count(pgJson) >= 1) { try { fs.writeFileSync(path.join(DATA_DIR, name), pgJson); restored++; } catch (e) {} }
  }
  // Disk is now in sync with Postgres — live writes may mirror again.
  bootGate = false;
  // First boot / newly-added stores: seed Postgres from any disk store it lacks
  // (or holds empty) while the disk has real records.
  for (const name of _diskStores()) {
    const pgJson = pgRows.has(name) ? pgRows.get(name) : null;
    if (pgJson != null && _count(pgJson) >= 1) continue;
    try { const dj = fs.readFileSync(path.join(DATA_DIR, name), 'utf8'); if (_count(dj) >= 1) { await pool.query('INSERT INTO stores(name, json, updated_at) VALUES($1, $2, now()) ON CONFLICT(name) DO UPDATE SET json = EXCLUDED.json, updated_at = now()', [name, dj]); pushed++; } } catch (e) {}
  }
  return { restored, pushed };
}

async function flush() { await chain.p; while (pending > 0) { await chain.p; } }
async function close() { try { await flush(); } catch (e) {} try { if (pool) await pool.end(); } catch (e) {} }

module.exports = { init, ready, mirror, reconcile, bootRestore, openGate, flush, close, pendingCount };
