/* massmail.js — SaaS mass-email engine (Amazon SES + Postgres).
   Inert unless DATABASE_URL is set; sending inert unless SES is configured.
   Subscribers are a SEPARATE universe from CRM contacts. Suppression is global per tenant. */
'use strict';
const crypto = require('crypto');
const { Pool } = require('pg');

const TENANT = process.env.MAIL_TENANT || 'default';
let pool = null, DB_READY = false, _migrated = null, _drainTimer = null, _abTimer = null, _schedTimer = null;

function _ssl() { const m = String(process.env.PGSSL || '').toLowerCase(); if (m === 'disable' || m === 'off' || m === 'false') return false; return { rejectUnauthorized: false }; }
function dbReady() { return DB_READY; }
function initDb() {
  if (pool) return DB_READY;
  if (!process.env.DATABASE_URL) { DB_READY = false; return false; }
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: _ssl(), max: Number(process.env.PGPOOL_MAX || 6), idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    pool.on('error', e => console.error('[MAIL][PG] idle error: ' + (e && e.message)));
    DB_READY = true; return true;
  } catch (e) { console.error('[MAIL][PG] init failed: ' + (e && e.message)); DB_READY = false; return false; }
}
async function migrate() {
  if (_migrated) return _migrated;
  _migrated = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_subscribers(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default',
      email TEXT NOT NULL, first_name TEXT DEFAULT '', last_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active', source TEXT DEFAULT '', meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant, email))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mm_subs_ts ON mm_subscribers(tenant, status)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_suppressions(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default', email TEXT NOT NULL,
      reason TEXT DEFAULT 'manual', detail TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant, email))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_lists(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_list_members(
      list_id BIGINT NOT NULL, subscriber_id BIGINT NOT NULL, PRIMARY KEY(list_id, subscriber_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_campaigns(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default', name TEXT DEFAULT '',
      subject TEXT DEFAULT '', preheader TEXT DEFAULT '', from_name TEXT DEFAULT '', from_email TEXT DEFAULT '',
      reply_to TEXT DEFAULT '', html TEXT DEFAULT '', list_id BIGINT, status TEXT NOT NULL DEFAULT 'draft',
      total INT DEFAULT 0, sent INT DEFAULT 0, failed INT DEFAULT 0, opens INT DEFAULT 0, clicks INT DEFAULT 0,
      bounces INT DEFAULT 0, complaints INT DEFAULT 0, unsubs INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(), scheduled_at TIMESTAMPTZ, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
      by_user TEXT DEFAULT '')`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_sends(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default', campaign_id BIGINT NOT NULL,
      subscriber_id BIGINT, email TEXT NOT NULL, token TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
      ses_message_id TEXT DEFAULT '', error TEXT DEFAULT '', tries INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(), sent_at TIMESTAMPTZ, opened_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mm_sends_pending ON mm_sends(campaign_id) WHERE status='pending'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mm_sends_msg ON mm_sends(ses_message_id)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_events(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default', email TEXT, campaign_id BIGINT,
      type TEXT, ses_message_id TEXT, at TIMESTAMPTZ DEFAULT now(), meta JSONB DEFAULT '{}'::jsonb)`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS ab_enabled BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS subject_b TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS html_b TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS ab_pct INT DEFAULT 30`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS ab_metric TEXT DEFAULT 'opens'`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS ab_hours INT DEFAULT 4`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS ab_winner TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS ab_decided_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE mm_sends ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'A'`);
    await pool.query(`ALTER TABLE mm_sends ADD COLUMN IF NOT EXISTS run_seq INT DEFAULT 1`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS runs INT DEFAULT 0`);
    await pool.query(`ALTER TABLE mm_campaigns ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mm_schedules(
      id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL DEFAULT 'default', campaign_id BIGINT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'pending', note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now(), done_at TIMESTAMPTZ)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mm_sched_due ON mm_schedules(run_at) WHERE status='pending'`);
    await pool.query(`ALTER TABLE mm_schedules ADD COLUMN IF NOT EXISTS slot_date DATE`);
    await pool.query(`ALTER TABLE mm_schedules ADD COLUMN IF NOT EXISTS slot TEXT`);
    await pool.query(`ALTER TABLE mm_schedules ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false`);
  })().catch(e => { console.error('[MAIL] migrate failed: ' + (e && e.message)); _migrated = null; throw e; });
  return _migrated;
}
async function q(text, params) { if (!DB_READY) throw new Error('Mass email storage is not configured (set DATABASE_URL).'); await migrate(); return pool.query(text, params); }

/* ---------------- SES + MIME ---------------- */
let _ses = null;
function sesConfigured() { return !!((process.env.SES_FROM || process.env.MAIL_FROM) && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_REGION || process.env.SES_REGION)); }
function sesClient() { if (_ses) return _ses; const { SESv2Client } = require('@aws-sdk/client-sesv2'); _ses = new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1' }); return _ses; }
function _norm(e) { return String(e || '').trim().toLowerCase(); }
function _validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }
function newToken() { return crypto.randomBytes(18).toString('hex'); }
function _b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }
function _foldB64(s) { const b = _b64(s); return b.replace(/(.{76})/g, '$1\r\n'); }
function _hdrEnc(s) { s = String(s || ''); return /[^\x20-\x7e]/.test(s) ? ('=?UTF-8?B?' + _b64(s) + '?=') : s; }

// Build a raw multipart/alternative MIME message with one-click unsubscribe headers.
function buildMime(o) {
  const boundary = 'rrgmm_' + crypto.randomBytes(12).toString('hex');
  const fromDisplay = o.fromName ? (_hdrEnc(o.fromName) + ' <' + o.fromEmail + '>') : o.fromEmail;
  const lines = [];
  lines.push('From: ' + fromDisplay);
  lines.push('To: ' + o.to);
  if (o.replyTo) lines.push('Reply-To: ' + o.replyTo);
  lines.push('Subject: ' + _hdrEnc(o.subject));
  lines.push('MIME-Version: 1.0');
  if (o.unsubUrl) {
    lines.push('List-Unsubscribe: <' + o.unsubUrl + '>' + (o.unsubMailto ? (', <mailto:' + o.unsubMailto + '>') : ''));
    lines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }
  lines.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
  lines.push('');
  lines.push('--' + boundary);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(_foldB64(o.text || ''));
  lines.push('--' + boundary);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(_foldB64(o.html || ''));
  lines.push('--' + boundary + '--');
  lines.push('');
  return lines.join('\r\n');
}
async function sesSendRaw(rawMime) {
  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const cmd = new SendEmailCommand({
    Content: { Raw: { Data: Buffer.from(rawMime, 'utf8') } },
    ConfigurationSetName: process.env.SES_CONFIG_SET || undefined,
  });
  const r = await sesClient().send(cmd);
  return r && r.MessageId;
}

/* ---------------- Suppression ---------------- */
async function isSuppressed(email) { const r = await q('SELECT 1 FROM mm_suppressions WHERE tenant=$1 AND email=$2 LIMIT 1', [TENANT, _norm(email)]); return r.rowCount > 0; }
async function addSuppression(email, reason, detail) {
  email = _norm(email); if (!email) return;
  await q(`INSERT INTO mm_suppressions(tenant,email,reason,detail) VALUES($1,$2,$3,$4)
           ON CONFLICT(tenant,email) DO UPDATE SET reason=EXCLUDED.reason, detail=EXCLUDED.detail`, [TENANT, email, reason || 'manual', String(detail || '').slice(0, 300)]);
  const st = reason === 'complaint' ? 'complained' : (reason === 'bounce' ? 'bounced' : (reason === 'unsubscribe' ? 'unsubscribed' : 'active'));
  if (st !== 'active') await q('UPDATE mm_subscribers SET status=$3, updated_at=now() WHERE tenant=$1 AND email=$2', [TENANT, email, st]);
}

/* ---------------- Merge + footer ---------------- */
function mergeFields(str, sub) {
  return String(str || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, (sub && sub.first_name) || '')
    .replace(/\{\{\s*last_name\s*\}\}/gi, (sub && sub.last_name) || '')
    .replace(/\{\{\s*email\s*\}\}/gi, (sub && sub.email) || '');
}
function ensureFooter(html, unsubUrl) {
  const postal = process.env.MAIL_POSTAL_ADDRESS || '';
  const from = process.env.MAIL_FROM_NAME || process.env.SES_FROM || '';
  const foot = '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e6e9f0;font-family:Arial,sans-serif;font-size:11px;color:#8a93a8;line-height:1.6;text-align:center">'
    + (from ? (escapeHtml(from) + '<br>') : '')
    + (postal ? (escapeHtml(postal) + '<br>') : '')
    + 'You are receiving this because you subscribed. <a href="' + unsubUrl + '" style="color:#8a93a8;text-decoration:underline">Unsubscribe</a>.'
    + '</div>';
  if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) return html.replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubUrl);
  // append footer before </body> if present, else at end
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, foot + '</body>');
  return html + foot;
}
function openPixel(html, url) { const px = '<img src="' + url + '" width="1" height="1" alt="" style="display:block;border:0" />'; if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, px + '</body>'); return html + px; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function htmlToText(html) { return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }

/* ---------------- Subscriber import ---------------- */
// rows: [{email, first_name?, last_name?, source?}]. Dedupe by email; suppressed stay suppressed.
async function importSubscribers(rows, source) {
  let added = 0, updated = 0, skipped = 0, suppressed = 0;
  for (const r of (rows || [])) {
    const email = _norm(r && (r.email || r.Email || r.EMAIL));
    if (!_validEmail(email)) { skipped++; continue; }
    if (await isSuppressed(email)) { suppressed++; continue; }
    const fn = String((r.first_name || r.firstName || r.first || r.First || '')).slice(0, 120);
    const ln = String((r.last_name || r.lastName || r.last || r.Last || '')).slice(0, 120);
    const res = await q(`INSERT INTO mm_subscribers(tenant,email,first_name,last_name,source)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(tenant,email) DO UPDATE SET
        first_name=CASE WHEN mm_subscribers.first_name='' THEN EXCLUDED.first_name ELSE mm_subscribers.first_name END,
        last_name=CASE WHEN mm_subscribers.last_name='' THEN EXCLUDED.last_name ELSE mm_subscribers.last_name END,
        updated_at=now()
      RETURNING (xmax=0) AS inserted`, [TENANT, email, fn, ln, String(source || r.source || 'import').slice(0, 60)]);
    if (res.rows[0] && res.rows[0].inserted) added++; else updated++;
  }
  return { added, updated, skipped, suppressed };
}
// Parse a CSV string into row objects using the header row.
function parseCsv(text) {
  const out = []; const rows = _csvRows(String(text || ''));
  if (!rows.length) return out;
  const head = rows[0].map(h => String(h || '').trim().toLowerCase());
  for (let i = 1; i < rows.length; i++) { const r = rows[i]; if (!r.length || (r.length === 1 && !r[0])) continue; const o = {}; head.forEach((h, j) => { o[h] = r[j]; }); out.push(o); }
  return out;
}
function _csvRows(s) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (c === '\r') { /* skip */ } else field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------------- Campaigns ---------------- */
function _abFields(b){
  return {
    enabled: !!b.abEnabled,
    subjectB: String(b.subjectB || '').slice(0, 300),
    htmlB: String(b.htmlB || ''),
    pct: Math.max(5, Math.min(100, parseInt(b.abPct, 10) || 30)),
    metric: (b.abMetric === 'clicks' ? 'clicks' : 'opens'),
    hours: Math.max(1, Math.min(72, parseInt(b.abHours, 10) || 4))
  };
}
async function createCampaign(b, user) {
  const ab = _abFields(b);
  const r = await q(`INSERT INTO mm_campaigns(tenant,name,subject,preheader,from_name,from_email,reply_to,html,list_id,by_user,ab_enabled,subject_b,html_b,ab_pct,ab_metric,ab_hours)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [TENANT, String(b.name || '').slice(0, 200), String(b.subject || '').slice(0, 300), String(b.preheader || '').slice(0, 300),
     String(b.fromName || process.env.MAIL_FROM_NAME || '').slice(0, 120), String(b.fromEmail || process.env.SES_FROM || '').slice(0, 200),
     String(b.replyTo || '').slice(0, 200), String(b.html || ''), b.listId ? Number(b.listId) : null, String((user && user.name) || '').slice(0, 120),
     ab.enabled, ab.subjectB, ab.htmlB, ab.pct, ab.metric, ab.hours]);
  return r.rows[0].id;
}
async function updateCampaign(id, b) {
  const ab = _abFields(b);
  await q(`UPDATE mm_campaigns SET name=$3,subject=$4,preheader=$5,from_name=$6,from_email=$7,reply_to=$8,html=$9,list_id=$10,
           ab_enabled=$11,subject_b=$12,html_b=$13,ab_pct=$14,ab_metric=$15,ab_hours=$16
           WHERE tenant=$1 AND id=$2 AND status IN('draft','scheduled')`,
    [TENANT, id, String(b.name || '').slice(0, 200), String(b.subject || '').slice(0, 300), String(b.preheader || '').slice(0, 300),
     String(b.fromName || '').slice(0, 120), String(b.fromEmail || '').slice(0, 200), String(b.replyTo || '').slice(0, 200),
     String(b.html || ''), b.listId ? Number(b.listId) : null,
     ab.enabled, ab.subjectB, ab.htmlB, ab.pct, ab.metric, ab.hours]);
}
// Materialize the recipient set (active subscribers in the list, minus suppression) into mm_sends.
// US major-holiday calendar (with federal observed shifts). Blocks marketing sends.
function _holidaySet(year){
  function pad(n){ return (n<10?'0':'')+n; }
  function nthWeekday(y,mo,wd,n){ var first=new Date(Date.UTC(y,mo-1,1)).getUTCDay(); return 1 + ((7+wd-first)%7) + (n-1)*7; }
  function lastWeekday(y,mo,wd){ var last=new Date(Date.UTC(y,mo,0)).getUTCDate(); var d=new Date(Date.UTC(y,mo-1,last)).getUTCDay(); return last - ((7+d-wd)%7); }
  var set={}; function add(mo,d){ if(d>=1){ set[pad(mo)+'-'+pad(d)]=1; } }
  add(1,1);                          // New Year's Day
  add(1, nthWeekday(year,1,1,3));    // MLK — 3rd Mon Jan
  add(2, nthWeekday(year,2,1,3));    // Presidents' — 3rd Mon Feb
  add(5, lastWeekday(year,5,1));     // Memorial — last Mon May
  add(6,19);                         // Juneteenth
  add(7,4);                          // Independence Day
  add(9, nthWeekday(year,9,1,1));    // Labor — 1st Mon Sep
  add(11,11);                        // Veterans Day
  var thx=nthWeekday(year,11,4,4); add(11,thx); add(11,thx+1);  // Thanksgiving + day after
  add(12,24); add(12,25);            // Christmas Eve + Day
  add(12,31);                        // New Year's Eve
  [[1,1],[6,19],[7,4],[11,11],[12,25]].forEach(function(md){
    var dow=new Date(Date.UTC(year,md[0]-1,md[1])).getUTCDay();
    if(dow===6){ var f=new Date(Date.UTC(year,md[0]-1,md[1]-1)); add(f.getUTCMonth()+1,f.getUTCDate()); }
    else if(dow===0){ var m2=new Date(Date.UTC(year,md[0]-1,md[1]+1)); add(m2.getUTCMonth()+1,m2.getUTCDate()); }
  });
  return set;
}
function _isHolidayLocal(ld){ var p=String(ld||'').split('-'); if(p.length<3) return false; var y=+p[0],mo=+p[1],d=+p[2]; if(!y||!mo||!d) return false; var set=_holidaySet(y); return !!set[(mo<10?'0':'')+mo+'-'+(d<10?'0':'')+d]; }
async function materialize(campaignId, runSeq, useAB) {
  runSeq = runSeq || 1;
  const c = (await q('SELECT * FROM mm_campaigns WHERE tenant=$1 AND id=$2', [TENANT, campaignId])).rows[0];
  if (!c) throw new Error('Campaign not found.');
  const listFilter = c.list_id ? ' AND s.id IN (SELECT subscriber_id FROM mm_list_members WHERE list_id=$2)' : '';
  const params = c.list_id ? [TENANT, c.list_id] : [TENANT];
  // insert pending sends for this run: eligible subscribers not already queued in THIS run and not suppressed
  const sql = `INSERT INTO mm_sends(tenant,campaign_id,subscriber_id,email,token,status,run_seq)
    SELECT $1, ${campaignId}, s.id, s.email, md5(random()::text||clock_timestamp()::text||s.id::text||'${runSeq}'), 'pending', ${runSeq}
    FROM mm_subscribers s
    WHERE s.tenant=$1 AND s.status='active'${listFilter}
      AND NOT EXISTS (SELECT 1 FROM mm_suppressions x WHERE x.tenant=$1 AND x.email=s.email)
      AND NOT EXISTS (SELECT 1 FROM mm_sends d WHERE d.campaign_id=${campaignId} AND d.run_seq=${runSeq} AND d.subscriber_id=s.id)`;
  await q(sql, params);
  const tot = (await q('SELECT count(*)::int AS n FROM mm_sends WHERE campaign_id=$1', [campaignId])).rows[0].n;
  await q('UPDATE mm_campaigns SET total=$2 WHERE id=$1', [campaignId, tot]);
  if (useAB && runSeq === 1 && c.ab_enabled) {
    const pct = Math.max(5, Math.min(100, c.ab_pct || 30));
    await q(`WITH ranked AS (
        SELECT id, row_number() OVER (ORDER BY random()) AS rn, count(*) OVER () AS n
        FROM mm_sends WHERE campaign_id=$1 AND run_seq=1 AND status='pending')
      UPDATE mm_sends d SET
        status = CASE WHEN r.rn > ceil(r.n * $2 / 100.0) THEN 'hold' ELSE 'pending' END,
        variant = CASE WHEN r.rn > ceil(r.n * $2 / 100.0) THEN 'H'
                       WHEN r.rn <= ceil(r.n * $2 / 100.0 / 2.0) THEN 'A' ELSE 'B' END
      FROM ranked r WHERE d.id = r.id`, [campaignId, pct]);
  }
  return tot;
}
// Begin a fresh send run (re-queues the full active list). Used for the first send and every scheduled repeat.
async function _beginRun(campaignId, useAB) {
  const c = (await q('SELECT runs FROM mm_campaigns WHERE tenant=$1 AND id=$2', [TENANT, campaignId])).rows[0];
  if (!c) throw new Error('Campaign not found.');
  const runSeq = (c.runs || 0) + 1;
  await materialize(campaignId, runSeq, useAB);
  await q(`UPDATE mm_campaigns SET status='sending', runs=$3, started_at=COALESCE(started_at, now()), last_run_at=now(), finished_at=NULL WHERE tenant=$1 AND id=$2`, [TENANT, campaignId, runSeq]);
  kickDrainer();
}
async function startCampaign(campaignId) {
  const c = (await q('SELECT status FROM mm_campaigns WHERE tenant=$1 AND id=$2', [TENANT, campaignId])).rows[0];
  if (!c) throw new Error('Campaign not found.');
  if (c.status === 'sending') return;
  if (c.status === 'paused') { await q(`UPDATE mm_campaigns SET status='sending' WHERE tenant=$1 AND id=$2`, [TENANT, campaignId]); kickDrainer(); return; }  // resume same run
  await _beginRun(campaignId, true);
}
async function startRun(campaignId) { await _beginRun(campaignId, false); }  // scheduled repeat — plain full send, no A/B
// Fire any due schedules. One run per due row; a campaign still sending a prior run waits for the next tick.
async function checkSchedules() {
  if (!DB_READY || !sesConfigured()) return false;
  let fired = false;
  let due;
  try { due = (await q(`SELECT id, campaign_id FROM mm_schedules WHERE tenant=$1 AND status='pending' AND run_at <= now() ORDER BY run_at ASC LIMIT 10`, [TENANT])).rows; }
  catch (e) { return false; }
  for (const sc of due) {
    const c = (await q(`SELECT status FROM mm_campaigns WHERE tenant=$1 AND id=$2`, [TENANT, sc.campaign_id])).rows[0];
    if (!c) { await q(`UPDATE mm_schedules SET status='canceled', done_at=now() WHERE id=$1`, [sc.id]); continue; }
    if (c.status === 'sending') continue;  // a prior run is still going; try next tick
    // Auto-scheduled sends never fire on a weekend or major holiday (belt-and-suspenders in case one
    // slipped through at insert time). Deliberate/manual sends (e.g. a Christmas greeting) are exempt.
    try {
      const tz = process.env.MAIL_TZ || 'America/Chicago';
      const inf = (await q(`SELECT EXTRACT(DOW FROM (run_at AT TIME ZONE $2))::int AS dow, (run_at AT TIME ZONE $2)::date::text AS ld, COALESCE(manual,false) AS manual FROM mm_schedules WHERE id=$1`, [sc.id, tz])).rows[0];
      if (inf && !inf.manual && (inf.dow === 0 || inf.dow === 6 || _isHolidayLocal(inf.ld))) { await q(`UPDATE mm_schedules SET status='skipped', done_at=now(), note='blackout (weekend/holiday)' WHERE id=$1`, [sc.id]); continue; }
    } catch (e) {}
    try {
      await q(`UPDATE mm_schedules SET status='done', done_at=now() WHERE id=$1`, [sc.id]);
      await startRun(sc.campaign_id);
      fired = true;
    } catch (e) { await q(`UPDATE mm_schedules SET status='failed', note=$2, done_at=now() WHERE id=$1`, [sc.id, String((e && e.message) || e).slice(0, 200)]); }
  }
  return fired;
}
async function pauseCampaign(campaignId) { await q(`UPDATE mm_campaigns SET status='paused' WHERE tenant=$1 AND id=$2 AND status='sending'`, [TENANT, campaignId]); }

/* ---------------- Send worker (throttled) ---------------- */
let BASE = '';
let _draining = false;
const RATE = Math.max(1, Number(process.env.SES_MAX_RATE || 10)); // messages per second
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _injectPreheader(html, txt) { const ph = '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">' + escapeHtml(txt) + '</div>'; if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, '$1' + ph); return ph + html; }
function kickDrainer() { if (_draining) return; if (!DB_READY || !sesConfigured()) return; _draining = true; _loop().catch(e => console.error('[MAIL] drain loop: ' + (e && e.message))).finally(() => { _draining = false; }); }
async function maybeDecideAb() {
  if (!DB_READY) return false;
  let released = false;
  const cands = (await q(`SELECT id, ab_metric, ab_hours FROM mm_campaigns
     WHERE tenant=$1 AND status='sending' AND ab_enabled=true AND (ab_winner='' OR ab_winner IS NULL)
       AND started_at IS NOT NULL AND now() >= started_at + ((ab_hours||4) * interval '1 hour')`, [TENANT])).rows;
  for (const c of cands) {
    const pend = (await q(`SELECT count(*)::int n FROM mm_sends WHERE campaign_id=$1 AND variant IN('A','B') AND status='pending'`, [c.id])).rows[0].n;
    if (pend > 0) continue;
    const metricCol = c.ab_metric === 'clicks' ? 'clicked_at' : 'opened_at';
    const stat = (await q(`SELECT variant, count(*) FILTER (WHERE status='sent')::int AS sent, count(*) FILTER (WHERE ${metricCol} IS NOT NULL)::int AS hits FROM mm_sends WHERE campaign_id=$1 AND variant IN('A','B') GROUP BY variant`, [c.id])).rows;
    let a = { sent: 0, hits: 0 }, b = { sent: 0, hits: 0 };
    stat.forEach(r => { if (r.variant === 'A') a = r; else if (r.variant === 'B') b = r; });
    const ra = a.sent ? a.hits / a.sent : 0, rb = b.sent ? b.hits / b.sent : 0;
    const winner = rb > ra ? 'B' : 'A';
    await q(`UPDATE mm_campaigns SET ab_winner=$2, ab_decided_at=now() WHERE id=$1`, [c.id, winner]);
    const upd = await q(`UPDATE mm_sends SET status='pending', variant=$2 WHERE campaign_id=$1 AND status='hold'`, [c.id, winner]);
    if (upd.rowCount > 0) released = true;
  }
  return released;
}
async function _loop() {
  while (true) {
    await maybeDecideAb();
    const batch = (await q(`SELECT d.id,d.email,d.token,d.campaign_id,d.variant,s.first_name,s.last_name
      FROM mm_sends d JOIN mm_subscribers s ON s.id=d.subscriber_id JOIN mm_campaigns c ON c.id=d.campaign_id
      WHERE d.status='pending' AND c.status='sending' ORDER BY d.id ASC LIMIT $1`, [RATE])).rows;
    if (!batch.length) {
      await q(`UPDATE mm_campaigns SET
                 status = CASE WHEN EXISTS(SELECT 1 FROM mm_schedules x WHERE x.tenant=mm_campaigns.tenant AND x.campaign_id=mm_campaigns.id AND x.status='pending') THEN 'scheduled' ELSE 'sent' END,
                 finished_at = CASE WHEN EXISTS(SELECT 1 FROM mm_schedules x WHERE x.tenant=mm_campaigns.tenant AND x.campaign_id=mm_campaigns.id AND x.status='pending') THEN finished_at ELSE now() END
               WHERE status='sending'
                 AND NOT EXISTS(SELECT 1 FROM mm_sends d WHERE d.campaign_id=mm_campaigns.id AND d.status='pending')
                 AND NOT EXISTS(SELECT 1 FROM mm_sends d WHERE d.campaign_id=mm_campaigns.id AND d.status='hold')`);
      break;
    }
    const t0 = Date.now(); const camps = {};
    for (const row of batch) { if (!camps[row.campaign_id]) camps[row.campaign_id] = (await q('SELECT * FROM mm_campaigns WHERE id=$1', [row.campaign_id])).rows[0]; }
    for (const row of batch) {
      const c = camps[row.campaign_id]; if (!c) continue;
      try {
        if (await isSuppressed(row.email)) { await q(`UPDATE mm_sends SET status='failed', error='suppressed' WHERE id=$1`, [row.id]); continue; }
        const sub = { first_name: row.first_name, last_name: row.last_name, email: row.email };
        const unsubUrl = BASE + '/mail/u/' + row.token;
        const openUrl = BASE + '/mail/o/' + row.token + '.gif';
        const useB = (row.variant === 'B');
        const rawHtml = (useB && c.html_b) ? c.html_b : c.html;
        const rawSubj = (useB && c.subject_b) ? c.subject_b : c.subject;
        let html = mergeFields(rawHtml, sub);
        if (c.preheader) html = _injectPreheader(html, mergeFields(c.preheader, sub));
        html = ensureFooter(html, unsubUrl);
        html = openPixel(html, openUrl);
        const subject = mergeFields(rawSubj, sub);
        const mime = buildMime({ to: row.email, subject: subject, html: html, text: htmlToText(html), fromName: c.from_name, fromEmail: c.from_email, replyTo: c.reply_to, unsubUrl: unsubUrl, unsubMailto: process.env.MAIL_UNSUB_MAILTO || '' });
        const msgId = await sesSendRaw(mime);
        await q(`UPDATE mm_sends SET status='sent', ses_message_id=$2, sent_at=now(), tries=tries+1 WHERE id=$1`, [row.id, msgId || '']);
        await q(`UPDATE mm_campaigns SET sent=sent+1 WHERE id=$1`, [row.campaign_id]);
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/throttl|rate exceeded|throughput|too many/i.test(msg)) { await _sleep(2000); break; } // back off, leave pending
        await q(`UPDATE mm_sends SET status='failed', error=$2, tries=tries+1 WHERE id=$1`, [row.id, msg.slice(0, 300)]);
        await q(`UPDATE mm_campaigns SET failed=failed+1 WHERE id=$1`, [row.campaign_id]);
      }
    }
    const dt = Date.now() - t0; if (dt < 1000) await _sleep(1000 - dt);
  }
}

