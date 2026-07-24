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
const leasegen = require('./leasegen.js');
const attackgen = require('./attackgen.js');
const offergen = require('./offergen.js');
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

// ---- Brand (org logo, admin-managed) ----
const BRAND_FILE = path.join(BOV_DATA_DIR, 'brand.json');
const LOGO_EXT = /^(png|jpe?g|gif|webp|svg)$/i;
const LOGO_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
function loadBrand() { try { return JSON.parse(fs.readFileSync(BRAND_FILE, 'utf8')); } catch (e) { return {}; } }
function saveBrand(b) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(BRAND_FILE, JSON.stringify(b, null, 2)); } catch (e) {} }
function brandLogoObj() { try { const b = loadBrand(); if (!b.logoExt) return null; const buf = fs.readFileSync(path.join(BOV_DATA_DIR, 'brand_logo.' + b.logoExt)); return { dataB64: buf.toString('base64'), type: b.logoType || LOGO_MIME[b.logoExt] || 'image/png' }; } catch (e) { return null; } }
// ---- CIM store (Confidential Information Memorandums) — mirrors the BOV store ----
const CIMS_FILE = path.join(BOV_DATA_DIR, 'cims.json');
function loadCims() { try { return JSON.parse(fs.readFileSync(CIMS_FILE, 'utf8')); } catch (e) { return []; } }
function saveCims(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(CIMS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newCimId() { return 'cim_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
// Lease abstracts (standalone or attached to a deal).
const LEASES_FILE = path.join(BOV_DATA_DIR, 'leases.json');
function loadLeases() { try { return JSON.parse(fs.readFileSync(LEASES_FILE, 'utf8')); } catch (e) { return []; } }
function saveLeases(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(LEASES_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newLeaseId() { return 'lse_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const LEASE_PROMPT_FILE = path.join(BOV_DATA_DIR, 'lease_prompt.txt');
function loadLeasePromptCustom() { try { const t = fs.readFileSync(LEASE_PROMPT_FILE, 'utf8'); return (t && t.trim()) ? t : ''; } catch (e) { return ''; } }
function saveLeasePromptCustom(t) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(LEASE_PROMPT_FILE, String(t)); } catch (e) {} }
function clearLeasePromptCustom() { try { fs.unlinkSync(LEASE_PROMPT_FILE); } catch (e) {} }
// Market Attack Plans (MAP) — the sell-side go-to-market strategy, advanced from a Marketing Pack (CIM).
const MAPS_FILE = path.join(BOV_DATA_DIR, 'maps.json');
function loadMaps() { try { return JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8')); } catch (e) { return []; } }
function saveMaps(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(MAPS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newMapId() { return 'map_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const MAP_PROMPT_FILE = path.join(BOV_DATA_DIR, 'map_prompt.txt');
function loadMapPromptCustom() { try { const t = fs.readFileSync(MAP_PROMPT_FILE, 'utf8'); return (t && t.trim()) ? t : ''; } catch (e) { return ''; } }
function saveMapPromptCustom(t) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(MAP_PROMPT_FILE, String(t)); } catch (e) {} }
function clearMapPromptCustom() { try { fs.unlinkSync(MAP_PROMPT_FILE); } catch (e) {} }

// Deals — first-class deal records. A deal can be created directly (with its own data
// room), then "started" to promote it into a Seller Qualification Call and the pipeline.
const DEALS_FILE = path.join(BOV_DATA_DIR, 'deals.json');
function loadDeals() { try { return JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8')); } catch (e) { return []; } }
function saveDeals(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(DEALS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newDealId() { return 'deal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ownsDeal(req, d) {
  if (req.user && req.user.role === 'admin') return true;
  if (d.byUser) return d.byUser === (req.user && req.user.username);
  return d.by && d.by === (req.user && req.user.name);
}

// People — a GLOBAL buyer / prospect / contact registry shared across all deals. Offers,
// tours, NDAs, and data-room buyers all link back to a person by personId, so the same
// buyer connects across every deal they touch.
const PEOPLE_FILE = path.join(BOV_DATA_DIR, 'people.json');
const PERSON_TYPES = ['Buyer', 'Seller', 'Client', 'Prospect', 'Investor', 'Broker', 'Operator', 'Other'];
function loadPeople() { try { return JSON.parse(fs.readFileSync(PEOPLE_FILE, 'utf8')); } catch (e) { return []; } }
function savePeople(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(PEOPLE_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newPersonId() { return 'per_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function normKey(s) { return String(s || '').trim().toLowerCase(); }
function personById(id) { if (!id) return null; return loadPeople().find(p => p.id === id) || null; }
// Find a person by email (preferred) or name; create one if none exists. Enriches blanks.
function findOrCreatePerson(req, info) {
  const name = String((info && info.name) || '').trim();
  const email = String((info && info.email) || '').trim();
  const company = String((info && info.company) || '').trim();
  if (!name && !email) return null;
  const arr = loadPeople();
  let p = null;
  if (email) p = arr.find(x => normKey(x.email) && normKey(x.email) === normKey(email));
  if (!p && name) p = arr.find(x => normKey(x.name) === normKey(name));
  if (p) {
    let ch = false;
    if (email && !p.email) { p.email = email.slice(0, 160); ch = true; }
    if (company && !p.company) { p.company = company.slice(0, 160); ch = true; }
    if (info && info.companyId && !p.companyId) { p.companyId = info.companyId; ch = true; }
    if (ch) { p.updatedAt = new Date().toISOString(); savePeople(arr); }
    return p;
  }
  const type = (info && PERSON_TYPES.indexOf(info.type) >= 0) ? info.type : 'Buyer';
  p = {
    id: newPersonId(), name: name.slice(0, 160) || email.slice(0, 160), company: company.slice(0, 160), companyId: (info && info.companyId) || '',
    email: email.slice(0, 160), phone: '', type: type, notes: '',
    createdAt: new Date().toISOString(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
  };
  arr.push(p); savePeople(arr);
  return p;
}
function personBrief(p) { return p ? { id: p.id, name: p.name || '', company: p.company || '', companyId: p.companyId || '', email: p.email || '', phone: p.phone || '', type: p.type || '' } : null; }

// Companies — a company / account file that groups its associated contacts (people) and
// its deals. Created at onboarding (the subject business), reusable across deals.
const COMPANIES_FILE = path.join(BOV_DATA_DIR, 'companies.json');
const COMPANY_TYPES = ['Business', 'Buyer Group', 'Investor', 'Vendor', 'Franchisor', 'Other'];
function loadCompanies() { try { return JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8')); } catch (e) { return []; } }
function saveCompanies(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(COMPANIES_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newCompanyId() { return 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function companyById(id) { if (!id) return null; return loadCompanies().find(c => c.id === id) || null; }
function companyBrief(c) { return c ? { id: c.id, name: c.name || '', market: c.market || '', type: c.type || '' } : null; }
function findOrCreateCompany(req, info) {
  const name = String((info && info.name) || '').trim();
  if (!name) return null;
  const arr = loadCompanies();
  let c = arr.find(x => normKey(x.name) === normKey(name));
  if (c) {
    if (info.market && !c.market) { c.market = String(info.market).slice(0, 80); c.updatedAt = new Date().toISOString(); saveCompanies(arr); }
    return c;
  }
  const type = (info && COMPANY_TYPES.indexOf(info.type) >= 0) ? info.type : 'Business';
  c = { id: newCompanyId(), name: name.slice(0, 160), market: String((info && info.market) || '').slice(0, 80), type: type, notes: '', createdAt: new Date().toISOString(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
  arr.push(c); saveCompanies(arr);
  return c;
}

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

// Admin-editable "what's about to happen" screen shown before a Marketing Pack builds.
const DEFAULT_PACK_INTRO_SECONDS = 20;
function loadPackIntroSeconds() { const c = loadCfg(); const n = Number(c.packIntroSeconds); return (isFinite(n) && n >= 0) ? n : DEFAULT_PACK_INTRO_SECONDS; }
function savePackIntroSeconds(n) { let v = Math.round(Number(n)); if (!isFinite(v) || v < 0) v = DEFAULT_PACK_INTRO_SECONDS; if (v > 120) v = 120; saveCfg({ packIntroSeconds: v }); }
const DEFAULT_PACK_INTRO_MESSAGE = [
  "You’re about to generate the full Marketing Pack for this business. In one step, RRG’s analyst produces the complete go-to-market package:",
  "",
  "- The Confidential Information Memorandum (CIM) — the confidential offering book buyers read, built from this deal’s valuation, questionnaire, and qualification call",
  "- A ready-to-send email campaign — the whole confidential-sale sequence: teaser, buyer qualifier, NDA cover, CIM delivery, data-room access, the call with ownership, and the call for offers",
  "",
  "To get started, on the next screen, add your photos and logo, then press Build. Everything reuses the numbers already locked in the valuation, so the CIM and the emails stay consistent end to end. You can edit any of it after it’s built."
].join("\n");
function loadPackIntroMessage() { const m = loadCfg().packIntroMessage; return (typeof m === 'string' && m.trim()) ? m : DEFAULT_PACK_INTRO_MESSAGE; }
function savePackIntroMessage(t) { saveCfg({ packIntroMessage: String(t == null ? '' : t).slice(0, 4000) }); }
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
// Which build-ambience sound plays on every build screen — BOV, Marketing Pack, Lease (id from rrg_ambience.js).
const DEFAULT_AMBIENCE_ID = 'analyst';
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
  if (req.path === '/api/generate-bov' || req.path === '/api/generate-cim' || req.path === '/api/generate-lease' || req.path === '/api/generate-map' || req.path === '/api/valuation-factors' || req.path === '/api/admin/upload-doc' || req.path === '/api/admin/logo' || req.path === '/api/room-upload') return next();
  express.json({ limit: '1mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

/* ---------- auth gate ---------- */
const OPEN = new Set(['/health', '/login', '/api/login', '/logout']);
app.use((req, res, next) => {
  // Buyer-facing data-room links are public (the unguessable token is the gate).
  if (OPEN.has(req.path) || req.path.startsWith('/room/') || req.path.startsWith('/roomfile/')) return next();
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
  logoUrl: (function () { const b = loadBrand(); return b.logoExt ? ('/api/brand/logo?v=' + encodeURIComponent(b.updatedAt || '')) : ''; })(),
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
  if (existing) { ensureLeaseForCim(req, existing); return existing; }
  const rec = {
    id: newCimId(), srcBovId: bov.id, srcQuestId: bov.srcQuestId || '', pending: true,
    business: bov.business || 'Business', market: bov.market || '',
    by: (req.user && req.user.name) || bov.by || '', byUser: (req.user && req.user.username) || bov.byUser || '',
    createdAt: new Date().toISOString(),
  };
  arr.push(rec); saveCims(arr);
  ensureLeaseForCim(req, rec);   // the pack ships with a lease abstract (both redactions on)
  return rec;
}
// A Marketing Pack ships as three pieces — the CIM, the email templates, and a lease
// abstract. Create the lease the moment the pack is created, tied to the same deal, with
// both landlord & tenant redactions on by default. Idempotent: reuse the deal's abstract
// if one already exists (built manually or from a prior advance).
function ensureLeaseForCim(req, cim) {
  if (!cim) return null;
  const arr = loadLeases();
  let l = cim.srcBovId ? arr.find(x => x.srcBovId && x.srcBovId === cim.srcBovId) : null;
  if (!l && cim.srcQuestId) l = arr.find(x => x.srcQuestId && x.srcQuestId === cim.srcQuestId);
  if (l) return l;
  const rec = {
    id: newLeaseId(), business: String(cim.business || 'Lease Abstract').slice(0, 120), propertyAddress: '',
    pending: true, srcQuestId: cim.srcQuestId || '', srcBovId: cim.srcBovId || '',
    by: (req.user && req.user.name) || cim.by || '', byUser: (req.user && req.user.username) || cim.byUser || '',
    createdAt: new Date().toISOString(),
    state: null,   // awaiting the lease document; redactions default ON everywhere state is null
  };
  arr.push(rec); saveLeases(arr);
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
    // Auto-file the uploaded financials / lease into this deal's data room (if it has one).
    try {
      const idx = assignmentsIndex(); let grp = null;
      for (const k in idx) { if (idx[k].bov && idx[k].bov.id === rec.id) { grp = idx[k]; break; } }
      if (grp && grp.room) {
        const rooms = loadRooms(); const room = rooms.find(x => x.id === grp.room.id);
        if (room) { let added = 0; (files || []).forEach(f => { if (addFileToRoom(room, f, { source: 'bov:' + rec.id, by: (req.user && req.user.name) || '' })) added++; }); if (added) saveRooms(rooms); }
      }
    } catch (e) { console.error('bov room-file error:', e && e.message); }
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
  removeRoomDocsBySource('cim:' + req.params.id);   // pull the files this pack put in the data room
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
    out.state.logo = (b.logo && b.logo.dataB64) ? b.logo : brandLogoObj();   // default to the org logo set in Admin
    out.state.bov = { summary: inp.summary, bridge: (inp.bovState && inp.bovState.bridge) || null };  // figures for the financial tables
    cim.business = String(out.business || cim.business || 'Untitled').slice(0, 120);
    cim.state = out.state; cim.aiGenerated = true; cim.pending = false; cim.builtAt = new Date().toISOString();
    saveCims(cims);
    // Auto-file the marketing photos into this deal's data room (Menus & Marketing).
    try {
      const idx = assignmentsIndex(); let grp = null;
      for (const k in idx) { if (idx[k].cim && idx[k].cim.id === cim.id) { grp = idx[k]; break; } }
      if (grp && grp.room) {
        const rooms = loadRooms(); const room = rooms.find(x => x.id === grp.room.id);
        if (room) {
          let added = 0;
          const mimeExt = t => ({ 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'png' }[String(t || '').toLowerCase()] || 'jpg');
          photos.forEach((p, i) => {
            if (!p || !p.dataB64) return;
            const nm = (String(p.caption || '').trim() || ('Marketing Photo ' + (i + 1))).slice(0, 80) + '.' + mimeExt(p.type);
            if (addFileToRoom(room, { name: nm, dataB64: p.dataB64, label: 'Menus & Marketing' }, { source: 'cim:' + cim.id, category: 'Menus & Marketing', title: (String(p.caption || '').trim() || ('Marketing Photo ' + (i + 1))), by: (req.user && req.user.name) || '' })) added++;
          });
          if (added) saveRooms(rooms);
        }
      }
    } catch (e) { console.error('cim room-file error:', e && e.message); }
    res.json({ ok: true, id: cim.id });
  } catch (e) {
    console.error('generate-cim error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ================= Lease Abstracts =================
function ownsLease(req, l) {
  if (req.user && req.user.role === 'admin') return true;
  if (l.byUser) return l.byUser === (req.user && req.user.username);
  return l.by && l.by === (req.user && req.user.name);
}
app.get('/api/leases', (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadLeases().slice().reverse().filter(l => isAdmin || ownsLease(req, l));
  res.json({ ok: true, isAdmin: !!isAdmin, leases: list.map(l => ({
    id: l.id, business: l.business, propertyAddress: l.propertyAddress || '', pending: !!l.pending,
    srcQuestId: l.srcQuestId || '', srcBovId: l.srcBovId || '', by: l.by, byUser: l.byUser,
    createdAt: l.createdAt, builtAt: l.builtAt || '',
  })) });
});
app.get('/api/lease/:id', (req, res) => {
  const l = loadLeases().find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsLease(req, l)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, lease: l });
});
app.delete('/api/lease/:id', (req, res) => {
  const arr = loadLeases();
  const target = arr.find(x => x.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsLease(req, target)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  saveLeases(arr.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});
// Create a standalone blank lease abstract, return its id (for the "New abstract" button).
app.post('/api/lease/new', express.json(), (req, res) => {
  const b = req.body || {};
  const rec = {
    id: newLeaseId(), business: String(b.business || 'Lease Abstract').slice(0, 120), propertyAddress: '',
    pending: true, srcQuestId: '', srcBovId: '', by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
    createdAt: new Date().toISOString(), state: null,
  };
  const arr = loadLeases(); arr.push(rec); saveLeases(arr);
  res.json({ ok: true, id: rec.id });
});
// The lease abstract that belongs to this Marketing Pack's deal (matched by the source BOV, then questionnaire).
function leaseForDeal(req, cim) {
  if (!cim) return null;
  const arr = loadLeases();
  let l = cim.srcBovId ? arr.find(x => x.srcBovId && x.srcBovId === cim.srcBovId && ownsLease(req, x)) : null;
  if (!l && cim.srcQuestId) l = arr.find(x => x.srcQuestId && x.srcQuestId === cim.srcQuestId && ownsLease(req, x));
  return l || null;
}
// Does this pack's deal have a lease abstract? (for the Lease Abstract view in the builder)
app.get('/api/cim/:id/lease', (req, res) => {
  const cim = loadCims().find(x => x.id === req.params.id);
  if (!cim) return res.status(404).json({ ok: false, error: 'Marketing Pack not found.' });
  if (!ownsCim(req, cim)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const l = leaseForDeal(req, cim);
  if (!l) return res.json({ ok: true, lease: null });
  res.json({ ok: true, lease: {
    id: l.id, business: l.business, propertyAddress: l.propertyAddress || '',
    pending: !!l.pending, builtAt: l.builtAt || '', createdAt: l.createdAt || '',
    redactLandlord: l.state ? (l.state.redactLandlord !== false) : true,
    redactTenant: l.state ? (l.state.redactTenant !== false) : true,
  } });
});
// Start a lease abstract tied to this pack's deal (or return the one already linked).
app.post('/api/cim/:id/lease/new', express.json(), (req, res) => {
  const cim = loadCims().find(x => x.id === req.params.id);
  if (!cim) return res.status(404).json({ ok: false, error: 'Marketing Pack not found.' });
  if (!ownsCim(req, cim)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const existing = leaseForDeal(req, cim);
  if (existing) return res.json({ ok: true, id: existing.id, existed: true });
  const arr = loadLeases();
  const rec = {
    id: newLeaseId(), business: String(cim.business || 'Lease Abstract').slice(0, 120), propertyAddress: '',
    pending: true, srcQuestId: cim.srcQuestId || '', srcBovId: cim.srcBovId || '',
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
    createdAt: new Date().toISOString(), state: null,
  };
  arr.push(rec); saveLeases(arr);
  res.json({ ok: true, id: rec.id });
});
// Save in-builder edits (the whole abstract state, including the redact flag).
app.post('/api/lease-save', express.json({ limit: '4mb' }), (req, res) => {
  const b = req.body || {};
  const arr = loadLeases();
  const l = arr.find(x => x.id === b.id);
  if (!l) return res.status(404).json({ ok: false, error: 'Lease abstract not found.' });
  if (!ownsLease(req, l)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  if (b.state && typeof b.state === 'object') {
    l.state = b.state;
    if (l.state.header) { l.business = String(l.state.header.business || l.business || 'Lease Abstract').slice(0, 120); l.propertyAddress = String(l.state.header.propertyAddress || l.propertyAddress || '').slice(0, 200); }
    if (l.pending) { l.pending = false; if (!l.builtAt) l.builtAt = new Date().toISOString(); }  // a saved abstract is a built one
    l.updatedAt = new Date().toISOString(); saveLeases(arr);
  }
  res.json({ ok: true });
});
// Generate the abstract from the uploaded lease document(s).
app.post('/api/generate-lease', express.json({ limit: '48mb' }), async (req, res) => {
  try {
    const b = req.body || {};
    const arr = loadLeases();
    const l = arr.find(x => x.id === b.leaseId);
    if (!l) return res.status(404).json({ ok: false, error: 'Lease abstract not found.' });
    if (!ownsLease(req, l)) return res.status(403).json({ ok: false, error: 'Not yours.' });
    const files = Array.isArray(b.files) ? b.files.slice(0, 12) : [];
    if (!files.length) return res.status(400).json({ ok: false, error: 'Upload the lease document before building.' });
    const asOf = new Date().toLocaleDateString('en-US');
    const out = await leasegen.generateLease({
      business: l.business, files, questionnaire: b.questionnaire || '', asOf,
      systemPrompt: loadLeasePromptCustom() || undefined,
    });
    out.state = out.state || {};
    // Redaction is chosen on the build screen — landlord and tenant each default ON.
    out.state.redactLandlord = (typeof b.redactLandlord === 'undefined') ? true : !!b.redactLandlord;
    out.state.redactTenant   = (typeof b.redactTenant   === 'undefined') ? true : !!b.redactTenant;
    // If the rep gave this abstract a business name at creation, keep it; otherwise use what the analyst extracted.
    const typedName = (l.business && l.business !== 'Lease Abstract') ? l.business : '';
    l.business = String(typedName || out.business || l.business || 'Lease Abstract').slice(0, 120);
    if (out.state.header && (typedName || !out.state.header.business)) out.state.header.business = l.business;
    if (out.state.header) l.propertyAddress = String(out.state.header.propertyAddress || '').slice(0, 200);
    l.state = out.state; l.aiGenerated = true; l.pending = false; l.builtAt = new Date().toISOString();
    saveLeases(arr);
    res.json({ ok: true, id: l.id });
  } catch (e) {
    console.error('generate-lease error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ================= Market Attack Plans (MAP) — sell-side =================
function ownsMap(req, m) {
  if (req.user && req.user.role === 'admin') return true;
  if (m.byUser) return m.byUser === (req.user && req.user.username);
  return m.by && m.by === (req.user && req.user.name);
}
// One MAP per Marketing Pack (CIM). Reuse the existing one if present, else create a pending record.
function ensureMapForCim(req, cim) {
  if (!cim) return null;
  const arr = loadMaps();
  const existing = arr.find(x => x.srcCimId === cim.id);
  if (existing) return existing;
  const rec = {
    id: newMapId(), srcCimId: cim.id, srcBovId: cim.srcBovId || '', srcQuestId: cim.srcQuestId || '', pending: true,
    business: cim.business || 'Business', market: cim.market || '',
    by: (req.user && req.user.name) || cim.by || '', byUser: (req.user && req.user.username) || cim.byUser || '',
    createdAt: new Date().toISOString(),
  };
  arr.push(rec); saveMaps(arr);
  return rec;
}
// Everything the system knows for a MAP: the BOV, the CIM state, the questionnaire, and the call.
function mapInputsFor(map) {
  const cim = loadCims().find(x => x.id === map.srcCimId) || null;
  const bovId = (cim && cim.srcBovId) || map.srcBovId || '';
  const bov = bovId ? loadBovs().find(x => x.id === bovId) : null;
  let questionnaire = '', call = '';
  const qid = (bov && bov.srcQuestId) || (cim && cim.srcQuestId) || map.srcQuestId || '';
  if (qid) {
    const q = loadQuests().find(x => x.id === qid);
    if (q) {
      questionnaire = questToText(q);
      const m = String(q.formId || '').match(/^qfromscr_(.+)$/);
      if (m) { const sc = loadScreens().find(x => x.id === m[1]); if (sc) call = questToText(sc); }
    }
  }
  const summary = bov ? { business: bov.business, revText: bov.revText || bovRevenueText(bov), rangeText: bov.rangeText, targetText: bov.targetText, multText: bov.multText, basis: bov.basis, sdeText: bov.sdeText, adjText: bov.adjText, date: bov.date } : null;
  return { cim, cimState: (cim && cim.state) || null, bov, bovState: (bov && bov.state) || null, summary, questionnaire, call };
}
app.get('/api/maps', (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadMaps().slice().reverse().filter(m => isAdmin || ownsMap(req, m));
  res.json({ ok: true, isAdmin: !!isAdmin, maps: list.map(m => ({ id: m.id, business: m.business, market: m.market || '', pending: !!m.pending, srcCimId: m.srcCimId || '', srcBovId: m.srcBovId || '', by: m.by, byUser: m.byUser, createdAt: m.createdAt, builtAt: m.builtAt || '' })) });
});
app.get('/api/map/:id', (req, res) => {
  const m = loadMaps().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Market Attack Plan not found.' });
  if (!ownsMap(req, m)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, map: m });
});
app.delete('/api/map/:id', (req, res) => {
  const arr = loadMaps();
  const m = arr.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsMap(req, m)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  saveMaps(arr.filter(x => x.id !== m.id));
  res.json({ ok: true });
});
// Advance a Marketing Pack to a Market Attack Plan — ensure one exists, return its id.
app.post('/api/cim/:id/advance-map', (req, res) => {
  const cim = loadCims().find(x => x.id === req.params.id);
  if (!cim) return res.status(404).json({ ok: false, error: 'Marketing Pack not found.' });
  if (!ownsCim(req, cim)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  if (cim.pending) return res.status(409).json({ ok: false, error: 'Build the Marketing Pack before advancing it to a Market Attack Plan.' });
  let mapId = '';
  try { const m = ensureMapForCim(req, cim); mapId = (m && m.id) || ''; } catch (e) {}
  res.json({ ok: true, mapId });
});
// Save in-builder edits (the whole MAP state).
app.post('/api/map-save', express.json({ limit: '4mb' }), (req, res) => {
  const b = req.body || {};
  const arr = loadMaps();
  const m = arr.find(x => x.id === b.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Market Attack Plan not found.' });
  if (!ownsMap(req, m)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  if (b.state && typeof b.state === 'object') {
    m.state = b.state;
    if (m.state.header && m.state.header.business) m.business = String(m.state.header.business).slice(0, 120);
    if (m.pending) { m.pending = false; if (!m.builtAt) m.builtAt = new Date().toISOString(); }
    m.updatedAt = new Date().toISOString(); saveMaps(arr);
  }
  res.json({ ok: true });
});
// Generate the Market Attack Plan from the deal (BOV + CIM + questionnaire + call).
app.post('/api/generate-map', express.json({ limit: '8mb' }), async (req, res) => {
  try {
    const b = req.body || {};
    const arr = loadMaps();
    const m = arr.find(x => x.id === b.mapId);
    if (!m) return res.status(404).json({ ok: false, error: 'Market Attack Plan not found.' });
    if (!ownsMap(req, m)) return res.status(403).json({ ok: false, error: 'Not yours.' });
    if (m.aiGenerated && !m.pending) return res.status(409).json({ ok: false, error: 'This plan is already built. Delete it in the log to rebuild.' });
    const inp = mapInputsFor(m);
    const out = await attackgen.generateMap({
      business: m.business, bovSummary: inp.summary, bovState: inp.bovState, cimState: inp.cimState,
      questionnaire: inp.questionnaire, call: inp.call,
      preparedBy: (req.user && req.user.preparedBy) || (req.user && req.user.name) || '',
      systemPrompt: loadMapPromptCustom() || undefined,
    });
    out.state = out.state || {};
    m.business = String(out.business || m.business || 'Market Attack Plan').slice(0, 120);
    m.state = out.state; m.aiGenerated = true; m.pending = false; m.builtAt = new Date().toISOString();
    saveMaps(arr);
    res.json({ ok: true, id: m.id });
  } catch (e) {
    console.error('generate-map error:', e);
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
  removeRoomDocsBySource('bov:' + req.params.id);   // pull the financials/lease this BOV filed
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

// ---- Admin-uploaded documents (persist on the DATA_DIR disk, survive deploys) ----
const DOCS_DIR = path.join(BOV_DATA_DIR, 'documents');
const DOCS_FILE = path.join(BOV_DATA_DIR, 'documents.json');
function loadDocs() { try { return JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveDocs(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(DOCS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newDocId() { return 'doc_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); }
function prettyName(f) { return String(f || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

app.get('/api/agreements', (_req, res) => {
  const pretty = f => f.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let list = [];
  try {
    const dir = path.join(__dirname, 'public', 'agreements');
    if (fs.existsSync(dir)) {
      list = fs.readdirSync(dir).filter(f => /\.(pdf|docx?|png|jpe?g)$/i.test(f))
        .map(f => ({ name: pretty(f), file: 'agreements/' + f, type: (f.split('.').pop() || '').toUpperCase(), updated: fs.statSync(path.join(dir, f)).mtimeMs }));
    }
  } catch (e) { console.error('agreements folder list error:', e); }
  // Merge in admin-uploaded documents (from the persistent disk).
  try {
    loadDocs().forEach(d => {
      let updated = Date.parse(d.uploadedAt) || 0;
      try { updated = fs.statSync(path.join(DOCS_DIR, d.id + '.' + d.ext)).mtimeMs; } catch (e) {}
      list.push({ id: d.id, name: d.title || prettyName(d.originalName), file: 'doc/' + d.id + '.' + d.ext, type: d.type || ((d.category || 'Document') + ' · ' + String(d.ext).toUpperCase()), updated });
    });
  } catch (e) { console.error('agreements uploaded list error:', e); }
  list.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ ok: true, agreements: list });
});

// List uploaded documents (admin manager).
app.get('/api/admin/documents', requireAdmin, (req, res) => res.json({ ok: true, documents: loadDocs() }));

// Upload a document (base64 JSON so no multipart dependency). Stored on DATA_DIR.
app.post('/api/admin/upload-doc', requireAdmin, express.json({ limit: '40mb' }), (req, res) => {
  const b = req.body || {};
  const orig = String(b.filename || '').trim();
  const m = orig.match(/\.([a-z0-9]+)$/i); const ext = m ? m[1].toLowerCase() : '';
  if (!/^(pdf|docx?|png|jpe?g)$/i.test(ext)) return res.status(400).json({ ok: false, error: 'Only PDF, Word, PNG or JPG files are allowed.' });
  const data = String(b.dataB64 || ''); if (!data) return res.status(400).json({ ok: false, error: 'No file data received.' });
  let buf; try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Could not read the file data.' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'The file appears to be empty.' });
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large (max 20 MB).' });
  const category = (['Agreement', 'Document', 'Training'].indexOf(b.category) >= 0) ? b.category : 'Document';
  const title = String(b.title || '').trim().slice(0, 120) || prettyName(orig);
  try { if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true }); } catch (e) { return res.status(500).json({ ok: false, error: 'Could not create the documents folder.' }); }
  const id = newDocId();
  try { fs.writeFileSync(path.join(DOCS_DIR, id + '.' + ext), buf); } catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the file.' }); }
  const docs = loadDocs();
  docs.push({ id, title, category, ext, originalName: orig, type: category + ' · ' + ext.toUpperCase(), uploadedAt: new Date().toISOString(), by: (req.user && req.user.name) || '' });
  saveDocs(docs);
  res.json({ ok: true, documents: docs });
});

// Delete an uploaded document.
app.post('/api/admin/delete-doc', requireAdmin, express.json(), (req, res) => {
  const id = String((req.body || {}).id || '');
  const docs = loadDocs(); const d = docs.find(x => x.id === id);
  if (!d) return res.status(404).json({ ok: false, error: 'Document not found.' });
  try { fs.unlinkSync(path.join(DOCS_DIR, d.id + '.' + d.ext)); } catch (e) {}
  saveDocs(docs.filter(x => x.id !== id));
  res.json({ ok: true, documents: loadDocs() });
});

// ---- Brand logo (org-wide, admin-managed) ----
app.get('/api/brand', (req, res) => { const b = loadBrand(); res.json({ ok: true, hasLogo: !!b.logoExt, logoUrl: b.logoExt ? ('/api/brand/logo?v=' + encodeURIComponent(b.updatedAt || '')) : '', updatedAt: b.updatedAt || '' }); });
app.get('/api/brand/logo', (req, res) => {
  const b = loadBrand(); if (!b.logoExt) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(BOV_DATA_DIR, 'brand_logo.' + b.logoExt)); res.set('Content-Type', b.logoType || LOGO_MIME[b.logoExt] || 'image/png'); res.set('Cache-Control', 'public, max-age=300'); res.send(buf); }
  catch (e) { res.status(404).end(); }
});
app.post('/api/admin/logo', requireAdmin, express.json({ limit: '8mb' }), (req, res) => {
  const b = req.body || {};
  const orig = String(b.filename || '').trim();
  let m = orig.match(/\.([a-z0-9]+)$/i); let ext = m ? m[1].toLowerCase() : '';
  if (ext === 'jpeg') ext = 'jpg';
  if (!LOGO_EXT.test(ext)) return res.status(400).json({ ok: false, error: 'Use a PNG, JPG, SVG, GIF, or WEBP image.' });
  const data = String(b.dataB64 || ''); if (!data) return res.status(400).json({ ok: false, error: 'No image data received.' });
  let buf; try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Could not read the image.' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'The image appears to be empty.' });
  if (buf.length > 4 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image too large (max 4 MB).' });
  try {
    if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true });
    const old = loadBrand(); if (old.logoExt && old.logoExt !== ext) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_logo.' + old.logoExt)); } catch (e) {} }
    fs.writeFileSync(path.join(BOV_DATA_DIR, 'brand_logo.' + ext), buf);
  } catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the logo.' }); }
  const now = new Date().toISOString();
  saveBrand({ logoExt: ext, logoType: LOGO_MIME[ext] || 'image/png', updatedAt: now, by: (req.user && req.user.name) || '' });
  res.json({ ok: true, hasLogo: true, logoUrl: '/api/brand/logo?v=' + encodeURIComponent(now) });
});
app.post('/api/admin/logo/clear', requireAdmin, (req, res) => {
  const b = loadBrand(); if (b.logoExt) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_logo.' + b.logoExt)); } catch (e) {} }
  saveBrand({});
  res.json({ ok: true, hasLogo: false });
});

// Serve an uploaded document (login-gated by the auth middleware above).
app.get('/doc/:name', (req, res) => {
  const name = String(req.params.name || '');
  if (!/^doc_[a-z0-9]+\.(pdf|docx?|png|jpe?g)$/i.test(name)) return res.status(404).end();
  const fp = path.join(DOCS_DIR, name);
  if (!fp.startsWith(DOCS_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  res.sendFile(fp);
});

// ================= Deal Data Rooms =================
// One room per deal (Marketing Pack). Files live on the persistent disk; a buyer
// reaches the room through an unguessable share link. Not Fort Knox — practical.
const ROOMS_FILE = path.join(BOV_DATA_DIR, 'rooms.json');
const ROOMS_DIR = path.join(BOV_DATA_DIR, 'rooms');
function loadRooms() { try { return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveRooms(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(ROOMS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newRoomId() { return 'room_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function newRoomDocId() { return 'rd_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); }
function newRoomToken() { try { return crypto.randomBytes(16).toString('hex'); } catch (e) { return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 28); } }
const ROOM_CATEGORIES = ['Financials', 'Tax Returns', 'Lease', 'Equipment & FF&E', 'Licenses & Permits', 'Legal & Corporate', 'Menus & Marketing', 'Other'];
const ROOM_EXT = /^(pdf|docx?|xlsx?|csv|pptx?|png|jpe?g|gif|txt)$/i;
// ---- Buyer access control: per-buyer codes + a 15-min idle session ----
const ROOM_COOKIE = 'rrg_room';
const ROOM_IDLE_MS = 15 * 60 * 1000;
const ROOM_KEYFILE = path.join(BOV_DATA_DIR, 'room.key');
function roomSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return fs.readFileSync(ROOM_KEYFILE, 'utf8'); }
  catch (e) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); } catch (_) {} const k = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(ROOM_KEYFILE, k); } catch (_) {} return k; }
}
function signRoomSess(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', roomSecret()).update(b).digest('base64url');
  return b + '.' + sig;
}
function readRoomSess(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [b, sig] = tok.split('.');
  let expect; try { expect = crypto.createHmac('sha256', roomSecret()).update(b).digest('base64url'); } catch (e) { return null; }
  if (!sig || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let p; try { p = JSON.parse(Buffer.from(b, 'base64url').toString()); } catch (e) { return null; }
  if (!p || !p.exp || p.exp < Date.now()) return null;
  return p;
}
function setRoomCookie(res, token) { res.append('Set-Cookie', ROOM_COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=900'); }
function newGrantId() { return 'g_' + Math.random().toString(36).slice(2, 9); }
function newGrantCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; try { const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) s += A[b[i] % A.length]; } catch (e) { for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)]; } return s; }
// The active grant for the current buyer session on this room, or null.
function roomGrantFor(req, r) {
  const sess = readRoomSess(parseCookies(req)[ROOM_COOKIE]);
  if (!sess || sess.r !== r.id) return null;
  return (r.grants || []).find(g => g.id === sess.g && g.active) || null;
}
// A room is gated once it has ever been locked (a buyer was added). Revoking every
// buyer then locks everyone OUT rather than falling back open.
function roomIsGated(r) { return !!r.locked || (r.grants || []).some(g => g.active); }
function ownsRoom(req, r) {
  if (req.user && req.user.role === 'admin') return true;
  if (r.byUser) return r.byUser === (req.user && req.user.username);
  return r.by && r.by === (req.user && req.user.name);
}
function ensureRoomForCim(req, cim) {
  if (!cim) return null;
  const arr = loadRooms();
  const existing = arr.find(x => x.srcCimId === cim.id);
  if (existing) return existing;
  const rec = {
    id: newRoomId(), srcCimId: cim.id, srcBovId: cim.srcBovId || '', token: newRoomToken(),
    business: cim.business || 'Business',
    by: (req.user && req.user.name) || cim.by || '', byUser: (req.user && req.user.username) || cim.byUser || '',
    createdAt: new Date().toISOString(), docs: [], access: [], grants: [],
  };
  arr.push(rec); saveRooms(arr);
  return rec;
}
function roomPublic(r, origin) {
  const base = (origin || '') + '/room/' + r.token;
  return { id: r.id, business: r.business, token: r.token, link: base, docCount: (r.docs || []).length, gated: roomIsGated(r), buyerCount: (r.grants || []).filter(g => g.active).length, srcCimId: r.srcCimId || '', createdAt: r.createdAt, builtAt: r.builtAt || '', by: r.by };
}
app.get('/api/rooms', (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const list = loadRooms().slice().reverse().filter(r => isAdmin || ownsRoom(req, r));
  const origin = req.protocol + '://' + req.get('host');
  res.json({ ok: true, isAdmin: !!isAdmin, rooms: list.map(r => roomPublic(r, origin)) });
});
app.get('/api/room/:id', (req, res) => {
  const r = loadRooms().find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const origin = req.protocol + '://' + req.get('host');
  res.json({ ok: true, room: { id: r.id, business: r.business, token: r.token, link: origin + '/room/' + r.token, srcCimId: r.srcCimId || '', docs: r.docs || [], access: (r.access || []).slice(-120).reverse(), categories: ROOM_CATEGORIES,
    gated: roomIsGated(r),
    grants: (r.grants || []).map(g => ({ id: g.id, name: g.name || '', email: g.email || '', code: g.code, active: g.active !== false, createdAt: g.createdAt, lastSeen: g.lastSeen || '', views: g.views || 0, downloads: g.downloads || 0 })) } });
});
// Add a buyer (grant) — generates a personal access code.
app.post('/api/room/:id/grant', express.json(), (req, res) => {
  const arr = loadRooms(); const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 120);
  if (!name && !email) return res.status(400).json({ ok: false, error: 'Add a name or email for this buyer.' });
  r.grants = r.grants || [];
  r.locked = true;   // adding a buyer locks the room — a code is now required
  const g = { id: newGrantId(), name, email, code: newGrantCode(), active: true, createdAt: new Date().toISOString(), lastSeen: '', views: 0, downloads: 0, by: (req.user && req.user.name) || '' };
  r.grants.push(g); saveRooms(arr);
  res.json({ ok: true, grants: r.grants, gated: true });
});
// Revoke / reactivate a buyer's access.
app.post('/api/room/:id/grant-toggle', express.json(), (req, res) => {
  const arr = loadRooms(); const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const g = (r.grants || []).find(x => x.id === String((req.body || {}).grantId || ''));
  if (!g) return res.status(404).json({ ok: false, error: 'Buyer not found.' });
  g.active = !g.active; saveRooms(arr);
  res.json({ ok: true, grants: r.grants });
});
// Create a standalone data room (not tied to a Marketing Pack).
app.post('/api/room/new', express.json(), (req, res) => {
  const b = req.body || {};
  const rec = {
    id: newRoomId(), srcCimId: '', srcBovId: '', token: newRoomToken(),
    business: String(b.business || 'Data Room').slice(0, 120),
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
    createdAt: new Date().toISOString(), docs: [], access: [], grants: [],
  };
  const arr = loadRooms(); arr.push(rec); saveRooms(arr);
  res.json({ ok: true, id: rec.id });
});
// Ensure (auto-create) the data room for a deal, from the Marketing Pack.
app.post('/api/cim/:id/room', (req, res) => {
  const cim = loadCims().find(x => x.id === req.params.id);
  if (!cim) return res.status(404).json({ ok: false, error: 'Marketing Pack not found.' });
  if (!ownsCim(req, cim)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  let id = '';
  try { const r = ensureRoomForCim(req, cim); id = (r && r.id) || ''; } catch (e) {}
  res.json({ ok: true, roomId: id });
});
// Upload a document into a room.
app.post('/api/room-upload', express.json({ limit: '40mb' }), (req, res) => {
  const b = req.body || {};
  const arr = loadRooms();
  const r = arr.find(x => x.id === b.roomId);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const orig = String(b.filename || '').trim();
  const m = orig.match(/\.([a-z0-9]+)$/i); const ext = m ? m[1].toLowerCase() : '';
  if (!ROOM_EXT.test(ext)) return res.status(400).json({ ok: false, error: 'That file type isn\'t supported. Use PDF, Word, Excel, CSV, PowerPoint, an image, or text.' });
  const data = String(b.dataB64 || ''); if (!data) return res.status(400).json({ ok: false, error: 'No file data received.' });
  let buf; try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Could not read the file data.' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'The file appears to be empty.' });
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large (max 20 MB).' });
  const category = (ROOM_CATEGORIES.indexOf(b.category) >= 0) ? b.category : 'Other';
  const title = String(b.title || '').trim().slice(0, 140) || prettyName(orig);
  try { if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true }); } catch (e) { return res.status(500).json({ ok: false, error: 'Could not create the rooms folder.' }); }
  const id = newRoomDocId();
  try { fs.writeFileSync(path.join(ROOMS_DIR, id + '.' + ext), buf); } catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the file.' }); }
  r.docs = r.docs || [];
  r.docs.push({ id, title, category, ext, originalName: orig, size: buf.length, uploadedAt: new Date().toISOString(), by: (req.user && req.user.name) || '' });
  if (!r.builtAt) r.builtAt = new Date().toISOString();
  saveRooms(arr);
  res.json({ ok: true, docs: r.docs });
});
app.post('/api/room/:id/delete-doc', express.json(), (req, res) => {
  const arr = loadRooms();
  const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const did = String((req.body || {}).id || '');
  const d = (r.docs || []).find(x => x.id === did);
  if (d) { try { fs.unlinkSync(path.join(ROOMS_DIR, d.id + '.' + d.ext)); } catch (e) {} }
  r.docs = (r.docs || []).filter(x => x.id !== did);
  saveRooms(arr);
  res.json({ ok: true, docs: r.docs });
});
app.delete('/api/room/:id', (req, res) => {
  const arr = loadRooms();
  const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  (r.docs || []).forEach(d => { try { fs.unlinkSync(path.join(ROOMS_DIR, d.id + '.' + d.ext)); } catch (e) {} });
  saveRooms(arr.filter(x => x.id !== r.id));
  res.json({ ok: true });
});
// Regenerate the share link (invalidates the old one).
app.post('/api/room/:id/newlink', (req, res) => {
  const arr = loadRooms();
  const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  r.token = newRoomToken(); saveRooms(arr);
  const origin = req.protocol + '://' + req.get('host');
  res.json({ ok: true, token: r.token, link: origin + '/room/' + r.token });
});
function logRoomAccess(r, req, event, doc, grant) {
  try {
    r.access = r.access || [];
    const entry = { at: new Date().toISOString(), ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim(), event: event, doc: doc || '' };
    if (grant) { entry.grantId = grant.id; entry.who = grant.name || grant.email || ''; if (event === 'download') grant.downloads = (grant.downloads || 0) + 1; if (event === 'view') grant.views = (grant.views || 0) + 1; }
    r.access.push(entry);
    if (r.access.length > 1000) r.access = r.access.slice(-1000);
  } catch (e) {}
}
// PUBLIC buyer-facing room page — gated by a personal access code once buyers are added.
app.get('/room/:token', (req, res) => {
  const arr = loadRooms();
  const r = arr.find(x => x.token === req.params.token);
  if (!r) return res.status(404).set('Content-Type', 'text/html').send(roomNotFoundPage());
  if (roomIsGated(r)) {
    const grant = roomGrantFor(req, r);
    if (!grant) return res.set('Content-Type', 'text/html; charset=utf-8').send(roomGatePage(r, ''));
    grant.lastSeen = new Date().toISOString();
    setRoomCookie(res, signRoomSess({ r: r.id, g: grant.id, exp: Date.now() + ROOM_IDLE_MS }));
    logRoomAccess(r, req, 'view', '', grant); saveRooms(arr);
    return res.set('Content-Type', 'text/html; charset=utf-8').send(roomPublicPage(r, grant));
  }
  logRoomAccess(r, req, 'view', '', null); saveRooms(arr);
  res.set('Content-Type', 'text/html; charset=utf-8').send(roomPublicPage(r, null));
});
// Buyer enters their access code.
app.post('/room/:token/enter', (req, res) => {
  const arr = loadRooms();
  const r = arr.find(x => x.token === req.params.token);
  if (!r) return res.status(404).set('Content-Type', 'text/html').send(roomNotFoundPage());
  const code = String((req.body && req.body.code) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const grant = (r.grants || []).find(g => g.active && String(g.code).toUpperCase() === code);
  if (!grant) return res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(roomGatePage(r, 'That code isn’t valid. Check it and try again, or contact your RRG representative.'));
  grant.lastSeen = new Date().toISOString(); logRoomAccess(r, req, 'signin', '', grant); saveRooms(arr);
  setRoomCookie(res, signRoomSess({ r: r.id, g: grant.id, exp: Date.now() + ROOM_IDLE_MS }));
  res.redirect('/room/' + r.token);
});
// PUBLIC file download from a room (gated when buyers are added).
app.get('/roomfile/:token/:docid', (req, res) => {
  const arr = loadRooms();
  const r = arr.find(x => x.token === req.params.token);
  if (!r) return res.status(404).end();
  let grant = null;
  if (roomIsGated(r)) { grant = roomGrantFor(req, r); if (!grant) return res.redirect('/room/' + r.token); }
  const d = (r.docs || []).find(x => x.id === String(req.params.docid));
  if (!d) return res.status(404).end();
  const fp = path.join(ROOMS_DIR, d.id + '.' + d.ext);
  if (!fp.startsWith(ROOMS_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  if (grant) { grant.lastSeen = new Date().toISOString(); setRoomCookie(res, signRoomSess({ r: r.id, g: grant.id, exp: Date.now() + ROOM_IDLE_MS })); }
  logRoomAccess(r, req, 'download', d.title || d.originalName, grant); saveRooms(arr);
  res.setHeader('Content-Disposition', 'inline; filename="' + String(d.title || d.originalName || d.id).replace(/[^\w.\- ]+/g, '_') + '.' + d.ext + '"');
  res.sendFile(fp);
});
function fmtBytes(n) { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
function roomShell(title, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--navy:#000E31;--red:#DA2B1F;--ink:#1a2236;--muted:#6b7488;--line:#e6e9f0;--wash:#f5f7fb;}
*{box-sizing:border-box;} html,body{margin:0;padding:0;background:#eef1f6;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;}
.top{color:#fff;padding:28px 0 30px;background:radial-gradient(95% 130% at 28% 15%,#1c2e5c 0%,#112044 42%,#0b1636 70%,#071029 100%);}
.in{max-width:820px;margin:0 auto;padding:0 24px;}
.brand{display:inline-flex;align-items:center;} .disc{background:var(--red);color:#fff;border-radius:50%;width:40px;height:40px;font:900 13px 'Arial Black',Arial,sans-serif;display:flex;align-items:center;justify-content:center;letter-spacing:-.04em;}
.bar{background:#fff;width:3px;height:28px;margin:0 12px;} .wm{font-weight:800;font-size:13px;text-transform:uppercase;line-height:.95;color:#fff;}
.kick{margin:20px 0 4px;color:var(--red);font-weight:700;letter-spacing:.28em;font-size:11px;text-transform:uppercase;}
h1{font-size:26px;font-weight:800;margin:0;color:#fff;}
.sub{color:#aeb8cf;font-size:13px;margin-top:6px;}
.wrap{max-width:820px;margin:22px auto;padding:0 24px 60px;}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 6px 24px rgba(10,20,50,.06);overflow:hidden;margin-bottom:14px;}
.chd{padding:13px 20px;border-bottom:1px solid var(--line);font-weight:800;color:var(--navy);font-size:13px;display:flex;align-items:center;gap:8px;}
.chd .n{margin-left:auto;color:var(--muted);font-weight:600;font-size:11.5px;}
.docrow{display:flex;align-items:center;gap:12px;padding:11px 20px;border-top:1px solid #f0f2f7;text-decoration:none;color:inherit;}
.docrow:first-child{border-top:none;} .docrow:hover{background:#fbfcfe;}
.ext{flex:0 0 44px;height:30px;border-radius:6px;background:var(--wash);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;color:var(--navy);text-transform:uppercase;}
.dt{flex:1;font-weight:600;color:var(--navy);font-size:13.5px;} .dm{color:var(--muted);font-size:11px;margin-top:1px;}
.dl{border:1px solid var(--navy);background:var(--navy);color:#fff;border-radius:7px;padding:6px 13px;font-size:12px;font-weight:700;white-space:nowrap;}
.note{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px;color:var(--muted);font-size:12.5px;line-height:1.6;}
.empty{text-align:center;color:var(--muted);padding:46px 20px;}
.foot{max-width:820px;margin:0 auto;padding:0 24px 40px;color:var(--muted);font-size:11px;line-height:1.6;}
</style></head><body>
<div class="top"><div class="in"><span class="brand"><span class="disc">RRG</span><span class="bar"></span><span class="wm">Restaurant<br>Realty<br>Group</span></span>
${inner.head}</div></div>
<div class="wrap">${inner.body}</div>
<div class="foot">Confidential &amp; proprietary. Access to this data room is provided under a non-disclosure agreement to a qualified, identified party for the sole purpose of evaluating a potential acquisition. Do not copy, forward, or distribute. All inquiries route exclusively through Restaurant Realty Group, LLC · rrgcre.com</div>
</body></html>`;
}
function roomPublicPage(r, grant) {
  const docs = (r.docs || []);
  const who = grant ? `<div class="sub" style="margin-top:8px;color:#cdd6ea">Signed in as ${esc(grant.name || grant.email)} · session ends after 15 min idle</div>` : '';
  const head = `<div class="kick">Confidential Data Room</div><h1>${esc(r.business || 'Confidential Opportunity')}</h1><div class="sub">${docs.length} document${docs.length === 1 ? '' : 's'} · Provided by Restaurant Realty Group under NDA</div>${who}`;
  let body;
  if (!docs.length) {
    body = '<div class="card"><div class="empty"><b>Documents are being prepared.</b><br>Your RRG contact will let you know as materials are added.</div></div>';
  } else {
    body = ROOM_CATEGORIES.map(cat => {
      const inCat = docs.filter(d => (d.category || 'Other') === cat);
      if (!inCat.length) return '';
      return `<div class="card"><div class="chd">${esc(cat)}<span class="n">${inCat.length}</span></div>` +
        inCat.map(d => `<a class="docrow" href="/roomfile/${esc(r.token)}/${esc(d.id)}" target="_blank" rel="noopener"><span class="ext">${esc(d.ext)}</span><div style="flex:1"><div class="dt">${esc(d.title || d.originalName)}</div><div class="dm">${esc(fmtBytes(d.size))}</div></div><span class="dl">Open →</span></a>`).join('') +
        `</div>`;
    }).join('');
  }
  return roomShell('RRG Data Room — ' + (r.business || 'Confidential'), { head, body });
}
function roomNotFoundPage() {
  return roomShell('RRG Data Room', { head: '<div class="kick">Data Room</div><h1>Link not found</h1><div class="sub">This data room link is invalid or has been retired.</div>', body: '<div class="note">The link you followed is no longer active. Please contact your RRG representative for an updated link.</div>' });
}
// ================= Assignments (the deal / book of business) =================
// An assignment is one deal. It is derived by grouping every pipeline record
// (call, questionnaire, BOV, pack, attack plan, data room, lease) that resolves
// to the same root, plus an editable overlay (status, notes, owner) persisted here.
const ASSIGN_FILE = path.join(BOV_DATA_DIR, 'assignments.json');
function loadAssignOverlay() { try { return JSON.parse(fs.readFileSync(ASSIGN_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function saveAssignOverlay(o) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(ASSIGN_FILE, JSON.stringify(o, null, 2)); } catch (e) {} }
const ASSIGN_STATUSES = ['New', 'Active', 'Under Contract', 'Closed', 'On Hold', 'Lost'];
const OFFER_TYPES = ['IOI', 'LOI'];
const OFFER_STATUSES = ['Received', 'Under review', 'Countered', 'Accepted', 'Rejected', 'Withdrawn'];
const OFFER_RATINGS = ['Strong', 'Good', 'Fair', 'Weak'];   // the rep's own 1-of-4 gut rating
const TOUR_INTEREST = ['Hot', 'Warm', 'Cool', 'Passed'];    // buyer's read after a location tour
function newTourId() { return 'tur_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function applyTourFields(t, b) {
  if (typeof b.party === 'string') t.party = b.party.slice(0, 160);
  if (typeof b.date === 'string') t.date = b.date.slice(0, 20);
  if (typeof b.attendees === 'string') t.attendees = b.attendees.slice(0, 300);
  if (typeof b.host === 'string') t.host = b.host.slice(0, 120);
  if (typeof b.interest === 'string') t.interest = TOUR_INTEREST.indexOf(b.interest) >= 0 ? b.interest : '';
  if (typeof b.notes === 'string') t.notes = b.notes.slice(0, 4000);
}
const NDA_METHODS = ['DocuSign', 'Email', 'Paper', 'Other'];
const NDA_STATUSES = ['Sent', 'Received', 'Countersigned', 'Expired'];
function newNdaId() { return 'nda_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function applyNdaFields(n, b) {
  if (typeof b.party === 'string') n.party = b.party.slice(0, 160);
  if (typeof b.date === 'string') n.date = b.date.slice(0, 20);
  if (typeof b.method === 'string') n.method = NDA_METHODS.indexOf(b.method) >= 0 ? b.method : 'DocuSign';
  if (typeof b.status === 'string') n.status = NDA_STATUSES.indexOf(b.status) >= 0 ? b.status : 'Received';
  if (typeof b.notes === 'string') n.notes = b.notes.slice(0, 4000);
}
// ---- Data-room auto-filing helpers (deals) ----
// The data room that belongs to a deal (by the deal's own roomId, else its srcDealId link).
function roomForDeal(deal) {
  if (!deal) return null;
  const rooms = loadRooms();
  return (deal.roomId && rooms.find(r => r.id === deal.roomId)) || rooms.find(r => r.srcDealId === deal.id) || null;
}
function ensureRoomForDeal(req, deal) {
  if (!deal) return null;
  const existing = roomForDeal(deal);
  if (existing) return existing;
  const arr = loadRooms();
  const rec = {
    id: newRoomId(), srcDealId: deal.id, srcCimId: '', srcBovId: '', token: newRoomToken(),
    business: deal.business || 'Data Room',
    by: (req && req.user && req.user.name) || deal.by || '', byUser: (req && req.user && req.user.username) || deal.byUser || '',
    createdAt: new Date().toISOString(), docs: [], access: [], grants: [],
  };
  arr.push(rec); saveRooms(arr);
  return rec;
}
// Map a BOV upload label to a room category.
function categoryForUploadLabel(label) {
  const l = String(label || '').toLowerCase();
  if (/lease/.test(l)) return 'Lease';
  if (/tax/.test(l)) return 'Tax Returns';
  if (/financ|p&l|profit|balance|income|statement/.test(l)) return 'Financials';
  if (/menu|market|photo|image|press/.test(l)) return 'Menus & Marketing';
  if (/licen|permit/.test(l)) return 'Licenses & Permits';
  if (/legal|corp|entity|operating agreement/.test(l)) return 'Legal & Corporate';
  if (/equip|ffe|ff&e|asset list/.test(l)) return 'Equipment & FF&E';
  return 'Other';
}
// Write one uploaded file into a room, tagged by source (so it can be cascade-removed).
// file = { name, dataB64, text, type, label }. Returns the doc or null (skips text/dupes).
function addFileToRoom(room, file, opts) {
  try {
    opts = opts || {};
    if (!room || !file) return null;
    const orig = String(file.name || file.filename || '').trim();
    const m = orig.match(/\.([a-z0-9]+)$/i); let ext = m ? m[1].toLowerCase() : '';
    let buf = null;
    if (file.dataB64) { buf = Buffer.from(String(file.dataB64), 'base64'); }
    else if (typeof file.text === 'string' && file.text) { buf = Buffer.from(file.text, 'utf8'); if (!ext) ext = 'txt'; }
    if (!buf || !buf.length) return null;
    if (!ROOM_EXT.test(ext)) return null;
    if (buf.length > 20 * 1024 * 1024) return null;
    room.docs = room.docs || [];
    const source = opts.source || '';
    const category = opts.category || categoryForUploadLabel(file.label);
    const title = String(opts.title || file.label || prettyName(orig) || 'Document').slice(0, 140);
    // idempotent: skip if the same source already filed a file with this original name
    if (source && room.docs.some(d => d.source === source && d.originalName === orig)) return null;
    try { if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true }); } catch (e) { return null; }
    const id = newRoomDocId();
    try { fs.writeFileSync(path.join(ROOMS_DIR, id + '.' + ext), buf); } catch (e) { return null; }
    const doc = { id, title, category, ext, originalName: orig, size: buf.length, uploadedAt: new Date().toISOString(), by: (opts.by || ''), source, auto: true };
    room.docs.push(doc);
    if (!room.builtAt) room.builtAt = new Date().toISOString();
    return doc;
  } catch (e) { return null; }
}
// Remove every room doc contributed by a given source id (e.g. 'bov:ID' or 'cim:ID').
function removeRoomDocsBySource(source) {
  if (!source) return 0;
  const arr = loadRooms(); let n = 0, touched = false;
  arr.forEach(r => {
    const keep = [];
    (r.docs || []).forEach(d => {
      if (d.source === source) { try { fs.unlinkSync(path.join(ROOMS_DIR, d.id + '.' + d.ext)); } catch (e) {} n++; touched = true; }
      else keep.push(d);
    });
    r.docs = keep;
  });
  if (touched) saveRooms(arr);
  return n;
}
function newOfferId() { return 'ofr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
// Apply only the fields present in the body, so a status-only action (Accept/Counter/
// Reject) never wipes the buyer, amount, or terms.
function applyOfferFields(o, b) {
  if (typeof b.type === 'string' && OFFER_TYPES.indexOf(b.type) >= 0) o.type = b.type;
  if (typeof b.buyer === 'string') o.buyer = b.buyer.slice(0, 160);
  if (typeof b.amount === 'string') o.amount = b.amount.slice(0, 40);
  if (typeof b.received === 'string') o.received = b.received.slice(0, 20);
  if (typeof b.status === 'string' && OFFER_STATUSES.indexOf(b.status) >= 0) o.status = b.status;
  if (typeof b.rating === 'string') o.rating = OFFER_RATINGS.indexOf(b.rating) >= 0 ? b.rating : '';
  if (typeof b.terms === 'string') o.terms = b.terms.slice(0, 4000);
  if (b.counter && typeof b.counter === 'object') {
    o.counter = { amount: String(b.counter.amount || '').slice(0, 40), terms: String(b.counter.terms || '').slice(0, 2000), at: new Date().toISOString() };
  }
}
function assignmentsIndex() {
  const screens = loadScreens(), quests = loadQuests(), bovs = loadBovs(), cims = loadCims(), maps = loadMaps(), rooms = loadRooms(), leases = loadLeases(), dealRecs = loadDeals();
  const questById = {}, bovById = {}, cimById = {}, dealById = {};
  quests.forEach(q => questById[q.id] = q); bovs.forEach(b => bovById[b.id] = b); cims.forEach(c => cimById[c.id] = c); dealRecs.forEach(d => dealById[d.id] = d);
  const questByScreen = {};
  quests.forEach(q => { const m = String(q.formId || '').match(/^qfromscr_(.+)$/); if (m) questByScreen[m[1]] = q.id; });
  function dealKeyOf(deal) { return deal.screenId ? ('s_' + deal.screenId) : ('d_' + deal.id); }
  function questIdOf(rec, type) {
    if (type === 'quest') return rec.id;
    if (type === 'screen') return questByScreen[rec.id] || null;
    if (type === 'bov') return rec.srcQuestId || null;
    if (type === 'cim') return rec.srcQuestId || (bovById[rec.srcBovId] && bovById[rec.srcBovId].srcQuestId) || null;
    if (type === 'map') return rec.srcQuestId || (cimById[rec.srcCimId] && cimById[rec.srcCimId].srcQuestId) || (bovById[rec.srcBovId] && bovById[rec.srcBovId].srcQuestId) || null;
    if (type === 'room') { const c = cimById[rec.srcCimId]; return (c && c.srcQuestId) || (bovById[rec.srcBovId] && bovById[rec.srcBovId].srcQuestId) || null; }
    if (type === 'lease') return rec.srcQuestId || (bovById[rec.srcBovId] && bovById[rec.srcBovId].srcQuestId) || null;
    return null;
  }
  function screenIdFor(qid) { if (!qid) return null; const q = questById[qid]; if (!q) return null; const m = String(q.formId || '').match(/^qfromscr_(.+)$/); return m ? m[1] : null; }
  function keyOf(rec, type) {
    if (type === 'deal') return dealKeyOf(rec);
    // A room pre-created for a deal follows that deal's key (so it merges once started).
    if (type === 'room' && rec.srcDealId && dealById[rec.srcDealId]) return dealKeyOf(dealById[rec.srcDealId]);
    const qid = questIdOf(rec, type);
    const sid = (type === 'screen') ? rec.id : screenIdFor(qid);
    if (sid) return 's_' + sid;
    if (qid) return 'q_' + qid;
    return type + '_' + rec.id;
  }
  const deals = {};
  function slot(rec, type) {
    const key = keyOf(rec, type);
    if (!deals[key]) deals[key] = { key, deal: null, screen: null, quest: null, bov: null, cim: null, map: null, room: null, lease: null };
    // keep the most-complete/newest of each type
    const cur = deals[key][type];
    if (!cur || String(rec.builtAt || rec.createdAt || '') > String(cur.builtAt || cur.createdAt || '')) deals[key][type] = rec;
  }
  dealRecs.forEach(d => slot(d, 'deal'));
  screens.forEach(s => slot(s, 'screen'));
  quests.forEach(q => slot(q, 'quest'));
  bovs.forEach(b => slot(b, 'bov'));
  cims.forEach(c => slot(c, 'cim'));
  maps.forEach(m => slot(m, 'map'));
  rooms.forEach(r => slot(r, 'room'));
  leases.forEach(l => slot(l, 'lease'));
  return deals;
}
function assignmentView(d, overlay) {
  const o = overlay[d.key] || {};
  const deal = d.deal || null;
  const pick = (f) => (deal && deal[f]) || (d.quest && d.quest[f]) || (d.bov && d.bov[f]) || (d.cim && d.cim[f]) || (d.map && d.map[f]) || (d.screen && d.screen[f]) || (d.lease && d.lease[f]) || (d.room && d.room[f]) || '';
  const business = o.businessOverride || pick('business') || 'Untitled';
  const market = pick('market') || '';
  const contact = (d.screen && d.screen.contact) || (deal && deal.contact) || '';
  const anchor = deal || d.screen || d.quest || d.bov || d.cim || d.map || d.lease || d.room || {};
  const by = anchor.by || '', byUser = anchor.byUser || '';
  const bov = d.bov || null, cim = d.cim || null, map = d.map || null, room = d.room || null, lease = d.lease || null;
  const stages = {
    call: d.screen ? { done: true, id: d.screen.id, meta: d.screen.decision || d.screen.statusText || '' } : null,
    questionnaire: d.quest ? { done: !!d.quest.completed, id: d.quest.id, pct: (typeof d.quest.completePct === 'number' ? d.quest.completePct : (d.quest.completed ? 100 : 0)) } : null,
    bov: bov ? { done: !bov.pending, id: bov.id, value: bov.rangeText || '', target: bov.targetText || '', basis: bov.basis || '' } : null,
    pack: cim ? { done: !cim.pending, id: cim.id } : null,
    attack: map ? { done: !map.pending, id: map.id } : null,
    room: room ? { done: (room.docs || []).length > 0, id: room.id, docs: (room.docs || []).length, gated: roomIsGated(room) } : null,
    lease: lease ? { done: !lease.pending, id: lease.id } : null,
  };
  const times = [deal, d.screen, d.quest, d.bov, d.cim, d.map, d.room, d.lease].filter(Boolean).map(r => r.builtAt || r.updatedAt || r.createdAt || '').filter(Boolean);
  const lastActivity = times.sort().slice(-1)[0] || '';
  const created = [deal, d.screen, d.quest, d.bov, d.cim, d.map, d.room, d.lease].filter(Boolean).map(r => r.createdAt || '').filter(Boolean).sort()[0] || '';
  return {
    key: d.key, business, market, contact, by, byUser,
    dealId: deal ? deal.id : '', started: !!d.screen, canStart: !!(deal && !d.screen),
    clientPersonId: deal ? (deal.contactPersonId || '') : '',
    companyId: deal ? (deal.companyId || '') : '', company: (deal && deal.companyId && companyById(deal.companyId)) ? companyBrief(companyById(deal.companyId)) : null,
    roomId: (room && room.id) || (deal && deal.roomId) || '',
    status: o.status || 'New', notes: o.notes || '', owner: o.owner || by, businessOverride: o.businessOverride || '',
    offers: Array.isArray(o.offers) ? o.offers : [],
    tours: Array.isArray(o.tours) ? o.tours : [],
    ndas: Array.isArray(o.ndas) ? o.ndas : [],
    value: (bov && (bov.targetText || bov.rangeText)) || '', basis: (bov && bov.basis) || '',
    stages, lastActivity, createdAt: created,
  };
}
function ownsAssignment(req, d) {
  if (req.user && req.user.role === 'admin') return true;
  const u = req.user && req.user.username;
  return [d.deal, d.screen, d.quest, d.bov, d.cim, d.map, d.room, d.lease].filter(Boolean).some(r => r.byUser === u);
}
// Data-room access, shaped for the deal file: everyone granted access with their
// tallies, plus the full event log so the UI can drill into what each person did.
function roomActivityFor(d, origin) {
  const r = d.room;
  if (!r) return null;
  const events = (r.access || []).map(e => ({
    at: e.at || '', event: e.event || 'view', doc: e.doc || '',
    who: e.who || '', grantId: e.grantId || '', ip: e.ip || '',
  })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const people = (r.grants || []).map(g => ({
    id: g.id, name: g.name || '', email: g.email || '', active: g.active !== false,
    createdAt: g.createdAt || '', lastSeen: g.lastSeen || '',
    views: g.views || 0, downloads: g.downloads || 0,
  }));
  return {
    id: r.id, business: r.business || '', token: r.token || '',
    link: origin ? (origin + '/room/' + r.token) : '',
    gated: roomIsGated(r), docCount: (r.docs || []).length,
    people, events, buyerCount: people.filter(p => p.active).length,
  };
}
app.get('/api/assignments', (req, res) => {
  const deals = assignmentsIndex(), overlay = loadAssignOverlay();
  const isAdmin = req.user && req.user.role === 'admin';
  const list = Object.values(deals).filter(d => isAdmin || ownsAssignment(req, d)).map(d => assignmentView(d, overlay));
  list.sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
  res.json({ ok: true, isAdmin: !!isAdmin, statuses: ASSIGN_STATUSES, assignments: list });
});
app.get('/api/assignment/:key', (req, res) => {
  const deals = assignmentsIndex(), overlay = loadAssignOverlay();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const origin = req.protocol + '://' + req.get('host');
  res.json({ ok: true, statuses: ASSIGN_STATUSES, assignment: assignmentView(d, overlay), roomActivity: roomActivityFor(d, origin) });
});
app.post('/api/assignment/:key/save', express.json(), (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const b = req.body || {}, cur = overlay[d.key] || {};
  if (typeof b.status === 'string' && ASSIGN_STATUSES.indexOf(b.status) >= 0) cur.status = b.status;
  if (typeof b.notes === 'string') cur.notes = b.notes.slice(0, 8000);
  if (typeof b.owner === 'string') cur.owner = b.owner.slice(0, 120);
  if (typeof b.businessOverride === 'string') cur.businessOverride = b.businessOverride.slice(0, 120);
  cur.updatedAt = new Date().toISOString();
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true });
});
// Record or update an LOI / IOI received on this assignment.
app.post('/api/assignment/:key/offer', express.json(), (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const offers = Array.isArray(cur.offers) ? cur.offers : [];
  const b = req.body || {};
  const now = new Date().toISOString();
  if (b.id) {
    const ex = offers.find(o => o.id === b.id);
    if (!ex) return res.status(404).json({ ok: false, error: 'Offer not found.' });
    applyOfferFields(ex, b); ex.updatedAt = now;
  } else {
    const rec = { id: newOfferId(), type: 'IOI', buyer: '', amount: '', received: '', status: 'Received', rating: '', terms: '',
      createdAt: now, updatedAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
    applyOfferFields(rec, b);
    offers.push(rec);
  }
  // Link to the global buyer registry (by buyer name / email).
  const tgt = b.id ? offers.find(o => o.id === b.id) : offers[offers.length - 1];
  if (tgt && (tgt.buyer || b.buyerEmail)) { const p = findOrCreatePerson(req, { name: tgt.buyer, email: b.buyerEmail, company: b.buyerCompany }); if (p) tgt.personId = p.id; }
  cur.offers = offers; cur.updatedAt = now;
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, offers, people: loadPeople().map(personBrief) });
});
// Run the RRG analyst on one offer — scores it and returns a broker's assessment.
app.post('/api/assignment/:key/offer/:offerId/analyze', express.json(), async (req, res) => {
  try {
    const deals = assignmentsIndex();
    const d = deals[req.params.key];
    if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
    if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
    const overlay = loadAssignOverlay();
    const cur = overlay[d.key] || {};
    const offers = Array.isArray(cur.offers) ? cur.offers : [];
    const o = offers.find(x => x.id === req.params.offerId);
    if (!o) return res.status(404).json({ ok: false, error: 'Offer not found.' });
    const bov = d.bov || null;
    const view = assignmentView(d, overlay);
    const analysis = await offergen.analyzeOffer({
      business: view.business, market: view.market || '',
      dealTarget: (bov && bov.targetText) || '', dealRange: (bov && bov.rangeText) || '', dealBasis: (bov && bov.basis) || '',
      offer: o, otherOffers: offers.filter(x => x.id !== o.id),
      preparedBy: (req.user && req.user.name) || '',
    });
    o.analysis = Object.assign({}, analysis, { at: new Date().toISOString(), by: (req.user && req.user.name) || '' });
    if (typeof analysis.score === 'number') o.score = Math.max(0, Math.min(100, Math.round(analysis.score)));
    o.updatedAt = new Date().toISOString();
    cur.offers = offers; overlay[d.key] = cur; saveAssignOverlay(overlay);
    res.json({ ok: true, offers, offer: o });
  } catch (e) {
    console.error('offer analyze error:', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});
app.delete('/api/assignment/:key/offer/:offerId', (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const offers = (Array.isArray(cur.offers) ? cur.offers : []).filter(o => o.id !== req.params.offerId);
  cur.offers = offers; cur.updatedAt = new Date().toISOString();
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, offers });
});
// Location tours — who toured the business, when, hosted by whom, and their read.
app.post('/api/assignment/:key/tour', express.json(), (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const tours = Array.isArray(cur.tours) ? cur.tours : [];
  const b = req.body || {}, now = new Date().toISOString();
  if (b.id) {
    const ex = tours.find(t => t.id === b.id);
    if (!ex) return res.status(404).json({ ok: false, error: 'Tour not found.' });
    applyTourFields(ex, b); ex.updatedAt = now;
  } else {
    const rec = { id: newTourId(), party: '', date: '', attendees: '', host: (req.user && req.user.name) || '', interest: '', notes: '',
      createdAt: now, updatedAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
    applyTourFields(rec, b);
    tours.push(rec);
  }
  const tt = b.id ? tours.find(t => t.id === b.id) : tours[tours.length - 1];
  if (tt && (tt.party || b.partyEmail)) { const p = findOrCreatePerson(req, { name: tt.party, email: b.partyEmail, company: b.partyCompany }); if (p) tt.personId = p.id; }
  cur.tours = tours; cur.updatedAt = now;
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, tours, people: loadPeople().map(personBrief) });
});
app.delete('/api/assignment/:key/tour/:tourId', (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const tours = (Array.isArray(cur.tours) ? cur.tours : []).filter(t => t.id !== req.params.tourId);
  cur.tours = tours; cur.updatedAt = new Date().toISOString();
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, tours });
});
// NDAs — signed non-disclosures received on this deal (linked to the buyer registry).
app.post('/api/assignment/:key/nda', express.json(), (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const ndas = Array.isArray(cur.ndas) ? cur.ndas : [];
  const b = req.body || {}, now = new Date().toISOString();
  if (b.id) {
    const ex = ndas.find(n => n.id === b.id);
    if (!ex) return res.status(404).json({ ok: false, error: 'NDA not found.' });
    applyNdaFields(ex, b); ex.updatedAt = now;
  } else {
    const rec = { id: newNdaId(), party: '', date: '', method: 'DocuSign', status: 'Received', notes: '',
      createdAt: now, updatedAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
    applyNdaFields(rec, b);
    ndas.push(rec);
  }
  const nn = b.id ? ndas.find(n => n.id === b.id) : ndas[ndas.length - 1];
  if (nn && (nn.party || b.partyEmail)) { const p = findOrCreatePerson(req, { name: nn.party, email: b.partyEmail, company: b.partyCompany }); if (p) nn.personId = p.id; }
  cur.ndas = ndas; cur.updatedAt = now;
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, ndas, people: loadPeople().map(personBrief) });
});
app.delete('/api/assignment/:key/nda/:ndaId', (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const ndas = (Array.isArray(cur.ndas) ? cur.ndas : []).filter(n => n.id !== req.params.ndaId);
  cur.ndas = ndas; cur.updatedAt = new Date().toISOString();
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, ndas });
});
// ---- People (global buyer registry) ----
app.get('/api/people', (req, res) => {
  const cos = {}; loadCompanies().forEach(c => cos[c.id] = c.name);
  const people = loadPeople().map(p => Object.assign(personBrief(p), { companyName: (p.companyId && cos[p.companyId]) || '' }));
  res.json({ ok: true, people: people, types: PERSON_TYPES });
});
app.post('/api/person', express.json(), (req, res) => {
  const b = req.body || {};
  const arr = loadPeople();
  let p = b.id ? arr.find(x => x.id === b.id) : null;
  const now = new Date().toISOString();
  if (!p) { p = { id: newPersonId(), name: '', company: '', companyId: '', email: '', phone: '', type: 'Buyer', notes: '', createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }; arr.push(p); }
  if (typeof b.name === 'string') p.name = b.name.slice(0, 160);
  if (typeof b.company === 'string') p.company = b.company.slice(0, 160);
  if (typeof b.companyId === 'string') p.companyId = b.companyId.slice(0, 40);
  if (typeof b.email === 'string') p.email = b.email.slice(0, 160);
  if (typeof b.phone === 'string') p.phone = b.phone.slice(0, 60);
  if (typeof b.type === 'string' && PERSON_TYPES.indexOf(b.type) >= 0) p.type = b.type;
  if (typeof b.notes === 'string') p.notes = b.notes.slice(0, 4000);
  p.updatedAt = now; savePeople(arr);
  res.json({ ok: true, person: p, people: arr.map(personBrief) });
});
app.delete('/api/person/:id', (req, res) => {
  if (!(req.user && req.user.role === 'admin')) return res.status(403).json({ ok: false, error: 'Admin only.' });
  const arr = loadPeople().filter(p => p.id !== req.params.id);
  savePeople(arr);
  res.json({ ok: true, people: arr.map(personBrief) });
});
// ---- Companies (account files) ----
app.get('/api/companies', (req, res) => {
  const cos = loadCompanies(), people = loadPeople(), deals = loadDeals();
  const rows = cos.map(c => ({ id: c.id, name: c.name, market: c.market || '', type: c.type || '', contacts: people.filter(p => p.companyId === c.id).length, locations: (c.locations || []).length, deals: deals.filter(d => d.companyId === c.id).length, createdAt: c.createdAt }));
  res.json({ ok: true, companies: rows, types: COMPANY_TYPES });
});
// A person's full cross-book view: their company, the deals where they're the client,
// and every offer / tour / NDA they're linked to across all deals.
app.get('/api/person/:id', (req, res) => {
  const p = personById(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  const overlay = loadAssignOverlay(), idx = assignmentsIndex();
  const bizByKey = {}; for (const k in idx) { try { bizByKey[k] = assignmentView(idx[k], overlay).business; } catch (e) {} }
  const deals = [], offers = [], tours = [], ndas = [];
  loadDeals().filter(d => d.contactPersonId === p.id).forEach(d => { const key = d.screenId ? ('s_' + d.screenId) : ('d_' + d.id); deals.push({ key: key, business: d.business, market: d.market || '', role: 'Client' }); });
  for (const key in overlay) {
    const o = overlay[key], biz = bizByKey[key] || '(deal)';
    (o.offers || []).filter(x => x.personId === p.id).forEach(x => offers.push({ key: key, business: biz, type: x.type, amount: x.amount, status: x.status, received: x.received }));
    (o.tours || []).filter(x => x.personId === p.id).forEach(x => tours.push({ key: key, business: biz, date: x.date, interest: x.interest }));
    (o.ndas || []).filter(x => x.personId === p.id).forEach(x => ndas.push({ key: key, business: biz, date: x.date, status: x.status, method: x.method }));
  }
  res.json({ ok: true, person: p, company: companyBrief(companyById(p.companyId)), deals, offers, tours, ndas, personTypes: PERSON_TYPES });
});
const LOCATION_STATUSES = ['Open', 'Closed', 'Under LOI', 'Prospective'];
function newLocationId() { return 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function applyLocationFields(l, b) {
  if (typeof b.name === 'string') l.name = b.name.slice(0, 160);
  if (typeof b.address === 'string') l.address = b.address.slice(0, 200);
  if (typeof b.city === 'string') l.city = b.city.slice(0, 120);
  if (typeof b.status === 'string') l.status = LOCATION_STATUSES.indexOf(b.status) >= 0 ? b.status : 'Open';
  if (typeof b.notes === 'string') l.notes = b.notes.slice(0, 2000);
}
app.get('/api/company/:id', (req, res) => {
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const contacts = loadPeople().filter(p => p.companyId === c.id).map(p => ({ id: p.id, name: p.name, email: p.email || '', phone: p.phone || '', type: p.type || '', title: p.title || '' }));
  const dealRows = loadDeals().filter(d => d.companyId === c.id).map(d => ({ id: d.id, business: d.business, market: d.market || '', started: !!d.screenId, key: d.screenId ? ('s_' + d.screenId) : ('d_' + d.id) }));
  res.json({ ok: true, company: c, contacts, deals: dealRows, locations: c.locations || [], types: COMPANY_TYPES, personTypes: PERSON_TYPES, locationStatuses: LOCATION_STATUSES });
});
// Add / update a location on a company.
app.post('/api/company/:id/location', express.json(), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const b = req.body || {}; c.locations = c.locations || [];
  const now = new Date().toISOString();
  if (b.id) { const ex = c.locations.find(l => l.id === b.id); if (!ex) return res.status(404).json({ ok: false, error: 'Location not found.' }); applyLocationFields(ex, b); ex.updatedAt = now; }
  else { const rec = { id: newLocationId(), name: '', address: '', city: '', status: 'Open', notes: '', createdAt: now }; applyLocationFields(rec, b); if (!rec.name && !rec.address) return res.status(400).json({ ok: false, error: 'A location name or address is required.' }); c.locations.push(rec); }
  c.updatedAt = now; saveCompanies(arr);
  res.json({ ok: true, locations: c.locations });
});
app.post('/api/company/:id/location/:locId/remove', (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  c.locations = (c.locations || []).filter(l => l.id !== req.params.locId);
  c.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true, locations: c.locations });
});
app.post('/api/company', express.json(), (req, res) => {
  const b = req.body || {};
  const arr = loadCompanies();
  let c = b.id ? arr.find(x => x.id === b.id) : null;
  const now = new Date().toISOString();
  if (!c) { const nm = String(b.name || '').trim(); if (!nm) return res.status(400).json({ ok: false, error: 'A company name is required.' }); c = { id: newCompanyId(), name: '', market: '', type: 'Business', notes: '', createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }; arr.push(c); }
  if (typeof b.name === 'string' && b.name.trim()) c.name = b.name.trim().slice(0, 160);
  if (typeof b.market === 'string') c.market = b.market.slice(0, 80);
  if (typeof b.type === 'string' && COMPANY_TYPES.indexOf(b.type) >= 0) c.type = b.type;
  if (typeof b.notes === 'string') c.notes = b.notes.slice(0, 6000);
  c.updatedAt = now; saveCompanies(arr);
  res.json({ ok: true, company: c });
});
// Add / associate a contact (person) to a company.
app.post('/api/company/:id/contact', express.json(), (req, res) => {
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const b = req.body || {};
  const arr = loadPeople();
  let p = b.personId ? arr.find(x => x.id === b.personId) : null;
  if (p) { p.companyId = c.id; if (typeof b.type === 'string' && PERSON_TYPES.indexOf(b.type) >= 0) p.type = b.type; if (typeof b.title === 'string') p.title = b.title.slice(0, 120); p.updatedAt = new Date().toISOString(); savePeople(arr); }
  else {
    const name = String(b.name || '').trim(); const email = String(b.email || '').trim();
    if (!name && !email) return res.status(400).json({ ok: false, error: 'A contact name or email is required.' });
    p = findOrCreatePerson(req, { name: name, email: email, companyId: c.id, type: (PERSON_TYPES.indexOf(b.type) >= 0 ? b.type : 'Buyer') });
    if (p && (b.phone || b.title)) { const a2 = loadPeople(); const pp = a2.find(x => x.id === p.id); if (pp) { if (b.phone) pp.phone = String(b.phone).slice(0, 60); if (b.title) pp.title = String(b.title).slice(0, 120); savePeople(a2); } }
  }
  const contacts = loadPeople().filter(x => x.companyId === c.id).map(x => ({ id: x.id, name: x.name, email: x.email || '', phone: x.phone || '', type: x.type || '', title: x.title || '' }));
  res.json({ ok: true, contacts });
});
// Remove a contact's association from a company (does not delete the person).
app.post('/api/company/:id/contact/:personId/remove', (req, res) => {
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.personId);
  if (p && p.companyId === c.id) { p.companyId = ''; p.updatedAt = new Date().toISOString(); savePeople(arr); }
  const contacts = arr.filter(x => x.companyId === c.id).map(x => ({ id: x.id, name: x.name, email: x.email || '', phone: x.phone || '', type: x.type || '', title: x.title || '' }));
  res.json({ ok: true, contacts });
});
app.delete('/api/company/:id', (req, res) => {
  if (!(req.user && req.user.role === 'admin')) return res.status(403).json({ ok: false, error: 'Admin only.' });
  saveCompanies(loadCompanies().filter(c => c.id !== req.params.id));
  const arr = loadPeople(); let ch = false; arr.forEach(p => { if (p.companyId === req.params.id) { p.companyId = ''; ch = true; } }); if (ch) savePeople(arr);
  res.json({ ok: true });
});
// ---- Deals (first-class) ----
app.post('/api/deal/new', express.json(), (req, res) => {
  const b = req.body || {};
  const business = String(b.business || '').trim();
  if (!business) return res.status(400).json({ ok: false, error: 'A business / deal name is required.' });
  const rec = {
    id: newDealId(), business: business.slice(0, 120), market: String(b.market || '').slice(0, 80), contact: String(b.contact || '').slice(0, 120),
    screenId: '', roomId: '', contactPersonId: '', companyId: '', createdAt: new Date().toISOString(),
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
  };
  // Onboarding: open the company file for the subject business...
  const company = findOrCreateCompany(req, { name: rec.business, market: rec.market, type: 'Business' });
  if (company) rec.companyId = company.id;
  // ...and locate the existing client, or onboard them, associated with that company.
  if (rec.contact || b.contactEmail) { const p = findOrCreatePerson(req, { name: rec.contact, email: b.contactEmail, type: 'Client', companyId: rec.companyId }); if (p) { rec.contactPersonId = p.id; if (!rec.contact) rec.contact = p.name; } }
  const arr = loadDeals(); arr.push(rec);
  const room = ensureRoomForDeal(req, rec);   // auto-build its structured data room
  if (room) rec.roomId = room.id;
  saveDeals(arr);
  res.json({ ok: true, id: rec.id, key: 'd_' + rec.id, roomId: rec.roomId, contactPersonId: rec.contactPersonId, people: loadPeople().map(personBrief) });
});
app.post('/api/deal/:id', express.json(), (req, res) => {
  const arr = loadDeals(); const rec = arr.find(x => x.id === req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Deal not found.' });
  if (!ownsDeal(req, rec)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const b = req.body || {};
  if (typeof b.business === 'string' && b.business.trim()) rec.business = b.business.trim().slice(0, 120);
  if (typeof b.market === 'string') rec.market = b.market.slice(0, 80);
  if (typeof b.contact === 'string') rec.contact = b.contact.slice(0, 120);
  if ((typeof b.contact === 'string' && b.contact.trim()) || b.contactEmail) { const p = findOrCreatePerson(req, { name: rec.contact, email: b.contactEmail, type: 'Client' }); if (p) rec.contactPersonId = p.id; }
  rec.updatedAt = new Date().toISOString(); saveDeals(arr);
  res.json({ ok: true, contactPersonId: rec.contactPersonId || '' });
});
// Promote a deal into a Seller Qualification Call (the pipeline front door).
app.post('/api/deal/:id/start', express.json(), (req, res) => {
  const arr = loadDeals(); const rec = arr.find(x => x.id === req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Deal not found.' });
  if (!ownsDeal(req, rec)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  if (rec.screenId) return res.json({ ok: true, key: 's_' + rec.screenId, screenId: rec.screenId, existed: true });
  const screens = loadScreens();
  const screen = {
    id: newScreenId(), formId: 'dealstart_' + rec.id, business: rec.business || 'Seller', contact: rec.contact || '', market: rec.market || '',
    date: new Date().toLocaleDateString('en-US'), statusText: 'New (Started from Deal)', status: 'nurture',
    completed: false, completePct: 0, data: { concept: rec.business || '', contact: rec.contact || '', market: rec.market || '' },
    by: rec.by || ((req.user && req.user.name) || ''), byUser: rec.byUser || ((req.user && req.user.username) || ''),
    processed: false, processedAt: '', createdAt: new Date().toISOString(),
  };
  screens.push(screen); saveScreens(screens);
  rec.screenId = screen.id; rec.startedAt = new Date().toISOString(); saveDeals(arr);
  // The deal's key changes d_<id> -> s_<screenId>; carry its overlay (status, offers,
  // tours, NDAs, notes) across so nothing logged before starting is orphaned.
  const overlay = loadAssignOverlay(); const oldKey = 'd_' + rec.id, newKey = 's_' + screen.id;
  if (overlay[oldKey] && !overlay[newKey]) { overlay[newKey] = overlay[oldKey]; delete overlay[oldKey]; saveAssignOverlay(overlay); }
  res.json({ ok: true, key: 's_' + screen.id, screenId: screen.id });
});
// Delete a deal and everything linked to it (records, data room, uploaded files).
app.delete('/api/deal/:id', (req, res) => {
  const arr = loadDeals(); const rec = arr.find(x => x.id === req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Deal not found.' });
  if (!ownsDeal(req, rec)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const key = rec.screenId ? ('s_' + rec.screenId) : ('d_' + rec.id);
  // Resolve the whole chain for this deal from the index, then delete each record.
  const group = assignmentsIndex()[key] || {};
  const screenId = rec.screenId || (group.screen && group.screen.id) || '';
  // gather ids
  const questId = (group.quest && group.quest.id) || '';
  const bovIds = [], cimIds = [], mapIds = [], leaseIds = [], roomIds = [];
  if (group.bov) bovIds.push(group.bov.id);
  if (group.cim) cimIds.push(group.cim.id);
  if (group.map) mapIds.push(group.map.id);
  if (group.lease) leaseIds.push(group.lease.id);
  if (group.room) roomIds.push(group.room.id);
  if (rec.roomId) roomIds.push(rec.roomId);
  // widen: catch any record pointing into this chain even if not the "newest"
  if (screenId) {
    const q = loadQuests().find(x => String(x.formId || '') === 'qfromscr_' + screenId); if (q && !questId) { /* handled below by formId filter */ }
  }
  // delete rooms (+ their files) linked by id, srcDealId, or srcCim in cimIds
  const rooms = loadRooms();
  const roomKeep = [];
  rooms.forEach(r => {
    const linked = roomIds.indexOf(r.id) >= 0 || r.srcDealId === rec.id || (r.srcCimId && cimIds.indexOf(r.srcCimId) >= 0);
    if (linked) { (r.docs || []).forEach(dd => { try { fs.unlinkSync(path.join(ROOMS_DIR, dd.id + '.' + dd.ext)); } catch (e) {} }); }
    else roomKeep.push(r);
  });
  if (roomKeep.length !== rooms.length) saveRooms(roomKeep);
  // delete leases / maps / cims / bovs by id
  if (leaseIds.length) saveLeases(loadLeases().filter(x => leaseIds.indexOf(x.id) < 0));
  if (mapIds.length) saveMaps(loadMaps().filter(x => mapIds.indexOf(x.id) < 0));
  if (cimIds.length) saveCims(loadCims().filter(x => cimIds.indexOf(x.id) < 0));
  if (bovIds.length) saveBovs(loadBovs().filter(x => bovIds.indexOf(x.id) < 0));
  // delete questionnaire(s) tied to this screening, then the screening
  if (screenId) {
    saveQuests(loadQuests().filter(x => String(x.formId || '') !== 'qfromscr_' + screenId));
    saveScreens(loadScreens().filter(x => x.id !== screenId));
  } else if (questId) {
    saveQuests(loadQuests().filter(x => x.id !== questId));
  }
  // overlay + deal record
  const overlay = loadAssignOverlay(); if (overlay[key]) { delete overlay[key]; saveAssignOverlay(overlay); }
  saveDeals(arr.filter(x => x.id !== rec.id));
  res.json({ ok: true });
});
function roomGatePage(r, err) {
  const head = `<div class="kick">Confidential Data Room</div><h1>${esc(r.business || 'Confidential Opportunity')}</h1><div class="sub">Enter your personal access code to continue. Access is provided by Restaurant Realty Group under NDA.</div>`;
  const body = `<div class="card"><div style="padding:24px 22px">`
    + (err ? `<div style="background:#fdeceb;color:#b3261e;border:1px solid #f3cfc9;border-radius:8px;padding:10px 13px;font-size:12.5px;font-weight:600;margin-bottom:16px">${esc(err)}</div>` : '')
    + `<form method="POST" action="/room/${esc(r.token)}/enter">`
    + `<label style="display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8a93a8;font-weight:700;margin-bottom:6px">Access code</label>`
    + `<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" autofocus placeholder="e.g. K7RM2QAP" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:13px;font:inherit;font-size:17px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;text-align:center">`
    + `<button type="submit" style="width:100%;margin-top:14px;background:#000E31;color:#fff;border:none;border-radius:9px;padding:13px;font:inherit;font-size:14px;font-weight:700;cursor:pointer">Enter data room →</button>`
    + `</form>`
    + `<div style="font-size:11.5px;color:#8a93a8;margin-top:16px;line-height:1.55">Your code was provided by your RRG contact. For confidentiality, this session ends automatically after 15 minutes of inactivity.</div>`
    + `</div></div>`;
  return roomShell('RRG Data Room — Access', { head, body });
}

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
const SERVER_BOOT = new Date();
const ADMIN_BUILD = 'v3 · groups + prompts open by default';
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
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Content-Type', 'text/html; charset=utf-8').send(shell('Admin Console', `
    <div class="bar"><span class="stat"><b>${users.length}</b> users</span><span class="stat"><b>${logins.filter(l=>l.result==='success').length}</b> logins shown</span><span class="stat"><b>${usageAll.length}</b> tool opens</span><span class="stat" title="Version and when the running server last started. After you push and Render redeploys, refresh this page — if the boot time doesn't update to just now, the new code isn't live yet."><b>${esc(ADMIN_BUILD)}</b> · booted ${esc(SERVER_BOOT.toLocaleString('en-US',{timeZone:'America/Chicago'}))} CT</span>
      <span class="dl"><a href="/index.html" style="background:#DA2B1F;color:#fff;padding:6px 13px;border-radius:8px;font-weight:800;text-decoration:none">Switch to user view →</a> <a href="/log">Submissions</a> <a href="/admin/logins.csv">Login CSV</a> <a href="/admin/usage.csv">Usage CSV</a> <a href="/logout">Sign out</a></span></div>
    <style>
      .expandbar{display:none!important;}
      .userscroll{max-height:390px;overflow-y:auto;border:1px solid #e9edf3;border-radius:11px;}
      .userscroll table{margin:0;}
      .userscroll thead th{position:sticky;top:0;z-index:2;background:#f6f8fb;box-shadow:inset 0 -1px 0 #e9edf3;}
      .userscroll::-webkit-scrollbar{width:10px;} .userscroll::-webkit-scrollbar-thumb{background:#cfd6e2;border-radius:8px;border:2px solid #fff;}
      .bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:18px 28px 2px;}
      .bar .stat{background:#f6f8fb;border:1px solid #e9edf3;border-radius:11px;padding:8px 14px;font-size:10.5px;color:#6b7488;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.3;}
      .bar .stat b{display:block;font-size:18px;color:#000E31;font-weight:800;letter-spacing:-.01em;text-transform:none;}
      .bar .dl{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .bar .dl a{font-size:12.5px;font-weight:700;color:#000E31;text-decoration:none;border:1px solid #e6e9f0;border-radius:8px;padding:8px 13px;background:#fff;}
      .bar .dl a:hover{border-color:#9fb0cc;}
      .wrap.is-console{max-width:1200px;}
      .console{display:flex;align-items:flex-start;}
      .sidenav{flex:0 0 230px;position:sticky;top:12px;padding:6px 12px 20px;border-right:1px solid #e9edf3;}
      .sidenav .snlabel{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#9aa4b6;padding:6px 13px;}
      .sidenav .snav{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:10px;color:#3a4560;font-weight:700;font-size:13.5px;text-decoration:none;cursor:pointer;margin-bottom:3px;transition:background .12s;}
      .sidenav .snav:hover{background:#f5f7fb;}
      .sidenav .snav.on{background:#eef2fb;color:#000E31;}
      .sidenav .snav .si{width:9px;height:9px;border-radius:50%;background:#cfd6e2;flex:none;}
      .sidenav .snav.on .si{background:#DA2B1F;}
      .apanels{flex:1;min-width:0;padding:2px 6px 70px 32px;}
      .apanel{display:none;} .apanel.show{display:block;animation:apf .2s ease;}
      @keyframes apf{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
      .apanel .ptitle{font-size:23px;font-weight:800;color:#000E31;margin:0 0 20px;letter-spacing:-.015em;border-bottom:2px solid #f0d9d6;padding-bottom:13px;}
      .apanel h2{font-size:15px;color:#000E31;border-top:1px solid #eef1f6;padding-top:20px;margin-top:24px;}
      .apanel h2:first-of-type{border-top:none;padding-top:0;margin-top:2px;}
      .bovprompt{width:100%;min-height:340px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;padding:14px 15px;border:1px solid #cfd6e2;border-radius:10px;color:#1a2236;resize:vertical;background:#fff;}
      .bovprompt:focus{outline:none;border-color:#DA2B1F;}
      .btn.ghost{background:#eef1f7;color:#000E31;border:1px solid #e6e9f0;}
      @media(max-width:820px){ .console{flex-direction:column;} .sidenav{flex:auto;width:100%;position:static;display:flex;flex-wrap:wrap;gap:6px;border-right:none;border-bottom:1px solid #e9edf3;} .sidenav .snlabel{display:none;} .apanels{padding-left:6px;} }
    </style>
    <div class="expandbar"><a onclick="accAll(true)">Expand all</a><a onclick="accAll(false)">Collapse all</a></div>
    <div class="wrap">
      <div class="grp">People &amp; Access</div>
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
      <h2>Users <span class="sub2">— ${users.length} total${users.length > 8 ? ' · scroll for more' : ''}</span></h2>
      <div class="userscroll"><table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Added</th><th>Last Login</th><th>Actions</th></tr></thead><tbody>${urows}</tbody></table></div>

      <h2 style="margin-top:34px">Tool Access <span class="sub2">— check a tool to make it admin-only (hidden from reps, and blocked by direct link)</span></h2>
      <div class="links">
        <div class="taccgrid">${toolAccessRows}</div>
        <div style="margin-top:10px"><button class="primary" onclick="saveToolAccess()">Save tool access</button> <span id="tmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Dashboard Quick Links <span class="sub2">— up to 20; check "Default for all" to put a link on every user's dashboard. Each user can add their own under Account.</span></h2>
      <div class="links">${linkRows}
        <div style="margin-top:10px"><button class="primary" onclick="saveLinks()">Save quick links</button> <span id="lmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Documents &amp; Agreements <span class="sub2">— files shown in the dashboard's "Agreements, Documents &amp; Training" section. Upload here and they appear for everyone instantly — no GitHub, no push. PDF, Word, PNG or JPG, up to 20&nbsp;MB.</span></h2>
      <div class="links">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input id="docTitle" placeholder="Title (e.g. Buyer Broker Agreement)" style="flex:1;min-width:220px;border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px">
          <select id="docCategory" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;background:#fff">
            <option>Agreement</option><option>Document</option><option>Training</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <input type="file" id="docFile" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" style="font:inherit;font-size:13px">
          <button class="primary" onclick="uploadDoc()">Upload document</button>
          <span id="docmsg" class="sub2"></span>
        </div>
        <div id="docList" style="margin-top:14px"></div>
      </div>

      <div class="grp">Brand</div>
      <h2 style="margin-top:20px">Company Logo <span class="sub2">— your firm's logo. Used as the default on Marketing Packs (reps can still override per pack). PNG, JPG, SVG, GIF or WEBP, up to 4&nbsp;MB.</span></h2>
      <div class="links">
        <div id="logoPreview" style="margin-bottom:12px"></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input type="file" id="logoFile" accept=".png,.jpg,.jpeg,.svg,.gif,.webp,image/*" style="font:inherit;font-size:13px">
          <button class="primary" onclick="uploadLogo()">Upload logo</button>
          <button onclick="clearLogo()">Remove</button>
          <span id="logomsg" class="sub2"></span>
        </div>
      </div>

      <div class="grp">Valuation Rules</div>
      <h2 style="margin-top:20px">BOV Valuation Basis <span class="sub2">— deals with trailing sales BELOW this value are concluded on SDE; at or above it, on Adjusted EBITDA.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">SDE threshold (annual sales, $)</label>
        <input id="sdeThreshold" inputmode="numeric" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:200px" placeholder="1200000">
        <div style="margin-top:10px"><button class="primary" onclick="saveBovConfig()">Save threshold</button> <span id="bcmsg" class="sub2"></span></div>
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

      <div class="grp">Screens &amp; Sound</div>
      <h2 style="margin-top:20px">Questionnaire Intro Screen <span class="sub2">— the "Before you begin" priming screen a rep sees when starting a questionnaire.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">Seconds on screen (default 10; 0 = off)</label>
        <input id="introSeconds" inputmode="numeric" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:120px" placeholder="10">
        <div style="margin-top:10px"><button class="primary" onclick="saveIntroSeconds()">Save duration</button> <span id="ismsg" class="sub2"></span></div>
        <label class="sub2" style="display:block;margin:18px 0 4px">Message shown on the screen <span style="font-weight:400">— blank lines separate paragraphs; a line starting with &ldquo;- &rdquo; becomes a checklist item</span></label>
        <textarea id="introMessage" spellcheck="true" style="width:100%;min-height:200px;border:1px solid #cfd6e2;border-radius:8px;padding:11px 13px;font:inherit;font-size:13.5px;line-height:1.5;resize:vertical"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveIntroMessage()">Save message</button> <button onclick="resetIntroMessage()">Reset to default</button> <span id="immsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Marketing Pack Intro Screen <span class="sub2">— the "what's about to happen" screen a rep sees on the Build a Marketing Pack page, before generating the CIM and email campaign.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">Seconds on screen (default 20; 0 = off)</label>
        <input id="packIntroSeconds" inputmode="numeric" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:120px" placeholder="20">
        <div style="margin-top:10px"><button class="primary" onclick="savePackIntroSeconds()">Save duration</button> <span id="pismsg" class="sub2"></span></div>
        <label class="sub2" style="display:block;margin:18px 0 4px">Message shown on the screen <span style="font-weight:400">— blank lines separate paragraphs; a line starting with &ldquo;- &rdquo; becomes a checklist item</span></label>
        <textarea id="packIntroMessage" spellcheck="true" style="width:100%;min-height:200px;border:1px solid #cfd6e2;border-radius:8px;padding:11px 13px;font:inherit;font-size:13.5px;line-height:1.5;resize:vertical"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="savePackIntroMessage()">Save message</button> <button onclick="resetPackIntroMessage()">Reset to default</button> <span id="pimmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">BOV Ready Screen <span class="sub2">— how long the "your BOV is ready" screen (with the completion sound) stays up before the finished draft opens.</span></h2>
      <div class="links">
        <label class="sub2" style="display:block;margin-bottom:4px">Seconds on screen (default 2)</label>
        <input id="doneSeconds" inputmode="decimal" style="border:1px solid #cfd6e2;border-radius:8px;padding:9px 12px;font:inherit;font-size:14px;width:120px" placeholder="2">
        <div style="margin-top:10px"><button class="primary" onclick="saveDoneSeconds()">Save duration</button> <span id="dsmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px">Build Sound <span class="sub2">— the ambience that plays on every build screen: Business Valuations, Marketing Packs, and Lease Abstracts. Tap Preview to sample, pick one, then Save.</span></h2>
      <div class="links">
        <div id="soundList"></div>
        <div style="margin-top:10px"><button class="primary" onclick="saveAmbience()">Save sound</button> <button onclick="stopPreview()">Stop preview</button> <span id="sndmsg" class="sub2"></span></div>
      </div>

      <div class="grp">AI Prompts</div>
      <h2 style="margin-top:20px" data-open="1">BOV Analyst Prompt <span class="sub2">— the instructions Claude follows when drafting a BOV. Edit to change how valuations are written; keep the JSON output block at the end intact so the BOV still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="bpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="bovPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveBovPrompt()">Save prompt</button> <button onclick="resetBovPrompt()">Reset to RRG default</button> <span id="bpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px" data-open="1">Marketing Pack Prompt <span class="sub2">— the instructions Claude follows when drafting the Confidential Information Memorandum inside a Marketing Pack. Keep the JSON output block intact so the pack still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="cpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="cimPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveCimPrompt()">Save prompt</button> <button onclick="resetCimPrompt()">Reset to RRG default</button> <span id="cpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px" data-open="1">Market Attack Plan Prompt <span class="sub2">— the instructions Claude follows when drafting the sell-side Market Attack Plan advanced from a Marketing Pack. Keep the JSON output block intact so the plan still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="mpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="mapPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveMapPrompt()">Save prompt</button> <button onclick="resetMapPrompt()">Reset to RRG default</button> <span id="mpmsg" class="sub2"></span></div>
      </div>

      <div class="grp">Activity &amp; Logs</div>
      <h2 style="margin-top:20px">Tool Usage <span class="sub2">— what your team is using</span></h2>
      <div class="cols">
        <div><h3>By tool</h3><table><thead><tr><th>Tool</th><th>Opens</th></tr></thead><tbody>${toolSummary}</tbody></table></div>
        <div><h3>By user</h3><table><thead><tr><th>User</th><th>Opens</th></tr></thead><tbody>${userSummary}</tbody></table></div>
      </div>
      <h3 style="margin-top:22px">Recent tool activity <span class="sub2">— newest first, last 200</span></h3>
      <table><thead><tr><th>When (CT)</th><th>User</th><th>Tool</th><th>IP</th></tr></thead><tbody>${usageRecent}</tbody></table>
      <h2 style="margin-top:34px">Login Activity <span class="sub2">— newest first, last 300</span></h2>
      <table><thead><tr><th>When (CT)</th><th>Username</th><th>Result</th><th>IP</th></tr></thead><tbody>${lrows}</tbody></table>
    </div>
    <script src="/rrg_ambience.js?v=3"></script>
    <script>
      /* visible proof the inline admin script executed (diagnostic) */
      try{ var _eb=document.querySelector('.expandbar'); if(_eb){ _eb.insertAdjacentHTML('beforeend','<span style="margin-left:auto;color:#8a93a8;font-size:11px">admin ${esc(ADMIN_BUILD)} · script loaded ✓</span>'); } }catch(e){}
      function post(action, data){ return fetch(action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json()); }
      function au(f){ post('/api/admin/add-user',{firstName:f.firstName.value,lastName:f.lastName.value,username:f.username.value,email:f.email.value,password:f.password.value,role:f.role.value,title:f.title.value,phone:f.phone.value}).then(j=>{ if(j.ok){location.reload();} else alert(j.error||'Failed'); }); return false; }
      function rp(f){ var p=prompt('New password for '+f.username.value+' (min 6):'); if(!p) return false; post('/api/admin/reset',{username:f.username.value,password:p}).then(j=>{ alert(j.ok?'Password reset.':(j.error||'Failed')); }); return false; }
      function saveLinks(){ var links=[]; document.querySelectorAll('.lrow').forEach(function(r){ var n=r.querySelector('.ln').value.trim(), u=r.querySelector('.lu').value.trim(), a=r.querySelector('.la').checked; if(n&&u) links.push({name:n,url:u,default:a}); }); post('/api/admin/links',{links:links}).then(function(j){ var m=document.getElementById('lmsg'); if(j.ok){ m.textContent='Saved '+(j.links.length)+' link(s) ✓'; } else { m.textContent=j.error||'Failed'; } }); }
      function docEsc(s){ var d=document.createElement('div'); d.textContent=(s==null?'':String(s)); return d.innerHTML; }
      function renderDocList(list){ var el=document.getElementById('docList'); if(!el) return;
        if(!list||!list.length){ el.innerHTML='<div class="sub2">No uploaded documents yet.</div>'; return; }
        el.innerHTML=list.map(function(d){ return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #eef1f6">'
          +'<b style="flex:1;color:#0b1a3a;font-size:13.5px">'+docEsc(d.title)+'</b>'
          +'<span class="sub2">'+docEsc(d.type||d.category||'')+'</span>'
          +'<a href="/doc/'+docEsc(d.id)+'.'+docEsc(d.ext)+'" target="_blank" rel="noopener" style="border:1px solid #cfd6e2;background:#fff;border-radius:7px;padding:5px 12px;font-size:12px;font-weight:700;color:#0b1a3a;text-decoration:none">Open</a>'
          +'<button type="button" class="docdel" data-id="'+docEsc(d.id)+'" style="border:1px solid #f0cfca;background:#fff5f4;border-radius:7px;padding:5px 12px;font:inherit;font-size:12px;font-weight:700;color:#DA2B1F;cursor:pointer">Delete</button>'
          +'</div>'; }).join('');
        [].slice.call(el.querySelectorAll('.docdel')).forEach(function(b){ b.onclick=function(){ delDoc(b.getAttribute('data-id')); }; }); }
      function loadDocList(){ fetch('/api/admin/documents').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok) renderDocList(j.documents||[]); }).catch(function(){}); }
      function uploadDoc(){ var fi=document.getElementById('docFile'), f=fi&&fi.files&&fi.files[0], m=document.getElementById('docmsg');
        if(!f){ m.textContent='Choose a file first.'; return; }
        if(f.size>20*1024*1024){ m.textContent='File too large (max 20 MB).'; return; }
        m.textContent='Uploading…';
        var rd=new FileReader(); rd.onload=function(){ var s=String(rd.result||''), i=s.indexOf(','), b64=(i>=0?s.slice(i+1):s);
          post('/api/admin/upload-doc',{filename:f.name, dataB64:b64, title:document.getElementById('docTitle').value, category:document.getElementById('docCategory').value}).then(function(j){ if(j&&j.ok){ m.textContent='Uploaded ✓'; document.getElementById('docTitle').value=''; fi.value=''; renderDocList(j.documents||[]); } else { m.textContent=(j&&j.error)||'Upload failed'; } }).catch(function(){ m.textContent='Upload failed — try again.'; }); };
        rd.onerror=function(){ m.textContent='Could not read that file.'; };
        rd.readAsDataURL(f); }
      function delDoc(id){ if(!confirm('Remove this document from the dashboard? This deletes the uploaded file.')) return; post('/api/admin/delete-doc',{id:id}).then(function(j){ if(j&&j.ok) renderDocList(j.documents||[]); else alert((j&&j.error)||'Could not delete.'); }); }
      function renderLogo(has){ var p=document.getElementById('logoPreview'); if(!p) return; if(has){ p.innerHTML='<div style="display:inline-flex;align-items:center;gap:14px;background:#fff;border:1px solid #e9edf3;border-radius:10px;padding:12px 16px"><img src="/api/brand/logo?v='+Date.now()+'" alt="Company logo" style="max-height:60px;max-width:240px;display:block"><span class="sub2">Current logo</span></div>'; } else { p.innerHTML='<div class="sub2" style="padding:6px 0">No logo set — reps see the built-in RRG wordmark on Marketing Packs.</div>'; } }
      function loadLogo(){ fetch('/api/brand').then(function(r){return r.json();}).then(function(j){ renderLogo(!!(j&&j.hasLogo)); }).catch(function(){ renderLogo(false); }); }
      function uploadLogo(){ var fi=document.getElementById('logoFile'), f=fi&&fi.files&&fi.files[0], m=document.getElementById('logomsg');
        if(!f){ m.textContent='Choose an image first.'; return; }
        if(f.size>4*1024*1024){ m.textContent='Image too large (max 4 MB).'; return; }
        m.textContent='Uploading…';
        var rd=new FileReader(); rd.onload=function(){ var s=String(rd.result||''), i=s.indexOf(','), b64=(i>=0?s.slice(i+1):s);
          post('/api/admin/logo',{filename:f.name, dataB64:b64}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓'; fi.value=''; renderLogo(true); } else { m.textContent=(j&&j.error)||'Upload failed'; } }).catch(function(){ m.textContent='Upload failed — try again.'; }); };
        rd.onerror=function(){ m.textContent='Could not read that image.'; };
        rd.readAsDataURL(f); }
      function clearLogo(){ if(!confirm('Remove the company logo? Marketing Packs will fall back to the built-in RRG wordmark.')) return; post('/api/admin/logo/clear',{}).then(function(j){ if(j&&j.ok){ renderLogo(false); document.getElementById('logomsg').textContent='Removed.'; } }); }
      loadDocList();
      loadLogo();
      function saveToolAccess(){ var t=[]; document.querySelectorAll('.ta:checked').forEach(function(c){ t.push(c.value); }); post('/api/admin/tool-access',{adminOnly:t}).then(function(j){ var m=document.getElementById('tmsg'); if(j.ok){ m.textContent='Saved — '+j.adminOnly.length+' tool(s) admin-only ✓'; } else { m.textContent=j.error||'Failed'; } }); }
      function _bpState(isDefault){ var s=document.getElementById('bpstate'); if(s) s.textContent = isDefault ? 'Currently using the RRG default prompt.' : 'Currently using a custom prompt.'; }
      function loadBovPrompt(){ fetch('/api/admin/bov-prompt').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('bovPrompt').value=j.prompt||''; _bpState(j.isDefault); } }).catch(function(){ var s=document.getElementById('bpstate'); if(s) s.textContent='Could not load the prompt.'; }); }
      function saveBovPrompt(){ var v=document.getElementById('bovPrompt').value; var m=document.getElementById('bpmsg'); m.textContent='Saving…'; post('/api/admin/bov-prompt',{prompt:v}).then(function(j){ if(j.ok){ m.textContent = j.isDefault ? 'Saved — matches the default, so the default is in use ✓' : 'Saved custom prompt ✓'; document.getElementById('bovPrompt').value=j.prompt||v; _bpState(j.isDefault); } else m.textContent=j.error||'Failed'; }); }
      function resetBovPrompt(){ if(!confirm('Reset the BOV prompt to the RRG default? Your custom prompt will be discarded.')) return; post('/api/admin/bov-prompt',{reset:true}).then(function(j){ if(j.ok){ document.getElementById('bovPrompt').value=j.prompt||''; document.getElementById('bpmsg').textContent='Reset to default ✓'; _bpState(true); } }); }
      try{ loadBovPrompt(); }catch(e){}
      function _cpState(isDefault){ var s=document.getElementById('cpstate'); if(s) s.textContent = isDefault ? 'Currently using the RRG default CIM prompt.' : 'Currently using a custom CIM prompt.'; }
      function loadCimPrompt(){ fetch('/api/admin/cim-prompt').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('cimPrompt').value=j.prompt||''; _cpState(j.isDefault); } }).catch(function(){ var s=document.getElementById('cpstate'); if(s) s.textContent='Could not load the prompt.'; }); }
      function saveCimPrompt(){ var v=document.getElementById('cimPrompt').value; var m=document.getElementById('cpmsg'); m.textContent='Saving…'; post('/api/admin/cim-prompt',{prompt:v}).then(function(j){ if(j.ok){ m.textContent = j.isDefault ? 'Saved — matches the default ✓' : 'Saved custom prompt ✓'; document.getElementById('cimPrompt').value=j.prompt||v; _cpState(j.isDefault); } else m.textContent=j.error||'Failed'; }); }
      function resetCimPrompt(){ if(!confirm('Reset the Marketing Pack prompt to the RRG default? Your custom prompt will be discarded.')) return; post('/api/admin/cim-prompt',{reset:true}).then(function(j){ if(j.ok){ document.getElementById('cimPrompt').value=j.prompt||''; document.getElementById('cpmsg').textContent='Reset to default ✓'; _cpState(true); } }); }
      function _mpState(isDefault){ var s=document.getElementById('mpstate'); if(s) s.textContent = isDefault ? 'Currently using the RRG default Market Attack Plan prompt.' : 'Currently using a custom Market Attack Plan prompt.'; }
      function loadMapPrompt(){ fetch('/api/admin/map-prompt').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('mapPrompt').value=j.prompt||''; _mpState(j.isDefault); } }).catch(function(){ var s=document.getElementById('mpstate'); if(s) s.textContent='Could not load the prompt.'; }); }
      function saveMapPrompt(){ var v=document.getElementById('mapPrompt').value; var m=document.getElementById('mpmsg'); m.textContent='Saving…'; post('/api/admin/map-prompt',{prompt:v}).then(function(j){ if(j.ok){ m.textContent = j.isDefault ? 'Saved — matches the default ✓' : 'Saved custom prompt ✓'; document.getElementById('mapPrompt').value=j.prompt||v; _mpState(j.isDefault); } else m.textContent=j.error||'Failed'; }); }
      function resetMapPrompt(){ if(!confirm('Reset the Market Attack Plan prompt to the RRG default? Your custom prompt will be discarded.')) return; post('/api/admin/map-prompt',{reset:true}).then(function(j){ if(j.ok){ document.getElementById('mapPrompt').value=j.prompt||''; document.getElementById('mpmsg').textContent='Reset to default ✓'; _mpState(true); } }); }
      try{ loadMapPrompt(); }catch(e){}
      try{ loadCimPrompt(); }catch(e){}
      function fmtNum(n){ return Number(n||0).toLocaleString('en-US'); }
      var INTRO_DEFAULT_MSG='', PACK_INTRO_DEFAULT_MSG='';
      function loadBovConfig(){ fetch('/api/admin/bov-config').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('sdeThreshold').value=fmtNum(j.sdeThreshold); var is=document.getElementById('introSeconds'); if(is) is.value=(j.introSeconds!=null?j.introSeconds:10); INTRO_DEFAULT_MSG=j.defaultIntroMessage||''; var im=document.getElementById('introMessage'); if(im) im.value=j.introMessage||j.defaultIntroMessage||''; var ds=document.getElementById('doneSeconds'); if(ds) ds.value=(j.doneSeconds!=null?j.doneSeconds:2); var nt=document.getElementById('noTtmMessage'); if(nt) nt.value=j.noTtmMessage||j.defaultNoTtmMessage||''; var af=document.getElementById('assetSaleFloor'); if(af) af.value=fmtNum(j.assetSaleFloor!=null?j.assetSaleFloor:(j.defaultAssetSaleFloor!=null?j.defaultAssetSaleFloor:25000)); var am=document.getElementById('assetSaleMessage'); if(am) am.value=j.assetSaleMessage||j.defaultAssetSaleMessage||''; var pis=document.getElementById('packIntroSeconds'); if(pis) pis.value=(j.packIntroSeconds!=null?j.packIntroSeconds:20); PACK_INTRO_DEFAULT_MSG=j.defaultPackIntroMessage||''; var pim=document.getElementById('packIntroMessage'); if(pim) pim.value=j.packIntroMessage||j.defaultPackIntroMessage||''; renderSounds(j.ambienceId||'analyst'); } }).catch(function(){ renderSounds('analyst'); }); }
      // ----- Build-sound picker (uses the shared RRG_AMBIENCE library) -----
      function renderSounds(sel){ var el=document.getElementById('soundList'); if(!el) return;
        if(!window.RRG_AMBIENCE){ el.innerHTML='<div class="sub2">Loading sounds...</div>'; setTimeout(function(){ renderSounds(sel); }, 400); return; }
        el.innerHTML=RRG_AMBIENCE.sounds.map(function(s){ return '<label style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #eef1f6">'
          +'<input type="radio" name="ambience" value="'+s.id+'"'+(s.id===sel?' checked':'')+'>'
          +'<span style="flex:1"><b style="color:#0b1a3a">'+s.name+'</b> <span class="sub2">&mdash; '+s.desc+'</span></span>'
          +'<button type="button" class="prevbtn" data-sound="'+s.id+'" style="border:1px solid #cfd6e2;background:#fff;border-radius:8px;padding:6px 13px;font:inherit;font-size:12.5px;font-weight:700;color:#0b1a3a;cursor:pointer">Preview</button>'
          +'</label>'; }).join('');
        [].slice.call(el.querySelectorAll('.prevbtn')).forEach(function(btn){ btn.onclick=function(){ togglePreview(btn.getAttribute('data-sound'), btn); }; });
      }
      var PREV=null;
      function stopPreview(){ if(!PREV) return; var P=PREV; PREV=null; try{ var t=P.ctx.currentTime; P.master.gain.cancelScheduledValues(t); P.master.gain.setValueAtTime(Math.max(P.master.gain.value,0.0001),t); P.master.gain.exponentialRampToValueAtTime(0.0001,t+0.4); }catch(e){} if(P.timer) clearTimeout(P.timer); if(P.handle&&P.handle.stop) P.handle.stop(); setTimeout(function(){ try{ P.ctx.close(); }catch(e){} }, 1300); var all=document.querySelectorAll('#soundList .prevbtn'); for(var i=0;i<all.length;i++) all[i].textContent='Preview'; }
      function previewSound(id, btn){ stopPreview(); try{ var C=window.AudioContext||window.webkitAudioContext; var ctx=new C(); if(ctx.state==='suspended') ctx.resume(); var master=ctx.createGain(); master.gain.value=0.0001; master.connect(ctx.destination); master.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime+0.6); var handle=RRG_AMBIENCE.play(ctx, master, id); var timer=setTimeout(stopPreview, 9000); PREV={ctx:ctx, master:master, handle:handle, timer:timer, id:id}; if(btn) btn.textContent='◼ Stop'; }catch(e){} }
      function togglePreview(id, btn){ if(PREV && PREV.id===id){ stopPreview(); } else { previewSound(id, btn); } }
      function saveAmbience(){ var r=document.querySelector('#soundList input[name=ambience]:checked'); var id=r?r.value:'orb'; var m=document.getElementById('sndmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{ambienceId:id}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓ — plays on the next build (all build screens)'; } else m.textContent=(j&&j.error)||'Failed'; }); }
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
      function savePackIntroSeconds(){ var v=(document.getElementById('packIntroSeconds').value||'').replace(/[^0-9.]/g,''); var m=document.getElementById('pismsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{packIntroSeconds:v}).then(function(j){ if(j&&j.ok){ document.getElementById('packIntroSeconds').value=(j.packIntroSeconds!=null?j.packIntroSeconds:20); m.textContent=(Number(j.packIntroSeconds)===0?'Saved — intro screen off ✓':('Saved — '+j.packIntroSeconds+'s ✓')); } else m.textContent=(j&&j.error)||'Failed'; }); }
      function savePackIntroMessage(){ var v=document.getElementById('packIntroMessage').value||''; var m=document.getElementById('pimmsg'); m.textContent='Saving…'; post('/api/admin/bov-config',{packIntroMessage:v}).then(function(j){ if(j&&j.ok){ document.getElementById('packIntroMessage').value=j.packIntroMessage||''; m.textContent='Saved ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      function resetPackIntroMessage(){ if(!confirm('Reset the Marketing Pack intro message to the RRG default?')) return; var m=document.getElementById('pimmsg'); m.textContent='Resetting…'; post('/api/admin/bov-config',{packIntroMessage:''}).then(function(j){ if(j&&j.ok){ document.getElementById('packIntroMessage').value=j.packIntroMessage||PACK_INTRO_DEFAULT_MSG; m.textContent='Reset to default ✓'; } else m.textContent=(j&&j.error)||'Failed'; }); }
      try{ loadBovConfig(); }catch(e){}
      document.querySelectorAll('form[action="/api/admin/toggle"],form[action="/api/admin/remove"]').forEach(function(f){ f.addEventListener('submit',function(e){ e.preventDefault(); var d={}; new FormData(f).forEach((v,k)=>d[k]=v); post(f.action,d).then(j=>{ if(j.ok) location.reload(); else alert(j.error||'Failed'); }); }); });
      /* Build the sidebar console from the existing group sections (no HTML change) */
      (function(){
        var wrap=document.querySelector('.wrap'); if(!wrap) return;
        var kids=[].slice.call(wrap.children), groups=[], cur=null;
        kids.forEach(function(el){
          if(el.classList && el.classList.contains('grp')){ cur={label:el.textContent.trim(), items:[]}; groups.push(cur); }
          else if(cur){ cur.items.push(el); }
        });
        if(!groups.length) return;
        var box=document.createElement('div'); box.className='console';
        var nav=document.createElement('aside'); nav.className='sidenav';
        nav.innerHTML='<div class="snlabel">Admin</div>';
        var main=document.createElement('main'); main.className='apanels';
        groups.forEach(function(g,i){
          var id='apanel-'+i;
          var a=document.createElement('a'); a.className='snav'+(i===0?' on':''); a.setAttribute('data-target',id);
          a.innerHTML='<span class="si"></span>'+g.label; nav.appendChild(a);
          var panel=document.createElement('section'); panel.className='apanel'+(i===0?' show':''); panel.id=id;
          var title=document.createElement('div'); title.className='ptitle'; title.textContent=g.label; panel.appendChild(title);
          g.items.forEach(function(it){ panel.appendChild(it); });
          main.appendChild(panel);
        });
        box.appendChild(nav); box.appendChild(main);
        wrap.innerHTML=''; wrap.appendChild(box); wrap.classList.add('is-console');
        var navs=[].slice.call(nav.querySelectorAll('.snav')), panels=[].slice.call(main.querySelectorAll('.apanel'));
        function show(id){ panels.forEach(function(p){ p.classList.toggle('show',p.id===id); }); navs.forEach(function(n){ n.classList.toggle('on',n.getAttribute('data-target')===id); }); try{ localStorage.setItem('rrgadm_panel',id); }catch(e){} window.scrollTo(0,0); }
        navs.forEach(function(n){ n.addEventListener('click',function(e){ e.preventDefault(); show(n.getAttribute('data-target')); }); });
        var saved=null; try{ saved=localStorage.getItem('rrgadm_panel'); }catch(e){}
        if(saved && document.getElementById(saved)) show(saved);
      })();
      function accAll(){}
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
// Lease-abstract extraction prompt — mirror of the CIM prompt routes.
app.get('/api/admin/lease-prompt', requireAdmin, (req, res) => {
  const custom = loadLeasePromptCustom();
  res.json({ ok: true, prompt: custom || leasegen.DEFAULT_SYSTEM, isDefault: !custom });
});
app.post('/api/admin/lease-prompt', requireAdmin, (req, res) => {
  const b = req.body || {};
  const def = String(leasegen.DEFAULT_SYSTEM || '');
  if (b.reset) { clearLeasePromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  const p = String(b.prompt || '').trim();
  if (!p || p === def.trim()) { clearLeasePromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  saveLeasePromptCustom(p);
  res.json({ ok: true, prompt: p, isDefault: false });
});
// Market Attack Plan prompt — mirror of the CIM prompt routes.
app.get('/api/admin/map-prompt', requireAdmin, (req, res) => {
  const custom = loadMapPromptCustom();
  res.json({ ok: true, prompt: custom || attackgen.DEFAULT_SYSTEM, isDefault: !custom });
});
app.post('/api/admin/map-prompt', requireAdmin, (req, res) => {
  const b = req.body || {};
  const def = String(attackgen.DEFAULT_SYSTEM || '');
  if (b.reset) { clearMapPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  const p = String(b.prompt || '').trim();
  if (!p || p === def.trim()) { clearMapPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  saveMapPromptCustom(p);
  res.json({ ok: true, prompt: p, isDefault: false });
});
// SDE-vs-EBITDA revenue threshold. Admins read/write; any signed-in user (the
// BOV builder) can read it to compute the basis client-side.
app.get('/api/bov-config', (req, res) => res.json({ ok: true, sdeThreshold: loadSdeThreshold(), defaultSdeThreshold: DEFAULT_SDE_THRESHOLD, introSeconds: loadIntroSeconds(), defaultIntroSeconds: DEFAULT_INTRO_SECONDS, introMessage: loadIntroMessage(), packIntroSeconds: loadPackIntroSeconds(), packIntroMessage: loadPackIntroMessage(), doneSeconds: loadDoneSeconds(), defaultDoneSeconds: DEFAULT_DONE_SECONDS, noTtmMessage: loadNoTtmMessage(), assetSaleFloor: loadAssetSaleFloor(), assetSaleMessage: loadAssetSaleMessage(), ambienceId: loadAmbienceId() }));
app.get('/api/admin/bov-config', requireAdmin, (req, res) => res.json({ ok: true, sdeThreshold: loadSdeThreshold(), defaultSdeThreshold: DEFAULT_SDE_THRESHOLD, introSeconds: loadIntroSeconds(), defaultIntroSeconds: DEFAULT_INTRO_SECONDS, introMessage: loadIntroMessage(), defaultIntroMessage: DEFAULT_INTRO_MESSAGE, packIntroSeconds: loadPackIntroSeconds(), defaultPackIntroSeconds: DEFAULT_PACK_INTRO_SECONDS, packIntroMessage: loadPackIntroMessage(), defaultPackIntroMessage: DEFAULT_PACK_INTRO_MESSAGE, doneSeconds: loadDoneSeconds(), defaultDoneSeconds: DEFAULT_DONE_SECONDS, noTtmMessage: loadNoTtmMessage(), defaultNoTtmMessage: DEFAULT_NO_TTM_MESSAGE, assetSaleFloor: loadAssetSaleFloor(), defaultAssetSaleFloor: DEFAULT_ASSET_SALE_FLOOR, assetSaleMessage: loadAssetSaleMessage(), defaultAssetSaleMessage: DEFAULT_ASSET_SALE_MESSAGE, ambienceId: loadAmbienceId() }));
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
  if (b.packIntroSeconds != null && String(b.packIntroSeconds).trim() !== '') {
    const s = Number(String(b.packIntroSeconds).replace(/[^0-9.]/g, ''));
    if (!(s >= 0)) return res.status(400).json({ ok: false, error: 'Enter a number of seconds (0 or more).' });
    savePackIntroSeconds(s);
  }
  // packIntroMessage: empty string resets to the RRG default.
  if (b.packIntroMessage != null) {
    const t = String(b.packIntroMessage).trim();
    if (t === '') saveCfg({ packIntroMessage: '' }); else savePackIntroMessage(t);
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
  res.json({ ok: true, sdeThreshold: loadSdeThreshold(), introSeconds: loadIntroSeconds(), introMessage: loadIntroMessage(), packIntroSeconds: loadPackIntroSeconds(), packIntroMessage: loadPackIntroMessage(), doneSeconds: loadDoneSeconds(), noTtmMessage: loadNoTtmMessage(), assetSaleFloor: loadAssetSaleFloor(), assetSaleMessage: loadAssetSaleMessage(), ambienceId: loadAmbienceId() });
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
