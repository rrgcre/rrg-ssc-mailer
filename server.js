// RRG toolkit server — serves the toolkit, gates it behind per-user logins,
// logs form submissions, emails SSC PDFs, and provides an admin console.
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { sendSsc } = require('./mailer.js');
const store = require('./store.js');
const auth = require('./auth.js');
const bovgen = require('./bovgen.js');
const cimgen = require('./cimgen.js');
const valgen = require('./valgen.js');

const fs = require('fs');
const path = require('path');
const app = express();
const COOKIE = 'rrg_sess';
// Deploy stamp — set when the server boots, so it reflects the latest Render deploy.
const BUILD = new Date().toISOString();

// ---- BOV queue store (on the persistent disk) ----
const BOV_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BOVS_FILE = path.join(BOV_DATA_DIR, 'bovs.json');
function loadBovs() { try { return JSON.parse(fs.readFileSync(BOVS_FILE, 'utf8')); } catch (e) { return []; } }
function saveBovs(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(BOVS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newBovId() { return 'bov_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
// ---- CIM store (Confidential Information Memorandums) — mirrors the BOV store ----
const CIMS_FILE = path.join(BOV_DATA_DIR, 'cims.json');
function loadCims() { try { return JSON.parse(fs.readFileSync(CIMS_FILE, 'utf8')); } catch (e) { return []; } }
function saveCims(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(CIMS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newCimId() { return 'cim_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---- Admin-editable BOV analyst prompt ----
// Empty file / no file = use bovgen's built-in default.
const BOV_PROMPT_FILE = path.join(BOV_DATA_DIR, 'bov_prompt.txt');
function loadBovPromptCustom() { try { const t = fs.readFileSync(BOV_PROMPT_FILE, 'utf8'); return (t && t.trim()) ? t : ''; } catch (e) { return ''; } }
function saveBovPromptCustom(t) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(BOV_PROMPT_FILE, String(t)); } catch (e) {} }
function clearBovPromptCustom() { try { fs.unlinkSync(BOV_PROMPT_FILE); } catch (e) {} }
// Admin-editable CIM prompt (mirrors the BOV prompt).
const CIM_PROMPT_FILE = path.join(BOV_DATA_DIR, 'cim_prompt.txt');
function loadCimPromptCustom() { try { const t = fs.readFileSync(CIM_PROMPT_FILE, 'utf8'); return (t && t.trim()) ? t : ''; } catch (e) { return ''; } }
function saveCimPromptCustom(t) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(CIM_PROMPT_FILE, String(t)); } catch (e) {} }
function clearCimPromptCustom() { try { fs.unlinkSync(CIM_PROMPT_FILE); } catch (e) {} }
// ---- BOV / app config (admin-editable) ----
const BOV_CONFIG_FILE = path.join(BOV_DATA_DIR, 'bov_config.json');
const DEFAULT_SDE_THRESHOLD = 1200000;
const DEFAULT_INTRO_SECONDS = 10;
// Generic config store — MERGES keys so settings don't clobber each other.
function loadCfg() { try { return JSON.parse(fs.readFileSync(BOV_CONFIG_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function saveCfg(patch) {
  try {
    if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true });
    const merged = Object.assign(loadCfg(), patch || {});
    fs.writeFileSync(BOV_CONFIG_FILE, JSON.stringify(merged, null, 2));
  } catch (e) {}
}
function loadSdeThreshold() { const n = Number(loadCfg().sdeThreshold); return n > 0 ? n : DEFAULT_SDE_THRESHOLD; }
function saveSdeThreshold(n) { saveCfg({ sdeThreshold: Number(n) || DEFAULT_SDE_THRESHOLD }); }
// Seconds the "Before you begin" questionnaire intro screen stays up (0 = off).
function loadIntroSeconds() { const c = loadCfg(); const n = Number(c.introSeconds); return (isFinite(n) && n >= 0) ? n : DEFAULT_INTRO_SECONDS; }
function saveIntroSeconds(n) { let v = Math.round(Number(n)); if (!isFinite(v) || v < 0) v = DEFAULT_INTRO_SECONDS; if (v > 120) v = 120; saveCfg({ introSeconds: v }); }
// Admin-editable body text of the "Before you begin" intro screen. Blank lines
// separate paragraphs; lines beginning "- " render as checklist items.
const DEFAULT_INTRO_MESSAGE = [
  "You’re about to complete the questionnaire our valuation analyst uses to build a defensible opinion of value for this business. The more complete and accurate your answers, the stronger the valuation — so it’s worth doing in one focused sitting.",
  "",
  "Have these within reach before you start:",
  "- Recent P&Ls and tax returns — trailing twelve months plus prior years",
  "- The lease — remaining term, rent, options, and whether it’s assignable",
  "- Owner and family compensation, perks, and any true one-time expenses",
  "- A candid read on operations, staffing, and what really drives the business",
  "",
  "Answer as completely and honestly as you can — this is the foundation the entire valuation is built on. Your answers save automatically, so you can step away and pick up right where you left off."
].join("\n");
function loadIntroMessage() { const m = loadCfg().introMessage; return (typeof m === 'string' && m.trim()) ? m : DEFAULT_INTRO_MESSAGE; }
function saveIntroMessage(t) { saveCfg({ introMessage: String(t == null ? '' : t).slice(0, 4000) }); }
// Seconds the "your BOV is ready" screen (with the completion sound) stays up
// before opening the finished draft.
const DEFAULT_DONE_SECONDS = 2;
function loadDoneSeconds() { const c = loadCfg(); const n = Number(c.doneSeconds); return (isFinite(n) && n >= 0) ? n : DEFAULT_DONE_SECONDS; }
function saveDoneSeconds(n) { let v = Number(n); if (!isFinite(v) || v < 0) v = DEFAULT_DONE_SECONDS; if (v > 60) v = 60; saveCfg({ doneSeconds: Math.round(v * 10) / 10 }); }
// Notice shown on a BOV when no TTM statement was provided AND we are past Q1, so
// the valuation fell back to the previous fiscal year (which may be stale).
const DEFAULT_NO_TTM_MESSAGE = "No trailing-twelve-month (TTM) statement was found in the documents, so this valuation was built on the previous fiscal year. Because we’re past Q1, that full-year figure may be stale — it won’t reflect the most recent months. For the most current value, add a TTM or year-to-date P&L and rebuild.";
function loadNoTtmMessage() { const m = loadCfg().noTtmMessage; return (typeof m === 'string' && m.trim()) ? m : DEFAULT_NO_TTM_MESSAGE; }
function saveNoTtmMessage(t) { saveCfg({ noTtmMessage: String(t == null ? '' : t).slice(0, 2000) }); }
// Asset-sale floor: when trailing SDE is at or below this, the business has no
// going-concern value and is treated/marketed as an asset sale.
const DEFAULT_ASSET_SALE_FLOOR = 25000;
function loadAssetSaleFloor() { const n = Number(loadCfg().assetSaleFloor); return (isFinite(n) && n >= 0) ? n : DEFAULT_ASSET_SALE_FLOOR; }
function saveAssetSaleFloor(n) { let v = Number(n); if (!isFinite(v) || v < 0) v = DEFAULT_ASSET_SALE_FLOOR; saveCfg({ assetSaleFloor: Math.round(v) }); }
const DEFAULT_ASSET_SALE_MESSAGE = "This business has little or no going-concern value — trailing owner’s earnings (SDE) fall at or below the asset-sale floor. It is best marketed as an ASSET SALE: the price reflects the tangible assets (equipment, leasehold improvements, a transferable or below-market lease, and any liquor / other licenses), not a multiple of earnings. Process it as an asset sale, not a going-concern listing.";
function loadAssetSaleMessage() { const m = loadCfg().assetSaleMessage; return (typeof m === 'string' && m.trim()) ? m : DEFAULT_ASSET_SALE_MESSAGE; }
function saveAssetSaleMessage(t) { saveCfg({ assetSaleMessage: String(t == null ? '' : t).slice(0, 2000) }); }
// Which build-ambience sound plays during a BOV build (id from rrg_ambience.js).
const DEFAULT_AMBIENCE_ID = 'factory';
function loadAmbienceId() { const m = loadCfg().ambienceId; return (typeof m === 'string' && m.trim()) ? m.slice(0, 32) : DEFAULT_AMBIENCE_ID; }
function saveAmbienceId(t) { saveCfg({ ambienceId: String(t == null ? '' : t).trim().slice(0, 32) || DEFAULT_AMBIENCE_ID }); }
// When a valuation questionnaire is advanced ("Request BOV"), drop a fresh
// "waiting BOV" into the queue — the same pattern as advancing a seller call.
// Each request creates a NEW valuation record, so a business can be valued more
// than once (re-runs, updated scenarios). Delete the ones you don't need.
function ensureBovForQuest(q) {
  if (!q) return null;
  const arr = loadBovs();
  // ONE valuation per questionnaire. If a valuation already exists for this VQ,
  // reuse it — the only way to get a fresh valuation is to delete the existing
  // one, which reverts the questionnaire to Waiting.
  const existing = arr.find(x => x.srcQuestId === q.id);
  if (existing) return existing;
  const rec = {
    id: newBovId(), srcFormId: 'bovfromq_' + q.id, srcQuestId: q.id, pending: true,
    business: q.business || 'Business', market: q.market || '', date: '',
    rangeText: '', targetText: '', multText: '', ebitdaText: '',
    by: q.by || '', byUser: q.byUser || '', createdAt: new Date().toISOString(),
  };
  arr.push(rec); saveBovs(arr);
  return rec;
}

// ---- Screening queue store (seller screenings awaiting a questionnaire) ----
const SCREEN_FILE = path.join(BOV_DATA_DIR, 'screenings.json');
function loadScreens() { try { return JSON.parse(fs.readFileSync(SCREEN_FILE, 'utf8')); } catch (e) { return []; } }
function saveScreens(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(SCREEN_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newScreenId() { return 'scr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---- Questionnaire queue store (valuation questionnaires awaiting a BOV) ----
const QUEST_FILE = path.join(BOV_DATA_DIR, 'questionnaires.json');
function loadQuests() { try { return JSON.parse(fs.readFileSync(QUEST_FILE, 'utf8')); } catch (e) { return []; } }
function saveQuests(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(QUEST_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }

// ---- Deleted-questionnaire tombstones ----
// When a rep deletes a questionnaire that was auto-created from an advanced
// seller call, we record its formId here so backfillQuests() does NOT recreate
// it on the next Q-Log load. Re-advancing the source call clears the tombstone.
const QUEST_TOMB_FILE = path.join(BOV_DATA_DIR, 'questionnaires_deleted.json');
function loadQuestTombs() { try { return JSON.parse(fs.readFileSync(QUEST_TOMB_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveQuestTombs(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(QUEST_TOMB_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function addQuestTomb(fid) { if (!fid) return; const a = loadQuestTombs(); if (a.indexOf(fid) < 0) { a.push(fid); saveQuestTombs(a); } }
function removeQuestTomb(fid) { if (!fid) return; const a = loadQuestTombs(); const b = a.filter(x => x !== fid); if (b.length !== a.length) saveQuestTombs(b); }
// Flatten a stored questionnaire into readable "Section / Label: value" text so it
// can be fed to the BOV analyst without the rep re-uploading it (mirrors the
// answers builder in the Valuation Questionnaire's Run-Analysis action).
function questToText(quest) {
  try {
    const d = (quest && quest.data) || {};
    const out = [];
    const head = [];
    if (d.concept) head.push('Business / concept: ' + d.concept);
    if (d.market) head.push('Market: ' + d.market);
    if (d.address) head.push('Address: ' + d.address);
    if (head.length) out.push(head.join('\n'));
    (d.sections || []).forEach(function (s) {
      if (/valuation factors/i.test(s.title || '')) return;
      const lines = [];
      (s.groups || []).forEach(function (g) {
        if (g.kind === 'field' && g.value) lines.push(g.label + ': ' + g.value);
        else if (g.kind === 'options' && g.selected && g.selected.length) lines.push(g.label + ': ' + g.selected.join(', '));
        else if (g.kind === 'subgroups') { (g.rows || []).forEach(function (rw) { if (rw.selected && rw.selected.length) lines.push(g.label + ' — ' + rw.label + ': ' + rw.selected.join(', ')); }); }
      });
      if (lines.length) out.push('## ' + (s.title || '') + '\n' + lines.join('\n'));
    });
    return out.join('\n\n');
  } catch (e) { return ''; }
}
function newQuestId() { return 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ownsQuest(req, s) {
  if (req.user && req.user.role === 'admin') return true;
  if (s.byUser) return s.byUser === (req.user && req.user.username);
  return s.by && s.by === (req.user && req.user.name);
}
function upsertQuest(req, data) {
  const arr = loadQuests();
  const fid = String((data && data.formId) || '').slice(0, 48);
  const fields = {
    business: String(data.concept || 'Business').slice(0, 120),
    market: String(data.market || '').slice(0, 80),
    completed: !!(data && data.complete),
    completePct: (data && data.completePct != null) ? Math.max(0, Math.min(100, Math.round(Number(data.completePct) || 0))) : (data && data.complete ? 100 : 0),
    data: data,
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
  };
  const mine = s => (s.byUser && s.byUser === fields.byUser) || (!s.byUser && s.by && s.by === fields.by);
  const existing = fid ? arr.find(s => s.formId === fid && mine(s)) : null;
  if (existing) { Object.assign(existing, fields); existing.updatedAt = new Date().toISOString(); saveQuests(arr); return existing; }
  const rec = Object.assign({ id: newQuestId(), formId: fid, processed: false, processedAt: '', decision: '', createdAt: new Date().toISOString() }, fields);
  arr.push(rec); saveQuests(arr);
  return rec;
}
// Ensure an advanced call has a matching questionnaire record (so it shows in the Questionnaire Log).
function ensureQuestForScreening(s) {
  if (!s) return null;
  const arr = loadQuests();
  const fid = 'qfromscr_' + s.id;
  const existing = arr.find(q => q.formId === fid);
  if (existing) return existing;
  const d = s.data || {};
  const rec = {
    id: newQuestId(), formId: fid, processed: false, processedAt: '', decision: '', completed: false,
    business: s.business || 'Business', market: s.market || '',
    data: { formId: fid, concept: s.business || '', market: s.market || '', address: d.address || '' },
    by: s.by || '', byUser: s.byUser || '', createdAt: new Date().toISOString(),
  };
  arr.push(rec); saveQuests(arr);
  return rec;
}
// Reconcile: every advanced call has a questionnaire record (efficient, idempotent).
function backfillQuests() {
  try {
    const quests = loadQuests();
    const have = new Set(quests.map(q => q.formId));
    const tombs = new Set(loadQuestTombs());
    let added = false;
    loadScreens().filter(x => x.processed).forEach(function (s) {
      const fid = 'qfromscr_' + s.id;
      if (have.has(fid) || tombs.has(fid)) return;
      const d = s.data || {};
      quests.push({
        id: newQuestId(), formId: fid, processed: false, processedAt: '', decision: '', completed: false,
        business: s.business || 'Business', market: s.market || '',
        data: { formId: fid, concept: s.business || '', market: s.market || '', address: d.address || '' },
        by: s.by || '', byUser: s.byUser || '', createdAt: new Date().toISOString(),
      });
      have.add(fid); added = true;
    });
    if (added) saveQuests(quests);
  } catch (e) { console.error('backfill error:', e); }
}
// Pull the selected "Lead Status" out of the screening's structured sections.
function leadStatusOf(data) {
  try {
    var secs = (data && data.sections) || [];
    for (var i = 0; i < secs.length; i++) {
      var gs = secs[i].groups || [];
      for (var j = 0; j < gs.length; j++) {
        if (gs[j].kind === 'options' && /lead status/i.test(gs[j].label || '')) {
          return (gs[j].selected && gs[j].selected[0]) || '';
        }
      }
    }
  } catch (e) {}
  return '';
}
function statusCode(txt) {
  txt = String(txt || '');
  if (/^advance/i.test(txt)) return 'advance';
  if (/^nurture/i.test(txt)) return 'nurture';
  if (/^pass/i.test(txt)) return 'pass';
  if (/^refer/i.test(txt)) return 'refer';
  return '';
}
function ownsScreen(req, s) {
  if (req.user && req.user.role === 'admin') return true;
  if (s.byUser) return s.byUser === (req.user && req.user.username);
  return s.by && s.by === (req.user && req.user.name);
}
// Create or update a screening-queue record. Dedups by formId within the same
// user, so printing and submitting the same screening make ONE record.
function upsertScreening(req, data) {
  const arr = loadScreens();
  const fid = String((data && data.formId) || '').slice(0, 48);
  const statusTxt = leadStatusOf(data);
  const fields = {
    business: String(data.concept || 'Seller').slice(0, 120),
    contact: String(data.contact || '').slice(0, 120),
    market: String(data.market || '').slice(0, 80),
    date: String(data.date || '').slice(0, 40),
    statusText: String(statusTxt || '').slice(0, 90),
    status: statusCode(statusTxt),
    completed: !!(data && data.complete),
    completePct: (data && data.completePct != null) ? Math.max(0, Math.min(100, Math.round(Number(data.completePct) || 0))) : (data && data.complete ? 100 : 0),
    data: data,
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
  };
  const mine = s => (s.byUser && s.byUser === fields.byUser) || (!s.byUser && s.by && s.by === fields.by);
  const existing = fid ? arr.find(s => s.formId === fid && mine(s)) : null;
  if (existing) {
    Object.assign(existing, fields);
    existing.updatedAt = new Date().toISOString();
    saveScreens(arr);
    return existing;
  }
  const rec = Object.assign({ id: newScreenId(), formId: fid, processed: false, processedAt: '', createdAt: new Date().toISOString() }, fields);
  arr.push(rec); saveScreens(arr);
  return rec;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Date + time in Central, e.g. "7/20/26, 1:12 PM" (falls back if ICU is limited).
function fmtWhen(ts) {
  const t = new Date(ts);
  if (isNaN(t.getTime())) return esc(ts);
  try {
    return t.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (e) { return t.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; }
}

// Tools that can be marked admin-only (name + file), for the admin toggle UI.
const TOOL_LIST = [
  { name: 'Site Selection Criteria', file: 'ssc_form.html' },
  { name: 'Seller Screening', file: 'seller_screening.html' },
  { name: 'Valuation Questionnaire', file: 'valuation_questionnaire.html' },
  { name: "Broker's Opinion of Value", file: 'rrg_bov_builder.html' },
  { name: 'BOV Queue', file: 'rrg_bov_queue.html' },
  { name: 'CIM Builder', file: 'rrg_cim_builder.html' },
  { name: 'Market Attack Plan (Sell)', file: 'rrg_seller_attack_plan.html' },
  { name: 'Market Attack Plan (Tenant)', file: 'rrg_tenant_attack_plan.html' },
  { name: 'Site & Concept Fit', file: 'rrg_site_fit.html' },
  { name: 'Tour Tracker', file: 'rrg_tour_tracker.html' },
  { name: 'Sale Commission', file: 'rrg_commission_calculator.html' },
  { name: 'Lease Commission', file: 'rrg_lease_commission_calculator.html' },
];

// Ensure an admin account exists on boot (from ADMIN_USER / ADMIN_PASS).
auth.seedAdmin();

// Seed a few sample calls into the Call Log the first time only (safe to Remove).
function seedSampleCalls() {
  const marker = path.join(BOV_DATA_DIR, '.calls_seeded');
  try { if (fs.existsSync(marker)) return; } catch (e) {}
  try {
    const admin = String(process.env.ADMIN_USER || 'van').toLowerCase();
    const arr = loadScreens();
    const t = Date.now();
    const mk = (o, i) => Object.assign({
      id: 'scr_seed' + i, formId: 'seed' + i, processed: false, processedAt: '', decision: '',
      by: 'Van Rinn', byUser: admin, createdAt: new Date(t - i * 36e5).toISOString(),
      data: { formId: 'seed' + i, concept: o.business, contact: o.contact, market: o.market, date: o.date,
        sections: [{ n: '6', title: 'Call Outcome & Notes', groups: [{ kind: 'options', label: 'Lead Status', selected: [o.statusText] }] }] },
    }, o);
    const samples = [
      { business: 'Barrio Cantina', contact: 'Miguel Reyes', market: 'San Antonio', date: '07/18/2026', statusText: 'Advance (Strong Lead, Financials Requested)', status: 'advance' },
      { business: 'The Copper Still', contact: 'Dana Whitfield', market: 'Austin', date: '07/17/2026', statusText: 'Nurture (Interested, Not Ready)', status: 'nurture' },
      { business: 'Lakeside Grill & Patio', contact: 'Tom Fenn', market: 'Dallas', date: '07/16/2026', statusText: 'Pass (Not a Fit)', status: 'pass' },
    ];
    samples.forEach((s, i) => arr.push(mk(s, i + 1)));
    saveScreens(arr);
    if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
    console.log('[calls] Seeded 3 sample calls.');
  } catch (e) { console.error('sample-call seed error:', e); }
}
seedSampleCalls();
backfillQuests();  // reconcile any already-advanced calls into the Questionnaire Log

/* ---------- cookies ---------- */
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=${auth.SESSION_IDLE_MIN * 60}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0`);
}

app.use(cors({ origin: process.env.ALLOW_ORIGIN || '*' }));
// The document-upload endpoints declare their own larger JSON limits below.
// Exempt them here so this 1 MB global cap doesn't 413 real uploads first.
app.use((req, res, next) => {
  if (req.path === '/api/generate-bov' || req.path === '/api/generate-cim' || req.path === '/api/valuation-factors') return next();
  express.json({ limit: '1mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

/* ---------- auth gate ---------- */
const OPEN = new Set(['/health', '/login', '/api/login', '/logout']);
app.use((req, res, next) => {
  if (OPEN.has(req.path)) return next();
  const sess = auth.readSession(parseCookies(req)[COOKIE]);
  if (sess) {
    req.user = sess;
    // Slide the idle timeout forward: any activity re-issues a fresh session
    // cookie, so an active user stays signed in and an idle one is logged out.
    try { setSessionCookie(res, auth.makeSession(sess)); } catch (e) {}
    return next();
  }
  // Not authenticated
  if (req.path.startsWith('/api/') || /\.(csv|json)$/.test(req.path)) {
    return res.status(401).json({ ok: false, error: 'Not signed in.' });
  }
  return res.redirect('/login');
});
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ ok: false, error: 'Admin only.' });
  return res.status(403).send('Admin access only.');
}

app.get('/health', (_req, res) => res.json({ ok: true }));

/* ---------- login / logout ---------- */
app.get('/login', (req, res) => {
  const sess = auth.readSession(parseCookies(req)[COOKIE]);
  if (sess) return res.redirect('/');
  res.set('Content-Type', 'text/html; charset=utf-8').send(loginPage(req.query.e ? 'Signed out.' : ''));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const meta = { username, ip: req.headers['x-forwarded-for'] || req.ip, userAgent: req.headers['user-agent'] };
  const user = auth.authenticate(username, password);
  if (!user) {
    auth.logLogin({ ...meta, result: 'fail' });
    return res.status(401).json({ ok: false, error: 'Wrong username or password.' });
  }
  auth.logLogin({ ...meta, username: user.username, result: 'success' });
  setSessionCookie(res, auth.makeSession(user));
  res.json({ ok: true, role: user.role, name: user.name });
});

app.get('/logout', (_req, res) => { clearSessionCookie(res); res.redirect('/login?e=1'); });

// Who am I + which tools are admin-only (dashboard uses this to hide restricted tiles).
app.get('/api/session', (req, res) => res.json({
  ok: true, username: req.user.username, name: req.user.name, role: req.user.role,
  title: req.user.title || '', phone: req.user.phone || '', email: req.user.email || '',
  preparedBy: req.user.preparedBy || '',
  adminOnlyTools: auth.loadToolAccess(),
  build: BUILD,
}));

// Active user names — populates the "RRG Rep" dropdown on the call form (any signed-in user).
app.get('/api/users-list', (req, res) => {
  const users = auth.loadUsers().filter(u => !u.disabled)
    .map(u => ({ username: u.username, name: u.name }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  res.json({ ok: true, users });
});

// ---- Self-service account: view/edit own contact info + change own password ----
app.get('/api/me', (req, res) => res.json({ ok: true, profile: auth.profileOf(auth.findUser(req.user.username)) }));

app.post('/api/me/profile', express.json(), (req, res) => {
  try {
    const b = req.body || {};
    const p = auth.updateProfile(req.user.username, { name: b.name, title: b.title, phone: b.phone, email: b.email });
    res.json({ ok: true, profile: p });
  } catch (e) { res.status(400).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.post('/api/me/password', express.json(), (req, res) => {
  try {
    const b = req.body || {};
    auth.changePassword(req.user.username, b.current, b.next);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: String((e && e.message) || e) }); }
});

// Block admin-only tool files for non-admins (even by direct URL).
app.use((req, res, next) => {
  if (req.method === 'GET' && /\.html$/.test(req.path) && !(req.user && req.user.role === 'admin')) {
    const file = req.path.replace(/^\//, '');
    if (auth.loadToolAccess().indexOf(file) >= 0) return res.redirect('/');
  }
  next();
});

// Log which tool a signed-in rep opens (dashboard + any *.html tool page).
app.use((req, res, next) => {
  try {
    if (req.method === 'GET' && req.user && (req.path === '/' || /\.html$/.test(req.path))) {
      auth.logUsage({ username: req.user.username, path: req.path, ip: req.headers['x-forwarded-for'] || req.ip });
    }
  } catch (e) {}
  next();
});

app.use(express.static('public')); // toolkit — gated by the middleware above

/* ---------- email + submission log (unchanged, now gated) ---------- */
function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
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
  } catch (e) { err = e; }
  try { store.appendSubmission('ssc', data, { ip: req.ip, emailed, by: req.user && req.user.username }); }
  catch (le) { console.error('log error:', le); }
  if (err) { console.error('send-ssc error:', err); return res.status(500).json({ ok: false, error: String((err && err.message) || err) }); }
  res.json({ ok: true, messageId: out.info.messageId, filename: out.filename, bytes: out.size });
});
app.post('/api/log', (req, res) => {
  const data = req.body || {};
  const formType = String(data.formType || 'seller').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20) || 'seller';
  try { const e = store.appendSubmission(formType, data, { ip: req.ip, emailed: false, by: req.user && req.user.username }); res.json({ ok: true, timestamp: e.timestamp }); }
  catch (err) { console.error('log error:', err); res.status(500).json({ ok: false, error: String((err && err.message) || err) }); }
  // Every submitted seller screening also drops into the Screening Queue (dedup by formId).
  if (formType === 'seller') {
    try { upsertScreening(req, data); } catch (e2) { console.error('screening enqueue error:', e2); }
  }
  // Every submitted valuation questionnaire drops into the Questionnaire Queue.
  if (formType === 'valuation') {
    try { upsertQuest(req, data); } catch (e3) { console.error('questionnaire enqueue error:', e3); }
  }
});

// Print / Save PDF also files the record to the queue (no email, no submission log).
app.post('/api/screening-save', express.json({ limit: '2mb' }), (req, res) => {
  try { const s = upsertScreening(req, req.body || {}); res.json({ ok: true, id: s.id }); }
  catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});
app.post('/api/questionnaire-save', express.json({ limit: '2mb' }), (req, res) => {
  try { const s = upsertQuest(req, req.body || {}); res.json({ ok: true, id: s.id }); }
  catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ---- Screening queue ----
app.get('/api/screenings', (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadScreens().slice().reverse().filter(s => isAdmin || ownsScreen(req, s));
  res.json({
    ok: true, isAdmin: !!isAdmin,
    screenings: list.map(s => ({ id: s.id, business: s.business, contact: s.contact, market: s.market, date: s.date, statusText: s.statusText, status: s.status, decision: s.decision || '', completed: !!s.completed, completePct: (typeof s.completePct === 'number' ? s.completePct : (s.completed ? 100 : 0)), processed: !!s.processed, processedAt: s.processedAt, by: s.by, byUser: s.byUser, createdAt: s.createdAt })),
  });
});
app.get('/api/screening/:id', (req, res) => {
  const s = loadScreens().find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsScreen(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, screening: s });
});
app.post('/api/screening/:id/advance', (req, res) => {
  const arr = loadScreens();
  const s = arr.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsScreen(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  // A screening must have its required fields complete before it can advance to a questionnaire.
  // (Re-advancing an already-processed call — "Reopen" — is always allowed.)
  if (!s.processed && !s.completed) return res.status(409).json({ ok: false, incomplete: true, error: 'Complete the required fields on the screening before advancing it.' });
  s.processed = true; s.processedAt = new Date().toISOString();
  saveScreens(arr);
  removeQuestTomb('qfromscr_' + s.id);  // explicit re-advance undoes a prior delete
  let qid = '';
  try { const q = ensureQuestForScreening(s); qid = (q && q.id) || ''; } catch (e) {}
  res.json({ ok: true, questionnaireId: qid });
});
// Pass on a lead (decline to move it forward) — or reconsider it.
app.post('/api/screening/:id/decision', express.json(), (req, res) => {
  const arr = loadScreens();
  const s = arr.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsScreen(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const dec = String((req.body || {}).decision || '');
  s.decision = dec === 'passed' ? 'passed' : '';
  s.decisionAt = new Date().toISOString();
  saveScreens(arr);
  res.json({ ok: true });
});
app.delete('/api/screening/:id', (req, res) => {
  const arr = loadScreens();
  const s = arr.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsScreen(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  saveScreens(arr.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Questionnaire queue routes (mirror of the screening queue) ----
app.get('/api/questionnaires', (req, res) => {
  backfillQuests();  // self-heal: any advanced call missing a questionnaire gets one now
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadQuests().slice().reverse().filter(s => isAdmin || ownsQuest(req, s));
  res.json({
    ok: true, isAdmin: !!isAdmin,
    questionnaires: list.map(s => ({ id: s.id, business: s.business, market: s.market, decision: s.decision || '', completed: !!s.completed, completePct: (typeof s.completePct === 'number' ? s.completePct : (s.completed ? 100 : 0)), processed: !!s.processed, processedAt: s.processedAt, by: s.by, byUser: s.byUser, createdAt: s.createdAt })),
  });
});
app.get('/api/questionnaire/:id', (req, res) => {
  const s = loadQuests().find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsQuest(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, questionnaire: s });
});
app.post('/api/questionnaire/:id/advance', (req, res) => {
  const arr = loadQuests();
  const s = arr.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsQuest(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  // An incomplete questionnaire cannot be advanced to a BOV — the analyst must
  // have the full picture. (Re-advancing an already-processed questionnaire is fine.)
  if (!s.processed && !s.completed) return res.status(409).json({ ok: false, incomplete: true, error: 'Complete the required fields on the questionnaire before requesting a BOV.' });
  s.processed = true; s.processedAt = new Date().toISOString();
  saveQuests(arr);
  // One valuation per questionnaire — ensureBovForQuest reuses the existing
  // record if one is already there, so this never creates a duplicate.
  let bovId = '';
  try { const b = ensureBovForQuest(s); bovId = (b && b.id) || ''; } catch (e) {}
  res.json({ ok: true, bovId });
});
app.post('/api/questionnaire/:id/decision', express.json(), (req, res) => {
  const arr = loadQuests();
  const s = arr.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsQuest(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const dec = String((req.body || {}).decision || '');
  s.decision = dec === 'passed' ? 'passed' : ''; s.decisionAt = new Date().toISOString();
  saveQuests(arr);
  res.json({ ok: true });
});
app.delete('/api/questionnaire/:id', (req, res) => {
  const arr = loadQuests();
  const s = arr.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsQuest(req, s)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  addQuestTomb(s.formId);  // so backfillQuests won't resurrect it on the next load
  saveQuests(arr.filter(x => x.id !== req.params.id));
  // If this questionnaire came from a seller call, revert that call to Waiting —
  // otherwise the Call Log keeps showing "Advanced" for a questionnaire that no
  // longer exists. Reverting lets the rep re-advance the call cleanly.
  try {
    const m = String(s.formId || '').match(/^qfromscr_(.+)$/);
    if (m) {
      const screens = loadScreens();
      const sc = screens.find(x => x.id === m[1]);
      if (sc && sc.processed) { sc.processed = false; sc.processedAt = ''; saveScreens(screens); }
    }
  } catch (e) {}
  res.json({ ok: true });
});
app.get('/log.csv', (_req, res) => {
  const fs = require('fs');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rrg-submissions.csv"');
  if (fs.existsSync(store.CSV)) return fs.createReadStream(store.CSV).pipe(res);
  res.send(store.CSV_COLS.join(',') + '\n');
});
// ---- BOV queue ----
// A rep can only see/open/delete their own BOVs; an admin sees the whole team.
// Money for the Business Valuations list — never "$0.45M"; use "$450K" under $1M.
function moneyShort(n) {
  n = Number(n) || 0; const a = Math.abs(n);
  if (a >= 1e6) { const m = n / 1e6; return '$' + (a >= 1e7 ? m.toFixed(1) : m.toFixed(2)) + 'M'; }
  if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}
// Trailing revenue ("the money the business brought in") lives in bridge row 0
// of the generated BOV.
function bovRevenueText(b) {
  try {
    const br = b.state && b.state.bridge;
    let n = 0;
    if (br && !Array.isArray(br) && br.revenue != null) {          // new keyed bridge
      n = Number(String(br.revenue).replace(/[^0-9.\-]/g, '')) || 0;
    } else if (Array.isArray(br) && br[0] && /revenue/i.test(br[0].label || '')) {  // legacy array
      n = Number(String(br[0].amt).replace(/[^0-9.\-]/g, '')) || 0;
    }
    if (n > 0) return moneyShort(n);
  } catch (e) {}
  return '';
}
// Sort a BOV's buyer-type list by likely multiple (highest first), keeping a
// header row (if any) on top. Applied to every saved BOV so it's consistent.
function bovMultVal(s) { const m = String(s == null ? '' : s).match(/-?\d+(?:\.\d+)?/g); return (m && m.length) ? Math.max.apply(null, m.map(Number)) : -1; }
function sortBovBuyers(state) {
  try {
    const rows = state && state.buyers;
    if (!Array.isArray(rows) || rows.length < 2) return state;
    const hasHead = bovMultVal(rows[0] && rows[0][1]) < 0 && /multiple/i.test(String((rows[0] || [])[1] || ''));
    const head = hasHead ? rows.slice(0, 1) : [];
    const body = hasHead ? rows.slice(1) : rows.slice();
    body.sort((a, b) => bovMultVal(b && b[1]) - bovMultVal(a && a[1]));
    state.buyers = head.concat(body);
  } catch (e) {}
  return state;
}
function ownsBov(req, b) {
  if (req.user && req.user.role === 'admin') return true;
  if (b.byUser) return b.byUser === (req.user && req.user.username);
  return b.by && b.by === (req.user && req.user.name);
}
function ownsCim(req, c) {
  if (req.user && req.user.role === 'admin') return true;
  if (c.byUser) return c.byUser === (req.user && req.user.username);
  return c.by && c.by === (req.user && req.user.name);
}
// One CIM per BOV. Reuse the existing one if present, else create a pending record.
function ensureCimForBov(req, bov) {
  if (!bov) return null;
  const arr = loadCims();
  const existing = arr.find(x => x.srcBovId === bov.id);
  if (existing) return existing;
  const rec = {
    id: newCimId(), srcBovId: bov.id, srcQuestId: bov.srcQuestId || '', pending: true,
    business: bov.business || 'Business', market: bov.market || '',
    by: (req.user && req.user.name) || bov.by || '', byUser: (req.user && req.user.username) || bov.byUser || '',
    createdAt: new Date().toISOString(),
  };
  arr.push(rec); saveCims(arr);
  return rec;
}
// Gather everything the system already knows for a CIM: the BOV, the questionnaire,
// and the qualification call that produced it.
function cimInputsFor(cim) {
  const bov = loadCims && loadBovs().find(x => x.id === cim.srcBovId);
  let questionnaire = '', call = '';
  if (bov && bov.srcQuestId) {
    const q = loadQuests().find(x => x.id === bov.srcQuestId);
    if (q) {
      questionnaire = questToText(q);
      const m = String(q.formId || '').match(/^qfromscr_(.+)$/);
      if (m) { const sc = loadScreens().find(x => x.id === m[1]); if (sc) call = questToText(sc); }
    }
  }
  const summary = bov ? { business: bov.business, revText: bov.revText || bovRevenueText(bov), rangeText: bov.rangeText, targetText: bov.targetText, multText: bov.multText, basis: bov.basis, sdeText: bov.sdeText, adjText: bov.adjText, date: bov.date } : null;
  return { bov, bovState: (bov && bov.state) || null, summary, questionnaire, call };
}
app.get('/api/bovs', (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadBovs().slice().reverse().filter(b => isAdmin || ownsBov(req, b));
  res.json({
    ok: true, isAdmin: !!isAdmin,
    bovs: list.map(b => ({ id: b.id, business: b.business, date: b.date, revText: bovRevenueText(b), rangeText: b.rangeText, targetText: b.targetText, multText: b.multText, ebitdaText: b.ebitdaText, sdeText: b.sdeText || '', adjText: b.adjText || '', basis: b.basis || '', pending: !!b.pending, srcQuestId: b.srcQuestId || '', by: b.by, byUser: b.byUser, createdAt: b.createdAt, builtAt: b.builtAt || '' })),
  });
});
app.get('/api/bov/:id', (req, res) => {
  const b = loadBovs().find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsBov(req, b)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, bov: b });
});
// AI-generate a BOV from uploaded documents, then save it to the queue.
app.post('/api/generate-bov', express.json({ limit: '48mb' }), async (req, res) => {
  try {
    const { business, files, bovId, links, preparedFor } = req.body || {};
    if (!files || !files.length) return res.status(400).json({ ok: false, error: 'Attach at least one financial document.' });
    const preparedBy = (req.user && req.user.preparedBy) || '';

    // Fulfilling an existing (Requested) valuation record? Pull its questionnaire
    // from the system so the rep never re-uploads the VQ, and update that record
    // in place rather than creating a duplicate.
    let target = null, questionnaireText = '';
    if (bovId) {
      const existing = loadBovs().find(x => x.id === bovId);
      if (existing) {
        if (!ownsBov(req, existing)) return res.status(403).json({ ok: false, error: 'Not yours.' });
        target = existing;
        if (existing.srcQuestId) {
          const q = loadQuests().find(x => x.id === existing.srcQuestId);
          if (q) questionnaireText = questToText(q);
        }
      }
    }

    // Build ONCE. A valuation that has already been built is frozen — its earnings
    // bridge is the source of truth and must not be silently regenerated into
    // different numbers. To rebuild, the rep deletes it in Business Valuations
    // (which reverts the questionnaire to Waiting) and requests a fresh one.
    if (target && target.aiGenerated && !target.pending) {
      return res.status(409).json({ ok: false, error: 'This valuation is already built. Its earnings bridge is locked. To rebuild from the financials, delete it in Business Valuations first — that reverts the questionnaire to Waiting so you can request a fresh valuation.' });
    }

    const out = await bovgen.generateBov({ business, files, preparedBy, questionnaire: questionnaireText, links, systemPrompt: loadBovPromptCustom() || undefined, sdeThreshold: loadSdeThreshold(), assetSaleFloor: loadAssetSaleFloor() });
    // Rep-entered "Prepared For" overrides whatever the analyst inferred.
    if (preparedFor && String(preparedFor).trim()) { out.state = out.state || {}; out.state.fields = out.state.fields || {}; out.state.fields.preparedFor = String(preparedFor).slice(0, 200); }
    const bovs = loadBovs();
    const rec = (target && bovs.find(x => x.id === target.id)) || {
      id: newBovId(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '', createdAt: new Date().toISOString(),
    };
    rec.business = String(out.business || rec.business || 'Untitled').slice(0, 120);
    rec.date = String(out.date || '').slice(0, 40);
    rec.rangeText = out.summary.rangeText; rec.targetText = out.summary.targetText;
    rec.multText = out.summary.multText; rec.ebitdaText = out.summary.ebitdaText;
    rec.basis = out.summary.basis; rec.sdeText = out.summary.sdeText; rec.adjText = out.summary.adjText;
    rec.state = out.state; rec.aiGenerated = true; rec.pending = false; rec.builtAt = new Date().toISOString();
    // No TTM statement (analyst fell back to the fiscal year) AND we're past Q1 →
    // flag the record so the builder can warn the rep the base may be stale.
    rec.periodBasis = (out.state && out.state.periodBasis === 'fiscal') ? 'fiscal' : 't12';
    rec.noTtmNotice = (rec.periodBasis === 'fiscal' && new Date().getMonth() >= 3);
    // No going-concern value → asset sale (analyst flag OR computed SDE ≤ floor).
    const _floor = loadAssetSaleFloor();
    rec.assetSale = (out.state && out.state.assetSale === true) || (out.summary && Number(out.summary.sde) <= _floor);
    if (!target) bovs.push(rec);
    saveBovs(bovs);
    res.json({ ok: true, id: rec.id, summary: out.summary, noTtmNotice: rec.noTtmNotice });
  } catch (e) {
    console.error('generate-bov error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ---- CIM routes (mirror the BOV routes) ----
app.get('/api/cims', (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadCims().slice().reverse().filter(c => isAdmin || ownsCim(req, c));
  res.json({ ok: true, isAdmin: !!isAdmin, cims: list.map(c => ({
    id: c.id, business: c.business, market: c.market, pending: !!c.pending, srcBovId: c.srcBovId || '',
    by: c.by, byUser: c.byUser, createdAt: c.createdAt, builtAt: c.builtAt || '',
  })) });
});
app.get('/api/cim/:id', (req, res) => {
  const c = loadCims().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsCim(req, c)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, cim: c });
});
app.delete('/api/cim/:id', (req, res) => {
  const arr = loadCims();
  const target = arr.find(x => x.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsCim(req, target)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  saveCims(arr.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});
// Save in-builder edits back onto the CIM record.
app.post('/api/cim-save', (req, res) => {
  const b = req.body || {};
  const cims = loadCims();
  const cim = cims.find(x => x.id === b.id);
  if (!cim) return res.status(404).json({ ok: false, error: 'CIM not found.' });
  if (!ownsCim(req, cim)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  if (b.state && typeof b.state === 'object') {
    const prev = cim.state || {};
    // The client sends edited text only — preserve the heavy photo/logo/bov data.
    cim.state = Object.assign({}, b.state, { photos: prev.photos, logo: prev.logo, bov: prev.bov });
    cim.updatedAt = new Date().toISOString(); saveCims(cims);
  }
  res.json({ ok: true });
});
// "Advance to CIM" from the BOV log — ensure a CIM exists for this BOV, return its id.
app.post('/api/bov/:id/advance-cim', (req, res) => {
  const bov = loadBovs().find(x => x.id === req.params.id);
  if (!bov) return res.status(404).json({ ok: false, error: 'Valuation not found.' });
  if (!ownsBov(req, bov)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  if (bov.pending) return res.status(409).json({ ok: false, error: 'Build the valuation before advancing it to a Marketing Pack.' });
  let cimId = '';
  try { const c = ensureCimForBov(req, bov); cimId = (c && c.id) || ''; } catch (e) {}
  res.json({ ok: true, cimId });
});
// Generate the CIM: reuse the stored BOV numbers, the questionnaire, and the call;
// the rep only supplies photos + logo.
app.post('/api/generate-cim', express.json({ limit: '48mb' }), async (req, res) => {
  try {
    const b = req.body || {};
    const cims = loadCims();
    const cim = cims.find(x => x.id === b.cimId);
    if (!cim) return res.status(404).json({ ok: false, error: 'CIM not found.' });
    if (!ownsCim(req, cim)) return res.status(403).json({ ok: false, error: 'Not yours.' });
    if (cim.aiGenerated && !cim.pending) return res.status(409).json({ ok: false, error: 'This CIM is already built. Delete it in the CIM log to rebuild.' });
    const inp = cimInputsFor(cim);
    const photos = Array.isArray(b.photos) ? b.photos.slice(0, 24) : [];
    const captions = photos.map(p => p && p.caption).filter(Boolean);
    const out = await cimgen.generateCim({
      business: cim.business, bovSummary: inp.summary, bovState: inp.bovState,
      questionnaire: inp.questionnaire, call: inp.call, links: b.links || [],
      photoCaptions: captions, systemPrompt: loadCimPromptCustom() || undefined,
    });
    out.state = out.state || {};
    out.state.photos = photos;                 // {dataB64,type,caption} — rendered by the builder
    out.state.logo = (b.logo && b.logo.dataB64) ? b.logo : null;
    out.state.bov = { summary: inp.summary, bridge: (inp.bovState && inp.bovState.bridge) || null };  // figures for the financial tables
    cim.business = String(out.business || cim.business || 'Untitled').slice(0, 120);
    cim.state = out.state; cim.aiGenerated = true; cim.pending = false; cim.builtAt = new Date().toISOString();
    saveCims(cims);
    res.json({ ok: true, id: cim.id });
  } catch (e) {
    console.error('generate-cim error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// AI-complete the Valuation Factors section from the questionnaire answers (text only).
app.post('/api/valuation-factors', express.json({ limit: '4mb' }), async (req, res) => {
  try {
    const { business, market, answers, driverOptions, detractorOptions } = req.body || {};
    if (!answers || String(answers).trim().length < 30) return res.status(400).json({ ok: false, error: 'Not enough questionnaire content to analyze.' });
    const out = await valgen.generateFactors({ business, market, answers, driverOptions, detractorOptions });
    res.json({ ok: true, result: out.result });
  } catch (e) {
    console.error('valuation-factors error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.post('/api/bov', (req, res) => {
  const b = req.body || {};
  const biz = String(b.business || '').trim();
  if (!biz) return res.status(400).json({ ok: false, error: 'Business name required.' });
  const bovs = loadBovs();
  const fields = {
    business: biz.slice(0, 120), date: String(b.date || '').slice(0, 40),
    rangeText: String(b.rangeText || '').slice(0, 60), targetText: String(b.targetText || '').slice(0, 60),
    multText: String(b.multText || '').slice(0, 40), ebitdaText: String(b.ebitdaText || '').slice(0, 40),
    basis: String(b.basis || '').slice(0, 24), sdeText: String(b.sdeText || '').slice(0, 40), adjText: String(b.adjText || '').slice(0, 40),
    state: (b.state && typeof b.state === 'object') ? sortBovBuyers(b.state) : null,
  };
  // Update an existing (owned) record in place when an id is supplied — editing a
  // valuation should not spawn a duplicate. Otherwise create a fresh record.
  if (b.id) {
    const existing = bovs.find(x => x.id === b.id);
    if (existing) {
      if (!ownsBov(req, existing)) return res.status(403).json({ ok: false, error: 'Not yours.' });
      Object.assign(existing, fields, { pending: false, updatedAt: new Date().toISOString() });
      saveBovs(bovs);
      return res.json({ ok: true, id: existing.id });
    }
  }
  const rec = Object.assign({ id: newBovId() }, fields, {
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
    createdAt: new Date().toISOString(),
  });
  bovs.push(rec); saveBovs(bovs);
  res.json({ ok: true, id: rec.id });
});
app.delete('/api/bov/:id', (req, res) => {
  const bovs = loadBovs();
  const target = bovs.find(x => x.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsBov(req, target)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const remaining = bovs.filter(x => x.id !== req.params.id);
  saveBovs(remaining);
  // If this was the last valuation tied to a questionnaire, revert that
  // questionnaire's status to Waiting (un-processed) in the Questionnaire Log.
  if (target.srcQuestId && !remaining.some(b => b.srcQuestId === target.srcQuestId)) {
    try {
      const quests = loadQuests();
      const q = quests.find(x => x.id === target.srcQuestId);
      if (q && q.processed) { q.processed = false; q.processedAt = ''; saveQuests(quests); }
    } catch (e) {}
  }
  res.json({ ok: true });
});

// Quick links — company default links + this user's own personal links.
app.get('/api/links', (req, res) => {
  const defaults = auth.loadLinks().filter(l => l.default).map(l => ({ name: l.name, url: l.url }));
  const u = req.user && auth.findUser(req.user.username);
  const personal = auth.userLinksOf(u).map(l => ({ name: l.name, url: l.url }));
  res.json({ ok: true, links: defaults.concat(personal) });
});
// A user's own quick links (managed on the Account page).
app.get('/api/me/links', (req, res) => {
  const u = req.user && auth.findUser(req.user.username);
  res.json({ ok: true, links: auth.userLinksOf(u) });
});
app.post('/api/me/links', express.json({ limit: '256kb' }), (req, res) => {
  try { const saved = auth.setUserLinks(req.user.username, (req.body || {}).links || []); res.json({ ok: true, links: saved }); }
  catch (e) { res.status(400).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.get('/api/agreements', (_req, res) => {
  const fs = require('fs'); const path = require('path');
  const dir = path.join(__dirname, 'public', 'agreements');
  try {
    if (!fs.existsSync(dir)) return res.json({ ok: true, agreements: [] });
    const pretty = f => f.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const agreements = fs.readdirSync(dir).filter(f => /\.(pdf|docx?|png|jpe?g)$/i.test(f))
      .map(f => ({ name: pretty(f), file: 'agreements/' + f, type: (f.split('.').pop() || '').toUpperCase(), updated: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ok: true, agreements });
  } catch (e) { console.error('agreements list error:', e); res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

/* ---------- submission log view (now shows who submitted) ---------- */
app.get('/log', (_req, res) => {
  const rows = store.readAll().slice().reverse();
  const nSsc = rows.filter(r => r.form === 'ssc').length, nSeller = rows.filter(r => r.form === 'seller').length;
  const body = rows.map(r => {
    const when = fmtWhen(r.timestamp);
    const badge = r.form === 'seller' ? '<span class="tag seller">Seller</span>' : '<span class="tag ssc">SSC</span>';
    return `<tr><td class="ts">${when}</td><td>${badge}</td><td class="nm">${esc(r.name) || '—'}</td><td>${esc(r.market) || '—'}</td><td>${esc(r.rep) || '—'}</td><td class="hl">${esc(r.highlights) || '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No submissions logged yet.</td></tr>';
  res.set('Content-Type', 'text/html; charset=utf-8').send(shell('Submission Log', `
    <div class="bar"><span class="stat"><b>${rows.length}</b> total</span><span class="stat"><b>${nSsc}</b> SSC</span><span class="stat"><b>${nSeller}</b> Seller</span>
      <span class="dl"><a href="/admin">Admin</a> <a href="/log.csv">Download CSV</a></span></div>
    <div class="wrap"><table><thead><tr><th>When (CT)</th><th>Form</th><th>Name</th><th>Market</th><th>Rep</th><th>Highlights</th></tr></thead><tbody>${body}</tbody></table></div>`));
});

/* ================= ADMIN CONSOLE ================= */
app.get('/admin', requireAdmin, (req, res) => {
  const users = auth.loadUsers();
  const logins = auth.readLogins().slice(-300).reverse();
  const usageAll = auth.readUsage();
  const links = auth.loadLinks();
  const lastLogin = auth.lastLoginMap();
  const adminOnlyTools = auth.loadToolAccess();
  const toolAccessRows = TOOL_LIST.map(t =>
    `<label class="tacc"><input type="checkbox" class="ta" value="${esc(t.file)}"${adminOnlyTools.indexOf(t.file) >= 0 ? ' checked' : ''}> ${esc(t.name)}</label>`
  ).join('');
  const linkRows = Array.from({ length: 20 }, (_, i) => {
    const l = links[i] || { name: '', url: '', default: false };
    return `<div class="lrow"><input class="ln" placeholder="Name (e.g. CoStar)" value="${esc(l.name)}"><input class="lu" placeholder="https://…" value="${esc(l.url)}"><label class="lchk"><input type="checkbox" class="la"${l.default ? ' checked' : ''}> Default for all</label></div>`;
  }).join('');
  // summaries
  const byTool = {}, byUser = {};
  usageAll.forEach(u => { byTool[u.tool] = (byTool[u.tool] || 0) + 1; byUser[u.username] = (byUser[u.username] || 0) + 1; });
  const toolSummary = Object.entries(byTool).sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<tr><td class="nm">${esc(t)}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No tool opens yet.</td></tr>';
  const userSummary = Object.entries(byUser).sort((a, b) => b[1] - a[1])
    .map(([u, n]) => `<tr><td class="mono">${esc(u)}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">—</td></tr>';
  const usageRecent = usageAll.slice(-200).reverse().map(u =>
    `<tr><td class="ts">${fmtWhen(u.timestamp)}</td><td class="mono">${esc(u.username)}</td><td class="nm">${esc(u.tool)}</td><td class="mono">${esc(u.ip)}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty">No tool activity yet.</td></tr>';
  const urows = users.map(u => `<tr>
      <td class="nm">${esc(u.name)} ${u.role === 'admin' ? '<span class="tag admin">Admin</span>' : ''} ${u.disabled ? '<span class="tag off">Disabled</span>' : ''}</td>
      <td class="mono">${esc(u.username)}</td>
      <td class="mono">${esc(u.email) || '—'}</td>
      <td class="ts">${esc((u.createdAt || '').slice(0, 10))}</td>
      <td class="ts">${lastLogin[u.username] ? fmtWhen(lastLogin[u.username]) : '<span class="sub2">Never</span>'}</td>
      <td class="act">
        <form method="post" action="/api/admin/reset" onsubmit="return rp(this)"><input type="hidden" name="username" value="${esc(u.username)}"><button>Reset password</button></form>
        <form method="post" action="/api/admin/toggle"><input type="hidden" name="username" value="${esc(u.username)}"><input type="hidden" name="disabled" value="${u.disabled ? '0' : '1'}"><button>${u.disabled ? 'Enable' : 'Disable'}</button></form>
        <form method="post" action="/api/admin/remove" onsubmit="return confirm('Remove ${esc(u.username)}?')"><input type="hidden" name="username" value="${esc(u.username)}"><button class="danger">Remove</button></form>
      </td></tr>`).join('') || '<tr><td colspan="6" class="empty">No users yet.</td></tr>';
  const lrows = logins.map(l =>
    `<tr><td class="ts">${fmtWhen(l.timestamp)}</td><td class="mono">${esc(l.username) || '—'}</td><td>${l.result === 'success' ? '<span class="tag ok">Success</span>' : '<span class="tag off">Failed</span>'}</td><td class="mono">${esc(l.ip)}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty">No logins recorded yet.</td></tr>';
  res.set('Content-Type', 'text/html; charset=utf-8').send(shell('Admin Console', `
    <div class="bar"><span class="stat"><b>${users.length}</b> users</span><span class="stat"><b>${logins.filter(l=>l.result==='success').length}</b> logins shown</span><span class="stat"><b>${usageAll.length}</b> tool opens</span>
      <span class="dl"><a href="/index.html" style="background:#DA2B1F;color:#fff;padding:6px 13px;border-radius:8px;font-weight:800;text-decoration:none">Switch to user view →</a> <a href="/log">Submissions</a> <a href="/admin/logins.csv">Login CSV</a> <a href="/admin/usage.csv">Usage CSV</a> <a href="/logout">Sign out</a></span></div>
    <style>
      .wrap h2.acch{cursor:pointer;user-select:none;display:flex;align-items:center;gap:9px;border-top:1px solid #e6e9f0;padding-top:20px;margin-top:26px;}
      .wrap h2.acch:first-of-type{border-top:none;padding-top:0;}
      .wrap h2.acch .chev{display:inline-flex;color:#DA2B1F;font-weight:900;font-size:16px;transition:transform .18s;transform:rotate(90deg);width:14px;}
      .wrap h2.acch.collapsed .chev{transform:rotate(0deg);}
      .wrap h2.acch .cc{margin-left:auto;font-size:11px;font-weight:600;color:#8a93a8;letter-spacing:0;text-transform:none;}
      .accbody{padding-top:4px;}
      .expandbar{display:flex;gap:14px;padding:10px 28px 0;}
      .expandbar a{font-size:12px;font-weight:700;color:#2647b0;cursor:pointer;text-decoration:none;}
      .bovprompt{width:100%;min-height:340px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;padding:14px 15px;border:1px solid #cfd6e2;border-radius:10px;color:#1a2236;resize:vertical;background:#fff;}
      .bovprompt:focus{outline:none;border-color:#DA2B1F;}
      .btn.ghost{background:#eef1f7;color:#000E31;border:1px solid #e6e9f0;}
    </style>
    <div class="expandbar"><a onclick="accAll(true)">Expand all</a><a onclick="accAll(false)">Collapse all</a></div>
    <div class="wrap">
      <h2>Add a user</h2>
      <form class="add" method="post" action="/api/admin/add-user" onsubmit="return au(this)">
        <input name="firstName" placeholder="First name" required>
        <input name="lastName" placeholder="Last name" required>
        <input name="username" placeholder="username (lowercase)" required>
        <input name="email" placeholder="Email" required>
        <input name="password" placeholder="password (min 6)" required>
        <select name="role"><option value="rep">Rep</option><option value="admin">Admin</option></select>
        <input name="title" placeholder="Title (e.g. Associate)">
        <input name="phone" placeholder="Phone (for BOVs)">
        <button class="primary">Add user</button>
      </form>
      <div class="sub2" style="margin:-6px 0 4px">Title, phone &amp; email appear as the "prepared by" line on that rep's BOVs. Reps can edit their own under Account.</div>
      <h2>Users</h2>
      <table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Added</th><th>Last Login</th><th>Actions</th></tr></thead><tbody>${urows}</tbody></table>

      <h2 style="margin-top:34px">Tool Access <span class="sub2">— check a tool to make it admin-only (hidden from reps, and blocked by direct link)</span></h2>
      <div class="links">
        <div class="taccgrid">${toolAccessRows}</div>
        <div style="margin-top:10px"><button class="primary" onclick="saveToolAccess()">Save tool access</button> <span id="tmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Dashboard Quick Links <span class="sub2">— up to 20; check "Default for all" to put a link on every user's dashboard. Each user can add their own under Account.</span></h2>
      <div class="links">${linkRows}
        <div style="margin-top:10px"><button class="primary" onclick="saveLinks()">Save quick links</button> <span id="lmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">BOV Valuation Basis <span class="sub2">— deals with trailing sales BELOW this value are concluded on SDE; at or above it, on Adjusted EBITDA.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">SDE threshold (annual sales, $)</label>
        <input id="sdeThreshold" inputmode="numeric" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:200px" placeholder="1200000">
        <div style="margin-top:10px"><button class="primary" onclick="saveBovConfig()">Save threshold</button> <span id="bcmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Questionnaire Intro Screen <span class="sub2">— the "Before you begin" priming screen a rep sees when starting a questionnaire.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">Seconds on screen (default 10; 0 = off)</label>
        <input id="introSeconds" inputmode="numeric" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:120px" placeholder="10">
        <div style="margin-top:10px"><button class="primary" onclick="saveIntroSeconds()">Save duration</button> <span id="ismsg" class="sub2"></span></div>
        <label class="sub2" style="display:block;margin:18px 0 4px">Message shown on the screen <span style="font-weight:400">— blank lines separate paragraphs; a line starting with &ldquo;- &rdquo; becomes a checklist item</span></label>
        <textarea id="introMessage" spellcheck="true" style="width:100%;min-height:200px;border:1px solid #cfd6e2;border-radius:8px;padding:11px 13px;font:inherit;font-size:13.5px;line-height:1.5;resize:vertical"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveIntroMessage()">Save message</button> <button onclick="resetIntroMessage()">Reset to default</button> <span id="immsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">BOV Ready Screen <span class="sub2">— how long the "your BOV is ready" screen (with the completion sound) stays up before the finished draft opens.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">Seconds on screen (default 2)</label>
        <input id="doneSeconds" inputmode="decimal" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:120px" placeholder="2">
        <div style="margin-top:10px"><button class="primary" onclick="saveDoneSeconds()">Save duration</button> <span id="dsmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">No-TTM Notice <span class="sub2">— shown on a BOV when no trailing-twelve-month statement was provided and we're past Q1, so the valuation fell back to the previous fiscal year.</span></h2>
      <div class="links">
        <textarea id="noTtmMessage" spellcheck="true" style="width:100%;min-height:110px;border:1px solid #cfd6e2;border-radius:8px;padding:11px 13px;font:inherit;font-size:13.5px;line-height:1.5;resize:vertical"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveNoTtmMessage()">Save message</button> <button onclick="resetNoTtmMessage()">Reset to default</button> <span id="ntmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Asset-Sale Floor <span class="sub2">— when trailing SDE is at or below this, the business has no going-concern value and is treated / marketed as an asset sale.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">SDE floor ($; default 25,000)</label>
        <input id="assetSaleFloor" inputmode="numeric" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:180px" placeholder="25000">
        <div style="margin-top:10px"><button class="primary" onclick="saveAssetSaleFloor()">Save floor</button> <span id="asfmsg" class="sub2"></span></div>
        <label class="sub2" style="display:block;margin:18px 0 4px">Notice shown on the BOV when a deal falls at or below the floor</label>
        <textarea id="assetSaleMessage" spellcheck="true" style="width:100%;min-height:110px;border:1px solid #cfd6e2;border-radius:8px;padding:11px 13px;font:inherit;font-size:13.5px;line-height:1.5;resize:vertical"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveAssetSaleMessage()">Save message</button> <button onclick="resetAssetSaleMessage()">Reset to default</button> <span id="asmmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Build Sound <span class="sub2">— the ambience that plays while a BOV builds. Tap Preview to sample, pick one, then Save.</span></h2>
      <div class="links">
        <div id="soundList"></div>
        <div style="margin-top:10px"><button class="primary" onclick="saveAmbience()">Save sound</button> <button onclick="stopPreview()">Stop preview</button> <span id="sndmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">BOV Analyst Prompt <span class="sub2">— the instructions Claude follows when drafting a BOV. Edit to change how valuations are written; keep the JSON output block at the end intact so the BOV still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="bpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="bovPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveBovPrompt()">Save prompt</button> <button onclick="resetBovPrompt()">Reset to RRG default</button> <span id="bpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Marketing Pack Prompt <span class="sub2">— the instructions Claude follows when drafting the Confidential Information Memorandum inside a Marketing Pack. Keep the JSON output block intact so the pack still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="cpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="cimPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveCimPrompt()">Save prompt</button> <button onclick="resetCimPrompt()">Reset to RRG default</button> <span id="cpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Tool Usage <span class="sub2">— what your team is using</span></h2>
      <div class="cols">
        <div><h3>By tool</h3><table><thead><tr><th>Tool</th><th>Opens</th></tr></thead><tbody>${toolSummary}</tbody></table></div>
        <div><h3>By user</h3><table><thead><tr><th>User</th><th>Opens</th></tr></thead><tbody>${userSummary}</tbody></table></div>
      </div>
      <h3 style="margin-top:22px">Recent tool activity <span class="sub2">— newest first, last 200</span></h3>
      <table><thead><tr><th>When (CT)</th><th>User</th><th>Tool</th><th>IP</th></tr></thead><tbody>${usageRecent}</tbody></table>
      <h2 style="margin-top:34px">Login Activity <span class="sub2">— newest first, last 300</span></h2>
      <table><thead><tr><th>When (CT)</th><th>Username</th><th>Result</th><th>IP</th></tr></thead><tbody>${lrows}</tbody></table>
    </div>
    <script src="/rrg_ambience.js"></script>
    <script>
      function post(action, data){ return fetch(action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json()); }
      function au(f){ post('/api/admin/add-user',{firstName:f.firstName.value,lastName:f.lastName.value,username:f.username.value,email:f.email.value,password:f.password.value,role:f.role.value,title:f.title.value,phone:f.phone.value}).then(j=>{ if(j.ok){location.reload();} else alert(j.error||'Failed'); }); return false; }
      function rp(f){ var p=prompt('New password for '+f.username.value+' (min 6):'); if(!p) return false; post('/api/admin/reset',{username:f.username.value,password:p}).then(j=>{ alert(j.ok?'Password reset.':(j.error||'Failed')); }); return false; }
      function saveLinks(){ var links=[]; document.querySelectorAll('.lrow').forEach(function(r){ var n=r.querySelector('.ln').value.trim(), u=r.querySelector('.lu').value.trim(), a=r.querySelector('.la').checked; if(n&&u) links.push({name:n,url:u,default:a}); }); post('/api/admin/links',{links:links}).then(function(j){ var m=document.getElementById('lmsg'); if(j.ok){ m.textContent='Saved '+(j.links.length)+' link(s) ✓'; } else { m.textContent=j.error||'Failed'; } }); }
      function saveToolAccess(){ var t=[]; document.querySelectorAll('.ta:checked').forEach(function(c){ t.push(c.value); }); post('/api/admin/tool-access',{adminOnly:t}).then(function(j){ var m=document.getElementById('tmsg'); if(j.ok){ m.textContent='Saved — '+j.adminOnly.length+' tool(s) admin-only ✓'; } else { m.textContent=j.error||'Failed'; } }); }
      function _bpState(isDefault){ var s=document.getElementById('bpstate'); if(s) s.textContent = isDefault ? 'Currently using the RRG default prompt.' : 'Currently using a custom prompt.'; }
      function loadBovPrompt(){ fetch('/api/admin/bov-prompt').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('bovPrompt').value=j.prompt||''; _bpState(j.isDefault); } }).catch(function(){ var s=document.getElementById('bpstate'); if(s) s.textContent='Could not load the prompt.'; }); }
      function saveBovPrompt(){ var v=document.getElementById('bovPrompt').value; var m=document.getElementById('bpmsg'); m.textContent='Saving…'; post('/api/admin/bov-prompt',{prompt:v}).then(function(j){ if(j.ok){ m.textContent = j.isDefault ? 'Saved — matches the default, so the default is in use ✓' : 'Saved custom prompt ✓'; document.getElementById('bovPrompt').value=j.prompt||v; _bpState(j.isDefault); } else m.textContent=j.error||'Failed'; }); }
      function resetBovPrompt(){ if(!confirm('Reset the BOV prompt to the RRG default? Your custom prompt will be discarded.')) return; post('/api/admin/bov-prompt',{reset:true}).then(function(j){ if(j.ok){ document.getElementById('bovPrompt').value=j.prompt||''; document.getElementById('bpmsg').textContent='Reset to default ✓'; _bpState(true); } }); }
      loadBovPrompt();
      function _cpState(isDefault){ var s=document.getElementById('cpstate'); if(s) s.textContent = isDefault ? 'Currently using the RRG default CIM prompt.' : 'Currently using a custom CIM prompt.'; }
      function loadCimPrompt(){ fetch('/api/admin/cim-prompt').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('cimPrompt').value=j.prompt||''; _cpState(j.isDefault); } }).catch(function(){ var s=document.getElementById('cpstate'); if(s) s.textContent='Could not load the prompt.'; }); }
      function saveCimPrompt(){ var v=document.getElementById('cimPrompt').value; var m=document.getElementById('cpmsg'); m.textContent='Saving…'; post('/api/admin/cim-prompt',{prompt:v}).then(function(j){ if(j.ok){ m.textContent = j.isDefault ? 'Saved — matches the default ✓' : 'Saved custom prompt ✓'; document.getElementById('cimPrompt').value=j.prompt||v; _cpState(j.isDefault); } else m.textContent=j.error||'Failed'; }); }
      function resetCimPrompt(){ if(!confirm('Reset the Marketing Pack prompt to the RRG default? Your custom prompt will be discarded.')) return; post('/api/admin/cim-prompt',{reset:true}).then(function(j){ if(j.ok){ document.getElementById('cimPrompt').value=j.prompt||''; document.getElementById('cpmsg').textContent='Reset to default ✓'; _cpState(true); } }); }
      loadCimPrompt();
      function fmtNum(n){ return Number(n||0).toLocaleString('en-US'); }
      var INTRO_DEFAULT_MSG='';
      function loadBovConfig(){ fetch('/api/admin/bov-config').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('sdeThreshold').value=fmtNum(j.sdeThreshold); var is=document.getElementById('introSeconds'); if(is) is.value=(j.introSeconds!=null?j.introSeconds:10); INTRO_DEFAULT_MSG=j.defaultIntroMessage||''; var im=document.getElementById('introMessage'); if(im) im.value=j.introMessage||j.defaultIntroMessage||''; var ds=document.getElementById('doneSeconds'); if(ds) ds.value=(j.doneSeconds!=null?j.doneSeconds:2); var nt=document.getElementById('noTtmMessage'); if(nt) nt.value=j.noTtmMessage||j.defaultNoTtmMessage||''; var af=document.getElementById('assetSaleFloor'); if(af) af.value=fmtNum(j.assetSaleFloor!=null?j.assetSaleFloor:(j.defaultAssetSaleFloor!=null?j.defaultAssetSaleFloor:25000)); var am=document.getElementById('assetSaleMessage'); if(am) am.value=j.assetSaleMessage||j.defaultAssetSaleMessage||''; renderSounds(j.ambienceId||'factory'); } }); }
      // ----- Build-sound picker (uses the shared RRG_AMBIENCE library) -----
      function renderSounds(sel){ var el=document.getElementById('soundList'); if(!el||!window.RRG_AMBIENCE) return;
        el.innerHTML=RRG_AMBIENCE.sounds.map(function(s){ return '<label style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #eef1f6">'
          +'<input type="radio" name="ambience" value="'+s.id+'"'+(s.id===sel?' checked':'')+'>'
          +'<span style="flex:1"><b style="color:#0b1a3a">'+s.name+'</b> <span class="sub2">— '+s.desc+'</span></span>'
          +'<button type="button" class="prevbtn" data-id="'+s.id+'" onclick="togglePreview(\''+s.id+'\',this)" style="border:1px solid #cfd6e2;background:#fff;border-radius:8px;padding:6px 13px;font:inherit;font-size:12.5px;font-weight:700;color:#0b1a3a;cursor:pointer">Preview</button>'
          +'</label>'; }).join(''); }
      var PREV=null;
      function stopPreview(){ if(!PREV) return; var P=PREV; PREV=null; try{ var t=P.ctx.currentTime; P.master.gain.cancelScheduledValues(t); P.master.gain.setValueAtTime(Math.max(P.master.gain.value,0.0001),t); P.master.gain.exponentialRampToValueAtTime(0.0001,t+0.4); }catch(e){} if(P.timer) clearTimeout(P.timer); if(P.handle&&P.handle.stop) P.handle.stop(); setTimeout(function(){ try{ P.ctx.close(); }catch(e){} }, 1300); var all=document.querySelectorAll('#soundList .prevbtn'); for(var i=0;i<all.length;i++) all[i].textContent='Preview'; }
      function previewSound(id, btn){ stopPreview(); try{ var C=window.AudioContext||window.webkitAudioContext; var ctx=new C(); if(ctx.state==='suspended') ctx.resume(); var master=ctx.createGain(); master.gain.value=0.0001; master.connect(ctx.destination); master.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime+0.6); var handle=RRG_AMBIENCE.play(ctx, master, id); var timer=setTimeout(stopPreview, 9000); PREV={ctx:ctx, master:master, handle:handle, timer:timer, id:id}; if(btn) btn.textContent='◼ Stop'; }catch(e){} }
      function togglePreview(id, btn){ if(PREV && PREV.id===id){ stopPreview(); } else { previewSound(id, btn); } }
      function saveAmbience(){ var r=document.querySelector('#soundList input[name=ambience]:checked'); var id=r?r.value:'orb'; var m=document.getElementById('sndmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{ambienceId:id}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓ — plays on the next build'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveDoneSeconds(){ var v=(document.getElementById('doneSeconds').value||'').replace(/[^0-9.]/g,''); var m=document.getElementById('dsmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{doneSeconds:v}).then(function(j){ if(j&&j.ok){ document.getElementById('doneSeconds').value=(j.doneSeconds!=null?j.doneSeconds:2); m.textContent='Saved — '+j.doneSeconds+'s ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveNoTtmMessage(){ var v=document.getElementById('noTtmMessage').value||''; var m=document.getElementById('ntmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{noTtmMessage:v}).then(function(j){ if(j&&j.ok){ document.getElementById('noTtmMessage').value=j.noTtmMessage||''; m.textContent='Saved ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function resetNoTtmMessage(){ if(!confirm('Reset the no-TTM notice to the RRG default?')) return; var m=document.getElementById('ntmsg'); m.textContent='Resetting…'; post('/api/admin/bov-config',{noTtmMessage:''}).then(function(j){ if(j&&j.ok){ document.getElementById('noTtmMessage').value=j.noTtmMessage||''; m.textContent='Reset to default ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveAssetSaleFloor(){ var v=(document.getElementById('assetSaleFloor').value||'').replace(/[^0-9.]/g,''); var m=document.getElementById('asfmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{assetSaleFloor:v}).then(function(j){ if(j&&j.ok){ document.getElementById('assetSaleFloor').value=fmtNum(j.assetSaleFloor); m.textContent='Saved — asset sale at/below $'+fmtNum(j.assetSaleFloor)+' SDE ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveAssetSaleMessage(){ var v=document.getElementById('assetSaleMessage').value||''; var m=document.getElementById('asmmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{assetSaleMessage:v}).then(function(j){ if(j&&j.ok){ document.getElementById('assetSaleMessage').value=j.assetSaleMessage||''; m.textContent='Saved ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function resetAssetSaleMessage(){ if(!confirm('Reset the asset-sale notice to the RRG default?')) return; var m=document.getElementById('asmmsg'); m.textContent='Resetting…'; post('/api/admin/bov-config',{assetSaleMessage:''}).then(function(j){ if(j&&j.ok){ document.getElementById('assetSaleMessage').value=j.assetSaleMessage||''; m.textContent='Reset to default ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveBovConfig(){ var v=(document.getElementById('sdeThreshold').value||'').replace(/[^0-9.]/g,''); var m=document.getElementById('bcmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{sdeThreshold:v}).then(function(j){ if(j&&j.ok){ document.getElementById('sdeThreshold').value=fmtNum(j.sdeThreshold); m.textContent='Saved — SDE below $'+fmtNum(j.sdeThreshold)+' in sales ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveIntroSeconds(){ var v=(document.getElementById('introSeconds').value||'').replace(/[^0-9.]/g,''); var m=document.getElementById('ismsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{introSeconds:v}).then(function(j){ if(j&&j.ok){ document.getElementById('introSeconds').value=(j.introSeconds!=null?j.introSeconds:10); m.textContent=(Number(j.introSeconds)===0?'Saved — intro screen off ✓':('Saved — '+j.introSeconds+'s ✓')); } else m.textContent=(j&&j.error)||'Failed'; }); }
      function saveIntroMessage(){ var v=document.getElementById('introMessage').value||''; var m=document.getElementById('immsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{introMessage:v}).then(function(j){ if(j&&j.ok){ document.getElementById('introMessage').value=j.introMessage||''; m.textContent='Saved ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function resetIntroMessage(){ if(!confirm('Reset the intro message to the RRG default?')) return; var m=document.getElementById('immsg'); m.textContent='Resetting…'; post('/api/admin/bov-config',{introMessage:''}).then(function(j){ if(j&&j.ok){ document.getElementById('introMessage').value=j.introMessage||INTRO_DEFAULT_MSG; m.textContent='Reset to default ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      loadBovConfig();
      document.querySelectorAll('form[action="/api/admin/toggle"],form[action="/api/admin/remove"]').forEach(function(f){ f.addEventListener('submit',function(e){ e.preventDefault(); var d={}; new FormData(f).forEach((v,k)=>d[k]=v); post(f.action,d).then(j=>{ if(j.ok) location.reload(); else alert(j.error||'Failed'); }); }); });
      /* Collapsible admin sections (chevrons) */
      var ACC=[];
      (function(){
        var hs=[].slice.call(document.querySelectorAll('.wrap > h2'));
        hs.forEach(function(h,idx){
          var body=document.createElement('div'); body.className='accbody';
          var n=h.nextElementSibling;
          while(n && n.tagName!=='H2'){ var nx=n.nextElementSibling; body.appendChild(n); n=nx; }
          h.after(body);
          h.classList.add('acch');
          h.insertAdjacentHTML('afterbegin','<span class="chev" aria-hidden="true">›</span>');
          var key='rrgadm_'+idx, saved=null; try{ saved=localStorage.getItem(key); }catch(e){}
          var open = saved===null ? (idx<2) : saved==='1';
          if(!open){ h.classList.add('collapsed'); body.style.display='none'; }
          function set(o){ h.classList.toggle('collapsed',!o); body.style.display=o?'':'none'; try{ localStorage.setItem(key,o?'1':'0'); }catch(e){} }
          h.addEventListener('click',function(ev){ if(ev.target.closest('a,button,input,select')) return; set(h.classList.contains('collapsed')); });
          ACC.push(set);
        });
      })();
      function accAll(o){ ACC.forEach(function(set){ set(o); }); }
    </script>`));
});
app.post('/api/admin/add-user', requireAdmin, (req, res) => {
  try { auth.addUser(req.body || {}); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/reset', requireAdmin, (req, res) => {
  try { auth.resetPassword((req.body || {}).username, (req.body || {}).password); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/toggle', requireAdmin, (req, res) => {
  try { auth.setDisabled((req.body || {}).username, String((req.body || {}).disabled) === '1'); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/remove', requireAdmin, (req, res) => {
  try { auth.removeUser((req.body || {}).username); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/links', requireAdmin, (req, res) => {
  try { const saved = auth.saveLinks((req.body || {}).links || []); res.json({ ok: true, links: saved }); }
  catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/tool-access', requireAdmin, (req, res) => {
  try { const saved = auth.saveToolAccess((req.body || {}).adminOnly || []); res.json({ ok: true, adminOnly: saved }); }
  catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
// The BOV analyst prompt (Admin → BOV Analyst Prompt). Returns the effective
// prompt (custom if set, else the built-in default) plus which one it is.
app.get('/api/admin/bov-prompt', requireAdmin, (req, res) => {
  const custom = loadBovPromptCustom();
  res.json({ ok: true, prompt: custom || bovgen.DEFAULT_SYSTEM, isDefault: !custom });
});
app.post('/api/admin/bov-prompt', requireAdmin, (req, res) => {
  const b = req.body || {};
  const def = String(bovgen.DEFAULT_SYSTEM || '');
  if (b.reset) { clearBovPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  const p = String(b.prompt || '').trim();
  // Blank, or identical to the default, means "just use the default".
  if (!p || p === def.trim()) { clearBovPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  saveBovPromptCustom(p);
  res.json({ ok: true, prompt: p, isDefault: false });
});
// CIM prompt — mirror of the BOV prompt routes.
app.get('/api/admin/cim-prompt', requireAdmin, (req, res) => {
  const custom = loadCimPromptCustom();
  res.json({ ok: true, prompt: custom || cimgen.DEFAULT_SYSTEM, isDefault: !custom });
});
app.post('/api/admin/cim-prompt', requireAdmin, (req, res) => {
  const b = req.body || {};
  const def = String(cimgen.DEFAULT_SYSTEM || '');
  if (b.reset) { clearCimPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  const p = String(b.prompt || '').trim();
  if (!p || p === def.trim()) { clearCimPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  saveCimPromptCustom(p);
  res.json({ ok: true, prompt: p, isDefault: false });
});
// SDE-vs-EBITDA revenue threshold. Admins read/write; any signed-in user (the
// BOV builder) can read it to compute the basis client-side.
app.get('/api/bov-config', (req, res) => res.json({ ok: true, sdeThreshold: loadSdeThreshold(), defaultSdeThreshold: DEFAULT_SDE_THRESHOLD, introSeconds: loadIntroSeconds(), defaultIntroSeconds: DEFAULT_INTRO_SECONDS, introMessage: loadIntroMessage(), doneSeconds: loadDoneSeconds(), defaultDoneSeconds: DEFAULT_DONE_SECONDS, noTtmMessage: loadNoTtmMessage(), assetSaleFloor: loadAssetSaleFloor(), assetSaleMessage: loadAssetSaleMessage(), ambienceId: loadAmbienceId() }));
app.get('/api/admin/bov-config', requireAdmin, (req, res) => res.json({ ok: true, sdeThreshold: loadSdeThreshold(), defaultSdeThreshold: DEFAULT_SDE_THRESHOLD, introSeconds: loadIntroSeconds(), defaultIntroSeconds: DEFAULT_INTRO_SECONDS, introMessage: loadIntroMessage(), defaultIntroMessage: DEFAULT_INTRO_MESSAGE, doneSeconds: loadDoneSeconds(), defaultDoneSeconds: DEFAULT_DONE_SECONDS, noTtmMessage: loadNoTtmMessage(), defaultNoTtmMessage: DEFAULT_NO_TTM_MESSAGE, assetSaleFloor: loadAssetSaleFloor(), defaultAssetSaleFloor: DEFAULT_ASSET_SALE_FLOOR, assetSaleMessage: loadAssetSaleMessage(), defaultAssetSaleMessage: DEFAULT_ASSET_SALE_MESSAGE, ambienceId: loadAmbienceId() }));
app.post('/api/admin/bov-config', requireAdmin, (req, res) => {
  const b = req.body || {};
  // All fields optional — update whichever is supplied.
  if (b.sdeThreshold != null && String(b.sdeThreshold).trim() !== '') {
    const n = Number(String(b.sdeThreshold).replace(/[^0-9.]/g, ''));
    if (!(n > 0)) return res.status(400).json({ ok: false, error: 'Enter a dollar amount greater than 0.' });
    saveSdeThreshold(n);
  }
  if (b.introSeconds != null && String(b.introSeconds).trim() !== '') {
    const s = Number(String(b.introSeconds).replace(/[^0-9.]/g, ''));
    if (!(s >= 0)) return res.status(400).json({ ok: false, error: 'Enter a number of seconds (0 or more).' });
    saveIntroSeconds(s);
  }
  // introMessage: empty string resets to the RRG default.
  if (b.introMessage != null) {
    const t = String(b.introMessage).trim();
    if (t === '') saveCfg({ introMessage: '' }); else saveIntroMessage(t);
  }
  if (b.doneSeconds != null && String(b.doneSeconds).trim() !== '') {
    const s = Number(String(b.doneSeconds).replace(/[^0-9.]/g, ''));
    if (!(s >= 0)) return res.status(400).json({ ok: false, error: 'Enter a number of seconds (0 or more).' });
    saveDoneSeconds(s);
  }
  // noTtmMessage: empty string resets to the RRG default.
  if (b.noTtmMessage != null) {
    const t = String(b.noTtmMessage).trim();
    if (t === '') saveCfg({ noTtmMessage: '' }); else saveNoTtmMessage(t);
  }
  if (b.assetSaleFloor != null && String(b.assetSaleFloor).trim() !== '') {
    const n = Number(String(b.assetSaleFloor).replace(/[^0-9.]/g, ''));
    if (!(n >= 0)) return res.status(400).json({ ok: false, error: 'Enter a dollar amount (0 or more).' });
    saveAssetSaleFloor(n);
  }
  if (b.assetSaleMessage != null) {
    const t = String(b.assetSaleMessage).trim();
    if (t === '') saveCfg({ assetSaleMessage: '' }); else saveAssetSaleMessage(t);
  }
  if (b.ambienceId != null && String(b.ambienceId).trim() !== '') saveAmbienceId(b.ambienceId);
  res.json({ ok: true, sdeThreshold: loadSdeThreshold(), introSeconds: loadIntroSeconds(), introMessage: loadIntroMessage(), doneSeconds: loadDoneSeconds(), noTtmMessage: loadNoTtmMessage(), assetSaleFloor: loadAssetSaleFloor(), assetSaleMessage: loadAssetSaleMessage(), ambienceId: loadAmbienceId() });
});
app.get('/admin/logins.csv', requireAdmin, (_req, res) => {
  const fs = require('fs');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rrg-logins.csv"');
  if (fs.existsSync(auth.LOG_CSV)) return fs.createReadStream(auth.LOG_CSV).pipe(res);
  res.send(auth.LOGIN_COLS.join(',') + '\n');
});
app.get('/admin/usage.csv', requireAdmin, (_req, res) => {
  const fs = require('fs');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rrg-tool-usage.csv"');
  if (fs.existsSync(auth.USAGE_CSV)) return fs.createReadStream(auth.USAGE_CSV).pipe(res);
  res.send(auth.USAGE_COLS.join(',') + '\n');
});

/* ---------- shared HTML shells ---------- */
function chrome() {
  return `<style>
:root{--navy:#000E31;--red:#DA2B1F;--line:#e6e9f0;--muted:#6b7488;--ink:#1a2236;--wash:#f5f7fb;}
*{box-sizing:border-box;} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fbfcfe;}
.top{background:var(--navy);color:#fff;padding:20px 28px;display:flex;align-items:center;gap:14px;}
.disc{width:38px;height:38px;border-radius:50%;background:var(--red);color:#fff;font:900 13px 'Arial Black',Arial,sans-serif;display:flex;align-items:center;justify-content:center;letter-spacing:-.04em;}
.top h1{font-size:17px;margin:0;font-weight:700;} .top .sub{font-size:12px;color:#aeb8cf;margin-top:2px;}
.bar{display:flex;align-items:center;gap:14px;padding:14px 28px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
.stat{font-size:13px;color:var(--muted);} .stat b{color:var(--navy);font-size:15px;}
.dl{margin-left:auto;display:flex;gap:8px;} .dl a{background:var(--navy);color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:7px;}
.wrap{padding:14px 28px 48px;} .wrap h2{font-size:14px;color:var(--navy);margin:22px 0 8px;} .wrap h3{font-size:12.5px;color:var(--navy);margin:14px 0 6px;} .sub2{font-weight:500;color:var(--muted);font-size:12px;}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;} @media(max-width:640px){.cols{grid-template-columns:1fr;}}
.links{background:var(--wash);border:1px solid var(--line);border-radius:10px;padding:14px;max-width:640px;}
.lrow{display:flex;gap:10px;margin-bottom:8px;align-items:center;} .lrow .ln{flex:0 0 180px;} .lrow .lu{flex:1;}
.lchk{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);font-weight:600;white-space:nowrap;} .lchk input{width:15px;height:15px;accent-color:var(--red);}
.taccgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px 16px;}
.tacc{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);font-weight:600;cursor:pointer;} .tacc input{width:15px;height:15px;accent-color:var(--red);}
.links input{border:1px solid #cfd6e2;border-radius:7px;padding:8px 10px;font:inherit;font-size:13px;min-width:0;}
.links button{border:1px solid var(--navy);background:var(--navy);color:#fff;font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:7px;cursor:pointer;}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;} th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:middle;}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;} tr:hover td{background:var(--wash);}
.ts{white-space:nowrap;color:var(--muted);} .nm{font-weight:600;color:var(--navy);} .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;} .hl{color:#3a4256;max-width:340px;}
.tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:20px;text-transform:uppercase;margin-left:4px;}
.tag.ssc{background:#eaf0ff;color:#2647b0;} .tag.seller{background:#fdeceb;color:var(--red);} .tag.admin{background:#e7f5ee;color:#1f8a5b;} .tag.off{background:#fbe9e7;color:var(--red);} .tag.ok{background:#e7f5ee;color:#1f8a5b;}
.empty{color:var(--muted);text-align:center;padding:32px;}
.add{display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:var(--wash);border:1px solid var(--line);border-radius:10px;padding:14px;}
.add input,.add select{border:1px solid #cfd6e2;border-radius:7px;padding:8px 10px;font:inherit;font-size:13px;} .add input{min-width:150px;}
.act{display:flex;gap:6px;flex-wrap:wrap;} .act button,.add button{border:1px solid #cfd6e2;background:#fff;color:var(--navy);font:inherit;font-size:12px;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer;}
.act button:hover,.add button:hover{border-color:#9fb0cc;} .add .primary,.act .primary{background:var(--navy);color:#fff;border-color:var(--navy);} .act .danger{color:var(--red);border-color:#f0c9c6;}
.foot{padding:16px 28px;color:var(--muted);font-size:11px;border-top:1px solid var(--line);}
</style>`;
}
function shell(title, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RRG · ${esc(title)}</title>${chrome()}</head><body>
<div class="top"><span class="disc">RRG</span><div><h1>${esc(title)}</h1><div class="sub">Restaurant Realty Group — internal</div></div></div>
${inner}
<div class="foot">Proprietary &amp; Confidential · Property of Restaurant Realty Group, LLC · Internal RRG use only.</div></body></html>`;
}
function loginPage(note) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RRG · Sign In</title>
<style>
:root{--navy:#000E31;--red:#DA2B1F;}
*{box-sizing:border-box;} html,body{height:100%;margin:0;}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 120% at 30% 10%, #1c2e5c 0%, #112044 42%, #0b1636 70%, #071029 100%);}
.card{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);width:360px;max-width:92vw;padding:34px 32px 30px;}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px;}
.disc{width:46px;height:46px;border-radius:50%;background:var(--red);color:#fff;font:900 15px 'Arial Black',Arial,sans-serif;display:flex;align-items:center;justify-content:center;letter-spacing:-.04em;}
.brand .wm{font-weight:800;color:var(--navy);font-size:14px;text-transform:uppercase;line-height:1;} .brand .wm span{display:block;}
h1{font-size:19px;color:var(--navy);margin:0 0 4px;} .sub{font-size:12.5px;color:#6b7488;margin:0 0 20px;}
label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7488;font-weight:700;display:block;margin:14px 0 4px;}
input{width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:11px 12px;font:inherit;font-size:14px;}
input:focus{outline:none;border-color:var(--red);}
button{width:100%;margin-top:22px;background:var(--navy);color:#fff;border:none;border-radius:9px;padding:12px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}
button:hover{background:#0b1a3a;}
.err{background:#fdeceb;color:var(--red);font-size:12.5px;font-weight:600;border-radius:8px;padding:9px 12px;margin-top:16px;display:none;}
.note{color:#1f8a5b;font-size:12px;margin-top:14px;text-align:center;}
.foot{text-align:center;font-size:10px;color:#8894a8;margin-top:20px;letter-spacing:.03em;}
</style></head><body>
<form class="card" onsubmit="return go(this)">
  <div class="brand"><span class="disc">RRG</span><span class="wm"><span>Restaurant</span><span>Realty</span><span>Group</span></span></div>
  <h1>Associate Sign In</h1>
  <p class="sub">Restaurant Transactions. Done Right.</p>
  <label>Username</label><input name="username" autocomplete="username" autofocus required>
  <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
  <div class="err" id="err"></div>
  <button>Sign in</button>
  ${note ? `<div class="note">${esc(note)}</div>` : ''}
  <div class="foot">Proprietary &amp; Confidential · Internal RRG use only</div>
</form>
<script>
function go(f){
  var e=document.getElementById('err'); e.style.display='none';
  fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:f.username.value,password:f.password.value})})
    .then(r=>r.json()).then(j=>{ if(j.ok){ location.href='/'; } else { e.textContent=j.error||'Sign in failed.'; e.style.display='block'; } })
    .catch(()=>{ e.textContent='Network error.'; e.style.display='block'; });
  return false;
}
</script></body></html>`;
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`RRG toolkit server listening on :${PORT}`));
