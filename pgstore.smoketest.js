'use strict';
// End-to-end smoke test for pgstore against a REAL Postgres.
// Run: DATABASE_URL=... PGSSL=disable node pgstore.smoketest.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = '/tmp/rrg_pgtest_data';
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
// Seed some JSON "stores" on disk, like /var/data would have.
fs.writeFileSync(path.join(TMP, 'companies.json'), JSON.stringify([{ id: 'c1', name: 'Acme BBQ' }, { id: 'c2', name: 'Taco Town' }]));
fs.writeFileSync(path.join(TMP, 'agreements.json'), JSON.stringify([{ id: 'agr_1', signToken: 'TOK123', type: 'NDA' }]));

let failures = 0;
function ok(label, cond) { if (cond) { console.log('  ✓ ' + label); } else { console.error('  ✗ ' + label); failures++; } }

(async function () {
  // Fresh DB: wipe the stores table so this test is deterministic.
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await c.connect();
  await c.query('DROP TABLE IF EXISTS stores');
  await c.end();

  const store = require('./pgstore');

  console.log('1) init on empty DB (sync boot load)');
  store.init(TMP);
  ok('cache empty before import', store._cache.size === 0);

  console.log('2) importFromFiles seeds Postgres');
  const imp = store.importFromFiles(TMP);
  ok('imported companies + agreements', imp.some(x => x.startsWith('companies.json:2')) && imp.some(x => x.startsWith('agreements.json:1')));
  await store.flush();

  console.log('3) synchronous reads return fresh copies');
  const a = store.readStore('companies.json');
  const b = store.readStore('companies.json');
  ok('reads deep-equal', JSON.stringify(a) === JSON.stringify(b));
  ok('reads are distinct objects (fresh copy)', a !== b);
  a[0].name = 'MUTATED';
  ok('mutating a read does not corrupt the store', store.readStore('companies.json')[0].name === 'Acme BBQ');
  ok('readOrThrow returns data', store.readOrThrow('agreements.json')[0].signToken === 'TOK123');

  console.log('4) write-through persists to Postgres');
  const ags = store.readOrThrow('agreements.json');
  ags.push({ id: 'agr_2', signToken: 'TOK999', type: 'ETRA' });
  ok('writeStore returns true', store.writeStore('agreements.json', ags, 'saveAgreements') === true);
  ok('read reflects the write immediately (sync)', store.readOrThrow('agreements.json').length === 2);
  await store.flush();

  console.log('5) empty-overwrite guard');
  ok('guard blocks empty overwrite of >=2 records', store.writeStore('agreements.json', [], 'saveAgreements') === false);
  ok('data intact after blocked write', store.readOrThrow('agreements.json').length === 2);
  // A store with <2 records can be legitimately emptied.
  ok('single-record store may be emptied', store.writeStore('agreements.json'.replace('agreements', 'tiny'), [], 't') === true);

  console.log('6) local JSON mirror written alongside Postgres');
  const mirror = JSON.parse(fs.readFileSync(path.join(TMP, 'agreements.json'), 'utf8'));
  ok('disk mirror has 2 agreements', mirror.length === 2 && mirror[1].signToken === 'TOK999');

  console.log('7) durability across reconnect — new process/cache loads from Postgres');
  await store.close();
  // Simulate a fresh boot: clear require cache and re-init. Disk still present, but
  // Postgres is the source of truth. Prove it by CORRUPTING the disk mirror first —
  // a correct load must come from Postgres, not the disk.
  fs.writeFileSync(path.join(TMP, 'agreements.json'), JSON.stringify([{ id: 'DISK_ONLY', signToken: 'STALE' }]));
  delete require.cache[require.resolve('./pgstore')];
  const store2 = require('./pgstore');
  store2.init(TMP);
  const reloaded = store2.readOrThrow('agreements.json');
  ok('reload came from Postgres (2 records), not stale disk', reloaded.length === 2);
  ok('reload has the written token', reloaded.some(x => x.signToken === 'TOK999'));
  ok('importFromFiles is idempotent (no re-import of existing store)', store2.importFromFiles(TMP).length === 0);
  await store2.close();

  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURE(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('THREW:', e); process.exit(1); });
