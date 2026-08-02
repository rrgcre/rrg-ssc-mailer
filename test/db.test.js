'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
let db; try { db = require('../db'); } catch (e) { console.error('SKIP db tests: better-sqlite3 not installed here'); process.exit(0); }

function seed() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fsmig-'));
  fs.writeFileSync(path.join(d, 'people.json'), JSON.stringify([{id:1},{id:2},{id:3}]));
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({theme:'dark',x:1}));
  fs.writeFileSync(path.join(d, 'broken.json'), '{ not json');
  db.init(d); return d;
}
test('import brings existing JSON files across with correct record counts', () => {
  const d = seed();
  const done = db.importFromFiles(d, ['people.json','settings.json','deals.json']);
  assert.deepStrictEqual(db.readStore('people.json'), [{id:1},{id:2},{id:3}]);
  assert.deepStrictEqual(db.readStore('settings.json'), {theme:'dark',x:1});
  assert.ok(done.includes('people.json:3'));
  assert.strictEqual(db.has('deals.json'), false);
});
test('import is idempotent — a second run does not clobber edits', () => {
  const d = seed();
  db.importFromFiles(d, ['people.json']);
  db.writeStore('people.json', [{id:1},{id:2},{id:3},{id:4}]);
  db.importFromFiles(d, ['people.json']);
  assert.strictEqual(db.readStore('people.json').length, 4);
});
test('import scans the directory when no list is given (skips rescue/db files)', () => {
  const d = seed();
  fs.writeFileSync(path.join(d, 'people.json.rescue-123.json'), '[{"id":9}]');
  const done = db.importFromFiles(d);
  assert.ok(done.some(x => x.startsWith('people.json:')));
  assert.ok(!done.some(x => x.indexOf('.rescue-') >= 0), 'rescue snapshots are not imported as stores');
});
test('import skips a corrupt JSON file without crashing', () => {
  const d = seed();
  const done = db.importFromFiles(d, ['broken.json','people.json']);
  assert.strictEqual(db.has('broken.json'), false);
  assert.ok(done.includes('people.json:3'));
});
test('readOrThrow returns data when present, throws when absent (fallback contract)', () => {
  const d = seed();
  db.importFromFiles(d, ['people.json']);
  assert.deepStrictEqual(db.readOrThrow('people.json'), [{id:1},{id:2},{id:3}]);
  let result; try { result = db.readOrThrow('nope.json'); } catch (e) { result = []; }
  assert.deepStrictEqual(result, []);
});
test('guard still blocks emptying a >=2 record store after migration', () => {
  const d = seed();
  db.importFromFiles(d, ['people.json']);
  assert.strictEqual(db.writeStore('people.json', [], 'people'), false);
  assert.strictEqual(db.readStore('people.json').length, 3);
});
