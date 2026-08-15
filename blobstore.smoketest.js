'use strict';
// End-to-end test for blobstore against a local S3 (s3rver).
const fs = require('fs');
const path = require('path');
const S3rver = require('s3rver');

const TMP = '/tmp/rrg_blob_data';
const S3DIR = '/tmp/rrg_blob_s3';
const PORT = 4578;
const BUCKET = 'rrg-assets';
const PREFIXES = ['agreedocs/', 'rooms/', 'documents/', 'brand_logo', 'brand_favicon'];

let failures = 0;
function ok(label, cond) { if (cond) console.log('  ✓ ' + label); else { console.error('  ✗ ' + label); failures++; } }

(async function () {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(S3DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(TMP, 'agreedocs'), { recursive: true });
  fs.mkdirSync(path.join(TMP, 'rooms'), { recursive: true });
  fs.mkdirSync(S3DIR, { recursive: true });

  // Seed some existing binary files on disk (pre-migration state).
  fs.writeFileSync(path.join(TMP, 'agreedocs', 'final_agr_1.pdf'), Buffer.from('%PDF-old-executed'));
  fs.writeFileSync(path.join(TMP, 'brand_logo.png'), Buffer.from('PNGLOGO'));
  // A non-binary file that must be IGNORED by the mirror.
  fs.writeFileSync(path.join(TMP, 'agreements.json'), '[{"id":"a"}]');

  const server = new S3rver({ port: PORT, address: '127.0.0.1', silent: true, directory: S3DIR, configureBuckets: [{ name: BUCKET }] });
  await new Promise((res, rej) => server.run(err => err ? rej(err) : res()));

  process.env.S3_BUCKET = BUCKET;
  process.env.AWS_ACCESS_KEY_ID = 'S3RVER';
  process.env.AWS_SECRET_ACCESS_KEY = 'S3RVER';
  process.env.AWS_REGION = 'us-east-1';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:' + PORT;

  const blob = require('./blobstore');

  console.log('1) init');
  ok('ready with config', blob.init(TMP, PREFIXES) === true && blob.ready() === true);
  ok('binary path recognized', blob._isBinary(path.join(TMP, 'agreedocs', 'x.pdf')) === true);
  ok('json store NOT treated as binary', blob._isBinary(path.join(TMP, 'agreements.json')) === false);
  ok('key mirrors disk layout', blob._key(path.join(TMP, 'agreedocs', 'final_agr_1.pdf')) === 'agreedocs/final_agr_1.pdf');

  console.log('2) reconcile migrates existing disk files to bucket');
  let r = await blob.reconcile();
  ok('uploaded the 2 seeded binaries', r.uploaded === 2, );
  ok('nothing to restore yet', r.restored === 0);

  const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const c = new S3Client({ region: 'us-east-1', endpoint: 'http://127.0.0.1:' + PORT, forcePathStyle: true, credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' } });
  async function bucketList() { const out = await c.send(new ListObjectsV2Command({ Bucket: BUCKET })); return (out.Contents || []).map(o => o.Key).sort(); }
  async function bucketGet(k) { const out = await c.send(new GetObjectCommand({ Bucket: BUCKET, Key: k })); const chunks = []; for await (const ch of out.Body) chunks.push(ch); return Buffer.concat(chunks).toString(); }

  let keys = await bucketList();
  ok('bucket has both binaries, not the json', keys.includes('agreedocs/final_agr_1.pdf') && keys.includes('brand_logo.png') && !keys.includes('agreements.json'), );

  console.log('3) mirrorPut on a new write reaches the bucket');
  const newPdf = path.join(TMP, 'agreedocs', 'final_agr_2.pdf');
  fs.writeFileSync(newPdf, Buffer.from('%PDF-brand-new-executed'));   // simulate binWrite: disk first
  blob.mirrorPut(newPdf);                                              // then mirror
  await blob.flush();
  ok('new pdf uploaded', (await bucketList()).includes('agreedocs/final_agr_2.pdf'));
  ok('content matches', (await bucketGet('agreedocs/final_agr_2.pdf')) === '%PDF-brand-new-executed');

  console.log('4) mirrorDel removes from the bucket');
  fs.unlinkSync(newPdf);
  blob.mirrorDel(newPdf);
  await blob.flush();
  ok('deleted pdf gone from bucket', !(await bucketList()).includes('agreedocs/final_agr_2.pdf'));

  console.log('5) disaster restore: wipe disk, reconcile pulls files back from bucket');
  fs.rmSync(path.join(TMP, 'agreedocs', 'final_agr_1.pdf'));
  fs.rmSync(path.join(TMP, 'brand_logo.png'));
  ok('disk file gone before restore', !fs.existsSync(path.join(TMP, 'agreedocs', 'final_agr_1.pdf')));
  r = await blob.reconcile();
  ok('restored 2 files from bucket', r.restored === 2);
  ok('executed pdf back on disk with content', fs.existsSync(path.join(TMP, 'agreedocs', 'final_agr_1.pdf')) && fs.readFileSync(path.join(TMP, 'agreedocs', 'final_agr_1.pdf')).toString() === '%PDF-old-executed');
  ok('brand logo restored', fs.existsSync(path.join(TMP, 'brand_logo.png')));

  console.log('6) inert when unconfigured');
  delete process.env.S3_BUCKET;
  delete require.cache[require.resolve('./blobstore')];
  const blob2 = require('./blobstore');
  ok('init returns false with no bucket', blob2.init(TMP, PREFIXES) === false && blob2.ready() === false);
  blob2.mirrorPut(path.join(TMP, 'agreedocs', 'final_agr_1.pdf')); // must be a harmless no-op
  ok('mirror is a no-op when unconfigured (no throw)', true);

  await server.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURE(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('THREW:', e); process.exit(1); });