/* ---------------- Event handlers (open / unsubscribe / SNS) ---------------- */
async function handleOpen(token) {
  const d = (await q(`UPDATE mm_sends SET opened_at=COALESCE(opened_at, now()) WHERE token=$1 AND opened_at IS NULL RETURNING campaign_id,email`, [token])).rows[0];
  if (d) { await q('UPDATE mm_campaigns SET opens=opens+1 WHERE id=$1', [d.campaign_id]); await q(`INSERT INTO mm_events(tenant,email,campaign_id,type) VALUES($1,$2,$3,'open')`, [TENANT, d.email, d.campaign_id]); }
}
async function handleUnsub(token) {
  const d = (await q('SELECT campaign_id,email FROM mm_sends WHERE token=$1 LIMIT 1', [token])).rows[0];
  if (!d) return null;
  await addSuppression(d.email, 'unsubscribe', 'one-click');
  await q(`UPDATE mm_campaigns SET unsubs=unsubs+1 WHERE id=$1`, [d.campaign_id]);
  await q(`INSERT INTO mm_events(tenant,email,campaign_id,type) VALUES($1,$2,$3,'unsubscribe')`, [TENANT, d.email, d.campaign_id]);
  return d.email;
}
async function _markSend(mid, email, status, evt) {
  let d = (await q('SELECT id,campaign_id FROM mm_sends WHERE ses_message_id=$1 AND email=$2 LIMIT 1', [mid, _norm(email)])).rows[0];
  if (!d) d = (await q('SELECT id,campaign_id FROM mm_sends WHERE ses_message_id=$1 LIMIT 1', [mid])).rows[0];
  if (!d) return;
  await q('UPDATE mm_sends SET status=$2 WHERE id=$1', [d.id, status]);
  const col = evt === 'bounce' ? 'bounces' : 'complaints';
  await q('UPDATE mm_campaigns SET ' + col + '=' + col + '+1 WHERE id=$1', [d.campaign_id]);
  await q(`INSERT INTO mm_events(tenant,email,campaign_id,type,ses_message_id) VALUES($1,$2,$3,$4,$5)`, [TENANT, _norm(email), d.campaign_id, evt, mid]);
}
async function handleSns(raw) {
  let env; try { env = JSON.parse(raw); } catch (e) { return; }
  if (env.Type === 'SubscriptionConfirmation' && env.SubscribeURL) { try { await fetch(env.SubscribeURL); } catch (e) {} return; }
  if (env.Type !== 'Notification') return;
  let msg; try { msg = JSON.parse(env.Message); } catch (e) { return; }
  const nt = msg.notificationType || msg.eventType; const mid = (msg.mail && msg.mail.messageId) || '';
  if (nt === 'Bounce') { const bt = msg.bounce && msg.bounce.bounceType; for (const r of ((msg.bounce && msg.bounce.bouncedRecipients) || [])) { if (bt === 'Permanent') await addSuppression(r.emailAddress, 'bounce', bt); await _markSend(mid, r.emailAddress, 'bounced', 'bounce'); } }
  else if (nt === 'Complaint') { for (const r of ((msg.complaint && msg.complaint.complainedRecipients) || [])) { await addSuppression(r.emailAddress, 'complaint', ''); await _markSend(mid, r.emailAddress, 'complained', 'complaint'); } }
}
async function sendTest(campaignId, toEmail) {
  const c = (await q('SELECT * FROM mm_campaigns WHERE tenant=$1 AND id=$2', [TENANT, campaignId])).rows[0]; if (!c) throw new Error('Campaign not found.');
  const sub = { first_name: '', last_name: '', email: toEmail }; const token = 'test' + newToken(); const unsubUrl = BASE + '/mail/u/' + token;
  let html = mergeFields(c.html, sub); if (c.preheader) html = _injectPreheader(html, mergeFields(c.preheader, sub)); html = ensureFooter(html, unsubUrl);
  const mime = buildMime({ to: toEmail, subject: '[TEST] ' + mergeFields(c.subject, sub), html: html, text: htmlToText(html), fromName: c.from_name, fromEmail: c.from_email, replyTo: c.reply_to, unsubUrl: unsubUrl });
  return await sesSendRaw(mime);
}

