'use strict';
// FullServe data layer — SQLite document store (first-pass migration off JSON files).
// Each named store (people.json, companies.json, …) is one JSON document in a row of
// `stores`, read/written in a single ACID transaction. Store names are the old file
// basenames, so the rest of the app keeps referring to files while the bytes live in
// one SQLite database. The empty-overwrite guard from datasafe.js is preserved.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function init(dataDir) {
  db = new Database(path.join(dataDir, 'fullserve.db'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS stores (name TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT)');
  return db;
}
function _count(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return 0;
}
function has(name) {
  return !!db.prepare('SELECT 1 FROM stores WHERE name=?').get(name);
}
function readStore(name, fallback) {
  const row = db.prepare('SELECT json FROM stores WHERE name=?').get(name);
  if (!row) return fallback === undefined ? null : fallback;
  try { return JSON.parse(row.json); } catch (e) { return fallback === undefined ? null : fallback; }
}
function writeStore(name, data, label) {
  const emptyArr = Array.isArray(data) && data.length === 0;
  const emptyObj = data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0;
  if (emptyArr || emptyObj) {
    const n = _count(readStore(name));
    if (n >= 2) {
      console.error('[DATA GUARD] ' + (label || name) + ' BLOCKED: refused to overwrite ' + n + ' records with empty data.');
      return false;
    }
  }
  db.prepare('INSERT INTO stores(name,json,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at')
    .run(name, JSON.stringify(data), new Date().toISOString());
  return true;
}
// One-time seed: import each JSON file present in dataDir that is not yet a store.
// Idempotent — an existing store is left alone, so this runs safely on every boot and
// only imports the first time. If fileNames is omitted, every *.json in dataDir is
// imported (excluding rescue snapshots and the database's own files).
function importFromFiles(dataDir, fileNames) {
  let names = fileNames;
  if (!names) {
    try {
      names = fs.readdirSync(dataDir).filter(function (n) {
        return /\.json$/.test(n) && n.indexOf('.rescue-') < 0 && n.indexOf('fullserve.db') < 0;
      });
    } catch (e) { names = []; }
  }
  const imported = [];
  const tx = db.transaction(function (list) {
    for (const name of list) {
      if (has(name)) continue;
      const p = path.join(dataDir, name);
      if (!fs.existsSync(p)) continue;
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
      db.prepare('INSERT OR REPLACE INTO stores(name,json,updated_at) VALUES(?,?,?)')
        .run(name, JSON.stringify(parsed), new Date().toISOString());
      imported.push(name + ':' + _count(parsed));
    }
  });
  tx(names);
  return imported;
}
// Read contract for the app: throw when a store is absent so the caller's existing
// try/catch returns its own fallback ([] or {}), exactly as the old file read did.
function readOrThrow(name) {
  const row = db.prepare('SELECT json FROM stores WHERE name=?').get(name);
  if (!row) throw new Error('no store: ' + name);
  return JSON.parse(row.json);
}
module.exports = { init, has, readStore, writeStore, importFromFiles, readOrThrow, _db: () => db };
