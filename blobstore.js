'use strict';
/*
 * blobstore.js — durable object storage for FullServe's BINARY assets.
 *
 * Executed agreement PDFs, signature images, agreement templates, data-room
 * documents, uploaded files, photos and logos live as files on the /var/data
 * disk. That disk survives deploys but has no automated backups. This module
 * mirrors every binary write and delete to S3-compatible object storage
 * (AWS S3 or Cloudflare R2), and can restore the disk from the bucket after a
 * disk loss — giving those files the same durability the Postgres records now
 * have.
 *
 * DESIGN (low-churn, low-risk):
 *   - The DISK stays the working filesystem. All existing reads are unchanged,
 *     so serving a PDF or image behaves exactly as before.
 *   - Every binary WRITE and DELETE is additionally streamed to the bucket
 *     (write-through), asynchronously, via a small serialized queue. The local
 *     fs operation happens first and synchronously, so nothing about the
 *     request path changes; replication is a background side effect.
 *   - On boot, reconcile(): upload disk files missing from the bucket
 *     (first-run migration) and download bucket objects missing from disk
 *     (disaster restore). Idempotent.
 *
 * CONFIG (same env as the existing video integration, plus optional endpoint):
 *   S3_BUCKET, AWS_REGION (default us-east-2), AWS_ACCESS_KEY_ID,
 *   AWS_SECRET_ACCESS_KEY, and optionally S3_ENDPOINT (set for Cloudflare R2,
 *   e.g. https://<account>.r2.cloudflarestorage.com). When the bucket or keys
 *   are absent the module is INERT: mirror* are no-ops and the app runs exactly
 *   as it does today on disk only.
 *
 * Object keys mirror the on-disk layout relative to the data dir, e.g.
 * "agreedocs/final_agr_x.pdf", "rooms/abc.pdf", "brand_logo.png".
 */
const fs = require('fs');
const path = require('path');

let s3 = null, BUCKET = '', DATA_DIR = '', PREFIXES = [], READY = false;
let pending = 0;
const chain = { p: Promise.resolve() };   // serialize background ops

function _env(...names) { for (const n of names) { if (process.env[n]) return process.env[n]; } return ''; }

function init(dataDir, prefixes) {
  DATA_DIR = dataDir;
  PREFIXES = (prefixes || []).slice();
  BUCKET = _env('S3_BUCKET', 'BLOB_BUCKET');
  const accessKeyId = _env('AWS_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID');
  const secretAccessKey = _env('AWS_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY');
  if (!BUCKET || !accessKeyId || !secretAccessKey) { READY = false; return false; }
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    const endpoint = _env('S3_ENDPOINT', 'BLOB_ENDPOINT');            // set for Cloudflare R2
    const region = _env('AWS_REGION', 'S3_REGION') || (endpoint ? 'auto' : 'us-east-2');
    const cfg = { region, credentials: { accessKeyId, secretAccessKey } };
    if (endpoint) { cfg.endpoint = endpoint; cfg.forcePathStyle = true; }
    s3 = new S3Client(cfg);
    READY = true;
    return true;
  } catch (e) {
    console.error('[BLOB] S3 SDK load failed — binary mirroring disabled: ' + (e && e.message));
    READY = false;
    return false;
  }
}

function ready() { return READY; }
function pendingCount() { return pending; }

function _key(fullPath) {
  const rel = path.relative(DATA_DIR, fullPath);
  return rel.split(path.sep).join('/');
}
function _isBinary(fullPath) {
  const key = _key(fullPath);
  if (!key || key.startsWith('..')) return false;
  return PREFIXES.some(p => key === p || key.startsWith(p));
}
function _ctype(key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  return ({ pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
    webp:'image/webp', svg:'image/svg+xml', doc:'application/msword',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mp4:'video/mp4', webm:'video/webm', zip:'application/zip', ico:'image/x-icon' })[ext] || 'application/octet-stream';
}
function _enqueue(fn) {
  pending++;
  chain.p = chain.p.then(fn).catch(e => { console.error('[BLOB] background op failed: ' + (e && e.message)); }).then(() => { pending--; });
  return chain.p;
}

// Mirror a just-written file to the bucket (async, best-effort). Call AFTER the
// local write so the buffer is on disk to stream.
function mirrorPut(fullPath) {
  if (!READY || !_isBinary(fullPath)) return;
  const key = _key(fullPath);
  _enqueue(async () => {
    if (!fs.existsSync(fullPath)) return;
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const body = fs.readFileSync(fullPath);
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentLength: body.length, ContentType: _ctype(key) }));
  });
}
// Mirror a delete to the bucket (async, best-effort).
function mirrorDel(fullPath) {
  if (!READY || !_isBinary(fullPath)) return;
  const key = _key(fullPath);
  _enqueue(async () => {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  });
}

async function _listAllKeys() {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const keys = new Set(); let token = undefined;
  do {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }));
    (out.Contents || []).forEach(o => { if (o.Key) keys.add(o.Key); });
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
function _walkDiskKeys() {
  const keys = new Set();
  const root = DATA_DIR;
  const rootFilePrefixes = PREFIXES.filter(p => p.indexOf('/') < 0); // e.g. brand_logo, brand_favicon
  const dirPrefixes = PREFIXES.filter(p => p.slice(-1) === '/').map(p => p.slice(0, -1));
  // root-level files matching a bare prefix (brand_logo.*, brand_favicon.*)
  try {
    fs.readdirSync(root, { withFileTypes: true }).forEach(d => {
      if (d.isFile() && rootFilePrefixes.some(pfx => d.name.startsWith(pfx))) keys.add(d.name);
    });
  } catch (e) {}
  // whole binary directories (recursive)
  const walk = (dirRel) => {
    const abs = path.join(root, dirRel);
    let ents; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
    ents.forEach(d => {
      const relChild = dirRel + '/' + d.name;
      if (d.isDirectory()) walk(relChild);
      else if (d.isFile()) keys.add(relChild.split(path.sep).join('/'));
    });
  };
  dirPrefixes.forEach(walk);
  return keys;
}
// Two-way reconcile: upload disk-only files, download bucket-only objects.
// Runs once on boot. Returns {uploaded, restored}.
async function reconcile() {
  if (!READY) return { uploaded: 0, restored: 0, skipped: true };
  const [bucketKeys, diskKeys] = [await _listAllKeys(), _walkDiskKeys()];
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  let uploaded = 0, restored = 0;
  // disk -> bucket (migrate)
  for (const key of diskKeys) {
    if (bucketKeys.has(key)) continue;
    const full = path.join(DATA_DIR, key.split('/').join(path.sep));
    try { const body = fs.readFileSync(full); await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentLength: body.length, ContentType: _ctype(key) })); uploaded++; } catch (e) {}
  }
  // bucket -> disk (restore anything the disk is missing)
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  for (const key of bucketKeys) {
    if (diskKeys.has(key)) continue;
    const full = path.join(DATA_DIR, key.split('/').join(path.sep));
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const body = out && out.Body; if (!body) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      await new Promise((resolve, reject) => { const ws = fs.createWriteStream(full); body.pipe(ws); ws.on('finish', resolve); ws.on('error', reject); body.on('error', reject); });
      restored++;
    } catch (e) {}
  }
  return { uploaded, restored };
}

async function flush() { await chain.p; while (pending > 0) { await chain.p; } }

module.exports = { init, ready, mirrorPut, mirrorDel, reconcile, flush, pendingCount, _key, _isBinary };
