'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeJsonGuarded, GUARD_MIN_RECORDS } = require('../datasafe');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'datasafe-'));
}
function read(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

test('writes a normal array and returns true', () => {
  const d = tmpdir(); const f = path.join(d, 'people.json');
  const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.strictEqual(writeJsonGuarded(f, data, 'people'), true);
  assert.deepStrictEqual(read(f), data);
});

test('write is atomic — no leftover .tmp file remains', () => {
  const d = tmpdir(); const f = path.join(d, 'people.json');
  writeJsonGuarded(f, [{ id: 1 }], 'people');
  assert.strictEqual(fs.existsSync(f + '.tmp'), false, 'temp file should be renamed away');
});

test('GUARD: refuses to overwrite >=2 records with an empty array', () => {
  const d = tmpdir(); const f = path.join(d, 'people.json');
  const original = [{ id: 1 }, { id: 2 }];
  writeJsonGuarded(f, original, 'people');
  const ok = writeJsonGuarded(f, [], 'people');
  assert.strictEqual(ok, false, 'empty overwrite must be blocked');
  assert.deepStrictEqual(read(f), original, 'original data must be untouched');
  const rescue = fs.readdirSync(d).filter(n => n.includes('.rescue-'));
  assert.strictEqual(rescue.length, 1, 'a rescue copy must be written');
  assert.deepStrictEqual(read(path.join(d, rescue[0])), original, 'rescue holds the original data');
});

test('GUARD: refuses to overwrite an object map of >=2 keys with an empty object', () => {
  const d = tmpdir(); const f = path.join(d, 'byId.json');
  const original = { a: 1, b: 2 };
  writeJsonGuarded(f, original, 'byId');
  assert.strictEqual(writeJsonGuarded(f, {}, 'byId'), false);
  assert.deepStrictEqual(read(f), original);
});

test('GUARD: allows an empty write when the current file has fewer than 2 records', () => {
  const d = tmpdir(); const f = path.join(d, 'people.json');
  writeJsonGuarded(f, [{ id: 1 }], 'people');          // 1 record — below threshold
  assert.strictEqual(writeJsonGuarded(f, [], 'people'), true, 'clearing a 1-record file is allowed');
  assert.deepStrictEqual(read(f), []);
});

test('GUARD: allows an empty write to a brand-new file (nothing to protect)', () => {
  const d = tmpdir(); const f = path.join(d, 'fresh.json');
  assert.strictEqual(writeJsonGuarded(f, [], 'fresh'), true);
  assert.deepStrictEqual(read(f), []);
});

test('does not crash when the current file is corrupt JSON; writes the new data', () => {
  const d = tmpdir(); const f = path.join(d, 'people.json');
  fs.writeFileSync(f, '{ this is not valid json');
  const data = [{ id: 9 }];
  assert.strictEqual(writeJsonGuarded(f, data, 'people'), true);
  assert.deepStrictEqual(read(f), data);
});

test('creates a missing parent directory', () => {
  const d = tmpdir(); const f = path.join(d, 'nested', 'deep', 'people.json');
  assert.strictEqual(writeJsonGuarded(f, [{ id: 1 }], 'people'), true);
  assert.ok(fs.existsSync(f));
});

test('a non-empty overwrite of many records is always allowed', () => {
  const d = tmpdir(); const f = path.join(d, 'people.json');
  writeJsonGuarded(f, [{ id: 1 }, { id: 2 }, { id: 3 }], 'people');
  const next = [{ id: 1 }, { id: 2 }];   // shrinking but not empty — legitimate edit
  assert.strictEqual(writeJsonGuarded(f, next, 'people'), true);
  assert.deepStrictEqual(read(f), next);
});

test('threshold constant is 2 (guard triggers at two or more existing records)', () => {
  assert.strictEqual(GUARD_MIN_RECORDS, 2);
});
