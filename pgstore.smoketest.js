'use strict';
// End-to-end test for the pgstore BACKUP REPLICA (disk-first) against a real Postgres.
// Run: DATABASE_URL=... PGSSL=disable node pgstore.smoketest.js
const fs = require('fs');
const path = require('path');

const TMP = '/tmp/rrg_pgrep_data';
let failures = 0;
function ok(label, cond) { if (cond) console.log('  ✓ ' + label); else { console.error('  ✗ ' + label); failures++; } }

(async function () {
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await c.connect(); await c.query('DROP TABLE IF EXISTS stores'); await c.end();

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'companies.json'), JSON.stringify([{ id: 'c1', name: 'Acme BBQ' }, { id: 'c2', name: 'Taco Town' }]));
  fs.writeFileSync(path.join(TMP, 'agreements.json'), JSON.stringify([{ id: 'agr_1', signToken: 'TOK123' }]));

  const pg = require('./pgstore');
  const { Client: C2 } = require('pg');
  const q = async (sql, args) => { const cl = new C2({ connectionString: process.env.DATABASE_URL, ssl: false }); await cl.connect(); const r = await cl.query(sql, args); await cl.end(); return r; };

  console.log('1) init (replica configured)');
  ok('ready with DATABASE_URL', pg.init(TMP) === true && pg.ready() === true);

  console.log('2) mirror() replicates a store write to Postgres');
  pg.mirror('agreements.json', [{ id: 'agr_1', signToken: 'TOK123' }, { id: 'agr_2', signToken: 'TOK999' }]);
  await pg.flush();
  let r = await q('SELECT json FROM stores WHERE name=$1', ['agreements.json']);
  ok('agreements mirrored', r.rows[0] && JSON.parse(r.rows[0].json).length === 2);

  console.log('3) reconcile pushes the live disk up (disk is source of truth)');
  // Disk companies has 2 records; Postgres has none yet. Reconcile should push it up.
  r = await pg.reconcile();
  ok('pushed disk stores to Postgres', r.pushed >= 2);
  const comp = await q('SELECT json FROM stores WHERE name=$1', ['companies.json']);
  ok('companies now in Postgres backup', comp.rows[0] && JSON.parse(comp.rows[0].json).length === 2);
  // Disk agreements has 1 record; the mirror wrote 2. Reconcile pushes disk (1) over pg (2) — disk wins.
  const agr = await q('SELECT json FROM stores WHERE name=$1', ['agreements.json']);
  ok('disk is authoritative (agreements = disk copy of 1)', agr.rows[0] && JSON.parse(agr.rows[0].json).length === 1);

  console.log('4) disaster restore: a store only in Postgres is written back to disk');
  await q('INSERT INTO stores(name,json,updated_at) VALUES($1,$2,now()) ON CONFLICT(name) DO UPDATE SET json=EXCLUDED.json', ['deals.json', JSON.stringify([{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }])]);
  ok('deals.json absent on disk before restore', !fs.existsSync(path.join(TMP, 'deals.json')));
  r = await pg.reconcile();
  ok('restored the missing store to disk', r.restored >= 1 && fs.existsSync(path.join(TMP, 'deals.json')));
  ok('restored content correct', JSON.parse(fs.readFileSync(path.join(TMP, 'deals.json'), 'utf8')).length === 3);

  console.log('5) empty-disk guard: an emptied disk store does NOT wipe the Postgres backup');
  // Postgres holds 2 companies; simulate the disk file getting emptied.
  fs.writeFileSync(path.join(TMP, 'companies.json'), '[]');
  r = await pg.reconcile();
  ok('emptied disk store restored from Postgres, not pushed', JSON.parse(fs.readFileSync(path.join(TMP, 'companies.json'), 'utf8')).length === 2);
  const comp2 = await q('SELECT json FROM stores WHERE name=$1', ['companies.json']);
  ok('Postgres backup still has 2 companies', JSON.parse(comp2.rows[0].json).length === 2);

  console.log('6) inert when DATABASE_URL is unset');
  const saved = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  delete require.cache[require.resolve('./pgstore')];
  const pg2 = require('./pgstore');
  ok('init returns false with no DATABASE_URL', pg2.init(TMP) === false && pg2.ready() === false);
  pg2.mirror('companies.json', []); // harmless no-op
  ok('mirror is a no-op when unconfigured (no throw)', true);
  process.env.DATABASE_URL = saved;

  await pg.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURE(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('THREW:', e); process.exit(1); });
