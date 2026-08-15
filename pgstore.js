'use strict';
/*
 * pgstore.js — Postgres-backed document store for FullServe.
 *
 * Drop-in analog of db.js (the SQLite store): the same interface
 * (init/has/readStore/writeStore/readOrThrow/importFromFiles) so the rest of the
 * app keeps referring to "people.json", "agreements.json", … while the bytes
 * live in one managed Postgres table:  stores(name TEXT PK, json TEXT, updated_at).
 *
 * WHY A CACHE. The app is synchronous end-to-end (const all = load(); …; save(all)),
 * but Postgres is async. So this module keeps an in-memory cache of every store,
 * populated SYNCHRONOUSLY at boot via the pgboot.js child process. Reads are served
 * from the cache (synchronous, a fresh clone each time — identical semantics to
 * db.js which JSON.parses each read). Writes update the cache synchronously and are
 * streamed to Postgres asynchronously (write-through), serialized per store name so
 * updates land in order.
 *
 * DURABILITY. Postgres is the source of truth (managed backups / PITR). Every write
 * is ALSO mirrored synchronously to the local JSON file via datasafe's atomic
 * guarded writer, so (a) there is never a data-loss window if the process dies in
 * the millisecond before the async Postgres write lands, and (b) the disk copy is a
 * warm local fallback. On boot we load from Postgres; if Postgres is empty we import
 * from the local JSON files (first migration). The empty-overwrite guard from
 * db.js/datasafe.js is preserved.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { Pool } = require('pg');
const { writeJsonGuarded: _fileWriteGuarded } = require('./datasafe');

const GUARD_MIN_RECORDS = 2;

let pool = null;
let DATA_DIR = null;
const cache = new Map();        // name -> canonical JSON string (source for fresh-copy reads)
const chains = new Map();       // name -> Promise (per-name serialized write-through)
let pending = 0;                // count of in-flight write-through operations

function _count(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return 0;
}
function _sslOpt() {
  const mode = String(process.env.PGSSL || '').toLowerCase();
  if (mode === 'disable' || mode === 'off' || mode === 'false') return false;
  return { rejectUnauthorized: false };
}

// Synchronous boot load: run pgboot.js as a child, parse its JSON snapshot into cache.
function _bootLoadSync() {
  const out = cp.execSync('node ' + JSON.stringify(path.join(__dirname, 'pgboot.js')), {
    cwd: __dirname,
    env: process.env,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 512 * 1024 * 1024, // stores can be large; allow up to 512MB snapshot
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let parsed;
  try { parsed = JSON.parse(out); } catch (e) { throw new Error('pgboot: unparseable output: ' + String(out).slice(0, 200)); }
  if (!parsed || parsed.ok !== true) throw new Error('pgboot: ' + ((parsed && parsed.error) || 'unknown error'));
  cache.clear();
  for (const row of (parsed.rows || [])) {
    // Normalize to a canonical string; reads JSON.parse this each time for a fresh copy.
    cache.set(row.name, typeof row.json === 'string' ? row.json : JSON.stringify(row.json));
  }
}

function init(dataDir) {
  DATA_DIR = dataDir;
  _bootLoadSync();                       // throws if Postgres is unreachable -> caller falls back
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: _sslOpt(),
    max: Number(process.env.PGPOOL_MAX || 6),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (e) => { console.error('[PG] idle client error: ' + (e && e.message)); });
  return pool;
}

function has(name) { return cache.has(name); }

function readOrThrow(name) {
  if (!cache.has(name)) throw new Error('no store: ' + name);
  return JSON.parse(cache.get(name));
}

function readStore(name, fallback) {
  if (!cache.has(name)) return fallback === undefined ? null : fallback;
  try { return JSON.parse(cache.get(name)); } catch (e) { return fallback === undefined ? null : fallback; }
}

// Queue an async UPSERT for `name`, serialized behind any prior write for that name.
function _persist(name, jsonStr, label) {
  pending++;
  const prev = chains.get(name) || Promise.resolve();
  const next = prev.then(() =>
    pool.query(
      'INSERT INTO stores(name, json, updated_at) VALUES($1, $2, now()) ' +
      'ON CONFLICT(name) DO UPDATE SET json = EXCLUDED.json, updated_at = now()',
      [name, jsonStr]
    )
  ).catch((e) => {
    console.error('[PG] write-through FAILED for ' + (label || name) + ': ' + (e && e.message) +
      ' (local JSON mirror still holds this write)');
  }).then(() => { pending--; });
  chains.set(name, next);
  return next;
}

function writeStore(name, data, label) {
  const emptyArr = Array.isArray(data) && data.length === 0;
  const emptyObj = data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0;
  if (emptyArr || emptyObj) {
    const n = _count(readStore(name));
    if (n >= GUARD_MIN_RECORDS) {
      console.error('[DATA GUARD] ' + (label || name) + ' BLOCKED: refused to overwrite ' + n + ' records with empty data.');
      return false;
    }
  }
  const jsonStr = JSON.stringify(data);
  cache.set(name, jsonStr);                    // synchronous: readers see the new value immediately
  _persist(name, jsonStr, label);              // async write-through to Postgres (source of truth)
  if (DATA_DIR) {                              // synchronous local mirror (crash-safe fallback)
    try { _fileWriteGuarded(path.join(DATA_DIR, name), data, label); } catch (e) {}
  }
  return true;
}

// One-time seed: import each JSON file present in dataDir that is not yet a store.
// Idempotent — an existing store (already in cache/Postgres) is left alone.
function importFromFiles(dataDir, fileNames) {
  let names = fileNames;
  if (!names) {
    try {
      names = fs.readdirSync(dataDir).filter((n) =>
        /\.json$/.test(n) && n.indexOf('.rescue-') < 0 && n.indexOf('.tmp') < 0 && n.indexOf('fullserve.db') < 0);
    } catch (e) { names = []; }
  }
  const imported = [];
  for (const name of names) {
    if (cache.has(name)) continue;
    const p = path.join(dataDir, name);
    if (!fs.existsSync(p)) continue;
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
    const jsonStr = JSON.stringify(parsed);
    cache.set(name, jsonStr);
    _persist(name, jsonStr, 'import:' + name);
    imported.push(name + ':' + _count(parsed));
  }
  return imported;
}

// Await all in-flight write-through operations (tests / graceful shutdown).
async function flush() {
  await Promise.all(Array.from(chains.values()));
  // A write scheduled during the await above bumps `pending`; drain once more.
  while (pending > 0) { await Promise.all(Array.from(chains.values())); }
}

async function close() { try { await flush(); } catch (e) {} try { if (pool) await pool.end(); } catch (e) {} }

module.exports = { init, has, readStore, writeStore, importFromFiles, readOrThrow, flush, close, _cache: cache, _pending: () => pending };
