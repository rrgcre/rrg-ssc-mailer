'use strict';
/*
 * datasafe.js — the safety-critical data writer for FullServe.
 *
 * Isolated from server.js so it can be unit-tested and reasoned about on its
 * own. This is the function that stands between a bug (or a full disk) and
 * losing the book of business, so it is written to FAIL SAFE:
 *
 *   1. Atomic write: data is written to `<file>.tmp` then renamed onto `<file>`.
 *      A rename is atomic on POSIX, so a reader never sees a half-written file,
 *      and a crash mid-write leaves the previous good file intact.
 *   2. Empty-overwrite guard: refuses to overwrite a file that currently holds
 *      >= 2 records with an empty array/object. Before refusing, it writes a
 *      timestamped `.rescue-*.json` copy of the current data and returns false.
 *      This is the exact failure that once wiped the contacts file.
 *
 * Returns true on a successful write, false if the write was blocked or errored.
 */
const fs = require('fs');
const path = require('path');

// How many existing records make an empty overwrite "suspicious" enough to block.
const GUARD_MIN_RECORDS = 2;

function _count(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return 0;
}

function writeJsonGuarded(file, data, label) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    const emptyArr = Array.isArray(data) && data.length === 0;
    const emptyObj = data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0;

    if (emptyArr || emptyObj) {
      try {
        const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
        const n = _count(cur);
        if (n >= GUARD_MIN_RECORDS) {
          try {
            fs.writeFileSync(file + '.rescue-' + Date.now() + '.json', JSON.stringify(cur, null, 2));
          } catch (e) { /* rescue is best-effort */ }
          console.error('[DATA GUARD] ' + (label || file) +
            ' BLOCKED: refused to overwrite ' + n + ' records with empty data. Rescue copy written.');
          return false;
        }
      } catch (e) { /* unreadable/corrupt current file -> fall through and write */ }
    }

    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { writeJsonGuarded, GUARD_MIN_RECORDS };