/* ---------------- Mount ---------------- */
function mount(app, deps) {
  deps = deps || {};
  const requireAdmin = deps.requireAdmin || function (req, res, next) { next(); };
  BASE = (deps.appBaseUrl && deps.appBaseUrl()) || '';
  const express = require('express');
  initDb();
  function guard(req, res, next) { if (!DB_READY) return res.status(503).json({ ok: false, error: 'Mass email is not configured — set DATABASE_URL.' }); next(); }

  app.get('/api/mail/config', requireAdmin, (req, res) => { res.json({ ok: true, storage: DB_READY, sending: sesConfigured(), from: process.env.SES_FROM || process.env.MAIL_FROM || '', fromName: process.env.MAIL_FROM_NAME || '', postal: process.env.MAIL_POSTAL_ADDRESS || '', rate: RATE }); });
  app.get('/api/mail/stats', requireAdmin, guard, async (req, res) => { try {
    const s = (await q(`SELECT status, count(*)::int n FROM mm_subscribers WHERE tenant=$1 GROUP BY status`, [TENANT])).rows;
    const supp = (await q('SELECT count(*)::int n FROM mm_suppressions WHERE tenant=$1', [TENANT])).rows[0].n;
    const by = { active: 0, unsubscribed: 0, bounced: 0, complained: 0, cleaned: 0 }; s.forEach(r => { by[r.status] = r.n; });
    res.json({ ok: true, subscribers: by, total: Object.keys(by).reduce((a, k) => a + by[k], 0), suppressions: supp });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/import', requireAdmin, guard, express.json({ limit: '60mb' }), async (req, res) => { try {
    const b = req.body || {}; const rows = Array.isArray(b.rows) ? b.rows : (b.csv ? parseCsv(b.csv) : []);
    const r = await importSubscribers(rows, b.source || 'import');
    let listId = b.listId ? Number(b.listId) : 0; const listName = String(b.listName || '').trim().slice(0, 160); let listed = 0;
    if (!listId && listName) { listId = (await q('INSERT INTO mm_lists(tenant,name) VALUES($1,$2) RETURNING id', [TENANT, listName])).rows[0].id; }
    if (listId) {
      const emails = rows.map(x => _norm((x && x.email) || (typeof x === 'string' ? x : ''))).filter(Boolean);
      if (emails.length) { const ins = await q(`INSERT INTO mm_list_members(list_id, subscriber_id) SELECT $1, s.id FROM mm_subscribers s WHERE s.tenant=$2 AND s.email = ANY($3::text[]) ON CONFLICT (list_id, subscriber_id) DO NOTHING`, [listId, TENANT, emails]); listed = ins.rowCount || 0; }
    }
    res.json(Object.assign({ ok: true, listId: listId || null, listed: listed }, r));
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.get('/api/mail/subscribers', requireAdmin, guard, async (req, res) => { try {
    const lim = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100)); const off = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const st = String(req.query.status || ''); const qq = String(req.query.q || '').trim().toLowerCase(); const listId = parseInt(req.query.list, 10) || 0;
    const wh = ['tenant=$1']; const p = [TENANT]; if (st) { p.push(st); wh.push('status=$' + p.length); } if (qq) { p.push('%' + qq + '%'); wh.push('email ILIKE $' + p.length); } if (listId) { p.push(listId); wh.push('id IN (SELECT subscriber_id FROM mm_list_members WHERE list_id=$' + p.length + ')'); }
    p.push(lim); p.push(off);
    const rows = (await q(`SELECT id,email,first_name,last_name,status,source,created_at FROM mm_subscribers WHERE ${wh.join(' AND ')} ORDER BY id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
    res.json({ ok: true, subscribers: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/suppress', requireAdmin, guard, express.json(), async (req, res) => { try { await addSuppression((req.body || {}).email, 'manual', (req.body || {}).detail || ''); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.get('/api/mail/suppressions', requireAdmin, guard, async (req, res) => { try {
    const qq = String(req.query.q || '').trim().toLowerCase();
    const p = [TENANT]; let wh = 'tenant=$1'; if (qq) { p.push('%' + qq + '%'); wh += ' AND email ILIKE $' + p.length; }
    const rows = (await q(`SELECT email,reason,detail,created_at FROM mm_suppressions WHERE ${wh} ORDER BY created_at DESC LIMIT 300`, p)).rows;
    res.json({ ok: true, suppressions: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });

  app.get('/api/mail/campaigns', requireAdmin, guard, async (req, res) => { try {
    const arch = String(req.query.archived||'')==='1'; const qq=String(req.query.q||'').trim().toLowerCase();
    const days = Math.max(0, parseInt(req.query.days,10) || 0);
    const p=[TENANT]; let wh='c.tenant=$1 AND COALESCE(c.archived,false)=$2'; p.push(arch);
    if(qq){ p.push('%'+qq+'%'); wh+=' AND (LOWER(c.name) LIKE $'+p.length+' OR LOWER(c.subject) LIKE $'+p.length+')'; }
    if(days>0){ p.push(days); wh+=' AND c.created_at >= now() - ($'+p.length+" * interval '1 day')"; }
    const rows = (await q(`SELECT c.id,c.name,c.subject,c.status,c.total,c.sent,c.failed,c.opens,c.clicks,c.bounces,c.complaints,c.unsubs,c.created_at,c.started_at,c.finished_at,COALESCE(c.archived,false) AS archived,COALESCE(c.ab_enabled,false) AS ab_enabled,COALESCE(c.ab_winner,'') AS ab_winner,COALESCE(c.runs,0) AS runs,(SELECT min(run_at) FROM mm_schedules x WHERE x.tenant=c.tenant AND x.campaign_id=c.id AND x.status='pending') AS next_run,(SELECT count(*)::int FROM mm_schedules x WHERE x.tenant=c.tenant AND x.campaign_id=c.id AND x.status='pending') AS sched_pending,l.name AS list_name FROM mm_campaigns c LEFT JOIN mm_lists l ON l.id=c.list_id WHERE ${wh} ORDER BY c.id DESC LIMIT 500`, p)).rows;
    res.json({ ok: true, campaigns: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.get('/api/mail/campaigns/:id', requireAdmin, guard, async (req, res) => { try { const c = (await q('SELECT * FROM mm_campaigns WHERE tenant=$1 AND id=$2', [TENANT, req.params.id])).rows[0]; if (!c) return res.status(404).json({ ok: false, error: 'Not found.' }); res.json({ ok: true, campaign: c }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/campaigns', requireAdmin, guard, express.json({ limit: '25mb' }), async (req, res) => { try { const b = req.body || {}; if (b.id) { await updateCampaign(Number(b.id), b); res.json({ ok: true, id: Number(b.id) }); } else { const id = await createCampaign(b, req.user); res.json({ ok: true, id }); } } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/campaigns/:id/test', requireAdmin, guard, express.json(), async (req, res) => { try { if (!sesConfigured()) return res.status(400).json({ ok: false, error: 'Sending (SES) is not configured.' }); const to = String((req.body || {}).email || '').trim(); if (!_validEmail(to)) return res.status(400).json({ ok: false, error: 'Enter a valid test email.' }); const id = await sendTest(Number(req.params.id), to); res.json({ ok: true, messageId: id || '' }); } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/campaigns/:id/send', requireAdmin, guard, express.json(), async (req, res) => { try { if (!sesConfigured()) return res.status(400).json({ ok: false, error: 'Sending (SES) is not configured.' }); await startCampaign(Number(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/campaigns/:id/pause', requireAdmin, guard, async (req, res) => { try { await pauseCampaign(Number(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/campaigns/:id/archive', requireAdmin, guard, express.json(), async (req, res) => { try { const a = (req.body||{}).archived !== false; await q('UPDATE mm_campaigns SET archived=$3 WHERE tenant=$1 AND id=$2', [TENANT, Number(req.params.id), a]); res.json({ ok: true, archived: a }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.get('/api/mail/campaigns/:id/schedule', requireAdmin, guard, async (req, res) => { try {
    const rows = (await q(`SELECT id, run_at, status, done_at FROM mm_schedules WHERE tenant=$1 AND campaign_id=$2 ORDER BY run_at ASC`, [TENANT, Number(req.params.id)])).rows;
    res.json({ ok: true, schedules: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/campaigns/:id/schedule', requireAdmin, guard, express.json(), async (req, res) => { try {
    const id = Number(req.params.id); const b = req.body || {};
    const times = Array.isArray(b.times) ? b.times : (b.time ? [b.time] : []);
    // A deliberate/manual send (e.g. a Christmas greeting) is exempt from the weekend + holiday
    // blackout. Auto-scheduled series stay inside business days. Default is auto (safe).
    const manual = b.manual === true || b.force === true || b.allowBlackout === true;
    const tz = process.env.MAIL_TZ || 'America/Chicago';
    const now = Date.now(); let added = 0, skipWeekend = 0, skipSlot = 0, skipPast = 0, skipHoliday = 0;
    const usedBatch = {};
    for (const t of times) {
      const d = new Date(t);
      if (isNaN(d.getTime()) || d.getTime() <= now - 60000) { skipPast++; continue; }
      // classify in the brokerage's local timezone: weekday + AM/PM + local date
      const info = (await q(`SELECT EXTRACT(DOW FROM ($1::timestamptz AT TIME ZONE $2))::int AS dow, EXTRACT(HOUR FROM ($1::timestamptz AT TIME ZONE $2))::int AS hr, ($1::timestamptz AT TIME ZONE $2)::date::text AS ld`, [d.toISOString(), tz])).rows[0];
      if (!manual && (info.dow === 0 || info.dow === 6)) { skipWeekend++; continue; }  // auto: no weekends
      if (!manual && _isHolidayLocal(info.ld)) { skipHoliday++; continue; }            // auto: no major holidays
      const slot = info.hr < 12 ? 'am' : 'pm';
      const key = info.ld + '|' + slot;
      if (usedBatch[key]) { skipSlot++; continue; }
      const dup = (await q(`SELECT count(*)::int AS n FROM mm_schedules WHERE tenant=$1 AND slot_date=$2 AND slot=$3 AND status='pending'`, [TENANT, info.ld, slot])).rows[0].n;
      if (dup > 0) { skipSlot++; continue; }                                          // one AM + one PM per day, tenant-wide
      usedBatch[key] = true;
      await q(`INSERT INTO mm_schedules(tenant,campaign_id,run_at,status,slot_date,slot,manual) VALUES($1,$2,$3,'pending',$4,$5,$6)`, [TENANT, id, d.toISOString(), info.ld, slot, manual]);
      added++;
    }
    if (added) await q(`UPDATE mm_campaigns SET status='scheduled' WHERE tenant=$1 AND id=$2 AND status IN('draft')`, [TENANT, id]);
    const rows = (await q(`SELECT id, run_at, status, slot, COALESCE(manual,false) AS manual FROM mm_schedules WHERE tenant=$1 AND campaign_id=$2 AND status='pending' ORDER BY run_at ASC`, [TENANT, id])).rows;
    res.json({ ok: true, added: added, manual: manual, skippedWeekend: skipWeekend, skippedHoliday: skipHoliday, skippedSlot: skipSlot, skippedPast: skipPast, schedules: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.get('/api/mail/schedule-events', requireAdmin, guard, async (req, res) => { try {
    const rows = (await q(`SELECT s.id, s.campaign_id, s.run_at, c.name FROM mm_schedules s JOIN mm_campaigns c ON c.id=s.campaign_id WHERE s.tenant=$1 AND s.status='pending' ORDER BY s.run_at ASC LIMIT 500`, [TENANT])).rows;
    res.json({ ok: true, events: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });

  // Per-recipient engagement (matched by email) — powers the Subscriber detail page's activity list, last-sent and last-opened.
  app.get('/api/mail/recipient', requireAdmin, guard, async (req, res) => { try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.json({ ok: true, email: '', sends: [], lastSent: null, lastOpened: null, suppression: null, totals: { sent: 0, opened: 0, clicked: 0 } });
    const rows = (await q(`SELECT d.campaign_id, c.name, c.subject, d.status, d.sent_at, d.opened_at, d.clicked_at
      FROM mm_sends d JOIN mm_campaigns c ON c.id=d.campaign_id
      WHERE d.tenant=$1 AND lower(d.email)=$2 ORDER BY COALESCE(d.sent_at, d.created_at) DESC LIMIT 500`, [TENANT, email])).rows;
    const sup = (await q(`SELECT reason, detail, created_at FROM mm_suppressions WHERE tenant=$1 AND lower(email)=$2 LIMIT 1`, [TENANT, email])).rows[0] || null;
    let lastSent = null, lastOpened = null, sent = 0, opened = 0, clicked = 0;
    rows.forEach(r => {
      if (r.sent_at) { sent++; if (!lastSent || r.sent_at > lastSent) lastSent = r.sent_at; }
      if (r.opened_at) { opened++; if (!lastOpened || r.opened_at > lastOpened) lastOpened = r.opened_at; }
      if (r.clicked_at) clicked++;
    });
    res.json({ ok: true, email, sends: rows.map(r => ({ campaignId: r.campaign_id, campaign: r.name || '', subject: r.subject || '', status: r.status || '', sentAt: r.sent_at, openedAt: r.opened_at, clickedAt: r.clicked_at })), lastSent, lastOpened, suppression: sup, totals: { sent, opened, clicked } });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });

  // All email as calendar events — scheduled sends (future) + finished campaigns (past). Rendered on rrg_calendar.
  app.get('/api/mail/calendar-events', requireAdmin, guard, async (req, res) => { try {
    const sched = (await q(`SELECT s.id, s.campaign_id, s.run_at, c.name FROM mm_schedules s JOIN mm_campaigns c ON c.id=s.campaign_id WHERE s.tenant=$1 AND s.status='pending' ORDER BY s.run_at ASC LIMIT 500`, [TENANT])).rows;
    const sent = (await q(`SELECT c.id, c.name, c.subject, c.finished_at, c.started_at, c.sent, c.opens, c.clicks FROM mm_campaigns c WHERE c.tenant=$1 AND c.finished_at IS NOT NULL ORDER BY c.finished_at DESC LIMIT 500`, [TENANT])).rows;
    const events = [];
    sched.forEach(r => events.push({ kind: 'scheduled', id: 's' + r.id, campaignId: r.campaign_id, title: r.name || 'Campaign', at: r.run_at }));
    sent.forEach(r => events.push({ kind: 'sent', id: 'c' + r.id, campaignId: r.id, title: r.name || 'Campaign', subject: r.subject || '', at: r.finished_at || r.started_at, sent: r.sent || 0, opens: r.opens || 0, clicks: r.clicks || 0 }));
    res.json({ ok: true, events });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/schedules/:sid/cancel', requireAdmin, guard, async (req, res) => { try {
    await q(`UPDATE mm_schedules SET status='canceled', done_at=now() WHERE tenant=$1 AND id=$2 AND status='pending'`, [TENANT, Number(req.params.sid)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.get('/api/mail/campaigns/:id/export', requireAdmin, guard, async (req, res) => { try {
    const c = (await q('SELECT name FROM mm_campaigns WHERE tenant=$1 AND id=$2', [TENANT, Number(req.params.id)])).rows[0]; if(!c) return res.status(404).json({ ok:false, error:'Not found.' });
    const rows = (await q(`SELECT email,status,sent_at,opened_at,clicked_at FROM mm_sends WHERE tenant=$1 AND campaign_id=$2 ORDER BY id`, [TENANT, Number(req.params.id)])).rows;
    const esc=v=>{ v=(v==null?'':String(v)); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
    let csv='email,status,sent_at,opened_at,clicked_at\n'; rows.forEach(r=>{ csv+=[r.email,r.status,r.sent_at||'',r.opened_at||'',r.clicked_at||''].map(esc).join(',')+'\n'; });
    res.set('Content-Type','text/csv; charset=utf-8'); res.set('Content-Disposition','attachment; filename="campaign-'+Number(req.params.id)+'-recipients.csv"'); res.send(csv);
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });

  app.get('/api/mail/lists', requireAdmin, guard, async (req, res) => { try { const rows = (await q('SELECT l.id,l.name,(SELECT count(*)::int FROM mm_list_members m WHERE m.list_id=l.id) AS members FROM mm_lists l WHERE l.tenant=$1 ORDER BY l.id DESC', [TENANT])).rows; res.json({ ok: true, lists: rows }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });
  app.post('/api/mail/lists', requireAdmin, guard, express.json(), async (req, res) => { try { const nm = String((req.body || {}).name || '').trim().slice(0, 160); if (!nm) return res.status(400).json({ ok: false, error: 'Name required.' }); const id = (await q('INSERT INTO mm_lists(tenant,name) VALUES($1,$2) RETURNING id', [TENANT, nm])).rows[0].id; res.json({ ok: true, id }); } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); } });

  /* public */
  app.post('/api/mail/ses-webhook', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => { try { await handleSns(req.body); } catch (e) { console.error('[MAIL] sns: ' + (e && e.message)); } res.json({ ok: true }); });
  const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  app.get('/mail/o/:token', async (req, res) => { try { if (DB_READY) await handleOpen(String(req.params.token).replace(/\.gif$/i, '')); } catch (e) {} res.set('Content-Type', 'image/gif').set('Cache-Control', 'no-store, no-cache, must-revalidate').send(GIF); });
  function _unsubPage(email) { return '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#eef1f6;margin:0"><div style="max-width:480px;margin:70px auto;background:#fff;border:1px solid #e6e9f0;border-radius:12px;padding:34px;text-align:center"><h2 style="color:#000E31;margin:0 0 8px">You\'re unsubscribed</h2><p style="color:#6b7488">' + (email ? ('<b>' + escapeHtml(email) + '</b> has been removed and won\'t receive further emails.') : 'You will not receive further emails.') + '</p></div></body>'; }
  app.get('/mail/u/:token', async (req, res) => { let email = null; try { if (DB_READY) email = await handleUnsub(String(req.params.token)); } catch (e) {} res.set('Content-Type', 'text/html; charset=utf-8').send(_unsubPage(email)); });
  app.post('/mail/u/:token', express.urlencoded({ extended: false }), async (req, res) => { try { if (DB_READY) await handleUnsub(String(req.params.token)); } catch (e) {} res.json({ ok: true }); });

  if (DB_READY && sesConfigured()) { migrate().then(() => kickDrainer()).catch(() => {}); }
  if (DB_READY && !_abTimer) { _abTimer = setInterval(() => { maybeDecideAb().then(r => { if (r) kickDrainer(); }).catch(() => {}); }, 60000); }
  if (DB_READY && !_schedTimer) { _schedTimer = setInterval(() => { checkSchedules().catch(() => {}); }, 30000); }
  if (DB_READY) { migrate().then(() => checkSchedules()).catch(() => {}); }
}

module.exports = { mount, dbReady, sesConfigured, importSubscribers, parseCsv };
