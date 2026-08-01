// RRG Site Selection Criteria — mailer service.
// Receives form submissions, renders a branded PDF, emails it to the tenant rep (CC van@rrgcre.com).
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { sendSsc } = require('./mailer.js');
const store = require('./store.js');

const app = express();

// ---- Password gate (internal RRG use only) -----------------------------
// Set APP_USER + APP_PASS to require login before the form/API load.
// Leave them unset to disable the gate (e.g., for local testing).
const APP_USER = process.env.APP_USER || '';
const APP_PASS = process.env.APP_PASS || '';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function passwordGate(req, res, next) {
  if (!APP_USER && !APP_PASS) return next();     // gate disabled
  if (req.path === '/health') return next();     // health check stays open
  const hdr = req.headers.authorization || '';
  const [scheme, encoded] = hdr.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
    if (safeEqual(u, APP_USER) && safeEqual(p, APP_PASS)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="RRG SSC Internal Use Only"');
  return res.status(401).send('Restaurant Realty Group - authorized access only.');
}

// CORS: allow the form's origin (set ALLOW_ORIGIN, or '*' for any).
app.use(cors({ origin: process.env.ALLOW_ORIGIN || '*' }));
app.use(passwordGate);                 // <- everything below requires the RRG login
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public')); // serves the form at /

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/send-ssc', async (req, res) => {
  const data = req.body || {};
  if (!data.repEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.repEmail)) {
    return res.status(400).json({ ok: false, error: 'A valid tenant rep email is required.' });
  }
  let out = null, err = null, emailed = false;
  try {
    if (!process.env.SMTP_HOST) throw new Error('Server email is not configured (SMTP_HOST missing).');
    out = await sendSsc(data, buildTransport());
    emailed = true;
  } catch (e) {
    err = e;
  }
  // Log the entry regardless of email outcome, so nothing is ever lost.
  try { store.appendSubmission('ssc', data, { ip: req.ip, emailed }); }
  catch (le) { console.error('log error:', le); }
  if (err) {
    console.error('send-ssc error:', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
  res.json({ ok: true, messageId: out.info.messageId, filename: out.filename, bytes: out.size });
});

// Lightweight logger for forms that don't email through the server (e.g. Seller Screening).
app.post('/api/log', (req, res) => {
  const data = req.body || {};
  const formType = String(data.formType || 'seller').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20) || 'seller';
  try {
    const e = store.appendSubmission(formType, data, { ip: req.ip, emailed: false });
    res.json({ ok: true, timestamp: e.timestamp });
  } catch (err) {
    console.error('log error:', err);
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// CSV export of the running log (opens in Excel/Sheets).
app.get('/log.csv', (_req, res) => {
  const fs = require('fs');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rrg-submissions.csv"');
  if (fs.existsSync(store.CSV)) return fs.createReadStream(store.CSV).pipe(res);
  res.send(store.CSV_COLS.join(',') + '\n');
});

// Browser view of the running log (newest first), on-brand and password-gated.
app.get('/log', (_req, res) => {
  const rows = store.readAll().slice().reverse();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nSsc = rows.filter(r => r.form === 'ssc').length;
  const nSeller = rows.filter(r => r.form === 'seller').length;
  const body = rows.map(r => {
    const t = new Date(r.timestamp);
    const when = isNaN(t.getTime()) ? esc(r.timestamp) : t.toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const badge = r.form === 'seller'
      ? '<span class="tag seller">Seller</span>'
      : '<span class="tag ssc">SSC</span>';
    return `<tr><td class="ts">${when}</td><td>${badge}</td><td class="nm">${esc(r.name) || '—'}</td><td>${esc(r.market) || '—'}</td><td>${esc(r.rep) || '—'}</td><td>${esc(r.repEmail) || '—'}</td><td class="hl">${esc(r.highlights) || '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No submissions logged yet.</td></tr>';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RRG · Submission Log</title>
<style>
:root{--navy:#000E31;--red:#DA2B1F;--line:#e6e9f0;--muted:#6b7488;--ink:#1a2236;--wash:#f5f7fb;}
*{box-sizing:border-box;} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fbfcfe;}
.top{background:var(--navy);color:#fff;padding:22px 28px;display:flex;align-items:center;gap:16px;}
.disc{width:38px;height:38px;border-radius:50%;background:var(--red);color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;letter-spacing:.02em;}
.top h1{font-size:17px;margin:0;font-weight:700;letter-spacing:.01em;} .top .sub{font-size:12px;color:#aeb8cf;margin-top:2px;}
.bar{display:flex;align-items:center;gap:14px;padding:16px 28px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
.stat{font-size:13px;color:var(--muted);} .stat b{color:var(--navy);font-size:15px;}
.dl{margin-left:auto;} .dl a{background:var(--navy);color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 14px;border-radius:7px;}
.wrap{padding:8px 28px 40px;overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:13px;} th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;}
th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;position:sticky;top:0;background:#fbfcfe;}
tr:hover td{background:var(--wash);} .ts{white-space:nowrap;color:var(--muted);} .nm{font-weight:600;color:var(--navy);} .hl{color:#3a4256;max-width:360px;}
.tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:20px;text-transform:uppercase;}
.tag.ssc{background:#eaf0ff;color:#2647b0;} .tag.seller{background:#fdeceb;color:var(--red);}
.empty{color:var(--muted);text-align:center;padding:36px;} .foot{padding:16px 28px;color:var(--muted);font-size:11px;border-top:1px solid var(--line);}
</style></head><body>
<div class="top"><span class="disc">RRG</span><div><h1>Submission Log</h1><div class="sub">Site Selection Criteria &amp; Seller Screening — internal record</div></div></div>
<div class="bar"><span class="stat"><b>${rows.length}</b> total</span><span class="stat"><b>${nSsc}</b> SSC</span><span class="stat"><b>${nSeller}</b> Seller</span><span class="dl"><a href="log.csv">Download CSV</a></span></div>
<div class="wrap"><table><thead><tr><th>When (CT)</th><th>Form</th><th>Name</th><th>Market</th><th>Rep</th><th>Rep Email</th><th>Highlights</th></tr></thead><tbody>${body}</tbody></table></div>
<div class="foot">Proprietary &amp; Confidential · Property of Restaurant Realty Group, LLC · Internal RRG use only.</div>
</body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

// Auto-list agreement documents in public/agreements/ (frequently updated; drop-in more anytime).
app.get('/api/agreements', (_req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, 'public', 'agreements');
  try {
    if (!fs.existsSync(dir)) return res.json({ ok: true, agreements: [] });
    const pretty = f => f.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const agreements = fs.readdirSync(dir)
      .filter(f => /\.(pdf|docx?|png|jpe?g)$/i.test(f))
      .map(f => ({ name: pretty(f), file: 'agreements/' + f, type: (f.split('.').pop() || '').toUpperCase(), updated: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ok: true, agreements });
  } catch (e) {
    console.error('agreements list error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`RRG SSC mailer listening on :${PORT}`));
