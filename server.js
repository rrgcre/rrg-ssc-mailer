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
const gmail = require('./gmail.js');
const bovgen = require('./bovgen.js');
const cimgen = require('./cimgen.js');
const aiassist = require('./aiassist.js');
const leasegen = require('./leasegen.js');
const attackgen = require('./attackgen.js');
const offergen = require('./offergen.js');
const ticketgen = require('./ticketgen.js');
const locationgen = require('./locationgen.js');
const archiver = require('archiver');
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
// AI model — admin-settable so the firm can move to a newer model without a redeploy.
const AI_MODEL_FILE = path.join(BOV_DATA_DIR, 'ai_model.txt');
const DEFAULT_AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
function loadAiModel() { try { const t = fs.readFileSync(AI_MODEL_FILE, 'utf8').trim(); return t || DEFAULT_AI_MODEL; } catch (e) { return DEFAULT_AI_MODEL; } }
function saveAiModel(m) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(AI_MODEL_FILE, String(m || '').trim()); } catch (e) {} }
function applyAiModel() { const m = loadAiModel(); [bovgen, cimgen, leasegen, attackgen, offergen, ticketgen, locationgen, valgen].forEach(g => { try { if (g && g.setModel) g.setModel(m); } catch (e) {} }); }
applyAiModel(); // pick up the admin-selected model on boot

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
  if (req.user && isSuper(req.user)) return true;
  if (d.byUser) return d.byUser === (req.user && req.user.username);
  return d.by && d.by === (req.user && req.user.name);
}

// People — a GLOBAL buyer / prospect / contact registry shared across all deals. Offers,
// tours, NDAs, and data-room buyers all link back to a person by personId, so the same
// buyer connects across every deal they touch.
const PEOPLE_FILE = path.join(BOV_DATA_DIR, 'people.json');
const PERSON_TYPES = ['Buyer', 'Seller', 'Tenant', 'Investor', 'Broker', 'Referral Source', 'Internal Personnel', 'Other'];
const LEAD_SOURCES = ['Referral', 'Cold Call', 'Website', 'CoStar', 'LoopNet', 'Walk-in', 'Event / Networking', 'Existing Client', 'Social Media', 'Other'];
const ACTIVITY_TYPES = ['Tour', 'Photo Shoot', 'Meal', 'Text', 'Call', 'Email', 'Form Submitted', 'Agreement Sent', 'Agreement Signed', 'LOI Sent', 'LOI Received', 'LOI Countered', 'LOI Accepted', 'Diligence', 'Note', 'To-Do'];
const CUISINE_TYPES = ['American', 'Tex-Mex', 'Mexican', 'Italian', 'Pizza', 'Burgers', 'BBQ', 'Steakhouse', 'Seafood', 'Chinese', 'Japanese / Sushi', 'Thai', 'Vietnamese', 'Korean', 'Indian', 'Mediterranean', 'Greek', 'Southern / Soul', 'Breakfast / Brunch', 'Coffee / Cafe', 'Hawaiian', 'Desserts', 'Bar / Lounge'];
function loadPeople() { try { return JSON.parse(fs.readFileSync(PEOPLE_FILE, 'utf8')); } catch (e) { return []; } }
function savePeople(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(PEOPLE_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newPersonId() { return 'per_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const SPACES_FILE = path.join(BOV_DATA_DIR, 'spaces.json');
function loadSpaces() { try { return JSON.parse(fs.readFileSync(SPACES_FILE, 'utf8')); } catch (e) { return []; } }
function saveSpaces(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(SPACES_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newSpaceId() { return 'spc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const SPACE_TYPES = ['End cap', 'Inline', 'Pad / Outparcel', 'Freestanding'];
const SPACE_STATUS = ['Available', 'Toured', 'LOI Out', 'Leased', 'Passed'];
const SPACE_FEATURES = ['Drive-thru', 'Hood / exhaust', 'Grease trap', 'Gas service', 'Walk-in cooler', 'Bar built-out', 'Patio', 'Fire suppression', '3-phase power', 'Restrooms (ADA)', '2nd-gen restaurant'];
function splitName(n) { n = String(n || '').trim(); if (!n) return { first: '', last: '' }; const i = n.indexOf(' '); if (i < 0) return { first: n, last: '' }; return { first: n.slice(0, i).trim(), last: n.slice(i + 1).trim() }; }
function composeName(f, l) { return [String(f || '').trim(), String(l || '').trim()].filter(Boolean).join(' '); }
function personFirst(p) { return (p && p.firstName != null) ? p.firstName : splitName(p && p.name).first; }
function personLast(p) { return (p && p.lastName != null) ? p.lastName : splitName(p && p.name).last; }
// Multiple emails / phones per contact — normalize to a clean, de-duplicated list.
function cleanList(a, max, len) {
  if (!Array.isArray(a)) a = (a != null && a !== '') ? [a] : [];
  const seen = {}, out = [];
  a.forEach(v => { v = String(v || '').trim().slice(0, len || 160); if (!v) return; const k = v.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(v); });
  return out.slice(0, max || 10);
}
function personEmails(p) { return Array.isArray(p && p.emails) ? p.emails : ((p && p.email) ? [p.email] : []); }
function personPhones(p) { return Array.isArray(p && p.phones) ? p.phones : ((p && p.phone) ? [p.phone] : []); }
// Preferred contact value the UI shows first; falls back to the first entry.
function preferredEmailOf(p) { const e = personEmails(p); return (p && p.preferredEmail && e.indexOf(p.preferredEmail) >= 0) ? p.preferredEmail : (e[0] || ''); }
function preferredPhoneOf(p) { const ph = personPhones(p); return (p && p.preferredPhone && ph.indexOf(p.preferredPhone) >= 0) ? p.preferredPhone : (ph[0] || ''); }
function personTags(p) { return Array.isArray(p && p.tags) ? p.tags : []; }
function allTagsList() { const set = {}; try { loadPeople().forEach(p => (p.tags || []).forEach(t => { if (t) set[t] = 1; })); } catch (e) {} try { loadCompanies().forEach(c => (c.tags || []).forEach(t => { if (t) set[t] = 1; })); } catch (e) {} return Object.keys(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())); }
// Find another contact that already owns any of these emails (global uniqueness).
function emailOwner(arr, emails, exceptId) {
  const set = {}; emails.forEach(e => { const k = normKey(e); if (k) set[k] = 1; });
  if (!Object.keys(set).length) return null;
  return arr.find(x => x.id !== exceptId && personEmails(x).some(e => set[normKey(e)])) || null;
}
function normKey(s) { return String(s || '').trim().toLowerCase(); }
function personById(id) { if (!id) return null; return loadPeople().find(p => p.id === id) || null; }
// Find a person by email (preferred) or name; create one if none exists. Enriches blanks.
function findOrCreatePerson(req, info) {
  const first = String((info && info.firstName) || '').trim();
  const last = String((info && info.lastName) || '').trim();
  let name = String((info && info.name) || '').trim();
  if ((first || last) && !name) name = composeName(first, last);
  const email = String((info && info.email) || '').trim();
  const company = String((info && info.company) || '').trim();
  if (!name && !email) return null;
  const arr = loadPeople();
  let p = null;
  if (email) p = arr.find(x => normKey(x.email) && normKey(x.email) === normKey(email));
  if (!p && name && !(info && info.strict)) p = arr.find(x => normKey(x.name) === normKey(name));
  if (p) {
    let ch = false;
    if (email && !p.email) { p.email = email.slice(0, 160); ch = true; }
    if (company && !p.company) { p.company = company.slice(0, 160); ch = true; }
    if (info && info.companyId && !p.companyId) { p.companyId = info.companyId; ch = true; }
    if (ch) { p.updatedAt = new Date().toISOString(); savePeople(arr); }
    return p;
  }
  const type = (info && PERSON_TYPES.indexOf(info.type) >= 0) ? info.type : 'Buyer';
  const fullName = (name.slice(0, 160) || email.slice(0, 160));
  const sp = splitName(fullName);
  const emails = cleanList((info && info.emails) || (email ? [email] : []), 10, 160);
  const phones = cleanList((info && info.phones) || [], 10, 60);
  p = {
    id: newPersonId(), name: fullName, firstName: (first || sp.first).slice(0, 80), lastName: (last || sp.last).slice(0, 80),
    company: company.slice(0, 160), companyId: (info && info.companyId) || '',
    emails: emails, phones: phones, email: emails[0] || '', phone: phones[0] || '', type: type, notes: '',
    createdAt: new Date().toISOString(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
  };
  arr.push(p); logContactAdded(p, req); savePeople(arr);
  return p;
}
function personBrief(p) { const em = personEmails(p), ph = personPhones(p); return p ? { id: p.id, name: p.name || '', firstName: personFirst(p), lastName: personLast(p), nickname: p.nickname || '', company: p.company || '', companyId: p.companyId || '', emails: em, phones: ph, email: preferredEmailOf(p), phone: preferredPhoneOf(p), type: p.type || '', tags: personTags(p), leadSource: p.leadSource || '', vip: !!p.vip, caution: !!p.caution, prefContact: Array.isArray(p.prefContact) ? p.prefContact : [], createdAt: p.createdAt || '', owner: p.by || '', lastContacted: p.lastContacted || '', hasPhoto: !!p.photoExt } : null; }
// One contact row as shown on a company file.
function companyContactRow(p) { return { id: p.id, name: p.name, firstName: personFirst(p), lastName: personLast(p), nickname: p.nickname || '', emails: personEmails(p), phones: personPhones(p), email: preferredEmailOf(p), phone: preferredPhoneOf(p), type: p.type || '', title: p.title || '', tags: personTags(p), leadSource: p.leadSource || '', hasPhoto: !!p.photoExt }; }

// Companies — a company / account file that groups its associated contacts (people) and
// its deals. Created at onboarding (the subject business), reusable across deals.
const COMPANIES_FILE = path.join(BOV_DATA_DIR, 'companies.json');
const COMPANY_TYPES = ['Seller', 'Buyer', 'Tenant', 'Restaurant Group'];
function loadCompanies() { try { return JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8')); } catch (e) { return []; } }
function saveCompanies(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(COMPANIES_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newCompanyId() { return 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function companyById(id) { if (!id) return null; return loadCompanies().find(c => c.id === id) || null; }
function companyBrief(c) { return c ? { id: c.id, name: c.name || '', market: c.market || '', type: c.type || '' } : null; }

// ---- Tickets — reps open requests to the brokerage office; office works & resolves them ----
const TICKETS_FILE = path.join(BOV_DATA_DIR, 'tickets.json');
const TICKET_STATUSES = ['Open', 'Answered', 'Action Needed', 'Info Needed', 'Closed'];
const TICKET_PRIORITIES = ['Normal', 'High', 'Urgent'];
const TICKET_CATEGORIES = ['Marketing', 'Signage & Riders', 'Photography', 'Listings', 'Legal / Compliance', 'IT / Software', 'Supplies', 'Accounting', 'Other'];
function loadTickets() { try { return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8')); } catch (e) { return []; } }
function saveTickets(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(TICKETS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newTicketId() { return 'tkt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function ownsTicket(req, t) { if (req.user && isSuper(req.user)) return true; return t.byUser && t.byUser === (req.user && req.user.username); }
function ticketNo(t) { return t.num ? ('#' + String(t.num)) : ('#' + String(t.id).slice(-5)); }
const TICKET_PROMPT_FILE = path.join(BOV_DATA_DIR, 'ticket_prompt.txt');
function loadTicketPromptCustom() { try { const t = fs.readFileSync(TICKET_PROMPT_FILE, 'utf8'); return (t && t.trim()) ? t : ''; } catch (e) { return ''; } }
function saveTicketPromptCustom(t) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(TICKET_PROMPT_FILE, String(t)); } catch (e) {} }
function clearTicketPromptCustom() { try { fs.unlinkSync(TICKET_PROMPT_FILE); } catch (e) {} }
function loadTicketPrompt() { return loadTicketPromptCustom() || undefined; }

// ---- Admin-editable app settings (custom type lists, request-services email, etc.) ----
const SETTINGS_FILE = path.join(BOV_DATA_DIR, 'settings.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function saveSettings(o) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(o || {}, null, 2)); } catch (e) {} }
function cleanStrList(a, max, len) {
  if (!Array.isArray(a)) return null;
  const seen = {}, out = [];
  a.forEach(v => { v = String(v == null ? '' : v).trim().slice(0, len || 60); if (!v) return; const k = v.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(v); });
  return out.slice(0, max || 40);
}
function effPersonTypes() { const s = loadSettings(); return (Array.isArray(s.personTypes) && s.personTypes.length) ? s.personTypes : PERSON_TYPES; }
function effLeadSources() { const s = loadSettings(); return (Array.isArray(s.leadSources) && s.leadSources.length) ? s.leadSources : LEAD_SOURCES; }
function effActivityTypes() { const s = loadSettings(); return (Array.isArray(s.activityTypes) && s.activityTypes.length) ? s.activityTypes : ACTIVITY_TYPES; }
function effCuisineTypes() { const s = loadSettings(); return (Array.isArray(s.cuisineTypes) && s.cuisineTypes.length) ? s.cuisineTypes : CUISINE_TYPES; }
function effMaxPullLocations() { const s = loadSettings(); const n = parseInt(s.maxPullLocations, 10); return (isFinite(n) && n > 0) ? Math.min(500, n) : 20; }
function effDefaultState() { const s = loadSettings(); const v = String(s.defaultState || '').trim(); return v ? v.slice(0, 20) : 'TX'; }
function effAssistantName() { const s = loadSettings(); const v = String(s.assistantName || '').trim(); return v ? v.slice(0, 40) : 'Claude'; }
function effConceptLabel() { const s = loadSettings(); const v = String(s.conceptLabel || '').trim(); return v ? v.slice(0, 30) : 'Concept'; }
function effConceptLabelPlural() { const s = loadSettings(); const v = String(s.conceptLabelPlural || '').trim(); return v ? v.slice(0, 30) : (effConceptLabel() + 's'); }
function effShowRequestRibbon() { const s = loadSettings(); return s.showRequestRibbon !== false; }
function effShowQuickLinks() { const s = loadSettings(); return s.showQuickLinks !== false; }
// ---- Tool label overrides: admins can rename any tool (e.g. call "Contacts" "People").
// Stored as { file: customLabel }; the dashboard applies them when rendering. ----
const TOOL_DEFS = [
  { file: 'rrg_companies.html', name: 'Companies' },
  { file: 'rrg_people.html', name: 'Contacts' },
  { file: 'rrg_assignments.html', name: 'Listings' },
  { file: 'rrg_loi_builder.html', name: 'LOI Builder' },
  { file: 'rrg_deals.html', name: 'Deals' },
  { file: 'rrg_agreements.html', name: 'Agreements' },
  { file: 'rrg_tasks.html', name: 'Tasks' },
  { file: 'rrg_tickets.html', name: 'Requests' },
  { file: 'rrg_cap_rate_calculator.html', name: 'Cap Rate Calculator' },
  { file: 'rrg_screening_queue.html', name: 'Seller Qualification Calls' },
  { file: 'rrg_questionnaire_queue.html', name: 'Valuation Questionnaires' },
  { file: 'rrg_bov_queue.html', name: 'Business Valuations' },
  { file: 'rrg_rooms_queue.html', name: 'Data Rooms' },
  { file: 'rrg_cim_queue.html', name: 'Marketing Packs' },
  { file: 'rrg_attack_queue.html', name: 'Market Attack Plans' },
  { file: 'rrg_commission_calculator.html', name: 'Commission Forecaster' },
  { file: 'ssc_form.html', name: 'Site Selection Criteria' },
  { file: 'rrg_tenant_attack_plan.html', name: 'Market Attack Plan' },
  { file: 'rrg_site_fit.html', name: 'Site & Concept Fit' },
  { file: 'rrg_tour_tracker.html', name: 'Tour Tracker' },
  { file: 'rrg_lease_queue.html', name: 'Lease Abstracts' },
  { file: 'rrg_lease_commission_calculator.html', name: 'Lease Commission' },
];
const TOOL_FILES = TOOL_DEFS.map(t => t.file);
function effToolLabels() { const s = loadSettings(); const m = (s.toolLabels && typeof s.toolLabels === 'object') ? s.toolLabels : {}; const out = {}; Object.keys(m).forEach(k => { if (TOOL_FILES.indexOf(k) >= 0) { const v = String(m[k] || '').trim().slice(0, 40); if (v) out[k] = v; } }); return out; }
function cleanToolLabels(m) { if (!m || typeof m !== 'object') return {}; const out = {}; TOOL_DEFS.forEach(t => { const v = String(m[t.file] || '').trim().slice(0, 40); if (v && v !== t.name) out[t.file] = v; }); return out; }

function newActivityId() { return 'act_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function logActivity(p, type, note, o) {
  o = o || {};
  p.activities = Array.isArray(p.activities) ? p.activities : [];
  const now = new Date().toISOString();
  const date = (o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) ? o.date : now.slice(0, 10);
  const e = { id: newActivityId(), type: String(type || 'Note'), date, at: now, note: String(note || '').slice(0, 2000), by: o.by || '', byUser: o.byUser || '', auto: !!o.auto };
  p.activities.unshift(e); p.activities = p.activities.slice(0, 800);
  if (type !== 'To-Do') { if (!p.lastContacted || date > p.lastContacted) p.lastContacted = date; }
  p.updatedAt = now;
  return e;
}
// System-generated feed entry logged when a new client / contact first enters the book.
// (auto:true renders as a system activity in the feed.) Caller must savePeople afterward.
function logContactAdded(p, req, extra) {
  try {
    const role = (p && p.type) ? (' as a ' + p.type) : '';
    const where = extra ? (' · ' + extra) : (p && p.company ? (' · ' + p.company) : '');
    logActivity(p, 'Contact Added', ('New contact added' + role + where).slice(0, 400), { auto: true, by: (req && req.user && req.user.name) || '', byUser: (req && req.user && req.user.username) || '' });
  } catch (e) {}
}
function effCompanyTypes() { const s = loadSettings(); return (Array.isArray(s.companyTypes) && s.companyTypes.length) ? s.companyTypes : COMPANY_TYPES; }
function effTicketCategories() { const s = loadSettings(); return (Array.isArray(s.ticketCategories) && s.ticketCategories.length) ? s.ticketCategories : TICKET_CATEGORIES; }
// ---- Departments: route requests to a team; only that team's members (plus the
// requester) can see them. Departments own request categories, so a category maps
// to the department that handles it. Members + emails receive the notification. ----
const DEPARTMENTS_DEFAULT = [
  { id: 'marketing',  name: 'Marketing & Creative', members: [], cats: ['Marketing', 'Signage & Riders', 'Photography'], emails: [] },
  { id: 'listings',   name: 'Listings & MLS',       members: [], cats: ['Listings'], emails: [] },
  { id: 'legal',      name: 'Legal & Compliance',   members: [], cats: ['Legal / Compliance'], emails: [] },
  { id: 'it',         name: 'IT & Software',        members: [], cats: ['IT / Software'], emails: [] },
  { id: 'accounting', name: 'Accounting',           members: [], cats: ['Accounting'], emails: [] },
  { id: 'operations', name: 'Operations',           members: [], cats: ['Supplies', 'Other'], emails: [] },
];
function cleanDepartments(a) {
  if (!Array.isArray(a)) return null;
  const out = [];
  a.forEach(d => {
    if (!d || typeof d !== 'object') return;
    const name = String(d.name || '').trim().slice(0, 60);
    if (!name) return;
    let id = String(d.id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!id) id = 'dpt-' + (out.length + 1);
    while (out.some(x => x.id === id)) id = id + '-' + (out.length + 1);
    const members = Array.isArray(d.members) ? Array.from(new Set(d.members.map(m => String(m || '').trim().toLowerCase()).filter(Boolean))).slice(0, 300) : [];
    const cats = Array.isArray(d.cats) ? Array.from(new Set(d.cats.map(c => String(c || '').trim()).filter(Boolean))).slice(0, 40) : [];
    const emails = Array.isArray(d.emails) ? Array.from(new Set(d.emails.map(e => String(e || '').trim()).filter(e => e.indexOf('@') > 0))).slice(0, 20) : [];
    out.push({ id, name, members, cats, emails });
  });
  return out;
}
function effDepartments() { const s = loadSettings(); return (Array.isArray(s.departments) && s.departments.length) ? s.departments : DEPARTMENTS_DEFAULT; }
function deptById(id) { if (!id) return null; return effDepartments().find(d => d.id === id) || null; }
function deptForCategory(cat) { if (!cat) return null; return effDepartments().find(d => Array.isArray(d.cats) && d.cats.indexOf(cat) >= 0) || null; }
function ticketDept(t) { return (t && t.department && deptById(t.department)) || deptForCategory(t && t.category) || null; }
function userDepartmentIds(username) { const u = String(username || '').toLowerCase(); if (!u) return []; return effDepartments().filter(d => Array.isArray(d.members) && d.members.indexOf(u) >= 0).map(d => d.id); }
function deptNotifyEmails(d) {
  if (!d) return servicesEmails();
  const emails = [];
  (Array.isArray(d.members) ? d.members : []).forEach(un => { try { const u = auth.findUser(un); if (u && u.email) emails.push(u.email); } catch (e) {} });
  (Array.isArray(d.emails) ? d.emails : []).forEach(e => emails.push(e));
  const uniq = Array.from(new Set(emails.filter(Boolean)));
  return uniq.length ? uniq : servicesEmails();
}
function canSeeTicket(req, t) {
  const uname = String((req.user && req.user.username) || '').toLowerCase();
  if (!uname) return false;
  if (t.byUser && String(t.byUser).toLowerCase() === uname) return true;   // your own request
  const d = ticketDept(t);
  if (d && Array.isArray(d.members) && d.members.indexOf(uname) >= 0) return true;  // you're on the team it routed to
  return false;
}

function servicesEmails() { const s = loadSettings(); const a = cleanStrList(s.servicesEmails, 10, 160); return (a && a.length) ? a : ['van@rrgcre.com', 'avery@rrgcre.com']; }

// ---- Data backup — zips the entire data directory (all JSON stores + uploaded
// documents + data-room files) so the whole book of business can be restored. A
// daily snapshot is kept on the persistent disk; admins can download any snapshot
// or a fresh one on demand, and an automation token allows off-site copies. ----
const BACKUP_DIR = path.join(BOV_DATA_DIR, 'backups');
const BACKUP_KEEP = 14; // rolling window of daily snapshots retained on disk
function backupStamp(d) { d = d || new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function backupStampFull(d) { d = d || new Date(); const p = n => String(n).padStart(2, '0'); return backupStamp(d) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
// Pipe a zip of the data directory to any writable stream. Excludes the backups
// folder itself (no recursion) and the session-signing key (a secret).
function writeBackupZip(dest) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    let bytes = 0;
    archive.on('error', reject);
    archive.on('data', c => { bytes += c.length; });
    if (dest && typeof dest.on === 'function') dest.on('close', () => resolve(bytes));
    archive.pipe(dest);
    try {
      const entries = fs.readdirSync(BOV_DATA_DIR, { withFileTypes: true });
      entries.forEach(ent => {
        if (ent.name === 'backups') return;                 // don't nest backups in backups
        if (ent.name === 'session.key' || ent.name === 'gmail' || /\.key$/.test(ent.name)) return; // don't export secrets
        const full = path.join(BOV_DATA_DIR, ent.name);
        if (ent.isDirectory()) archive.directory(full, ent.name);
        else if (ent.isFile()) archive.file(full, { name: ent.name });
      });
    } catch (e) { return reject(e); }
    archive.finalize();
  });
}
function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR).filter(f => /\.zip$/.test(f)).map(f => {
      let size = 0, mtime = 0; try { const st = fs.statSync(path.join(BACKUP_DIR, f)); size = st.size; mtime = st.mtimeMs; } catch (e) {}
      return { name: f, size, at: new Date(mtime).toISOString() };
    }).sort((a, b) => (String(b.at)).localeCompare(String(a.at)) || b.name.localeCompare(a.name));
  } catch (e) { return []; }
}
function pruneBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /\.zip$/.test(f)).sort();
    while (files.length > BACKUP_KEEP) { const old = files.shift(); try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (e) {} }
  } catch (e) {}
}
async function makeSnapshot(tag) {
  try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
  const name = 'rrg-backup-' + (tag || backupStamp()) + '.zip';
  const tmp = path.join(BACKUP_DIR, '.' + name + '.tmp');
  const out = fs.createWriteStream(tmp);
  await writeBackupZip(out);
  try { fs.renameSync(tmp, path.join(BACKUP_DIR, name)); } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) {} throw e; }
  pruneBackups();
  return name;
}
// Daily automatic snapshot: on boot and then hourly, ensure today's snapshot exists.
let _lastBackupDay = '';
async function ensureDailyBackup() {
  const day = backupStamp();
  if (_lastBackupDay === day) return;
  const exists = listBackups().some(b => b.name === 'rrg-backup-' + day + '.zip');
  if (exists) { _lastBackupDay = day; return; }
  try { await makeSnapshot(day); _lastBackupDay = day; console.log('Daily backup written: rrg-backup-' + day + '.zip'); }
  catch (e) { console.error('Daily backup failed:', e && e.message); }
}
function findOrCreateCompany(req, info) {
  const name = String((info && info.name) || '').trim();
  if (!name) return null;
  const arr = loadCompanies();
  let c = arr.find(x => normKey(x.name) === normKey(name));
  if (c) {
    if (info.market && !c.market) { c.market = titleCaseMarket(String(info.market).slice(0, 80)); c.updatedAt = new Date().toISOString(); saveCompanies(arr); }
    return c;
  }
  const type = (info && COMPANY_TYPES.indexOf(info.type) >= 0) ? info.type : 'Seller';
  c = { id: newCompanyId(), name: name.slice(0, 160), market: titleCaseMarket(String((info && info.market) || '').slice(0, 80)), type: type, notes: '', createdAt: new Date().toISOString(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
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
  if (req.user && isSuper(req.user)) return true;
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
  if (req.user && isSuper(req.user)) return true;
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
  if (req.path === '/api/generate-bov' || req.path === '/api/generate-cim' || req.path === '/api/generate-lease' || req.path === '/api/generate-map' || req.path === '/api/valuation-factors' || req.path === '/api/admin/upload-doc' || req.path === '/api/admin/logo' || req.path === '/api/admin/favicon' || req.path === '/api/room-upload' || /^\/api\/company\/[^/]+\/location\/[^/]+\/photo$/.test(req.path) || /^\/api\/company\/[^/]+\/concept\/[^/]+\/logo$/.test(req.path) || /^\/api\/company\/[^/]+\/logo$/.test(req.path) || /^\/api\/agreements\/[^/]+\/doc$/.test(req.path) || /^\/api\/admin\/agreement-templates\/[^/]+\/file$/.test(req.path) || /^\/api\/sign\/[^/]+$/.test(req.path)) return next();
  express.json({ limit: '1mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

/* ---------- auth gate ---------- */
const OPEN = new Set(['/health', '/login', '/api/login', '/logout', '/favicon.ico', '/api/appname', '/rrg_brand.js', '/api/gmail/callback']);
app.use((req, res, next) => {
  // Buyer-facing data-room links are public (the unguessable token is the gate).
  if (OPEN.has(req.path) || req.path.startsWith('/room/') || req.path.startsWith('/roomfile/') || req.path.startsWith('/sign/') || req.path.startsWith('/api/sign/')) return next();
  const sess = auth.readSession(parseCookies(req)[COOKIE]);
  if (sess) {
    req.user = sess;
    // Slide the idle timeout forward: any activity re-issues a fresh session
    // cookie, so an active user stays signed in and an idle one is logged out.
    try { setSessionCookie(res, auth.makeSession(sess)); } catch (e) {}
    return next();
  }
  // Backup endpoints may be pulled off-site by an automation using a secret token
  // (set BACKUP_TOKEN on the server). A valid token acts as an admin for backup only.
  if (req.path.startsWith('/api/admin/backup') && process.env.BACKUP_TOKEN) {
    const tok = req.query.token || req.headers['x-backup-token'] || '';
    if (tok && tok === process.env.BACKUP_TOKEN) { req.user = { username: 'backup-bot', role: 'admin', name: 'Backup automation' }; return next(); }
  }
  // Not authenticated
  if (req.path.startsWith('/api/') || /\.(csv|json)$/.test(req.path)) {
    return res.status(401).json({ ok: false, error: 'Not signed in.' });
  }
  return res.redirect('/login');
});
function isSuper(u) { if (!u) return false; var r = u.role; return r === 'admin' || r === 'creator'; }
function manageLoiOk(req) { return isSuper(req.user) || (permsEnabled() && !!effectivePerms(req.user).manage_loi); }
function requireManageLoi(req, res, next) { if (manageLoiOk(req)) return next(); return res.status(403).json({ ok: false, error: 'You do not have permission to manage the LOI library.' }); }
function aiAllowed(req) { return isSuper(req.user) || !permsEnabled() || !!effectivePerms(req.user).use_ai; }
function canDelete(req) { return isSuper(req.user) || (permsEnabled() && !!effectivePerms(req.user).delete); }
// Smart title-case for market / city names typed by a rep: fixes "san antonio" -> "San Antonio"
// but leaves intentionally mixed-case names alone (McAllen, DeSoto, LaGrange).
function titleCaseMarket(s) {
  s = String(s || '').trim();
  if (!s) return '';
  return s.replace(/[A-Za-z]+/g, function (w) {
    if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w;
    var lw = w.toLowerCase();
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  });
}
function requireAdmin(req, res, next) {
  if (req.user && isSuper(req.user)) return next();
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
  canExport: !!(req.user && (isSuper(req.user) || (permsEnabled() && effectivePerms(req.user).export_data))),
  canManageLoi: manageLoiOk(req),
  canUseAi: aiAllowed(req),
  assistant: effAssistantName(),
  title: req.user.title || '', phone: req.user.phone || '', email: req.user.email || '',
  preparedBy: req.user.preparedBy || '',
  adminOnlyTools: auth.loadToolAccess(),
  toolLabels: effToolLabels(),
  logoUrl: (function () { const b = loadBrand(); return b.logoExt ? ('/api/brand/logo?v=' + encodeURIComponent(b.updatedAt || '')) : ''; })(),
  headerMsg: (function () { const b = loadBrand(); return (b.headerMsg && b.headerMsgOn !== false) ? String(b.headerMsg) : ''; })(),
  build: BUILD,
}));
// Admin-settable header announcement (shown across the top of the dashboard).
app.get('/api/admin/header-msg', requireAdmin, (req, res) => { const b = loadBrand(); res.json({ ok: true, msg: b.headerMsg || '', on: b.headerMsgOn !== false }); });
app.post('/api/admin/header-msg', requireAdmin, express.json(), (req, res) => {
  const b = loadBrand();
  if (typeof req.body.msg === 'string') b.headerMsg = req.body.msg.slice(0, 160);
  if (typeof req.body.on === 'boolean') b.headerMsgOn = req.body.on;
  b.updatedAt = new Date().toISOString(); saveBrand(b);
  res.json({ ok: true, msg: b.headerMsg || '', on: b.headerMsgOn !== false });
});

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
  if (req.method === 'GET' && /\.html$/.test(req.path) && !(req.user && isSuper(req.user))) {
    const file = req.path.replace(/^\//, '');
    if (auth.loadToolAccess().indexOf(file) >= 0) return res.redirect('/');
    if (permsEnabled() && GATEABLE_TOOLS.some(t => t.file === file) && !effectivePerms(req.user)['tool:' + file]) return res.redirect('/');
  }
  next();
});

// ---- AI usage meter (per-org billing groundwork) ----
const AI_USAGE_FILE = path.join(BOV_DATA_DIR, 'ai_usage.json');
function loadAiUsage() { try { return JSON.parse(fs.readFileSync(AI_USAGE_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveAiUsage(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(AI_USAGE_FILE, JSON.stringify(a.slice(-20000), null, 2)); } catch (e) {} }
// Rough $ estimate per AI action (web-search actions cost far more than a small text call).
const AI_FEATURE_COST = { 'build-concepts': 0.22, 'find-locations': 0.09, 'find-concepts': 0.07, 'concept-resolve': 0.03, 'brief': 0.04, 'loi-review': 0.03, 'loi-suggest': 0.02, 'loi-parse': 0.02, 'loi-counter': 0.02, 'enrich-company': 0.02, 'enrich-contact': 0.02, 'contact-prep': 0.02, 'concept': 0.02, 'site-read': 0.02, 'calc-summary': 0.01, 'placer': 0.01, 'space-intake': 0.02, 'space-match': 0.02 };
function aiMeterFeature(p) {
  p = String(p || '');
  var m = p.match(/^\/api\/ai\/([\w-]+)/); if (m) return m[1];
  if (/^\/api\/space\/ai-intake/.test(p)) return 'space-intake';
  if (/^\/api\/spaces\/ai-match/.test(p)) return 'space-match';
  if (/^\/api\/loi\/ai-parse/.test(p)) return 'loi-parse';
  var m2 = p.match(/\/(build-concepts|find-locations|find-concepts|concept-resolve)$/); if (m2) return m2[1];
  return null;
}
function logAiCall(feature, req) {
  try {
    var list = loadAiUsage();
    var cost = (AI_FEATURE_COST[feature] != null) ? AI_FEATURE_COST[feature] : 0.02;
    list.push({ ts: new Date().toISOString(), username: (req && req.user && req.user.username) || '', name: (req && req.user && req.user.name) || '', feature: feature, estCost: cost });
    saveAiUsage(list);
  } catch (e) {}
}
// Gate every AI endpoint by role (open when enforcement is off).
app.use((req, res, next) => {
  if (/^\/api\/(ai\/|space\/ai-intake|spaces\/ai-match|loi\/ai-parse)/.test(req.path)) {
    if (!aiAllowed(req)) return res.status(403).json({ ok: false, error: 'You do not have access to AI features. Ask an admin to enable it for your role.' });
  }
  next();
});
// Meter every AI call that actually succeeds (covers /api/ai/* and the locationgen concept/location routes).
app.use((req, res, next) => {
  const feat = aiMeterFeature(req.path);
  if (feat) { res.on('finish', function () { try { if (res.statusCode < 400) logAiCall(feat, req); } catch (e) {} }); }
  next();
});
// Admin — AI usage rollup: brokerage total + per-user + per-feature, this month and all-time.
app.get('/api/admin/ai-usage', requireAdmin, (req, res) => {
  const all = loadAiUsage();
  const ym = new Date().toISOString().slice(0, 7);
  const month = all.filter(x => String(x.ts || '').slice(0, 7) === ym);
  function agg(list, keyFn) { const m = {}; list.forEach(x => { const k = keyFn(x) || '—'; if (!m[k]) m[k] = { key: k, calls: 0, cost: 0 }; m[k].calls++; m[k].cost += (x.estCost || 0); }); return Object.keys(m).map(k => m[k]).sort((a, b) => b.cost - a.cost); }
  const r2 = n => Math.round(n * 100) / 100;
  const byUser = agg(month, x => (x.name || x.username)).map(r => ({ name: r.key, calls: r.calls, cost: r2(r.cost) }));
  const byFeature = agg(month, x => x.feature).map(r => ({ feature: r.key, calls: r.calls, cost: r2(r.cost) }));
  // Daily time-series (last 90 days) for trend analysis, from the timestamped log.
  const dayMap = {}; all.forEach(x => { const d = String(x.ts || '').slice(0, 10); if (!d) return; if (!dayMap[d]) dayMap[d] = { calls: 0, cost: 0 }; dayMap[d].calls++; dayMap[d].cost += (x.estCost || 0); });
  const DAYS = 90; const daily = []; const _now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) { const dt = new Date(_now.getTime() - i * 86400000); const key = dt.toISOString().slice(0, 10); const e = dayMap[key]; daily.push({ date: key, calls: e ? e.calls : 0, cost: e ? r2(e.cost) : 0 }); }
  const _since = ds => all.filter(x => String(x.ts || '') >= ds).length;
  const _d7 = new Date(_now.getTime() - 7 * 86400000).toISOString(); const _d30 = new Date(_now.getTime() - 30 * 86400000).toISOString();
  const windows = { last7: _since(_d7), last30: _since(_d30), firstTs: (all[0] && all[0].ts) || '', lastTs: (all[all.length - 1] && all[all.length - 1].ts) || '' };
  res.json({ ok: true, month: ym, total: { calls: month.length, cost: r2(month.reduce((s, x) => s + (x.estCost || 0), 0)) }, allTime: { calls: all.length, cost: r2(all.reduce((s, x) => s + (x.estCost || 0), 0)) }, byUser: byUser, byFeature: byFeature, daily: daily, windows: windows });
});

// AI usage — CSV export of the raw timestamped log for offline trend analysis.
app.get('/api/admin/ai-usage.csv', requireAdmin, (req, res) => {
  const all = loadAiUsage();
  const esc = v => { const s2 = String(v == null ? '' : v); return /[",\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2; };
  const rows = [['timestamp', 'date', 'user', 'feature', 'est_cost_usd']];
  all.forEach(x => rows.push([x.ts || '', String(x.ts || '').slice(0, 10), x.name || x.username || '', x.feature || '', x.estCost || 0]));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="ai-usage-' + new Date().toISOString().slice(0, 10) + '.csv"');
  res.send(rows.map(r => r.map(esc).join(',')).join('\n'));
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
// ---- Email (SMTP) config: stored on the persistent disk (email.key = excluded from backups) ----
const EMAIL_CFG_FILE = path.join(BOV_DATA_DIR, 'email.key');
function rawEmailCfg() { try { return JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function loadEmailConfig() {
  const c = rawEmailCfg();
  return {
    host: c.host || process.env.SMTP_HOST || '',
    port: Number(c.port || process.env.SMTP_PORT || 587),
    secure: (c.secure != null ? !!c.secure : (String(process.env.SMTP_SECURE || 'false') === 'true')),
    user: c.user || process.env.SMTP_USER || '',
    pass: (c.pass != null && c.pass !== '' ? c.pass : (process.env.SMTP_PASS || '')),
    from: c.from || process.env.MAIL_FROM || process.env.CC_ALWAYS || 'van@rrgcre.com',
    enabled: (c.enabled != null ? !!c.enabled : true),
  };
}
function saveEmailConfig(c) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(EMAIL_CFG_FILE, JSON.stringify(c, null, 2)); } catch (e) {} }
function isEmailConfigured() { const c = loadEmailConfig(); return !!(c.enabled && c.host); }
function mailFrom() { return loadEmailConfig().from; }
function buildTransport() {
  const c = loadEmailConfig();
  return nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: (c.user || c.pass) ? { user: c.user, pass: c.pass } : undefined });
}
app.get('/api/admin/email', requireAdmin, (req, res) => {
  const c = loadEmailConfig();
  res.json({ ok: true, host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from, enabled: c.enabled, hasPass: !!c.pass, configured: isEmailConfigured() });
});
app.post('/api/admin/email', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {}; const cur = rawEmailCfg();
  const c = {
    host: typeof b.host === 'string' ? b.host.trim().slice(0, 200) : (cur.host || ''),
    port: b.port != null ? (Number(b.port) || 587) : (cur.port || 587),
    secure: b.secure != null ? !!b.secure : (cur.secure || false),
    user: typeof b.user === 'string' ? b.user.trim().slice(0, 200) : (cur.user || ''),
    from: typeof b.from === 'string' ? b.from.trim().slice(0, 200) : (cur.from || ''),
    enabled: b.enabled != null ? !!b.enabled : (cur.enabled != null ? cur.enabled : true),
    pass: cur.pass || '',
  };
  if (typeof b.pass === 'string' && b.pass !== '') c.pass = b.pass;
  if (b.clearPass) c.pass = '';
  saveEmailConfig(c);
  res.json({ ok: true, configured: isEmailConfigured() });
});
app.post('/api/admin/email/test', requireAdmin, express.json(), async (req, res) => {
  const to = String((req.body && req.body.to) || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ ok: false, error: 'Enter a valid destination email.' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, error: 'Save your email settings first (host + enabled on).' });
  try {
    const info = await buildTransport().sendMail({ from: mailFrom(), to, subject: 'RRG toolkit — test email', text: 'This is a test from your RRG toolkit. If you got this, outbound email is working.' });
    res.json({ ok: true, id: info.messageId });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});
// Best-effort notification email. Silently no-ops if SMTP isn't configured, and never throws.
async function sendNotifyMail(to, subject, text) {
  try {
    if (!isEmailConfigured()) return { ok: false, skipped: true };
    const list = (Array.isArray(to) ? to : [to]).filter(Boolean).join(', ');
    if (!list) return { ok: false, skipped: true };
    const info = await buildTransport().sendMail({
      from: mailFrom(),
      to: list, subject: String(subject || '').slice(0, 200), text: String(text || ''),
    });
    return { ok: true, id: info.messageId };
  } catch (e) { console.error('notify mail error:', e && e.message); return { ok: false, error: String((e && e.message) || e) }; }
}
function ticketOwnerEmail(t) { try { const u = auth.findUser(t.byUser); return (u && u.email) || ''; } catch (e) { return ''; } }
function appBaseUrl() { return String(process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, ''); }
app.post('/api/send-ssc', async (req, res) => {
  const data = req.body || {};
  if (!data.repEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.repEmail)) {
    return res.status(400).json({ ok: false, error: 'A valid tenant rep email is required.' });
  }
  let out = null, err = null, emailed = false;
  try {
    if (!isEmailConfigured()) throw new Error('Server email is not configured. Set it in Admin → Email.');
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
  const isAdmin = req.user && isSuper(req.user);
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
  const isAdmin = req.user && isSuper(req.user);
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
  if (req.user && isSuper(req.user)) return true;
  if (b.byUser) return b.byUser === (req.user && req.user.username);
  return b.by && b.by === (req.user && req.user.name);
}
function ownsCim(req, c) {
  if (req.user && isSuper(req.user)) return true;
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
  const isAdmin = req.user && isSuper(req.user);
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
  const isAdmin = req.user && isSuper(req.user);
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
  if (req.user && isSuper(req.user)) return true;
  if (l.byUser) return l.byUser === (req.user && req.user.username);
  return l.by && l.by === (req.user && req.user.name);
}
app.get('/api/leases', (req, res) => {
  const isAdmin = req.user && isSuper(req.user);
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
  if (req.user && isSuper(req.user)) return true;
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
  const isAdmin = req.user && isSuper(req.user);
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
  const defaults = auth.loadLinks().filter(l => l.default).map(l => ({ name: l.name, url: l.url, scope: 'default' }));
  const u = req.user && auth.findUser(req.user.username);
  const personal = auth.userLinksOf(u).map(l => ({ name: l.name, url: l.url, scope: 'personal' }));
  res.json({ ok: true, links: defaults.concat(personal), canOrderDefault: !!(req.user && isSuper(req.user)), show: effShowQuickLinks() });
});
// Persist a new quick-links order from the dashboard. Shared "default" links are
// reorderable by admins; each user can always reorder their own personal links.
app.post('/api/links/order', express.json({ limit: '256kb' }), (req, res) => {
  try {
    const b = req.body || {};
    if (Array.isArray(b.personal)) auth.setUserLinks(req.user.username, b.personal);
    if (Array.isArray(b.defaults) && req.user && isSuper(req.user)) auth.reorderDefaultLinks(b.defaults);
    const defaults = auth.loadLinks().filter(l => l.default).map(l => ({ name: l.name, url: l.url, scope: 'default' }));
    const personal = auth.userLinksOf(auth.findUser(req.user.username)).map(l => ({ name: l.name, url: l.url, scope: 'personal' }));
    res.json({ ok: true, links: defaults.concat(personal), canOrderDefault: !!(req.user && isSuper(req.user)) });
  } catch (e) { res.status(400).json({ ok: false, error: String((e && e.message) || e) }); }
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
  const brand = loadBrand(); brand.logoExt = ext; brand.logoType = LOGO_MIME[ext] || 'image/png'; brand.updatedAt = now; brand.by = (req.user && req.user.name) || ''; saveBrand(brand);
  res.json({ ok: true, hasLogo: true, logoUrl: '/api/brand/logo?v=' + encodeURIComponent(now) });
});
app.post('/api/admin/logo/clear', requireAdmin, (req, res) => {
  const b = loadBrand(); if (b.logoExt) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_logo.' + b.logoExt)); } catch (e) {} }
  delete b.logoExt; delete b.logoType; b.updatedAt = new Date().toISOString(); saveBrand(b);
  res.json({ ok: true, hasLogo: false });
});
// ---- App name (admin-set) — drives the browser tab title on every page ----
const DEFAULT_APP_NAME = 'FullServe';
function loadAppName() { const b = loadBrand(); return (b.appName && String(b.appName).trim()) || DEFAULT_APP_NAME; }
// ---- AI action confirmations (admin master switch; default ON) ----
function effAiConfirm() { const b = loadBrand(); return b.aiConfirm !== false; }
const PALETTE_DEFAULT = { primary: '#000E31', accent: '#DA2B1F', sidebar: '#0b1a38', positive: '#1f8a5b' };
function isHexColor(v) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')); }
function effPalette() { const b = loadBrand(); const pl = (b.palette && typeof b.palette === 'object') ? b.palette : {}; return { primary: isHexColor(pl.primary) ? pl.primary : PALETTE_DEFAULT.primary, accent: isHexColor(pl.accent) ? pl.accent : PALETTE_DEFAULT.accent, sidebar: isHexColor(pl.sidebar) ? pl.sidebar : PALETTE_DEFAULT.sidebar, positive: isHexColor(pl.positive) ? pl.positive : PALETTE_DEFAULT.positive }; }
app.get('/api/appname', (req, res) => res.json({ ok: true, name: loadAppName(), assistant: effAssistantName(), concept: effConceptLabel(), conceptPlural: effConceptLabelPlural(), palette: effPalette(), aiConfirm: effAiConfirm(), logoUrl: (function(){ const _b = loadBrand(); return _b.logoExt ? ('/api/brand/logo?v=' + encodeURIComponent(_b.updatedAt || '')) : ''; })() }));
app.get('/api/feed', (req, res) => {
  let people = loadPeople();
  if (restrictToOwn(req)) people = people.filter(p => permOwnerMatch(req, p.by));
  const items = [];
  people.forEach(p => { (Array.isArray(p.activities) ? p.activities : []).forEach(a => { items.push({ type: a.type || 'Note', note: a.note || '', at: a.date || a.at || '', by: a.by || '', byUser: a.byUser || '', auto: !!a.auto, personId: p.id, personName: p.name || 'Contact', company: p.company || '' }); }); });
  const canScope = !restrictToOwn(req);
  const mine = req.query.scope === 'mine';
  let out = items;
  if (mine) { const u = req.user || {}; out = items.filter(it => (it.byUser && it.byUser === u.username) || (it.by && it.by === u.name)); }
  out.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  res.json({ ok: true, items: out.slice(0, 200), scope: mine ? 'mine' : 'all', canScope: canScope });
});
app.get('/api/admin/palette', requireAdmin, (req, res) => res.json({ ok: true, palette: effPalette(), defaults: PALETTE_DEFAULT }));
app.post('/api/admin/palette', requireAdmin, express.json(), (req, res) => {
  const bd = req.body || {};
  const b = loadBrand();
  if (bd.reset) { delete b.palette; saveBrand(b); return res.json({ ok: true, palette: effPalette(), defaults: PALETTE_DEFAULT }); }
  const pl = (b.palette && typeof b.palette === 'object') ? Object.assign({}, b.palette) : {};
  if (bd.primary !== undefined) { if (!isHexColor(bd.primary)) return res.status(400).json({ ok: false, error: 'Primary must be a 6-digit hex color like #0B1A38.' }); pl.primary = bd.primary; }
  if (bd.accent !== undefined) { if (!isHexColor(bd.accent)) return res.status(400).json({ ok: false, error: 'Accent must be a 6-digit hex color like #DA2B1F.' }); pl.accent = bd.accent; }
  if (bd.sidebar !== undefined) { if (!isHexColor(bd.sidebar)) return res.status(400).json({ ok: false, error: 'Sidebar must be a 6-digit hex color.' }); pl.sidebar = bd.sidebar; }
  if (bd.positive !== undefined) { if (!isHexColor(bd.positive)) return res.status(400).json({ ok: false, error: 'Positive must be a 6-digit hex color.' }); pl.positive = bd.positive; }
  b.palette = pl; saveBrand(b);
  res.json({ ok: true, palette: effPalette(), defaults: PALETTE_DEFAULT });
});
app.get('/api/admin/app-name', requireAdmin, (req, res) => res.json({ ok: true, name: loadAppName(), isDefault: loadAppName() === DEFAULT_APP_NAME, default: DEFAULT_APP_NAME }));
app.post('/api/admin/app-name', requireAdmin, express.json(), (req, res) => {
  const n = String((req.body && req.body.name) || '').trim().slice(0, 60);
  const b = loadBrand();
  if (!n) { delete b.appName; } else { b.appName = n; }
  b.updatedAt = new Date().toISOString(); saveBrand(b);
  res.json({ ok: true, name: loadAppName(), isDefault: loadAppName() === DEFAULT_APP_NAME });
});
// ---- AI confirmation gate (admin master switch) ----
app.get('/api/admin/ai-confirm', requireAdmin, (req, res) => res.json({ ok: true, on: effAiConfirm() }));
app.post('/api/admin/ai-confirm', requireAdmin, express.json(), (req, res) => {
  const b = loadBrand();
  b.aiConfirm = !!(req.body && req.body.on);
  b.updatedAt = new Date().toISOString(); saveBrand(b);
  res.json({ ok: true, on: effAiConfirm() });
});
// ---- Favicon (admin-set) — served at /favicon.ico for every page ----
const FAVICON_MIME = { ico: 'image/x-icon', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const FAVICON_EXT = /^(ico|png|jpe?g|gif|webp|svg)$/i;
app.get('/favicon.ico', (req, res) => {
  const b = loadBrand();
  if (!b.faviconExt) { try { const dflt = fs.readFileSync(path.join(__dirname, 'public', 'fullserve_favicon.svg')); res.set('Content-Type', 'image/svg+xml'); res.set('Cache-Control', 'public, max-age=3600'); return res.send(dflt); } catch (e) { return res.status(404).end(); } }
  try { const buf = fs.readFileSync(path.join(BOV_DATA_DIR, 'brand_favicon.' + b.faviconExt)); res.set('Content-Type', b.faviconType || FAVICON_MIME[b.faviconExt] || 'image/png'); res.set('Cache-Control', 'public, max-age=3600'); res.send(buf); }
  catch (e) { res.status(404).end(); }
});
app.get('/api/admin/favicon', requireAdmin, (req, res) => { const b = loadBrand(); res.json({ ok: true, hasFavicon: !!b.faviconExt }); });
app.post('/api/admin/favicon', requireAdmin, express.json({ limit: '4mb' }), (req, res) => {
  const b = req.body || {};
  let m = String(b.filename || '').trim().match(/\.([a-z0-9]+)$/i); let ext = m ? m[1].toLowerCase() : '';
  if (ext === 'jpeg') ext = 'jpg';
  if (!FAVICON_EXT.test(ext)) return res.status(400).json({ ok: false, error: 'Use an ICO, PNG, SVG, GIF, or WEBP image.' });
  const data = String(b.dataB64 || ''); if (!data) return res.status(400).json({ ok: false, error: 'No image data received.' });
  let buf; try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Could not read the image.' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'The image appears to be empty.' });
  if (buf.length > 1024 * 1024) return res.status(400).json({ ok: false, error: 'Favicon too large (max 1 MB).' });
  try {
    if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true });
    const old = loadBrand(); if (old.faviconExt && old.faviconExt !== ext) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_favicon.' + old.faviconExt)); } catch (e) {} }
    fs.writeFileSync(path.join(BOV_DATA_DIR, 'brand_favicon.' + ext), buf);
  } catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the favicon.' }); }
  const brand = loadBrand(); brand.faviconExt = ext; brand.faviconType = FAVICON_MIME[ext] || 'image/png'; brand.updatedAt = new Date().toISOString(); saveBrand(brand);
  res.json({ ok: true, hasFavicon: true });
});
app.post('/api/admin/favicon/clear', requireAdmin, (req, res) => {
  const b = loadBrand(); if (b.faviconExt) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_favicon.' + b.faviconExt)); } catch (e) {} }
  delete b.faviconExt; delete b.faviconType; b.updatedAt = new Date().toISOString(); saveBrand(b);
  res.json({ ok: true, hasFavicon: false });
});
// Auto-pull the company logo from a website domain (Clearbit).
app.post('/api/admin/logo/pull', requireAdmin, express.json(), async (req, res) => {
  const d = domainOf(String((req.body && req.body.url) || '')); if (!d) return res.status(400).json({ ok: false, error: 'Enter a website (e.g. rrgcre.com).' });
  const img = await fetchImageBuffer('https://logo.clearbit.com/' + d, 200);
  if (!img) return res.status(404).json({ ok: false, error: 'Could not find a logo for ' + d + '. Try uploading one instead.' });
  let ext = LOGO_EXT.test(img.ext) ? img.ext : 'png';
  try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); const old = loadBrand(); if (old.logoExt && old.logoExt !== ext) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_logo.' + old.logoExt)); } catch (e) {} } fs.writeFileSync(path.join(BOV_DATA_DIR, 'brand_logo.' + ext), img.buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the logo.' }); }
  const brand = loadBrand(); brand.logoExt = ext; brand.logoType = LOGO_MIME[ext] || 'image/png'; brand.updatedAt = new Date().toISOString(); saveBrand(brand);
  res.json({ ok: true, hasLogo: true });
});
// Auto-pull the favicon from a website domain (Clearbit, then Google favicon service).
app.post('/api/admin/favicon/pull', requireAdmin, express.json(), async (req, res) => {
  const d = domainOf(String((req.body && req.body.url) || '')); if (!d) return res.status(400).json({ ok: false, error: 'Enter a website (e.g. rrgcre.com).' });
  let img = await fetchImageBuffer('https://logo.clearbit.com/' + d, 200);
  if (!img) img = await fetchImageBuffer('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=64', 100);
  if (!img) return res.status(404).json({ ok: false, error: 'Could not find a favicon for ' + d + '. Try uploading one instead.' });
  let ext = FAVICON_EXT.test(img.ext) ? img.ext : 'png';
  try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); const old = loadBrand(); if (old.faviconExt && old.faviconExt !== ext) { try { fs.unlinkSync(path.join(BOV_DATA_DIR, 'brand_favicon.' + old.faviconExt)); } catch (e) {} } fs.writeFileSync(path.join(BOV_DATA_DIR, 'brand_favicon.' + ext), img.buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the favicon.' }); }
  const brand = loadBrand(); brand.faviconExt = ext; brand.faviconType = FAVICON_MIME[ext] || 'image/png'; brand.updatedAt = new Date().toISOString(); saveBrand(brand);
  res.json({ ok: true, hasFavicon: true });
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
// Per-buyer access levels for a data room grant: view (preview only, no download),
// download (view + download files), edit (download + upload their own documents).
const ROOM_LEVELS = ['view', 'download', 'edit'];
function cleanRoomLevel(v, dflt) { return ROOM_LEVELS.indexOf(String(v)) >= 0 ? String(v) : (dflt || 'download'); }
// Per-cell levels also allow 'none' (folder hidden from that buyer).
const ROOM_CELL_LEVELS = ['none', 'view', 'download', 'edit'];
// Effective level a buyer (grant) has for a given document category: the per-folder
// override if set, otherwise the buyer's room-wide baseline level.
function effGrantLevel(grant, category) { if (!grant) return 'download'; const cp = grant.catPerms && grant.catPerms[category]; if (ROOM_CELL_LEVELS.indexOf(cp) >= 0) return cp; return grant.level || 'download'; }
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
  if (req.user && isSuper(req.user)) return true;
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
  const isAdmin = req.user && isSuper(req.user);
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
    grants: (r.grants || []).map(g => ({ id: g.id, name: g.name || '', email: g.email || '', code: g.code, level: g.level || 'download', catPerms: g.catPerms || {}, active: g.active !== false, createdAt: g.createdAt, lastSeen: g.lastSeen || '', views: g.views || 0, downloads: g.downloads || 0 })) } });
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
  const g = { id: newGrantId(), name, email, code: newGrantCode(), level: cleanRoomLevel(b.level, 'download'), active: true, createdAt: new Date().toISOString(), lastSeen: '', views: 0, downloads: 0, by: (req.user && req.user.name) || '' };
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
// Change a buyer's access level (view / download / edit).
app.post('/api/room/:id/grant-level', express.json(), (req, res) => {
  const arr = loadRooms(); const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const g = (r.grants || []).find(x => x.id === String((req.body || {}).grantId || ''));
  if (!g) return res.status(404).json({ ok: false, error: 'Buyer not found.' });
  g.level = cleanRoomLevel((req.body || {}).level, g.level || 'download'); saveRooms(arr);
  res.json({ ok: true, grants: r.grants });
});
// Set one folder's permission for one buyer (a matrix cell). level 'inherit' clears the override.
app.post('/api/room/:id/grant-perms', express.json(), (req, res) => {
  const arr = loadRooms(); const r = arr.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  if (!ownsRoom(req, r)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const b = req.body || {};
  const g = (r.grants || []).find(x => x.id === String(b.grantId || ''));
  if (!g) return res.status(404).json({ ok: false, error: 'Buyer not found.' });
  const cat = String(b.category || ''); const lvl = String(b.level || '');
  if (ROOM_CATEGORIES.indexOf(cat) < 0) return res.status(400).json({ ok: false, error: 'Unknown folder.' });
  g.catPerms = g.catPerms || {};
  if (lvl === 'inherit') { delete g.catPerms[cat]; }
  else if (ROOM_CELL_LEVELS.indexOf(lvl) >= 0) { g.catPerms[cat] = lvl; }
  else return res.status(400).json({ ok: false, error: 'Bad level.' });
  saveRooms(arr);
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
  const level = grant ? effGrantLevel(grant, d.category || 'Other') : 'download';
  if (level === 'none') return res.status(403).end();
  const wantDl = String(req.query.dl || '') === '1';
  const asDownload = wantDl && level !== 'view';   // view-only buyers can preview but never download
  const fnameSafe = String(d.title || d.originalName || d.id).replace(/[^\w.\- ]+/g, '_') + '.' + d.ext;
  if (asDownload && grant) { grant.downloads = (grant.downloads || 0) + 1; }
  logRoomAccess(r, req, asDownload ? 'download' : 'view', d.title || d.originalName, grant); saveRooms(arr);
  res.setHeader('Content-Disposition', (asDownload ? 'attachment' : 'inline') + '; filename="' + fnameSafe + '"');
  res.sendFile(fp);
});
// Buyer document upload — only for grants with the 'edit' level (contributors).
app.post('/room/:token/upload', express.json({ limit: '40mb' }), (req, res) => {
  const arr = loadRooms(); const r = arr.find(x => x.token === req.params.token);
  if (!r) return res.status(404).json({ ok: false, error: 'Data room not found.' });
  const grant = roomGrantFor(req, r);
  const b = req.body || {};
  const upCat = (ROOM_CATEGORIES.indexOf(b.category) >= 0 ? b.category : 'Other');
  if (!grant || effGrantLevel(grant, upCat) !== 'edit') return res.status(403).json({ ok: false, error: 'You do not have permission to add documents to this folder.' });
  const orig = String(b.filename || '').trim();
  const m = orig.match(/\.([a-z0-9]+)$/i); const ext = m ? m[1].toLowerCase() : '';
  if (!ROOM_EXT.test(ext)) return res.status(400).json({ ok: false, error: 'Unsupported file type.' });
  const data = String(b.dataB64 || ''); if (!data) return res.status(400).json({ ok: false, error: 'No file data received.' });
  let buf; try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Could not read the file.' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'The file appears to be empty.' });
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large (max 20 MB).' });
  const doc = addFileToRoom(r, { name: orig, dataB64: data }, { source: 'buyer:' + grant.id, category: upCat, title: (String(b.title || '').trim().slice(0, 140) || prettyName(orig)), by: (grant.name || grant.email || 'Buyer') + ' (buyer)' });
  if (!doc) return res.status(400).json({ ok: false, error: 'Could not save the document.' });
  grant.lastSeen = new Date().toISOString(); logRoomAccess(r, req, 'upload', doc.title, grant); saveRooms(arr);
  res.json({ ok: true });
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
  const catLevel = cat => grant ? effGrantLevel(grant, cat) : 'download';
  const editCats = ROOM_CATEGORIES.filter(c => catLevel(c) === 'edit');
  const visibleCats = ROOM_CATEGORIES.filter(c => catLevel(c) !== 'none');
  const visCount = docs.filter(d => catLevel(d.category || 'Other') !== 'none').length;
  const lvlLabel = grant ? (editCats.length ? 'You can view, download & upload in some folders' : 'Folder-level access set by RRG') : '';
  const who = grant ? `<div class="sub" style="margin-top:8px;color:#cdd6ea">Signed in as ${esc(grant.name || grant.email)} · ${esc(lvlLabel)} · session ends after 15 min idle</div>` : '';
  const head = `<div class="kick">Confidential Data Room</div><h1>${esc(r.business || 'Confidential Opportunity')}</h1><div class="sub">${visCount} document${visCount === 1 ? '' : 's'} · Provided by Restaurant Realty Group under NDA</div>${who}`;
  let body = '';
  if (editCats.length) {
    body += `<div class="card"><div class="chd">Add a document</div><div style="padding:14px 20px">` +
      `<div class="note" style="border:none;padding:0;margin:0 0 10px">You can contribute documents to the folders you have upload rights to (e.g. proof of funds or a signed NDA). PDF, Word, Excel, images, or text — up to 20 MB.</div>` +
      `<select id="bupcat" style="padding:8px 10px;border:1px solid #cfd6e2;border-radius:8px;font:inherit;margin-right:8px">` + editCats.map(c => `<option>${esc(c)}</option>`).join('') + `</select>` +
      `<input type="file" id="bup" style="display:none"><button class="dl" style="border:none;cursor:pointer" onclick="document.getElementById('bup').click()">Choose a file to add</button> <span id="bupmsg" style="font-size:12px;color:var(--muted)"></span>` +
      `</div></div>`;
  }
  if (!visCount) {
    body += '<div class="card"><div class="empty"><b>Documents are being prepared.</b><br>Your RRG contact will let you know as materials are added.</div></div>';
  } else {
    body += visibleCats.map(cat => {
      const inCat = docs.filter(d => (d.category || 'Other') === cat);
      if (!inCat.length) return '';
      const lvl = catLevel(cat);
      const canDl = lvl !== 'view';
      return `<div class="card"><div class="chd">${esc(cat)}<span class="n">${inCat.length}</span></div>` +
        inCat.map(d => {
          const href = '/roomfile/' + esc(r.token) + '/' + esc(d.id) + (canDl ? '?dl=1' : '');
          const label = canDl ? 'Download →' : 'View →';
          return `<a class="docrow" href="${href}" target="_blank" rel="noopener"><span class="ext">${esc(d.ext)}</span><div style="flex:1"><div class="dt">${esc(d.title || d.originalName)}</div><div class="dm">${esc(fmtBytes(d.size))}</div></div><span class="dl">${label}</span></a>`;
        }).join('') +
        `</div>`;
    }).join('');
  }
  const script = editCats.length ? `<script>(function(){var fi=document.getElementById('bup');if(!fi)return;fi.addEventListener('change',function(){var f=fi.files&&fi.files[0];var m=document.getElementById('bupmsg');if(!f)return;if(f.size>20*1024*1024){m.textContent='That file is over 20 MB.';fi.value='';return;}m.textContent='Uploading '+f.name+'…';var rd=new FileReader();rd.onload=function(){var s=String(rd.result||''),i=s.indexOf(','),b64=(i>=0?s.slice(i+1):s);var cat=(document.getElementById('bupcat')||{}).value||'';fetch(location.pathname.replace(/\/+$/,'')+'/upload',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({filename:f.name,dataB64:b64,category:cat})}).then(function(r){return r.json();}).then(function(j){if(j&&j.ok){m.textContent='Added ✓ — reloading…';setTimeout(function(){location.reload();},700);}else{m.textContent=(j&&j.error)||'Upload failed.';fi.value='';}}).catch(function(){m.textContent='Upload failed.';fi.value='';});};rd.readAsDataURL(f);});})();<\/script>` : '';
  return roomShell('RRG Data Room — ' + (r.business || 'Confidential'), { head, body: body + script });
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
const TXN_STATUSES = ['LOI', 'Under Contract', 'Due Diligence', 'Financing', 'Closing', 'Closed', 'Dead'];
const TXN_COMM_STATUS = ['Unpaid', 'Invoiced', 'Partial', 'Paid'];
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
    stageFlags: o.stageFlags || {}, pipelineId: o.pipelineId || '', referredBy: o.referredBy || '', referralPct: o.referralPct || '', listingLive: o.listingLive || '', listingStart: o.listingStart || '', listingExpires: o.listingExpires || '', autoRenew: !!o.autoRenew,
    offers: Array.isArray(o.offers) ? o.offers : [],
    tours: Array.isArray(o.tours) ? o.tours : [],
    ndas: Array.isArray(o.ndas) ? o.ndas : [],
    inquiries: Array.isArray(o.inquiries) ? o.inquiries : [],
    bbsRef: o.bbsRef || '', bbsNumber: o.bbsNumber || '',
    transaction: (o.transaction && typeof o.transaction === 'object') ? o.transaction : null,
    value: (bov && (bov.targetText || bov.rangeText)) || '', basis: (bov && bov.basis) || '',
    stages, lastActivity, createdAt: created,
  };
}
function ownsAssignment(req, d) {
  if (req.user && isSuper(req.user)) return true;
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
  const isAdmin = req.user && isSuper(req.user);
  const list = Object.values(deals).filter(d => isAdmin || canSeeAllDeals(req) || ownsAssignment(req, d)).map(d => assignmentView(d, overlay));
  list.sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
  res.json({ ok: true, isAdmin: !!isAdmin, canDelete: canDelete(req), statuses: ASSIGN_STATUSES, metros: RRG_METROS, assignments: list });
});
app.get('/api/assignment/:key', (req, res) => {
  const deals = assignmentsIndex(), overlay = loadAssignOverlay();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!(canSeeAllDeals(req) || ownsAssignment(req, d))) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const origin = req.protocol + '://' + req.get('host');
  const dealAgreements = loadAgreements().filter(a => a.dealKey === d.key).map(agreementBrief).sort((x,y)=>String(x.expires||'9999').localeCompare(String(y.expires||'9999')));
  res.json({ ok: true, statuses: ASSIGN_STATUSES, txnStatuses: TXN_STATUSES, commStatuses: TXN_COMM_STATUS, assignment: assignmentView(d, overlay), agreements: dealAgreements, agreementTypes: AGREEMENT_TYPES, pipelines: loadPipelines(), roomActivity: roomActivityFor(d, origin) });
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
  if (b.stageFlags && typeof b.stageFlags === 'object') {
    const allowedStages = ['outreach','agreed','offers','dd','closing'];
    const sf = {};
    Object.keys(b.stageFlags).forEach(k => { if (b.stageFlags[k] && (allowedStages.indexOf(k) >= 0 || /^g\d+$/.test(k))) sf[k] = true; });
    cur.stageFlags = sf;
  }
  if (typeof b.referredBy === 'string') cur.referredBy = b.referredBy.slice(0, 120);
  if (b.referralPct != null) cur.referralPct = String(b.referralPct).replace(/[^0-9.]/g,'').slice(0, 6);
  if (typeof b.listingLive === 'string') cur.listingLive = b.listingLive.slice(0, 10);
  if (typeof b.listingStart === 'string') cur.listingStart = b.listingStart.slice(0, 10);
  if (typeof b.listingExpires === 'string') cur.listingExpires = b.listingExpires.slice(0, 10);
  if (typeof b.autoRenew === 'boolean') cur.autoRenew = b.autoRenew;
  if (typeof b.bbsRef === 'string') cur.bbsRef = b.bbsRef.slice(0, 80);
  if (typeof b.bbsNumber === 'string') cur.bbsNumber = b.bbsNumber.replace(/[^0-9A-Za-z-]/g, '').slice(0, 40);
  if (typeof b.pipelineId === 'string') cur.pipelineId = b.pipelineId.slice(0, 40);
  cur.updatedAt = new Date().toISOString();
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true });
});
app.get('/api/deals', (req, res) => {
  const idx = assignmentsIndex(), overlay = loadAssignOverlay();
  const isAdmin = isSuper(req.user);
  const out = [];
  Object.values(idx).forEach(function (d) {
    const cur = overlay[d.key] || {}; const t = cur.transaction;
    if (!t || typeof t !== 'object') return;
    if (!(isAdmin || canSeeAllDeals(req) || ownsAssignment(req, d))) return;
    let business = cur.businessOverride || '';
    try { business = business || assignmentView(d, overlay).business; } catch (e) {}
    out.push({ key: d.key, business: business || '', buyer: t.buyer || '', buyerCompany: t.buyerCompany || '', personId: t.personId || '', price: t.price || '', status: t.status || '', opened: t.opened || '', expectedClose: t.expectedClose || '', closedDate: t.closedDate || '', terms: t.terms || '', commissionRate: t.commissionRate || '', commissionDue: t.commissionDue || '', commissionPaid: t.commissionPaid || '', commissionStatus: t.commissionStatus || '', updatedAt: t.updatedAt || '' });
  });
  out.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  res.json({ ok: true, deals: out, statuses: TXN_STATUSES, commStatuses: TXN_COMM_STATUS, isAdmin: !!isAdmin });
});
// ---- The Deal (transaction) on a listing: the actual buyer-side transaction, one per listing ----
app.post('/api/assignment/:key/deal', express.json(), (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Listing not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  const t = (cur.transaction && typeof cur.transaction === 'object') ? cur.transaction : { createdAt: new Date().toISOString(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
  const b = req.body || {};
  if (typeof b.buyer === 'string') t.buyer = b.buyer.slice(0, 160);
  if (typeof b.buyerCompany === 'string') t.buyerCompany = b.buyerCompany.slice(0, 160);
  if (typeof b.price === 'string') t.price = b.price.slice(0, 40);
  if (typeof b.status === 'string' && TXN_STATUSES.indexOf(b.status) >= 0) t.status = b.status;
  if (!t.status) t.status = TXN_STATUSES[0];
  if (typeof b.opened === 'string') t.opened = b.opened.slice(0, 10);
  if (typeof b.expectedClose === 'string') t.expectedClose = b.expectedClose.slice(0, 10);
  if (typeof b.closedDate === 'string') t.closedDate = b.closedDate.slice(0, 10);
  if (typeof b.notes === 'string') t.notes = b.notes.slice(0, 2000);
  if (typeof b.terms === 'string') t.terms = b.terms.slice(0, 2000);
  if (typeof b.commissionRate === 'string') t.commissionRate = b.commissionRate.slice(0, 40);
  if (typeof b.commissionDue === 'string') t.commissionDue = b.commissionDue.slice(0, 40);
  if (typeof b.commissionPaid === 'string') t.commissionPaid = b.commissionPaid.slice(0, 40);
  if (typeof b.commissionStatus === 'string' && TXN_COMM_STATUS.indexOf(b.commissionStatus) >= 0) t.commissionStatus = b.commissionStatus;
  t.updatedAt = new Date().toISOString();
  if (t.buyer || b.buyerEmail) { const p = findOrCreatePerson(req, { name: t.buyer, email: b.buyerEmail, company: t.buyerCompany, type: 'Buyer' }); if (p) t.personId = p.id; }
  cur.transaction = t; cur.updatedAt = new Date().toISOString();
  overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, transaction: t, people: loadPeople().map(personBrief) });
});
app.delete('/api/assignment/:key/deal', (req, res) => {
  const deals = assignmentsIndex();
  const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Listing not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay();
  const cur = overlay[d.key] || {};
  delete cur.transaction; cur.updatedAt = new Date().toISOString();
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
function newInquiryId() { return 'inq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// Parse pasted BizBuySell buyer-lead email blocks into structured leads.
function parseBizBuySellLeads(text) {
  const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = src.split('\n');
  const LABELS = {
    'date': 'date',
    'listing': 'listingName', 'listing name': 'listingName', 'listing title': 'listingName',
    'listing #': 'listingNumber', 'listing number': 'listingNumber', 'listing no': 'listingNumber', 'listing id': 'listingNumber', 'ad id': 'listingNumber', 'ad #': 'listingNumber',
    'ref id': 'refId', 'ref': 'refId', 'ref #': 'refId', 'reference': 'refId', 'reference id': 'refId',
    'name': 'name', 'buyer': 'name', 'buyer name': 'name', 'from': 'name',
    'email': 'email', 'e-mail': 'email', 'email address': 'email',
    'phone': 'phone', 'phone number': 'phone', 'tel': 'phone', 'telephone': 'phone', 'mobile': 'phone', 'cell': 'phone',
    'first name': 'firstName', 'first': 'firstName', 'fname': 'firstName',
    'last name': 'lastName', 'last': 'lastName', 'lname': 'lastName', 'surname': 'lastName',
    'message': 'message', 'comments': 'message', 'comment': 'message', 'buyer message': 'message', 'inquiry': 'message',
    'zip': 'zip', 'zip code': 'zip', 'zipcode': 'zip', 'postal code': 'zip', 'postal': 'zip',
    'available funds': 'funds', 'funds': 'funds', 'funds available': 'funds', 'available capital': 'funds', 'capital': 'funds', 'liquid capital': 'funds', 'cash available': 'funds',
    'time frame': 'timeframe', 'timeframe': 'timeframe', 'timeline': 'timeframe', 'purchase timeframe': 'timeframe', 'buying timeframe': 'timeframe',
  };
  const leads = []; let cur = null;
  function flush(){ if (cur && (cur.email || cur.phone)) leads.push(cur); cur = null; }
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z #.\/\-]{0,24}?)\s*[:\t]\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
      const field = LABELS[key];
      if (field) {
        const val = m[2].trim();
        if (!cur) cur = {};
        if (cur[field] != null && (field === 'email' || field === 'listingNumber' || field === 'date')) { flush(); cur = {}; }
        cur[field] = val;
        continue;
      }
    }
    const em = line.match(/[\w.+\-]+@[\w.\-]+\.[A-Za-z]{2,}/);
    if (em && cur && !cur.email) { cur.email = em[0]; continue; }
  }
  flush();
  return leads.map(l => ({
    date: String(l.date || '').slice(0, 80),
    listingName: String(l.listingName || '').slice(0, 200),
    listingNumber: String(l.listingNumber || '').replace(/[^0-9A-Za-z\-]/g, '').slice(0, 40),
    refId: String(l.refId || '').slice(0, 80),
    name: String(l.name || '').slice(0, 120),
    email: String(l.email || '').slice(0, 160),
    phone: String(l.phone || '').slice(0, 60),
    firstName: String(l.firstName || '').slice(0, 80),
    lastName: String(l.lastName || '').slice(0, 80),
    message: String(l.message || '').replace(/\s+/g, ' ').slice(0, 2000),
    zip: String(l.zip || '').replace(/[^0-9A-Za-z \-]/g, '').slice(0, 20),
    funds: String(l.funds || '').slice(0, 80),
    timeframe: String(l.timeframe || '').slice(0, 120),
  })).filter(l => l.email || l.phone);
}
// Core importer: buyer contact (deduped) + inquiry on the matched listing + follow-up task.
function importBbsLeads(req, leads) {
  const overlay = loadAssignOverlay();
  const idx = assignmentsIndex();
  const byRef = {}, byNum = {};
  Object.keys(overlay).forEach(k => { const o = overlay[k] || {}; if (o.bbsRef) byRef[String(o.bbsRef).toLowerCase().trim()] = k; if (o.bbsNumber) byNum[String(o.bbsNumber).toLowerCase().trim()] = k; });
  const now = new Date().toISOString();
  const due = (function(){ const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })();
  const tasks = loadTasks();
  let imported = 0, matched = 0, unmatched = 0, dupes = 0;
  const results = [];
  (leads || []).forEach(l => {
    const email = String(l.email || '').trim();
    const refKey = l.refId ? byRef[String(l.refId).toLowerCase().trim()] : null;
    const numKey = l.listingNumber ? byNum[String(l.listingNumber).toLowerCase().trim()] : null;
    const key = refKey || numKey || null;
    const qualBits = []; if (l.funds) qualBits.push('Funds: ' + l.funds); if (l.timeframe) qualBits.push('Timeframe: ' + l.timeframe); if (l.zip) qualBits.push('Zip: ' + l.zip); const qualLine = qualBits.join(' \u00b7 ');
    const person = findOrCreatePerson(req, { name: l.name || '', firstName: l.firstName || '', lastName: l.lastName || '', email: email, phones: l.phone ? [l.phone] : [], type: (PERSON_TYPES.indexOf('Buyer') >= 0 ? 'Buyer' : 'Buyer') });
    if (person) { try { const ppl = loadPeople(); const pp = ppl.find(x => x.id === person.id); if (pp) { logActivity(pp, 'BizBuySell Lead', ('Inquired on ' + (l.listingName || 'a listing') + (l.refId ? (' \u00b7 Ref ' + l.refId) : (l.listingNumber ? (' \u00b7 #' + l.listingNumber) : '')) + (qualLine ? (' \u00b7 ' + qualLine) : '') + (l.message ? (' \u2014 \u201c' + String(l.message).slice(0,140) + '\u201d') : '')).slice(0, 300), { auto: true, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); savePeople(ppl); } } catch (e) {} }
    let listingLabel = l.listingName || '';
    if (key) {
      matched++;
      const cur = overlay[key] || {};
      const inqs = Array.isArray(cur.inquiries) ? cur.inquiries : [];
      const isDup = email && inqs.some(x => String(x.email || '').toLowerCase() === email.toLowerCase());
      if (isDup) { dupes++; }
      else { inqs.push({ id: newInquiryId(), source: 'BizBuySell', name: l.name || '', email: email, phone: l.phone || '', personId: (person && person.id) || '', refId: l.refId || '', listingNumber: l.listingNumber || '', date: l.date || '', zip: l.zip || '', funds: l.funds || '', timeframe: l.timeframe || '', message: l.message || '', status: 'Unqualified', note: [qualLine, (l.message ? ('\u201c' + l.message + '\u201d') : '')].filter(Boolean).join(' \u2014 ').slice(0, 2000), createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); }
      cur.inquiries = inqs; cur.updatedAt = now; overlay[key] = cur;
      try { const dv = idx[key] ? assignmentView(idx[key], overlay) : null; if (dv && dv.business) listingLabel = dv.business; } catch (e) {}
    } else { unmatched++; }
    const noteLines = [];
    if (l.phone) noteLines.push('Phone: ' + l.phone);
    if (email) noteLines.push('Email: ' + email);
    if (l.listingName) noteLines.push('Listing: ' + l.listingName);
    if (l.funds) noteLines.push('Available funds: ' + l.funds);
    if (l.timeframe) noteLines.push('Time frame: ' + l.timeframe);
    if (l.zip) noteLines.push('Zip: ' + l.zip);
    if (l.message) noteLines.push('Message: ' + l.message);
    if (!key && (l.refId || l.listingNumber)) noteLines.push('UNMATCHED \u2014 set BizBuySell Ref \u201c' + (l.refId || l.listingNumber) + '\u201d on the right listing, then this buyer can be attached.');
    tasks.push({ id: newTaskId(), title: ('Follow up (BizBuySell): ' + (l.name || email || 'buyer') + (listingLabel ? (' \u2014 ' + listingLabel) : '')).slice(0, 300), notes: noteLines.join('\n').slice(0, 2000), assignee: (req.user && req.user.username) || '', assigneeName: (req.user && req.user.name) || '', due: due, reminder: due, priority: 'Normal', status: 'open', linkType: 'contact', linkId: (person && person.id) || '', linkLabel: (person && person.name) || l.name || email, createdBy: (req.user && req.user.username) || '', createdByName: (req.user && req.user.name) || '', createdAt: now, updatedAt: now });
    imported++;
    results.push({ email: email, name: l.name || '', listing: listingLabel, matched: !!key, ref: l.refId || l.listingNumber || '' });
  });
  saveAssignOverlay(overlay); saveTasks(tasks);
  return { ok: true, imported: imported, matched: matched, unmatched: unmatched, dupes: dupes, results: results };
}
// Preview a paste (no writes) so the import window can show what it found.
app.post('/api/bizbuysell/parse', express.json({ limit: '1mb' }), (req, res) => {
  res.json({ ok: true, leads: parseBizBuySellLeads((req.body || {}).text || '') });
});
// Import leads — accepts { text } (server parses) or { leads:[...] } (from a CSV parsed client-side).
app.post('/api/bizbuysell/import', express.json({ limit: '2mb' }), (req, res) => {
  const b = req.body || {};
  let leads = Array.isArray(b.leads) ? b.leads.map(l => ({ date: String(l.date || '').slice(0, 80), listingName: String(l.listingName || l.listing || '').slice(0, 200), listingNumber: String(l.listingNumber || l.number || l['listing #'] || '').slice(0, 40), refId: String(l.refId || l.ref || l['ref id'] || '').slice(0, 80), name: String(l.name || l.buyer || '').slice(0, 120), email: String(l.email || '').slice(0, 160), phone: String(l.phone || '').slice(0, 60) })).filter(l => l.email || l.phone) : parseBizBuySellLeads(b.text || '');
  if (!leads.length) return res.status(400).json({ ok: false, error: 'No buyer leads found to import — check the pasted text or file.' });
  res.json(importBbsLeads(req, leads));
});
// Pull BizBuySell buyer-lead emails from the user's connected Gmail and import them.
// ---- BizBuySell Gmail auto-pull (shared by the manual button and the background poller) ----
const BBSPOLL_FILE = path.join(BOV_DATA_DIR, 'bbspoll.json');
function loadBbsPoll() { try { return JSON.parse(fs.readFileSync(BBSPOLL_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function saveBbsPoll(o) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(BBSPOLL_FILE, JSON.stringify(o, null, 2)); } catch (e) {} }
async function bbsGmailPull(username, name, opts) {
  opts = opts || {};
  if (!gmail.statusFor(username).connected) return { ok: false, error: 'Gmail not connected.' };
  const q = '(from:bizbuysell.com OR bizbuysell) newer_than:180d';
  const msgs = await gmail.searchLeadBodies(username, q, 50);
  const store = loadBbsPoll(); const rec = store[username] || {};
  const seen = Array.isArray(rec.seen) ? rec.seen : [];
  const seenSet = {}; seen.forEach(id => seenSet[id] = 1);
  const fresh = opts.all ? msgs : msgs.filter(m => !seenSet[m.id]);
  let leads = [];
  fresh.forEach(m => { const found = parseBizBuySellLeads(m.body || ''); if (found.length) leads = leads.concat(found); });
  const byEmail = {}; leads = leads.filter(l => { const k = String(l.email || l.phone || '').toLowerCase(); if (!k || byEmail[k]) return false; byEmail[k] = 1; return true; });
  // Mark EVERY fetched message id as seen (even non-lead ones) so nothing is re-scanned / re-tasked.
  rec.seen = seen.concat(msgs.map(m => m.id)).filter((v, i, a) => a.indexOf(v) === i).slice(-3000);
  rec.lastRun = new Date().toISOString();
  let out = { ok: true, imported: 0, matched: 0, unmatched: 0, dupes: 0, results: [], scanned: msgs.length, fresh: fresh.length };
  if (leads.length) { out = Object.assign(importBbsLeads({ user: { username: username, name: name || username } }, leads), { scanned: msgs.length, fresh: fresh.length }); }
  rec.lastCount = out.imported || 0; store[username] = rec; saveBbsPoll(store);
  return out;
}
app.post('/api/bizbuysell/gmail', express.json(), async (req, res) => {
  try {
    const u = (req.user && req.user.username) || '';
    if (!gmail.statusFor(u).connected) return res.status(400).json({ ok: false, error: 'Connect your Gmail first — open any contact, Email tab, Connect Gmail.' });
    const out = await bbsGmailPull(u, (req.user && req.user.name) || u, { all: !!(req.body && req.body.all) });
    if (out.ok && !out.imported) out.note = out.scanned ? ('Scanned ' + out.scanned + ' BizBuySell email(s)' + (out.fresh === 0 ? ' — all already imported.' : ', but could not read lead fields automatically. Use Paste or CSV, or send me a sample to tune the reader.')) : 'No BizBuySell lead emails found in the last 180 days.';
    res.json(out);
  } catch (e) { res.status(502).json({ ok: false, error: String((e && e.message) || e) }); }
});
app.get('/api/bizbuysell/poll', (req, res) => {
  const u = (req.user && req.user.username) || ''; const rec = (loadBbsPoll()[u]) || {};
  res.json({ ok: true, enabled: !!rec.enabled, intervalMin: rec.intervalMin || 15, connected: gmail.statusFor(u).connected, configured: gmail.isConfigured(), lastRun: rec.lastRun || '', lastCount: rec.lastCount || 0 });
});
app.post('/api/bizbuysell/poll', express.json(), (req, res) => {
  const u = (req.user && req.user.username) || ''; if (!u) return res.status(401).json({ ok: false, error: 'Sign in required.' });
  const b = req.body || {}; const store = loadBbsPoll(); const rec = store[u] || {};
  if (typeof b.enabled === 'boolean') rec.enabled = b.enabled;
  if (b.intervalMin != null) { const m = parseInt(b.intervalMin, 10); rec.intervalMin = (isFinite(m) && m >= 5) ? Math.min(m, 720) : 15; }
  store[u] = rec; saveBbsPoll(store);
  res.json({ ok: true, enabled: !!rec.enabled, intervalMin: rec.intervalMin || 15 });
});
// Background poller — checks each enabled+connected user's Gmail when their interval is due.
let _bbsPolling = false;
async function bbsPollTick() {
  if (_bbsPolling) return; _bbsPolling = true;
  try {
    if (gmail.isConfigured()) {
      const store = loadBbsPoll(); const users = auth.loadUsers(); const now = Date.now();
      for (const uname of Object.keys(store)) {
        const rec = store[uname]; if (!rec || !rec.enabled) continue;
        if (!gmail.statusFor(uname).connected) continue;
        const iv = (rec.intervalMin || 15) * 60 * 1000;
        const last = rec.lastRun ? Date.parse(rec.lastRun) : 0;
        if (now - last < iv) continue;
        const prof = (users || []).find(x => x.username === uname) || {};
        try { const r = await bbsGmailPull(uname, prof.name || uname, {}); if (r && r.imported) console.log('BizBuySell poll: imported ' + r.imported + ' lead(s) for ' + uname); } catch (e) { console.error('bbs poll error ' + uname + ':', e && e.message); }
      }
    }
  } catch (e) { console.error('bbs poll tick:', e && e.message); }
  _bbsPolling = false;
}
setInterval(bbsPollTick, 60 * 1000);
// Add / update / remove an inquiry on a listing (manual entry + status changes).
app.post('/api/assignment/:key/inquiry', express.json(), (req, res) => {
  const deals = assignmentsIndex(); const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay(); const cur = overlay[d.key] || {};
  const inqs = Array.isArray(cur.inquiries) ? cur.inquiries : [];
  const b = req.body || {}; const now = new Date().toISOString();
  const INQ_STATUS = ['Unqualified', 'Contacted', 'Qualified', 'NDA Sent', 'Toured', 'Offer', 'Passed', 'Dead'];
  let rec = b.id ? inqs.find(x => x.id === b.id) : null;
  if (!rec) { rec = { id: newInquiryId(), source: b.source || 'Manual', createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }; inqs.push(rec); }
  if (typeof b.name === 'string') rec.name = b.name.slice(0, 120);
  if (typeof b.email === 'string') rec.email = b.email.slice(0, 160);
  if (typeof b.phone === 'string') rec.phone = b.phone.slice(0, 60);
  if (typeof b.note === 'string') rec.note = b.note.slice(0, 2000);
  if (typeof b.status === 'string' && INQ_STATUS.indexOf(b.status) >= 0) rec.status = b.status;
  if (!rec.status) rec.status = 'Unqualified';
  if ((rec.name || rec.email) && !rec.personId) { const p = findOrCreatePerson(req, { name: rec.name || '', email: rec.email || '', phones: rec.phone ? [rec.phone] : [], type: 'Buyer' }); if (p) rec.personId = p.id; }
  rec.updatedAt = now;
  cur.inquiries = inqs; cur.updatedAt = now; overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, inquiries: inqs, statuses: INQ_STATUS });
});
app.post('/api/assignment/:key/inquiry/:id/remove', (req, res) => {
  const deals = assignmentsIndex(); const d = deals[req.params.key];
  if (!d) return res.status(404).json({ ok: false, error: 'Assignment not found.' });
  if (!ownsAssignment(req, d)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const overlay = loadAssignOverlay(); const cur = overlay[d.key] || {};
  cur.inquiries = (Array.isArray(cur.inquiries) ? cur.inquiries : []).filter(x => x.id !== req.params.id);
  cur.updatedAt = new Date().toISOString(); overlay[d.key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, inquiries: cur.inquiries });
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
  res.setHeader('Cache-Control', 'no-store');
  const cos = {}, coMain = {}; loadCompanies().forEach(c => { cos[c.id] = c.name; coMain[c.id] = c.mainContactId || ''; });
  const people = loadPeople().filter(p => !restrictToOwn(req) || permOwnerMatch(req, p.by)).map(p => Object.assign(personBrief(p), { companyName: (p.companyId && cos[p.companyId]) || '', isMainContact: !!(p.companyId && coMain[p.companyId] === p.id) }));
  res.json({ ok: true, people: people, canDelete: canDelete(req), types: effPersonTypes(), leadSources: effLeadSources(), isAdmin: !!(req.user && isSuper(req.user)) });
});
app.post('/api/person', express.json(), (req, res) => {
  const b = req.body || {};
  const arr = loadPeople();
  const isNew = !b.id;
  let p = b.id ? arr.find(x => x.id === b.id) : null;
  const now = new Date().toISOString();
  // Required first / last / type on entry.
  const first = String((typeof b.firstName === 'string' ? b.firstName : (p && p.firstName) || '') || '').trim();
  const last = String((typeof b.lastName === 'string' ? b.lastName : (p && p.lastName) || '') || '').trim();
  if (!first || !last) return res.status(400).json({ ok: false, error: 'First and last name are required.' });
  const typeIn = (typeof b.type === 'string' && effPersonTypes().indexOf(b.type) >= 0) ? b.type : (p && p.type) || '';
  if (!typeIn) return res.status(400).json({ ok: false, error: 'A contact type is required.' });
  // Multiple emails / phones — all emails must be globally unique.
  const emails = (b.emails !== undefined || b.email !== undefined) ? cleanList(b.emails !== undefined ? b.emails : b.email, 10, 160) : (p ? personEmails(p) : []);
  const phones = (b.phones !== undefined || b.phone !== undefined) ? cleanList(b.phones !== undefined ? b.phones : b.phone, 10, 60) : (p ? personPhones(p) : []);
  const clash = emailOwner(arr, emails, p ? p.id : '__new__');
  if (clash) return res.status(409).json({ ok: false, error: 'That email is already on ' + (clash.name || 'another contact') + '.', existingId: clash.id });
  if (!p) { p = { id: newPersonId(), createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }; arr.push(p); }
  p.firstName = first.slice(0, 80); p.lastName = last.slice(0, 80); p.name = composeName(p.firstName, p.lastName);
  p.type = typeIn;
  p.emails = emails; p.phones = phones;
  // Preferred email / phone — the value the app shows first (falls back to the first entry).
  if (typeof b.preferredEmail === 'string') p.preferredEmail = emails.indexOf(b.preferredEmail.trim()) >= 0 ? b.preferredEmail.trim() : '';
  else if (p.preferredEmail && emails.indexOf(p.preferredEmail) < 0) p.preferredEmail = '';
  if (typeof b.preferredPhone === 'string') p.preferredPhone = phones.indexOf(b.preferredPhone.trim()) >= 0 ? b.preferredPhone.trim() : '';
  else if (p.preferredPhone && phones.indexOf(p.preferredPhone) < 0) p.preferredPhone = '';
  p.email = preferredEmailOf(p); p.phone = preferredPhoneOf(p);
  if (typeof b.company === 'string') p.company = b.company.slice(0, 160);
  if (typeof b.companyId === 'string') p.companyId = b.companyId.slice(0, 40);
  if (typeof b.companyName === 'string' && b.companyName.trim()) { const co = findOrCreateCompany(req, { name: b.companyName }); if (co) { p.companyId = co.id; p.company = co.name; } }
  if (typeof b.title === 'string') p.title = b.title.slice(0, 120);
  if (typeof b.nickname === 'string') p.nickname = b.nickname.slice(0, 80);
  if (typeof b.leadSource === 'string') p.leadSource = b.leadSource.slice(0, 160);
  if (typeof b.referredBy === 'string') p.referredBy = b.referredBy.slice(0, 160);
  if (typeof b.referredById === 'string') p.referredById = b.referredById.slice(0, 40);
  if (Array.isArray(b.prefContact)) p.prefContact = b.prefContact.filter(x => ['phone', 'text', 'email'].indexOf(x) >= 0);
  if (typeof b.lastContacted === 'string') p.lastContacted = b.lastContacted.slice(0, 10);
  if (typeof b.url === 'string') p.url = b.url.slice(0, 300);
  if (b.vip !== undefined) p.vip = !!b.vip;
  if (b.caution !== undefined) p.caution = !!b.caution;
  if (b.tags !== undefined) p.tags = (cleanStrList(b.tags, 30, 40) || []);
  if (typeof b.notes === 'string') p.notes = b.notes.slice(0, 4000);
  if (isNew) logContactAdded(p, req);
  p.updatedAt = now; savePeople(arr);
  res.json({ ok: true, person: Object.assign({}, p, { emails: personEmails(p), phones: personPhones(p) }), people: arr.map(personBrief) });
});
// A buyer's interested listings (their inquiries across every listing) — the buyer-first view.
function personInterested(personId) {
  const overlay = loadAssignOverlay(); const idx = assignmentsIndex(); const out = [];
  for (const key in overlay) {
    const o = overlay[key] || {};
    (Array.isArray(o.inquiries) ? o.inquiries : []).filter(x => x.personId === personId).forEach(x => {
      let biz = ''; try { if (idx[key]) biz = assignmentView(idx[key], overlay).business; } catch (e) {}
      out.push({ key: key, business: biz || key, status: x.status || 'Unqualified', inquiryId: x.id, date: x.date || x.createdAt || '' });
    });
  }
  return out;
}
app.post('/api/person/:id/link-listing', express.json(), (req, res) => {
  const p = personById(req.params.id); if (!p) return res.status(404).json({ ok: false, error: 'Contact not found.' });
  const key = String((req.body || {}).key || ''); const idx = assignmentsIndex(); if (!idx[key]) return res.status(404).json({ ok: false, error: 'Listing not found.' });
  const overlay = loadAssignOverlay(); const cur = overlay[key] || {}; const inqs = Array.isArray(cur.inquiries) ? cur.inquiries : [];
  if (!inqs.some(x => x.personId === p.id)) {
    inqs.push({ id: newInquiryId(), source: 'Linked', name: p.name || '', email: p.email || '', phone: p.phone || '', personId: p.id, status: 'Unqualified', note: '', createdAt: new Date().toISOString(), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' });
  }
  cur.inquiries = inqs; cur.updatedAt = new Date().toISOString(); overlay[key] = cur; saveAssignOverlay(overlay);
  res.json({ ok: true, interested: personInterested(p.id) });
});
app.post('/api/person/:id/unlink-listing', express.json(), (req, res) => {
  const p = personById(req.params.id); if (!p) return res.status(404).json({ ok: false, error: 'Contact not found.' });
  const key = String((req.body || {}).key || ''); const overlay = loadAssignOverlay(); const cur = overlay[key];
  if (cur) { cur.inquiries = (Array.isArray(cur.inquiries) ? cur.inquiries : []).filter(x => x.personId !== p.id); cur.updatedAt = new Date().toISOString(); overlay[key] = cur; saveAssignOverlay(overlay); }
  res.json({ ok: true, interested: personInterested(p.id) });
});
app.delete('/api/person/:id', (req, res) => {
  if (!canDelete(req)) return res.status(403).json({ ok: false, error: 'You do not have permission to delete contacts.' });
  const arr = loadPeople().filter(p => p.id !== req.params.id);
  savePeople(arr);
  res.json({ ok: true, people: arr.map(personBrief) });
});
// ---------- Space Tracker: available-space inventory ----------
app.get('/api/spaces', (req, res) => {
  res.json({ ok: true, spaces: loadSpaces(), types: SPACE_TYPES, statuses: SPACE_STATUS, features: SPACE_FEATURES });
});
app.post('/api/space', express.json(), (req, res) => {
  const b = req.body || {};
  const arr = loadSpaces();
  const now = new Date().toISOString();
  const num = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
  let sp = b.id ? arr.find(x => x.id === b.id) : null;
  if (!sp) { sp = { id: newSpaceId(), createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }; arr.push(sp); }
  if (typeof b.name === 'string') sp.name = b.name.slice(0, 160);
  if (typeof b.address === 'string') sp.address = b.address.slice(0, 200);
  if (typeof b.center === 'string') sp.center = b.center.slice(0, 160);
  if (typeof b.market === 'string') sp.market = b.market.slice(0, 120);
  if (typeof b.spaceType === 'string') sp.spaceType = SPACE_TYPES.indexOf(b.spaceType) >= 0 ? b.spaceType : (sp.spaceType || '');
  if (b.size !== undefined) sp.size = num(b.size);
  if (b.rent !== undefined) sp.rent = num(b.rent);
  if (b.nnn !== undefined) sp.nnn = num(b.nnn);
  if (typeof b.status === 'string') sp.status = SPACE_STATUS.indexOf(b.status) >= 0 ? b.status : (sp.status || 'Available');
  if (!sp.status) sp.status = 'Available';
  if (typeof b.landlord === 'string') sp.landlord = b.landlord.slice(0, 160);
  if (typeof b.companyId === 'string') sp.companyId = b.companyId.slice(0, 40);
  if (typeof b.url === 'string') sp.url = b.url.slice(0, 300);
  if (Array.isArray(b.features)) sp.features = b.features.map(x => String(x).slice(0, 40)).filter(Boolean).slice(0, 40);
  if (typeof b.notes === 'string') sp.notes = b.notes.slice(0, 4000);
  sp.updatedAt = now;
  saveSpaces(arr);
  res.json({ ok: true, space: sp, spaces: arr });
});
app.delete('/api/space/:id', (req, res) => {
  if (!(req.user && isSuper(req.user))) return res.status(403).json({ ok: false, error: 'Admin only.' });
  const arr = loadSpaces().filter(x => x.id !== req.params.id);
  saveSpaces(arr);
  res.json({ ok: true, spaces: arr });
});
app.post('/api/space/ai-intake', express.json({ limit: '256kb' }), async (req, res) => {
  try { const text = String((req.body || {}).text || ''); if (!text.trim()) return res.status(400).json({ ok: false, error: 'Paste a listing first.' });
    const fields = await aiassist.parseSpaceListing({ text, types: SPACE_TYPES, features: SPACE_FEATURES }); res.json({ ok: true, fields: fields || {} });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
app.get('/api/site-criteria', (req, res) => {
  try { const list = store.readAll().filter(r => r.form === 'ssc').map(r => ({ key: r.timestamp, name: r.name || 'Untitled', market: r.market || '', rep: r.rep || '', when: r.timestamp || '', summary: r.highlights || '' })).reverse(); res.json({ ok: true, criteria: list }); }
  catch (e) { res.json({ ok: true, criteria: [] }); }
});
app.post('/api/spaces/ai-match', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const b = req.body || {};
    let crit = String(b.criteria || '').trim();
    if (b.criteriaKey) {
      const rec = store.readAll().filter(r => r.form === 'ssc' && r.timestamp === b.criteriaKey)[0];
      if (rec) { const head = 'On-file Site Criteria — Client/Concept: ' + (rec.name || '') + (rec.market ? (' · Market: ' + rec.market) : '') + (rec.rep ? (' · Rep: ' + rec.rep) : ''); crit = head + '\n' + JSON.stringify(rec.data || {}).slice(0, 3500) + (crit ? ('\n\nAdditional notes from the rep: ' + crit) : ''); }
    }
    if (!crit.trim()) return res.status(400).json({ ok: false, error: 'Pick a client on file, or type the criteria.' });
    const spaces = loadSpaces(); if (!spaces.length) return res.json({ ok: true, ranked: [] });
    const ranked = await aiassist.matchSpaces({ criteria: crit, spaces }); res.json({ ok: true, ranked: ranked || [] });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/loi/ai-parse', express.json({ limit: '256kb' }), async (req, res) => {
  try { const b = req.body || {}; const text = String(b.text || ''); if (!text.trim()) return res.status(400).json({ ok: false, error: 'Paste the LOI text first.' });
    const cfg = loadLoiConfig(); const tkey = (b.type === 'business_sale') ? 'business_sale' : 'tenant_rep';
    const terms = ((cfg[tkey] && cfg[tkey].terms) || []).map(t => ({ key: t.key, label: t.label, type: t.type || 'text' }));
    const values = await aiassist.parseLoiText({ text, terms }); res.json({ ok: true, values: values || {} });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
app.get('/api/ai/brief', async (req, res) => {
  try {
    const uname = (req.user && req.user.username) || '';
    const seeAll = isSuper(req.user) || canSeeAllDeals(req);
    const overlay = loadAssignOverlay(); const idx = assignmentsIndex();
    const listingsAll = Object.values(idx).filter(d => seeAll || ownsAssignment(req, d)).map(d => assignmentView(d, overlay));
    const ownedKeys = new Set(listingsAll.map(l => l.key));
    const _ts = new Date().toISOString().slice(0, 10);
    const listings = listingsAll.map(l => ({ business: l.business, market: l.market, status: l.status, owner: l.owner, expires: l.listingExpires || '', daysToExpiry: l.listingExpires ? daysUntil(l.listingExpires) : null, value: l.value || '', hasDeal: !!l.transaction, deal: l.transaction ? { status: l.transaction.status || '', price: l.transaction.price || '', close: l.transaction.expectedClose || l.transaction.closedDate || '', commissionStatus: l.transaction.commissionStatus || '', commissionDue: l.transaction.commissionDue || '' } : null }));
    const tasks = loadTasks().filter(t => t.status === 'open' && taskVisible(t, req) && t.due).map(t => ({ title: t.title, due: String(t.due).slice(0, 10), overdue: String(t.due).slice(0, 10) < _ts, assignee: t.assigneeName || '', priority: t.priority || '' })).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 25);
    const agreementsExpiring = loadAgreements().filter(a => a.status !== 'terminated' && a.expires && a.expires >= _ts).filter(a => seeAll || ownedKeys.has(a.dealKey) || a.byUser === uname).map(a => ({ name: a.name || a.type, type: a.type, party: a.personName || '', expires: a.expires, days: daysUntil(a.expires), signStatus: a.signStatus || '' })).filter(a => a.days != null && a.days <= 60).sort((a, b) => a.days - b.days).slice(0, 20);
    const recentLois = loadLois().filter(l => seeAll || l.byUser === uname || l.by === (req.user && req.user.name)).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 15).map(l => ({ type: l.typeName || l.type || '', tenant: l.tenant || '', landlord: l.landlord || '', property: l.property || '', created: l.createdAt || '' }));
    const sp = loadSpaces(); const spaces = { total: sp.length, available: sp.filter(x => x.status === 'Available').length, loiOut: sp.filter(x => x.status === 'LOI Out').length };
    const data = { listings, tasks, agreementsExpiring, recentLois, spaces, counts: { listings: listings.length, openTasks: tasks.length, overdueTasks: tasks.filter(t => t.overdue).length, dealsUnderContract: listings.filter(l => l.deal && /Under Contract|Closing/i.test(l.deal.status)).length } };
    const brief = await aiassist.dailyBrief({ data, repName: (req.user && req.user.name) || '', today: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) });
    res.json({ ok: true, brief, generatedAt: new Date().toISOString(), repName: (req.user && req.user.name) || '' });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
function aiRoute(fn) { return async (req, res) => { try { const result = await fn(req.body || {}); res.json({ ok: true, result: result || {} }); } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); } }; }
app.post('/api/ai/contact-prep', express.json({ limit: '256kb' }), aiRoute(b => aiassist.callPrep({ person: b.person || {} })));
app.post('/api/ai/enrich-contact', express.json({ limit: '64kb' }), aiRoute(b => aiassist.enrichContact(b || {})));
app.post('/api/ai/enrich-company', express.json({ limit: '64kb' }), aiRoute(b => aiassist.enrichCompany(b || {})));
app.post('/api/ai/loi-review', express.json({ limit: '256kb' }), aiRoute(b => aiassist.reviewLoi({ text: b.text || '' })));
app.post('/api/ai/concept', express.json({ limit: '256kb' }), aiRoute(b => aiassist.conceptPositioning({ concept: b.concept || {}, locations: b.locations || [] })));
app.post('/api/ai/site-read', express.json({ limit: '256kb' }), aiRoute(b => aiassist.locationSiteRead({ location: b.location || {} })));
app.post('/api/ai/calc-summary', express.json({ limit: '256kb' }), aiRoute(b => aiassist.calcSummary({ kind: b.kind || '', inputs: b.inputs || {}, outputs: b.outputs || {} })));
app.post('/api/ai/placer', express.json({ limit: '256kb' }), aiRoute(b => aiassist.parsePlacer({ text: b.text || '' })));
app.post('/api/ai/loi-suggest', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const b = req.body || {}; const cfg = loadLoiConfig(); const tkey = (b.type === 'business_sale') ? 'business_sale' : 'tenant_rep';
    const sections = ((cfg[tkey] && cfg[tkey].clauses) || []).map(c => ({ id: c.id, title: c.title }));
    const result = await aiassist.suggestSections({ dealInfo: b.dealInfo || {}, sections });
    res.json({ ok: true, result: result || {} });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/person/merge', express.json(), (req, res) => {
  const u = req.user || {};
  const canMerge = isSuper(u) || (permsEnabled() && effectivePerms(u).delete);
  if (!canMerge) return res.status(403).json({ ok: false, error: 'You do not have permission to merge contacts.' });
  const b = req.body || {};
  const keepId = String(b.keepId || '');
  let mergeIds = Array.isArray(b.mergeIds) ? b.mergeIds.map(String).filter(Boolean) : [];
  mergeIds = mergeIds.filter(id => id && id !== keepId);
  const people = loadPeople();
  const keep = people.find(p => p.id === keepId);
  if (!keep) return res.status(404).json({ ok: false, error: 'Surviving contact not found.' });
  const losers = mergeIds.map(id => people.find(p => p.id === id)).filter(Boolean);
  if (!losers.length) return res.status(400).json({ ok: false, error: 'Pick at least one other contact to merge in.' });
  const loserIds = losers.map(p => p.id);

  // Union emails / phones (keeper order first)
  const em = personEmails(keep).slice();
  losers.forEach(l => personEmails(l).forEach(e => { if (em.map(x => String(x).toLowerCase()).indexOf(String(e).toLowerCase()) < 0) em.push(e); }));
  const ph = personPhones(keep).slice();
  losers.forEach(l => personPhones(l).forEach(x => { if (ph.indexOf(x) < 0) ph.push(x); }));
  keep.emails = em.slice(0, 10); keep.phones = ph.slice(0, 10);

  // Fill blank scalar fields from the first loser that has them
  ['company', 'companyId', 'title', 'nickname', 'leadSource', 'referredBy', 'referredById', 'url', 'lastContacted'].forEach(f => {
    if (!String(keep[f] || '').trim()) { for (const l of losers) { if (String(l[f] || '').trim()) { keep[f] = l[f]; break; } } }
  });
  keep.vip = !!(keep.vip || losers.some(l => l.vip));
  keep.caution = !!(keep.caution || losers.some(l => l.caution));

  // Union tags + preferred-contact
  const tg = personTags(keep).slice();
  losers.forEach(l => personTags(l).forEach(t => { if (tg.indexOf(t) < 0) tg.push(t); }));
  keep.tags = tg.slice(0, 30);
  const pc = Array.isArray(keep.prefContact) ? keep.prefContact.slice() : [];
  losers.forEach(l => (Array.isArray(l.prefContact) ? l.prefContact : []).forEach(x => { if (pc.indexOf(x) < 0) pc.push(x); }));
  keep.prefContact = pc;

  // Concatenate person-level tours / activities
  let tours = Array.isArray(keep.tours) ? keep.tours.slice() : [];
  let acts = Array.isArray(keep.activities) ? keep.activities.slice() : [];
  losers.forEach(l => { if (Array.isArray(l.tours)) tours = tours.concat(l.tours); if (Array.isArray(l.activities)) acts = acts.concat(l.activities); });
  keep.tours = tours; keep.activities = acts;

  // Merge notes
  const baseNote = String(keep.notes || '').trim();
  const extra = losers.map(l => String(l.notes || '').trim()).filter(n => n && n !== baseNote);
  if (extra.length) keep.notes = [baseNote].concat(extra).filter(Boolean).join('\n\n---\n').slice(0, 8000);

  keep.email = preferredEmailOf(keep); keep.phone = preferredPhoneOf(keep);
  keep.updatedAt = new Date().toISOString();

  // Drop losers, save people (keeper mutations included)
  savePeople(people.filter(p => loserIds.indexOf(p.id) < 0));

  const inLosers = id => id && loserIds.indexOf(id) >= 0;
  // Reassign every reference from a loser to the keeper
  try { const deals = loadDeals(); let ch = false; deals.forEach(d => { if (inLosers(d.contactPersonId)) { d.contactPersonId = keepId; ch = true; } }); if (ch) saveDeals(deals); } catch (e) {}
  try { const ags = loadAgreements(); let ch = false; ags.forEach(a => { if (inLosers(a.personId)) { a.personId = keepId; a.personName = keep.name; ch = true; } }); if (ch) saveAgreements(ags); } catch (e) {}
  try { const cos = loadCompanies(); let ch = false; cos.forEach(c => { if (inLosers(c.mainContactId)) { c.mainContactId = keepId; ch = true; } }); if (ch) saveCompanies(cos); } catch (e) {}
  try { const pp = loadPeople(); let ch = false; pp.forEach(p => { if (inLosers(p.referredById)) { p.referredById = keepId; p.referredBy = keep.name; ch = true; } }); if (ch) savePeople(pp); } catch (e) {}
  try { const ov = loadAssignOverlay(); let ch = false; Object.keys(ov).forEach(k => { const cur = ov[k]; if (!cur) return; ['offers', 'tours', 'ndas'].forEach(coll => { if (Array.isArray(cur[coll])) cur[coll].forEach(r => { if (inLosers(r.personId)) { r.personId = keepId; ch = true; } }); }); }); if (ch) saveAssignOverlay(ov); } catch (e) {}

  res.json({ ok: true, keepId: keepId, merged: loserIds.length, people: loadPeople().map(personBrief) });
});
// ---- Contact photo (optional headshot / logo) ----
const PERSONPHOTO_DIR = path.join(BOV_DATA_DIR, 'personphotos');
app.post('/api/person/:id/email', express.json({ limit: '256kb' }), async (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, error: "Email isn't set up. Configure it in Admin -> Email." });
  const b = req.body || {};
  const to = String(b.to || '').trim() || preferredEmailOf(p);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ ok: false, error: 'A valid recipient email is required.' });
  const subject = String(b.subject || '').slice(0, 300);
  const body = String(b.body || '').slice(0, 20000);
  if (!subject.trim() && !body.trim()) return res.status(400).json({ ok: false, error: 'Add a subject or a message.' });
  try {
    const info = await buildTransport().sendMail({ from: mailFrom(), to, subject: subject || '(no subject)', text: body });
    const now = new Date().toISOString();
    p.emailLog = Array.isArray(p.emailLog) ? p.emailLog : [];
    const entry = { id: 'eml_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to, subject, body: body.slice(0, 6000), sentAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '', messageId: (info && info.messageId) || '' };
    p.emailLog.unshift(entry); p.emailLog = p.emailLog.slice(0, 100);
    logActivity(p, 'Email', subject || '(no subject)', { auto: true, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' });
    p.lastContacted = now.slice(0, 10); p.updatedAt = now;
    savePeople(arr);
    res.json({ ok: true, entry, emailLog: p.emailLog, lastContacted: p.lastContacted });
  } catch (e) { console.error('person email error:', e && e.message); res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ---- Gmail (per-user OAuth: read + send) ----
app.get('/api/gmail/status', (req, res) => {
  const u = (req.user && req.user.username) || '';
  res.json(Object.assign({ ok: true }, gmail.statusFor(u)));
});
app.get('/api/gmail/connect', (req, res) => {
  if (!gmail.isConfigured()) return res.status(400).send('Gmail is not configured on the server yet.');
  const u = (req.user && req.user.username) || '';
  if (!u) return res.redirect('/login');
  res.redirect(gmail.authUrl(u, req));
});
app.get('/api/gmail/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect('/rrg_account.html?gmail=denied');
    const st = gmail.readState(req.query.state || '');
    if (!st || !st.u) return res.redirect('/rrg_account.html?gmail=badstate');
    await gmail.connectFromCode(st.u, req.query.code, gmail.redirectUri(req));
    res.redirect('/rrg_account.html?gmail=connected');
  } catch (e) { console.error('gmail callback:', e && e.message); res.redirect('/rrg_account.html?gmail=error'); }
});
app.post('/api/gmail/disconnect', (req, res) => {
  const u = (req.user && req.user.username) || '';
  gmail.deleteToken(u);
  res.json({ ok: true });
});
app.get('/api/person/:id/gmail', async (req, res) => {
  const u = (req.user && req.user.username) || '';
  const st = gmail.statusFor(u);
  if (!st.connected) return res.json({ ok: true, connected: false, messages: [] });
  const p = personById(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  try { const messages = await gmail.messagesForContact(u, personEmails(p), 25); res.json({ ok: true, connected: true, messages }); }
  catch (e) { console.error('gmail list:', e && e.message); res.status(502).json({ ok: false, connected: true, error: String((e && e.message) || e), messages: [] }); }
});
app.get('/api/gmail/message/:id', async (req, res) => {
  const u = (req.user && req.user.username) || '';
  if (!gmail.statusFor(u).connected) return res.status(400).json({ ok: false, error: 'Gmail not connected.' });
  try { const m = await gmail.messageFull(u, req.params.id); res.json({ ok: true, message: m }); }
  catch (e) { res.status(502).json({ ok: false, error: String((e && e.message) || e) }); }
});
app.post('/api/gmail/send', express.json({ limit: '256kb' }), async (req, res) => {
  const u = (req.user && req.user.username) || '';
  if (!gmail.statusFor(u).connected) return res.status(400).json({ ok: false, error: 'Connect your Gmail first (Account -> Gmail).' });
  const b = req.body || {};
  const arr = loadPeople(); const p = b.personId ? arr.find(x => x.id === b.personId) : null;
  const to = String(b.to || '').trim() || (p ? preferredEmailOf(p) : '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ ok: false, error: 'A valid recipient email is required.' });
  const subject = String(b.subject || '').slice(0, 300);
  const body = String(b.body || '').slice(0, 20000);
  if (!subject.trim() && !body.trim()) return res.status(400).json({ ok: false, error: 'Add a subject or a message.' });
  try {
    const sent = await gmail.sendMessage(u, { to, subject, body, threadId: b.threadId || '', inReplyTo: b.inReplyTo || '' });
    let emailLog = null, lastContacted = null;
    if (p) {
      const now = new Date().toISOString();
      p.emailLog = Array.isArray(p.emailLog) ? p.emailLog : [];
      const entry = { id: 'eml_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to, subject, body: body.slice(0, 6000), sentAt: now, by: (req.user && req.user.name) || '', byUser: u, messageId: sent.id, via: 'gmail' };
      p.emailLog.unshift(entry); p.emailLog = p.emailLog.slice(0, 100);
      logActivity(p, 'Email', subject || '(no subject)', { auto: true, by: (req.user && req.user.name) || '', byUser: u });
      p.lastContacted = now.slice(0, 10); p.updatedAt = now; savePeople(arr);
      emailLog = p.emailLog; lastContacted = p.lastContacted;
    }
    res.json({ ok: true, sent, emailLog, lastContacted });
  } catch (e) { console.error('gmail send:', e && e.message); res.status(502).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.post('/api/person/:id/activity', express.json(), (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  const b = req.body || {};
  const type = String(b.type || '').trim();
  if (effActivityTypes().indexOf(type) < 0) return res.status(400).json({ ok: false, error: 'Pick an activity type.' });
  const entry = logActivity(p, type, b.note, { date: b.date, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '', auto: false });
  let task = null;
  if (type === 'To-Do') {
    try {
      const tasks = loadTasks(); const tnow = new Date().toISOString();
      const due = (typeof b.date === 'string' ? b.date : '').slice(0, 10);
      task = { id: newTaskId(), title: (String(b.note || '').trim() || ('Follow up: ' + (p.name || 'contact'))).slice(0, 300), notes: '', assignee: (req.user && req.user.username) || '', assigneeName: (req.user && req.user.name) || '', due: due, reminder: due, priority: 'Normal', status: 'open', linkType: 'contact', linkId: p.id, linkLabel: p.name || '', createdBy: (req.user && req.user.username) || '', createdByName: (req.user && req.user.name) || '', createdAt: tnow, updatedAt: tnow };
      tasks.push(task); saveTasks(tasks); entry.taskId = task.id;
    } catch (e) { console.error('activity->task error:', e && e.message); }
  }
  savePeople(arr);
  res.json({ ok: true, entry, activities: p.activities, lastContacted: p.lastContacted, task });
});
app.delete('/api/person/:id/activity/:aid', (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  const before = (Array.isArray(p.activities) ? p.activities : []).length;
  p.activities = (Array.isArray(p.activities) ? p.activities : []).filter(a => a.id !== req.params.aid);
  if (p.activities.length !== before) { p.updatedAt = new Date().toISOString(); savePeople(arr); }
  res.json({ ok: true, activities: p.activities });
});
app.post('/api/person/:id/tour', express.json(), (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  const b = req.body || {}, now = new Date().toISOString();
  p.tours = Array.isArray(p.tours) ? p.tours : [];
  const rec = { id: newTourId(), party: p.name || '', date: '', attendees: '', host: (req.user && req.user.name) || '', interest: '', notes: '', createdAt: now, updatedAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
  applyTourFields(rec, b);
  p.tours.unshift(rec);
  try { logActivity(p, 'Tour', rec.notes || 'Tour logged', { auto: true, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); } catch (e) {}
  p.updatedAt = now; savePeople(arr);
  res.json({ ok: true, tours: p.tours });
});
app.delete('/api/person/:id/tour/:tourId', (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  p.tours = (Array.isArray(p.tours) ? p.tours : []).filter(t => t.id !== req.params.tourId);
  p.updatedAt = new Date().toISOString(); savePeople(arr);
  res.json({ ok: true, tours: p.tours });
});
app.post('/api/person/:id/photo', express.json({ limit: '8mb' }), (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Contact not found.' });
  const dataB64 = String((req.body && req.body.dataB64) || '').replace(/^data:[^,]*,/, '');
  if (!dataB64) return res.status(400).json({ ok: false, error: 'No image data.' });
  const ext = photoExtFromName((req.body && req.body.filename) || '');
  const buf = Buffer.from(dataB64, 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image too large (max 6 MB).' });
  try { if (!fs.existsSync(PERSONPHOTO_DIR)) fs.mkdirSync(PERSONPHOTO_DIR, { recursive: true }); fs.writeFileSync(path.join(PERSONPHOTO_DIR, p.id + '.' + ext), buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the photo.' }); }
  if (p.photoExt && p.photoExt !== ext) { try { fs.unlinkSync(path.join(PERSONPHOTO_DIR, p.id + '.' + p.photoExt)); } catch (e) {} }
  p.photoExt = ext; p.updatedAt = new Date().toISOString(); savePeople(arr);
  res.json({ ok: true, hasPhoto: true, photoUrl: '/api/personphoto/' + p.id + '.' + ext + '?v=' + Date.now() });
});
app.post('/api/person/:id/photo/clear', (req, res) => {
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Contact not found.' });
  if (p.photoExt) { try { fs.unlinkSync(path.join(PERSONPHOTO_DIR, p.id + '.' + p.photoExt)); } catch (e) {} p.photoExt = ''; }
  p.updatedAt = new Date().toISOString(); savePeople(arr);
  res.json({ ok: true, hasPhoto: false });
});
app.get('/api/personphoto/:name', (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^per_[\w]+\.(png|jpg|jpeg|webp|gif|svg)$/.test(name)) return res.status(400).end();
  const fp = path.join(PERSONPHOTO_DIR, name);
  if (!fp.startsWith(PERSONPHOTO_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  const ext = name.split('.').pop();
  res.setHeader('Content-Type', ext === 'png' ? 'image/png' : (ext === 'svg' ? 'image/svg+xml' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg'))));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(fp).pipe(res);
});
// ---- Companies (account files) ----
app.get('/api/companies', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cos = loadCompanies().filter(c => !restrictToOwn(req) || permOwnerMatch(req, c.owner || c.by)), people = loadPeople(), deals = loadDeals();
  const rows = cos.map(c => {
    const mk = {}; (c.concepts || []).forEach(cp => (cp.markets || []).forEach(m => { if (m) mk[m] = 1; }));
    const _cp = people.filter(p => p.companyId === c.id);
    let _main = c.mainContactId ? _cp.find(p => p.id === c.mainContactId) : null;
    if (!_main && _cp.length === 1) _main = _cp[0];   // only one contact → treat it as the main/preferred
    const _pref = (_main && Array.isArray(_main.prefContact) && _main.prefContact.length) ? _main.prefContact.map(x => String(x).charAt(0).toUpperCase() + String(x).slice(1)).join(', ') : '';
    return { id: c.id, name: c.name, markets: Object.keys(mk), type: c.type || '', tags: Array.isArray(c.tags) ? c.tags : [], logo: c.logo || '', logoAuto: logoFromWebsite((c.office && c.office.website) || ((c.concepts && c.concepts[0] && c.concepts[0].website) || '')), concepts: (c.concepts || []).length, contacts: _cp.length, locations: (c.locations || []).length, deals: deals.filter(d => d.companyId === c.id).length, mainContactId: (_main && _main.id) || '', mainContact: (_main && _main.name) || '', preferredContact: _pref, createdAt: c.createdAt, owner: c.by || '', leadSource: c.leadSource || '' };
  });
  const _cities = {}; cos.forEach(c => { if (c.office && c.office.city) _cities[c.office.city] = 1; (c.locations || []).forEach(l => { if (l.city) _cities[l.city] = 1; }); }); const _titles = {}; people.forEach(pp => { if (pp.title) _titles[pp.title] = 1; });
  res.json({ ok: true, companies: rows, canDelete: canDelete(req), types: effCompanyTypes(), cuisineTypes: effCuisineTypes(), conceptTypes: CONCEPT_TYPES, leadSources: effLeadSources(), defaultState: effDefaultState(), personTypes: effPersonTypes(), metros: RRG_METROS, cities: Object.keys(_cities).sort((x,y)=>x.toLowerCase().localeCompare(y.toLowerCase())), titles: Object.keys(_titles).sort((x,y)=>x.toLowerCase().localeCompare(y.toLowerCase())), allTags: allTagsList(), isAdmin: !!(req.user && isSuper(req.user)) });
});
// A person's full cross-book view: their company, the deals where they're the client,
// and every offer / tour / NDA they're linked to across all deals.
app.get('/api/person/:id', (req, res) => {
  const p = personById(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Person not found.' });
  if (restrictToOwn(req) && !permOwnerMatch(req, p.by)) return res.status(403).json({ ok: false, error: 'You can only view your own contacts.' });
  const overlay = loadAssignOverlay(), idx = assignmentsIndex();
  const bizByKey = {}; for (const k in idx) { try { bizByKey[k] = assignmentView(idx[k], overlay).business; } catch (e) {} }
  const deals = [], offers = [], tours = [], ndas = [], interested = [];
  (Array.isArray(p.tours) ? p.tours : []).forEach(x => tours.push({ id: x.id, key: '', business: '', date: x.date, interest: x.interest, notes: x.notes, personLevel: true }));
  loadDeals().filter(d => d.contactPersonId === p.id).forEach(d => { const key = d.screenId ? ('s_' + d.screenId) : ('d_' + d.id); deals.push({ key: key, business: d.business, market: d.market || '', role: 'Client' }); });
  for (const key in overlay) {
    const o = overlay[key], biz = bizByKey[key] || '(deal)';
    (o.offers || []).filter(x => x.personId === p.id).forEach(x => offers.push({ key: key, business: biz, type: x.type, amount: x.amount, status: x.status, received: x.received }));
    (o.tours || []).filter(x => x.personId === p.id).forEach(x => tours.push({ id: x.id, key: key, business: biz, date: x.date, interest: x.interest }));
    (o.ndas || []).filter(x => x.personId === p.id).forEach(x => ndas.push({ key: key, business: biz, date: x.date, status: x.status, method: x.method }));
    (o.inquiries || []).filter(x => x.personId === p.id).forEach(x => interested.push({ key: key, business: biz, status: x.status || 'New', inquiryId: x.id, date: x.date || x.createdAt || '' }));
  }
  res.json({ ok: true, person: Object.assign({}, p, { firstName: personFirst(p), lastName: personLast(p), emails: personEmails(p), phones: personPhones(p), tags: personTags(p), hasPhoto: !!p.photoExt }), company: companyBrief(companyById(p.companyId)), deals, offers, tours, ndas, interested, agreements: loadAgreements().filter(a => a.personId === p.id).map(agreementBrief).sort((x,y)=>String(x.expires||'9999').localeCompare(String(y.expires||'9999'))), agreementTypes: AGREEMENT_TYPES, personTypes: effPersonTypes(), leadSources: effLeadSources(), allTags: allTagsList(), emailReady: isEmailConfigured(), activities: (Array.isArray(p.activities) ? p.activities : []), activityTypes: effActivityTypes(), canDelete: canDelete(req), isAdmin: !!(req.user && isSuper(req.user)) });
});
const LOCATION_STATUSES = ['Planned', 'Under Construction', 'Operating', 'Dark', 'Closed'];
const LOCATION_SITETYPES = ['Freestanding', 'End Cap', 'Inline', 'Food Hall', 'Ghost Kitchen', 'Other'];
const CONCEPT_TYPES = ['Full-Service', 'Fast-Casual', 'QSR', 'Bar / Nightlife', 'Cafe / Bakery', 'Food Truck', 'Ghost Kitchen', 'Other'];
const PRICE_POINTS = ['$', '$$', '$$$', '$$$$'];
const RRG_METROS = ['Austin', 'Dallas', 'Houston', 'San Antonio', 'Rio Grande Valley', 'Central Texas'];
function newLocationId() { return 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function applyLocationFields(l, b) {
  if (typeof b.name === 'string') l.name = b.name.slice(0, 160);
  if (typeof b.concept === 'string') l.concept = b.concept.slice(0, 120);
  if (typeof b.siteType === 'string') l.siteType = (b.siteType === '' || LOCATION_SITETYPES.indexOf(b.siteType) >= 0) ? b.siteType : l.siteType;
  if (typeof b.address === 'string') l.address = b.address.slice(0, 200);
  if (typeof b.city === 'string') l.city = b.city.slice(0, 120);
  if (typeof b.state === 'string') l.state = b.state.slice(0, 20);
  if (typeof b.zip === 'string') l.zip = b.zip.replace(/[^0-9-]/g, '').slice(0, 10);
  if (typeof b.phone === 'string') l.phone = b.phone.slice(0, 60);
  if (typeof b.website === 'string') l.website = b.website.slice(0, 300);
  if (typeof b.opened === 'string') l.opened = b.opened.slice(0, 10);
  if (typeof b.tenure === 'string') l.tenure = (['Leased', 'Owned'].indexOf(b.tenure) >= 0) ? b.tenure : (b.tenure === '' ? '' : l.tenure);
  if (b.sf !== undefined) { const n = parseInt(String(b.sf).replace(/[^0-9]/g, ''), 10); l.sf = isFinite(n) ? n : ''; }
  if (typeof b.leaseStart === 'string') l.leaseStart = b.leaseStart.slice(0, 10);
  if (typeof b.leaseExpires === 'string') l.leaseExpires = b.leaseExpires.slice(0, 10);
  if (typeof b.closedDate === 'string') l.closedDate = b.closedDate.slice(0, 10);
  if (typeof b.flagship === 'boolean') l.flagship = b.flagship;
  if (typeof b.commissary === 'boolean') l.commissary = b.commissary;
  if (typeof b.servesAll === 'boolean') l.servesAll = b.servesAll;
  if (Array.isArray(b.serves)) l.serves = b.serves.map(x => String(x || '').slice(0, 120)).filter(Boolean).slice(0, 40);
  if (!l.commissary) { l.servesAll = false; l.serves = []; } // only commissaries carry a service map
  if (typeof b.status === 'string') l.status = LOCATION_STATUSES.indexOf(b.status) >= 0 ? b.status : (b.status === 'Open' ? 'Operating' : l.status || 'Operating');
  if (typeof b.notes === 'string') l.notes = b.notes.slice(0, 2000);
  if (typeof b.description === 'string') l.description = b.description.slice(0, 2000);
}
// Location photos — a couple of images per location, stored on the data disk.
const LOCPHOTO_DIR = path.join(BOV_DATA_DIR, 'locphotos');
const LOCPHOTO_MAX = 5;
function photoExtFromName(n) { const m = String(n || '').toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/); return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'jpg'; }
// ---- Google Maps integration (Street View + Places photos) — key stays server-side ----
// Stored as *.key so it is excluded from data backups.
const GMAPS_KEY_FILE = path.join(BOV_DATA_DIR, 'google_maps.key');
function loadGmapsKey() { try { const t = fs.readFileSync(GMAPS_KEY_FILE, 'utf8').trim(); return t || process.env.GOOGLE_MAPS_API_KEY || ''; } catch (e) { return process.env.GOOGLE_MAPS_API_KEY || ''; } }
function saveGmapsKey(k) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(GMAPS_KEY_FILE, String(k || '').trim()); } catch (e) {} }
async function fetchImageBuffer(url, minBytes) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const ct = r.headers.get('content-type') || ''; if (!/image\//.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < (minBytes == null ? 1500 : minBytes)) return null;
    return { buf, ext: ct.includes('svg') ? 'svg' : (ct.includes('png') ? 'png' : (ct.includes('webp') ? 'webp' : (ct.includes('x-icon') || ct.includes('vnd.microsoft.icon') ? 'ico' : (ct.includes('gif') ? 'gif' : 'jpg')))) };
  } catch (e) { return null; }
}
// Each returns { img, reason } — reason is a short diagnostic when no image comes back.
async function streetViewPhoto(key, addr) {
  if (!key) return { img: null, reason: 'no key' };
  if (!addr) return { img: null, reason: 'no address' };
  const enc = encodeURIComponent(addr);
  try {
    const mr = await fetch('https://maps.googleapis.com/maps/api/streetview/metadata?location=' + enc + '&key=' + key);
    const mj = await mr.json();
    if (!mj) return { img: null, reason: 'street view: no response' };
    if (mj.status !== 'OK') return { img: null, reason: 'street view: ' + mj.status + (mj.error_message ? (' — ' + mj.error_message) : '') };
  } catch (e) { return { img: null, reason: 'street view: request failed' }; }
  const img = await fetchImageBuffer('https://maps.googleapis.com/maps/api/streetview?size=640x640&location=' + enc + '&fov=80&key=' + key);
  return { img, reason: img ? '' : 'street view: image download failed' };
}
async function placesPhotoNew(key, photoName) {
  if (!key || !photoName) return { img: null, reason: '' };
  const img = await fetchImageBuffer('https://places.googleapis.com/v1/' + photoName + '/media?maxWidthPx=800&key=' + encodeURIComponent(key));
  return { img, reason: img ? '' : 'places: image download failed' };
}
function attachPhotoBuffer(l, img, source) {
  if (!img) return false; l.photos = l.photos || []; if (l.photos.length >= LOCPHOTO_MAX) return false;
  const pid = 'lph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { if (!fs.existsSync(LOCPHOTO_DIR)) fs.mkdirSync(LOCPHOTO_DIR, { recursive: true }); fs.writeFileSync(path.join(LOCPHOTO_DIR, pid + '.' + img.ext), img.buf); } catch (e) { return false; }
  l.photos.push({ id: pid, ext: img.ext, source: source || 'google' }); return true;
}
// Google Places business-data enrichment: finds the listing and pulls address, geo, status, rating, phone, website.
async function placesSearchNew(key, query) {
  if (!key || !query) return { data: null, photos: [], reason: 'no key/query' };
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.formattedAddress,places.location,places.businessStatus,places.rating,places.userRatingCount,places.priceLevel,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.displayName,places.photos,places.editorialSummary' },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 })
    });
    const j = await r.json();
    if (!r.ok) return { data: null, photos: [], reason: 'places: ' + ((j && j.error && j.error.message) || ('HTTP ' + r.status)) };
    const pl = (j && j.places && j.places[0]) || null;
    if (!pl) return { data: null, photos: [], reason: 'places: no match' };
    const loc = pl.location || {};
    const PRICE = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
    return { data: {
      placeId: pl.id || '', address: pl.formattedAddress || '',
      lat: (typeof loc.latitude === 'number') ? loc.latitude : null, lng: (typeof loc.longitude === 'number') ? loc.longitude : null,
      businessStatus: pl.businessStatus || '', rating: (typeof pl.rating === 'number') ? pl.rating : null,
      reviews: (typeof pl.userRatingCount === 'number') ? pl.userRatingCount : null,
      priceLevel: (pl.priceLevel && PRICE[pl.priceLevel] !== undefined) ? PRICE[pl.priceLevel] : null,
      description: (pl.editorialSummary && pl.editorialSummary.text) ? String(pl.editorialSummary.text) : '',
      phone: pl.nationalPhoneNumber || pl.internationalPhoneNumber || '', website: pl.websiteUri || '', mapsUrl: pl.googleMapsUri || '',
      at: new Date().toISOString()
    }, photos: (pl.photos || []).map(function (x) { return x.name; }).filter(Boolean), reason: '' };
  } catch (e) { return { data: null, photos: [], reason: 'places: request failed' }; }
}
function applyPlacesData(l, data) {
  if (!data) return false;
  l.google = Object.assign({}, l.google || {}, data);
  if (!l.phone && data.phone) l.phone = data.phone;      // fill only empty fields — never overwrite what a rep typed
  if (!l.website && data.website) l.website = data.website;
  if (!l.description && data.description) l.description = data.description;   // Google editorial summary
  if (!l.zip && data.address) { const _zm = String(data.address).match(/\b(\d{5})(?:-\d{4})?\b/); if (_zm) l.zip = _zm[1]; }
  return true;
}
// Pull the best available photo(s) AND the Google business data for one location.
async function pullPhotosForLocation(key, l) {
  let added = 0; const reasons = [];
  const addr = [l.address, l.city, l.state].filter(Boolean).join(', ');
  const query = [l.concept, l.name, l.address, l.city, l.state].filter(Boolean).join(' ');
  let _pnames = [];
  try { const en = await placesSearchNew(key, query || addr); if (en.data) applyPlacesData(l, en.data); if (en.photos && en.photos.length) _pnames = en.photos; if (!en.data && en.reason) reasons.push(en.reason); } catch (e) {}
  for (let _i = 0; _i < _pnames.length && (l.photos || []).length < LOCPHOTO_MAX; _i++) { const p = await placesPhotoNew(key, _pnames[_i]); if (attachPhotoBuffer(l, p.img, 'places')) added++; else { if (p.reason) reasons.push(p.reason); break; } }
  if ((l.photos || []).length < LOCPHOTO_MAX) { const svp = await streetViewPhoto(key, addr); if (attachPhotoBuffer(l, svp.img, 'streetview')) added++; else if (svp.reason) reasons.push(svp.reason); }
  return { added, reasons, enriched: !!(l.google && l.google.placeId) };
}
app.get('/api/admin/gmaps-key', requireAdmin, (req, res) => res.json({ ok: true, set: !!loadGmapsKey(), fromEnv: !fs.existsSync(GMAPS_KEY_FILE) && !!process.env.GOOGLE_MAPS_API_KEY }));
app.post('/api/admin/gmaps-key', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  if (b.clear) { saveGmapsKey(''); return res.json({ ok: true, set: !!loadGmapsKey() }); }
  const k = String(b.key || '').trim();
  if (!k) return res.status(400).json({ ok: false, error: 'Paste a Google Maps API key.' });
  if (!/^[A-Za-z0-9_\-]{20,80}$/.test(k)) return res.status(400).json({ ok: false, error: 'That doesn’t look like a Google API key.' });
  saveGmapsKey(k); res.json({ ok: true, set: true });
});

app.post('/api/admin/gmaps-key/test', requireAdmin, async (req, res) => {
  const key = loadGmapsKey(); if (!key) return res.status(400).json({ ok: false, error: 'No key set — save one first.' });
  try {
    const t = await placesSearchNew(key, 'Starbucks');
    if (t.data) return res.json({ ok: true, status: 'OK' });
    return res.status(400).json({ ok: false, error: t.reason || 'Key rejected' });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});
// ---- Anthropic (Claude) API key — admin-settable; overrides the ANTHROPIC_API_KEY env var ----
const ANTHROPIC_KEY_FILE = path.join(BOV_DATA_DIR, 'anthropic.key');
function loadAnthropicKeyFile() { try { const t = fs.readFileSync(ANTHROPIC_KEY_FILE, 'utf8').trim(); return t || ''; } catch (e) { return ''; } }
function saveAnthropicKey(k) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(ANTHROPIC_KEY_FILE, String(k || '').trim()); } catch (e) {} }
// At boot, a saved key file overrides the environment so the generators pick it up.
(function () { const k = loadAnthropicKeyFile(); if (k) process.env.ANTHROPIC_API_KEY = k; })();
app.get('/api/admin/anthropic-key', requireAdmin, (req, res) => res.json({ ok: true, set: !!process.env.ANTHROPIC_API_KEY, fromFile: !!loadAnthropicKeyFile(), fromEnv: !loadAnthropicKeyFile() && !!process.env.ANTHROPIC_API_KEY }));
app.post('/api/admin/anthropic-key', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  if (b.clear) { saveAnthropicKey(''); return res.json({ ok: true, set: !!process.env.ANTHROPIC_API_KEY, fromFile: false, note: 'Cleared the saved key. The environment key (if any) is used after the next restart.' }); }
  const k = String(b.key || '').trim();
  if (!k) return res.status(400).json({ ok: false, error: 'Paste an Anthropic API key.' });
  if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(k)) return res.status(400).json({ ok: false, error: 'That doesn’t look like an Anthropic API key (they start with sk-ant-).' });
  saveAnthropicKey(k); process.env.ANTHROPIC_API_KEY = k;
  res.json({ ok: true, set: true, fromFile: true });
});

// ---- Admin-editable type lists (contact types, company types, request categories) ----
app.get('/api/admin/types', requireAdmin, (req, res) => {
  const s = loadSettings();
  res.json({
    ok: true,
    personTypes: effPersonTypes(), companyTypes: effCompanyTypes(), ticketCategories: effTicketCategories(), leadSources: effLeadSources(), activityTypes: effActivityTypes(), cuisineTypes: effCuisineTypes(), maxPullLocations: effMaxPullLocations(), defaultState: effDefaultState(), assistantName: effAssistantName(), conceptLabel: effConceptLabel(), conceptLabelPlural: effConceptLabelPlural(), showRequestRibbon: effShowRequestRibbon(), showQuickLinks: effShowQuickLinks(),
    defaults: { personTypes: PERSON_TYPES, companyTypes: COMPANY_TYPES, ticketCategories: TICKET_CATEGORIES, leadSources: LEAD_SOURCES, activityTypes: ACTIVITY_TYPES, cuisineTypes: CUISINE_TYPES },
    isCustom: { personTypes: Array.isArray(s.personTypes), companyTypes: Array.isArray(s.companyTypes), ticketCategories: Array.isArray(s.ticketCategories), leadSources: Array.isArray(s.leadSources), activityTypes: Array.isArray(s.activityTypes), cuisineTypes: Array.isArray(s.cuisineTypes) },
  });
});
app.post('/api/admin/types', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {}; const s = loadSettings();
  if (b.reset) { delete s.personTypes; delete s.companyTypes; delete s.ticketCategories; delete s.leadSources; delete s.activityTypes; delete s.cuisineTypes; delete s.maxPullLocations; delete s.defaultState; delete s.assistantName; delete s.conceptLabel; delete s.conceptLabelPlural; delete s.showRequestRibbon; delete s.showQuickLinks; saveSettings(s); return res.json({ ok: true, personTypes: effPersonTypes(), companyTypes: effCompanyTypes(), ticketCategories: effTicketCategories(), leadSources: effLeadSources(), activityTypes: effActivityTypes(), cuisineTypes: effCuisineTypes(), maxPullLocations: effMaxPullLocations(), defaultState: effDefaultState(), assistantName: effAssistantName(), conceptLabel: effConceptLabel(), conceptLabelPlural: effConceptLabelPlural(), showRequestRibbon: effShowRequestRibbon(), showQuickLinks: effShowQuickLinks() }); }
  if (b.personTypes !== undefined) s.personTypes = cleanStrList(b.personTypes, 40, 60) || [];
  if (b.companyTypes !== undefined) s.companyTypes = cleanStrList(b.companyTypes, 40, 60) || [];
  if (b.ticketCategories !== undefined) s.ticketCategories = cleanStrList(b.ticketCategories, 40, 60) || [];
  if (b.leadSources !== undefined) s.leadSources = cleanStrList(b.leadSources, 40, 60) || [];
  if (b.activityTypes !== undefined) s.activityTypes = cleanStrList(b.activityTypes, 40, 60) || [];
  if (b.cuisineTypes !== undefined) s.cuisineTypes = cleanStrList(b.cuisineTypes, 40, 60) || [];
  if (b.maxPullLocations !== undefined) { const n = parseInt(b.maxPullLocations, 10); s.maxPullLocations = (isFinite(n) && n > 0) ? Math.min(500, n) : 20; }
  if (typeof b.defaultState === 'string') s.defaultState = b.defaultState.trim().slice(0, 20);
  if (typeof b.assistantName === 'string') s.assistantName = b.assistantName.trim().slice(0, 40);
  if (typeof b.conceptLabel === 'string') s.conceptLabel = b.conceptLabel.trim().slice(0, 30);
  if (typeof b.conceptLabelPlural === 'string') s.conceptLabelPlural = b.conceptLabelPlural.trim().slice(0, 30);
  if (b.showRequestRibbon !== undefined) s.showRequestRibbon = !!b.showRequestRibbon;
  if (b.showQuickLinks !== undefined) s.showQuickLinks = !!b.showQuickLinks;
  saveSettings(s);
  res.json({ ok: true, personTypes: effPersonTypes(), companyTypes: effCompanyTypes(), ticketCategories: effTicketCategories(), leadSources: effLeadSources(), activityTypes: effActivityTypes(), cuisineTypes: effCuisineTypes(), maxPullLocations: effMaxPullLocations(), defaultState: effDefaultState(), assistantName: effAssistantName(), conceptLabel: effConceptLabel(), conceptLabelPlural: effConceptLabelPlural(), showRequestRibbon: effShowRequestRibbon(), showQuickLinks: effShowQuickLinks() });
});

// ---- Request-services notification recipients (multi-address) ----
app.get('/api/admin/services-email', requireAdmin, (req, res) => res.json({ ok: true, emails: servicesEmails() }));
app.post('/api/admin/services-email', requireAdmin, express.json(), (req, res) => {
  const s = loadSettings();
  let list = (req.body || {}).emails;
  if (typeof list === 'string') list = list.split(/[,;\s]+/);
  s.servicesEmails = cleanStrList(list, 10, 160) || [];
  saveSettings(s);
  res.json({ ok: true, emails: servicesEmails() });
});
// ---- Departments admin (create / rename / delete / assign users / categories / emails) ----
app.get('/api/admin/departments', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    departments: effDepartments(),
    isCustom: Array.isArray(loadSettings().departments),
    users: auth.loadUsers().filter(u => !u.disabled).map(u => ({ username: u.username, name: u.name || u.username, email: u.email || '' })),
    categories: effTicketCategories(),
  });
});
app.post('/api/admin/departments', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  if (b.reset) { const s = loadSettings(); delete s.departments; saveSettings(s); return res.json({ ok: true, departments: effDepartments() }); }
  const cleaned = cleanDepartments(b.departments);
  if (!cleaned) return res.status(400).json({ ok: false, error: 'Bad departments list.' });
  const s = loadSettings(); s.departments = cleaned; saveSettings(s);
  res.json({ ok: true, departments: effDepartments() });
});
app.get('/api/admin/tool-labels', requireAdmin, (req, res) => { res.json({ ok: true, tools: TOOL_DEFS, labels: effToolLabels() }); });
app.post('/api/admin/tool-labels', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  if (b.reset) { const s = loadSettings(); delete s.toolLabels; saveSettings(s); return res.json({ ok: true, tools: TOOL_DEFS, labels: {} }); }
  const s = loadSettings(); s.toolLabels = cleanToolLabels(b.labels); saveSettings(s);
  res.json({ ok: true, tools: TOOL_DEFS, labels: effToolLabels() });
});


// ---- Admin: reset the whole book (companies + concepts + locations). Contacts & deals are kept. ----
app.post('/api/admin/reset-book', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  if (String(b.confirm || '') !== 'RESET') return res.status(400).json({ ok: false, error: 'Type RESET to confirm.' });
  const companies = loadCompanies();
  companies.forEach(c => {
    (c.concepts || []).forEach(cp => { if (cp.logoExt) { try { fs.unlinkSync(path.join(CPTLOGO_DIR, cp.id + '.' + cp.logoExt)); } catch (e) {} } });
    (c.locations || []).forEach(l => { (l.photos || []).forEach(ph => { try { fs.unlinkSync(path.join(LOCPHOTO_DIR, ph.id + '.' + ph.ext)); } catch (e) {} }); });
  });
  const count = companies.length;
  saveCompanies([]);
  const people = loadPeople(); let ch = false; people.forEach(p => { if (p.companyId) { p.companyId = ''; ch = true; } }); if (ch) savePeople(people);
  res.json({ ok: true, cleared: count });
});
// Pull a photo for one location on demand.
app.post('/api/company/:id/location/:locId/pull-photo', express.json(), async (req, res) => {
  const key = loadGmapsKey(); if (!key) return res.status(400).json({ ok: false, error: 'No Google Maps API key is set. Add one in Admin → Integrations.' });
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const l = (c.locations || []).find(x => x.id === req.params.locId);
  if (!l) return res.status(404).json({ ok: false, error: 'Location not found.' });
  if ((l.photos || []).length >= LOCPHOTO_MAX) return res.json({ ok: true, locations: c.locations, added: 0, note: 'Already has photos.' });
  let out = { added: 0, reasons: [] }; try { out = await pullPhotosForLocation(key, l); } catch (e) { console.error('pull-photo:', e && e.message); out.reasons = ['server error']; }
  if (out.added) { c.updatedAt = new Date().toISOString(); saveCompanies(arr); }
  res.json({ ok: true, locations: c.locations, added: out.added, note: out.added ? '' : ((out.reasons && out.reasons.join(' · ')) || 'No photo found for that address.') });
});
// Bulk pull for all photoless locations (optionally scoped to a concept).
app.post('/api/company/:id/pull-photos', express.json(), async (req, res) => {
  const key = loadGmapsKey(); if (!key) return res.status(400).json({ ok: false, error: 'No Google Maps API key is set. Add one in Admin → Integrations.' });
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const concept = String((req.body && req.body.concept) || '');
  const targets = (c.locations || []).filter(l => (!concept || (l.concept || '') === concept) && (l.photos || []).length === 0).slice(0, 60);
  let added = 0; const reasons = {};
  for (const l of targets) { try { const r = await pullPhotosForLocation(key, l); if (r.added) added++; else (r.reasons || []).forEach(x => { reasons[x] = (reasons[x] || 0) + 1; }); } catch (e) {} }
  if (added) { c.updatedAt = new Date().toISOString(); saveCompanies(arr); }
  const topReason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0] || '';
  res.json({ ok: true, locations: c.locations, added, scanned: targets.length, note: (added ? '' : (topReason || 'No photos found.')) });
});
app.post('/api/company/:id/location/:locId/photo', express.json({ limit: '12mb' }), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const l = (c.locations || []).find(x => x.id === req.params.locId);
  if (!l) return res.status(404).json({ ok: false, error: 'Location not found.' });
  l.photos = l.photos || [];
  if (l.photos.length >= LOCPHOTO_MAX) return res.status(400).json({ ok: false, error: 'Up to ' + LOCPHOTO_MAX + ' photos per location.' });
  const b = req.body || {};
  const dataB64 = String(b.dataB64 || '').replace(/^data:[^,]*,/, '');
  if (!dataB64) return res.status(400).json({ ok: false, error: 'No image data.' });
  const ext = photoExtFromName(b.filename);
  const buf = Buffer.from(dataB64, 'base64');
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image too large (max 10 MB).' });
  const pid = 'lph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { if (!fs.existsSync(LOCPHOTO_DIR)) fs.mkdirSync(LOCPHOTO_DIR, { recursive: true }); fs.writeFileSync(path.join(LOCPHOTO_DIR, pid + '.' + ext), buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the image.' }); }
  l.photos.push({ id: pid, ext }); c.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true, locations: c.locations });
});
app.post('/api/company/:id/location/:locId/photo/:photoId/remove', (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const l = (c.locations || []).find(x => x.id === req.params.locId);
  if (!l) return res.status(404).json({ ok: false, error: 'Location not found.' });
  const ph = (l.photos || []).find(p => p.id === req.params.photoId);
  if (ph) { try { fs.unlinkSync(path.join(LOCPHOTO_DIR, ph.id + '.' + ph.ext)); } catch (e) {} }
  l.photos = (l.photos || []).filter(p => p.id !== req.params.photoId);
  c.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true, locations: c.locations });
});
app.post('/api/company/:id/location/:locId/photo/:photoId/main', (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const l = (c.locations || []).find(x => x.id === req.params.locId);
  if (!l) return res.status(404).json({ ok: false, error: 'Location not found.' });
  const ph = l.photos || []; const i = ph.findIndex(p => p.id === req.params.photoId);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Photo not found.' });
  const pick = ph.splice(i, 1)[0]; ph.unshift(pick); l.photos = ph;
  c.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true, locations: c.locations });
});
app.get('/api/locphoto/:name', (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^lph_[\w]+\.(png|jpg|jpeg|webp|gif)$/.test(name)) return res.status(400).end();
  const fp = path.join(LOCPHOTO_DIR, name);
  if (!fp.startsWith(LOCPHOTO_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  const ext = name.split('.').pop();
  res.setHeader('Content-Type', ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg')));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(fp).pipe(res);
});
// Optional custom prompt for the location finder (admin-overridable, like the others).
const LOC_PROMPT_FILE = path.join(BOV_DATA_DIR, 'location_prompt.txt');
function loadLocPromptCustom() { try { const t = fs.readFileSync(LOC_PROMPT_FILE, 'utf8'); return (t && t.trim()) ? t : ''; } catch (e) { return ''; } }
function saveLocPromptCustom(t) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(LOC_PROMPT_FILE, String(t)); } catch (e) {} }
function clearLocPromptCustom() { try { fs.unlinkSync(LOC_PROMPT_FILE); } catch (e) {} }
app.get('/api/company/:id', (req, res) => {
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  if (restrictToOwn(req) && !permOwnerMatch(req, c.owner || c.by)) return res.status(403).json({ ok: false, error: 'You can only view your own companies.' });
  const contacts = loadPeople().filter(p => p.companyId === c.id).map(companyContactRow);
  const _cids = loadPeople().filter(p => p.companyId === c.id).map(p => p.id);
  const dealRows = loadDeals().filter(d => d.companyId === c.id || (d.contactPersonId && _cids.indexOf(d.contactPersonId) >= 0)).map(d => ({ id: d.id, business: d.business, market: d.market || '', started: !!d.screenId, key: d.screenId ? ('s_' + d.screenId) : ('d_' + d.id) }));
  const _pn = {}; loadPeople().forEach(p => { _pn[p.id] = p.name; });
  const companyAgreements = loadAgreements().filter(a => a.companyId === c.id || _cids.indexOf(a.personId) >= 0).map(a => Object.assign(agreementBrief(a), { personName: a.personName || _pn[a.personId] || '' })).sort((x,y)=>String(x.expires||'9999').localeCompare(String(y.expires||'9999')));
  const companyLogoAuto = logoFromWebsite((c.office && c.office.website) || ((c.concepts && c.concepts[0] && c.concepts[0].website) || ''));
  res.json({ ok: true, company: c, logoAuto: companyLogoAuto, contacts, deals: dealRows, agreements: companyAgreements, agreementTypes: AGREEMENT_TYPES, locations: c.locations || [], concepts: c.concepts || [], types: effCompanyTypes(), personTypes: effPersonTypes(), locationStatuses: LOCATION_STATUSES, siteTypes: LOCATION_SITETYPES, conceptTypes: CONCEPT_TYPES, pricePoints: PRICE_POINTS, cuisineTypes: effCuisineTypes(), leadSources: effLeadSources(), markets: RRG_METROS, titles: Object.keys(loadPeople().reduce((m, pp) => { if (pp.title) m[pp.title] = 1; return m; }, {})).sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase())), hasMaps: !!loadGmapsKey(), canDelete: canDelete(req), isAdmin: !!(req.user && isSuper(req.user)) });
});
// ---- Concepts — a company runs one or more concepts (brands); locations attach to a concept. ----
function newConceptId() { return 'cpt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function domainOf(u) { try { let s = String(u || '').trim(); if (!s) return ''; if (!/^https?:\/\//i.test(s)) s = 'https://' + s; return new URL(s).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
// Auto logo from a brand's domain (Clearbit logo service; the client falls back to a monogram if it 404s).
function logoFromWebsite(w) { const d = domainOf(w); return d ? ('https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(d)) : ''; }
app.post('/api/company/:id/concept', express.json(), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const b = req.body || {}; c.concepts = c.concepts || [];
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'A concept name is required.' });
  const now = new Date().toISOString();
  let cpt;
  if (b.id) {
    cpt = c.concepts.find(x => x.id === b.id);
    if (!cpt) return res.status(404).json({ ok: false, error: 'Concept not found.' });
    const oldName = cpt.name;
    cpt.name = name.slice(0, 120);
    if (typeof b.website === 'string') cpt.website = b.website.slice(0, 300);
    if (Array.isArray(b.markets)) cpt.markets = b.markets.map(x => titleCaseMarket(String(x || '').slice(0, 80))).filter(Boolean).slice(0, 30);
    if (typeof b.conceptType === 'string') cpt.conceptType = CONCEPT_TYPES.indexOf(b.conceptType) >= 0 ? b.conceptType : '';
    if (typeof b.pricePoint === 'string') cpt.pricePoint = PRICE_POINTS.indexOf(b.pricePoint) >= 0 ? b.pricePoint : '';
    if (typeof b.cuisine === 'string') cpt.cuisine = effCuisineTypes().indexOf(b.cuisine) >= 0 ? b.cuisine : '';
    // Logo: use the explicit value only. No auto-derivation from the website.
    if (typeof b.logo === 'string') cpt.logo = b.logo.slice(0, 400);
    cpt.updatedAt = now;
    // keep the locations' concept label in sync with a rename
    if (oldName && oldName !== cpt.name) (c.locations || []).forEach(l => { if ((l.concept || '') === oldName) l.concept = cpt.name; });
  } else {
    const _dup = c.concepts.find(x => normKey(x.name) === normKey(name));
    if (_dup) {
      // Idempotent: re-running the AI (or re-adding) must never create a second copy.
      // Fill in only blanks from the incoming data; never clobber values already on file.
      if (!String(_dup.website || '').trim() && typeof b.website === 'string' && b.website.trim()) _dup.website = b.website.slice(0, 300);
      if (!String(_dup.conceptType || '').trim() && typeof b.conceptType === 'string' && CONCEPT_TYPES.indexOf(b.conceptType) >= 0) _dup.conceptType = b.conceptType;
      if (!String(_dup.pricePoint || '').trim() && typeof b.pricePoint === 'string' && PRICE_POINTS.indexOf(b.pricePoint) >= 0) _dup.pricePoint = b.pricePoint;
      if (!String(_dup.cuisine || '').trim() && typeof b.cuisine === 'string' && effCuisineTypes().indexOf(b.cuisine) >= 0) _dup.cuisine = b.cuisine;
      if (Array.isArray(b.markets) && b.markets.length) { const _mk = {}; (_dup.markets || []).forEach(m => { if (m) _mk[normKey(m)] = m; }); b.markets.map(x => titleCaseMarket(String(x || '').slice(0, 80))).filter(Boolean).forEach(m => { if (!_mk[normKey(m)]) _mk[normKey(m)] = m; }); _dup.markets = Object.values(_mk).slice(0, 30); }
      _dup.updatedAt = now;
      c.updatedAt = now; saveCompanies(arr);
      return res.json({ ok: true, concepts: c.concepts, locations: c.locations || [], concept: _dup, existed: true });
    }
    const website = String(b.website || '').slice(0, 300);
    cpt = { id: newConceptId(), name: name.slice(0, 120), website: website, logo: (typeof b.logo === 'string' && b.logo) ? b.logo.slice(0, 400) : '', markets: Array.isArray(b.markets) ? b.markets.map(x => String(x || '').slice(0, 80)).filter(Boolean).slice(0, 30) : [], conceptType: (typeof b.conceptType === 'string' && CONCEPT_TYPES.indexOf(b.conceptType) >= 0) ? b.conceptType : '', pricePoint: (typeof b.pricePoint === 'string' && PRICE_POINTS.indexOf(b.pricePoint) >= 0) ? b.pricePoint : '', cuisine: (typeof b.cuisine === 'string' && effCuisineTypes().indexOf(b.cuisine) >= 0) ? b.cuisine : '', createdAt: now };
    c.concepts.push(cpt);
  }
  c.updatedAt = now; saveCompanies(arr);
  res.json({ ok: true, concepts: c.concepts, locations: c.locations || [], concept: cpt });
});
// Concept logo upload — store an image and point the concept's logo at it.
const CPTLOGO_DIR = path.join(BOV_DATA_DIR, 'cptlogos');
app.post('/api/company/:id/concept/:cid/logo', express.json({ limit: '8mb' }), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const cpt = (c.concepts || []).find(x => x.id === req.params.cid);
  if (!cpt) return res.status(404).json({ ok: false, error: 'Concept not found.' });
  const dataB64 = String((req.body && req.body.dataB64) || '').replace(/^data:[^,]*,/, '');
  if (!dataB64) return res.status(400).json({ ok: false, error: 'No image data.' });
  const ext = photoExtFromName((req.body && req.body.filename) || '');
  const buf = Buffer.from(dataB64, 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image too large (max 6 MB).' });
  try { if (!fs.existsSync(CPTLOGO_DIR)) fs.mkdirSync(CPTLOGO_DIR, { recursive: true }); fs.writeFileSync(path.join(CPTLOGO_DIR, cpt.id + '.' + ext), buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the logo.' }); }
  cpt.logoExt = ext; cpt.logo = '/api/cptlogo/' + cpt.id + '.' + ext + '?v=' + Date.now(); cpt.updatedAt = new Date().toISOString();
  saveCompanies(arr);
  res.json({ ok: true, concepts: c.concepts });
});
app.post('/api/company/:id/concept/:cid/logo/clear', express.json(), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const cpt = (c.concepts || []).find(x => x.id === req.params.cid);
  if (!cpt) return res.status(404).json({ ok: false, error: 'Concept not found.' });
  if (cpt.logoExt) { try { fs.unlinkSync(path.join(CPTLOGO_DIR, cpt.id + '.' + cpt.logoExt)); } catch (e) {} cpt.logoExt = ''; }
  cpt.logo = ''; cpt.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true, concepts: c.concepts });
});
app.get('/api/cptlogo/:name', (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^cpt_[\w]+\.(png|jpg|jpeg|webp|gif|svg)$/.test(name)) return res.status(400).end();
  const fp = path.join(CPTLOGO_DIR, name);
  if (!fp.startsWith(CPTLOGO_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  const ext = name.split('.').pop();
  res.setHeader('Content-Type', ext === 'png' ? 'image/png' : (ext === 'svg' ? 'image/svg+xml' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg'))));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(fp).pipe(res);
});
// ---- Company logo upload (uploaded file, stored on disk; mirrors concept logo) ----
const COLOGO_DIR = path.join(BOV_DATA_DIR, 'cologos');
app.post('/api/company/:id/logo', express.json({ limit: '8mb' }), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const dataB64 = String((req.body && req.body.dataB64) || '').replace(/^data:[^,]*,/, '');
  if (!dataB64) return res.status(400).json({ ok: false, error: 'No image data.' });
  const ext = photoExtFromName((req.body && req.body.filename) || '');
  const buf = Buffer.from(dataB64, 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image too large (max 6 MB).' });
  try { if (!fs.existsSync(COLOGO_DIR)) fs.mkdirSync(COLOGO_DIR, { recursive: true }); fs.writeFileSync(path.join(COLOGO_DIR, c.id + '.' + ext), buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the logo.' }); }
  c.logoExt = ext; c.logo = '/api/cologo/' + c.id + '.' + ext + '?v=' + Date.now(); c.updatedAt = new Date().toISOString();
  saveCompanies(arr);
  res.json({ ok: true, logo: c.logo });
});
app.post('/api/company/:id/logo/clear', express.json(), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  if (c.logoExt) { try { fs.unlinkSync(path.join(COLOGO_DIR, c.id + '.' + c.logoExt)); } catch (e) {} c.logoExt = ''; }
  c.logo = ''; c.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true });
});
app.get('/api/cologo/:name', (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^co_[\w]+\.(png|jpg|jpeg|webp|gif|svg)$/.test(name)) return res.status(400).end();
  const fp = path.join(COLOGO_DIR, name);
  if (!fp.startsWith(COLOGO_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  const ext = name.split('.').pop();
  res.setHeader('Content-Type', ext === 'png' ? 'image/png' : (ext === 'svg' ? 'image/svg+xml' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg'))));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(fp).pipe(res);
});

app.post('/api/company/:id/concept/:cid/remove', express.json(), (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const cpt = (c.concepts || []).find(x => x.id === req.params.cid);
  c.concepts = (c.concepts || []).filter(x => x.id !== req.params.cid);
  // Also remove the concept's locations if asked; otherwise leave them (their label stays).
  if (cpt && req.body && req.body.withLocations) c.locations = (c.locations || []).filter(l => (l.concept || '') !== cpt.name);
  c.updatedAt = new Date().toISOString(); saveCompanies(arr);
  res.json({ ok: true, concepts: c.concepts, locations: c.locations || [] });
});
// Add / update a location on a company.
app.post('/api/company/:id/location', express.json(), async (req, res) => {
  const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const b = req.body || {}; c.locations = c.locations || [];
  const now = new Date().toISOString();
  let target, isNew = false;
  if (b.id) { const ex = c.locations.find(l => l.id === b.id); if (!ex) return res.status(404).json({ ok: false, error: 'Location not found.' }); applyLocationFields(ex, b); ex.updatedAt = now; target = ex; }
  else { const rec = { id: newLocationId(), name: '', concept: '', address: '', city: '', state: '', phone: '', opened: '', status: 'Operating', notes: '', photos: [], createdAt: now }; applyLocationFields(rec, b); if (!rec.name && !rec.address) return res.status(400).json({ ok: false, error: 'A location name or address is required.' }); c.locations.push(rec); target = rec; isNew = true; }
  // One flagship per concept — if this one is now flagship, clear its concept siblings.
  if (target && target.flagship) c.locations.forEach(l => { if (l.id !== target.id && (l.concept || '') === (target.concept || '')) l.flagship = false; });
  try { const gkey = loadGmapsKey(); if (isNew && gkey && (target.address || target.city) && !(target.google && target.google.placeId)) { await pullPhotosForLocation(gkey, target); } } catch (e) { console.error('loc auto-enrich:', e && e.message); }
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
// Onboarding — search a concept's website for its locations and create records for them.
app.post('/api/company/:id/find-locations', express.json(), async (req, res) => {
  try {
    const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
    const b = req.body || {};
    // Prefer a chosen concept (id) and use its stored website; fall back to raw fields.
    let concept = String(b.concept || '').trim();
    let website = String(b.website || '').trim();
    const count = String(b.count || '').trim();
    if (b.conceptId) {
      const cpt = (c.concepts || []).find(x => x.id === b.conceptId);
      if (cpt) { concept = cpt.name; if (!website) website = String(cpt.website || '').trim(); }
    }
    if (!concept) return res.status(400).json({ ok: false, error: 'A concept is required.' });
    if (!website) return res.status(400).json({ ok: false, error: 'This concept has no website set — add one to the concept first.' });
    const _cap = effMaxPullLocations();
    const _rc = parseInt(count, 10);
    const _useCount = String((isFinite(_rc) && _rc > 0) ? Math.min(_rc, _cap) : _cap);
    const result = await locationgen.findLocations({ company: c.name, concept, website, count: _useCount, systemPrompt: loadLocPromptCustom() || undefined });
    const now = new Date().toISOString();
    c.locations = c.locations || [];
    const created = [];
    (result.locations || []).slice(0, effMaxPullLocations()).forEach(l => {
      // Skip obvious duplicates (same concept + address already present).
      const _lk = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const dupe = c.locations.some(x => {
        if ((x.concept || '') !== concept) return false;
        const ax = _lk(x.address), al = _lk(l.address); if (ax && al && ax === al) return true;      // same street address
        const px = _lk(x.phone), pl = _lk(l.phone);   if (px && pl && px === pl) return true;         // same phone
        const nx = _lk(x.name), nl = _lk(l.name), cx = _lk(x.city), cl = _lk(l.city);
        if (nx && nl && nx === nl && cx === cl) return true;                                          // same name in same city
        return false;
      });
      if (dupe) return;
      const rec = { id: newLocationId(), name: l.name || '', concept, address: l.address || '', city: l.city || '', state: l.state || '', phone: l.phone || '', website, opened: '', status: 'Operating', notes: '', photos: [], source: 'ai-web', createdAt: now };
      c.locations.push(rec); created.push(rec);
    });
    // If a Google key is set, auto-pull a storefront/photo for each new location (best effort).
    const gkey = loadGmapsKey();
    let photos = 0;
    if (gkey && created.length) { for (const l of created.slice(0, 40)) { try { const pr = await pullPhotosForLocation(gkey, l); if (pr.added) photos++; } catch (e) {} } }
    // While we're pulling info from the concept's website, set its logo too (same source
    // as company logos — the browser loads it and falls back to the letter avatar if the
    // brand has no logo). Only when the concept doesn't already have one.
    let logoSet = false;
    let cptObj = null;
    if (b.conceptId) cptObj = (c.concepts || []).find(x => x.id === b.conceptId);
    if (!cptObj && concept) cptObj = (c.concepts || []).find(x => String(x.name || '').toLowerCase() === concept.toLowerCase());
    if (cptObj && website && !String(cptObj.logo || '').trim()) {
      const lg = logoFromWebsite(website);
      if (lg) { cptObj.logo = lg; logoSet = true; }
    }
    // Set the concept's price point from Google (rounded average of the units' price
    // levels), only when the concept doesn't already have one.
    if (cptObj && !String(cptObj.pricePoint || '').trim()) {
      const lvls = created.map(l => (l.google && typeof l.google.priceLevel === 'number') ? l.google.priceLevel : null).filter(n => n != null && n >= 1);
      if (lvls.length) { const lvl = Math.max(1, Math.min(4, Math.round(lvls.reduce((a, b) => a + b, 0) / lvls.length))); cptObj.pricePoint = PRICE_POINTS[lvl - 1]; }
    }
    c.updatedAt = now; saveCompanies(arr);
    res.json({ ok: true, created: created.length, locations: c.locations, concepts: c.concepts, logoSet, note: result.note || '', photos });
  } catch (e) {
    console.error('find-locations error:', e && e.message);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});
// Given just a concept name, use AI web search to resolve the official website, concept
// type, cuisine, and price point. Returned values are validated against the allowed lists.
app.post('/api/ai/find-concepts', express.json(), async (req, res) => {
  try { const b = req.body || {}; const out = await locationgen.findGroupConcepts({ name: b.name || '', website: b.website || '', market: b.market || '' }); res.json({ ok: true, concepts: out.concepts, groupWebsite: out.website || '' }); }
  catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/company/:id/find-concepts', express.json(), async (req, res) => {
  try {
    if (!aiAllowed(req)) return res.status(403).json({ ok: false, error: 'You do not have access to AI features.' });
    const c = loadCompanies().find(function(x){ return x.id === req.params.id; });
    if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
    const out = await locationgen.findGroupConcepts({ name: c.name || '', website: (c.office && c.office.website) || '' });
    // Capture the group's own website + logo while we have it (only fill blanks).
    if (out.website) {
      const arr2 = loadCompanies(); const c2 = arr2.find(x => x.id === req.params.id);
      if (c2) { c2.office = c2.office || {}; let ch = false;
        if (!String(c2.office.website || '').trim()) { c2.office.website = out.website.slice(0, 200); ch = true; }
        if (!String(c2.logo || '').trim()) { const lg = logoFromWebsite(out.website); if (lg) { c2.logo = lg; ch = true; } }
        if (ch) { c2.updatedAt = new Date().toISOString(); saveCompanies(arr2); } }
    }
    res.json({ ok: true, concepts: out.concepts, groupWebsite: out.website || '' });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
// Parallel batch build: resolve every brand and pull its locations CONCURRENTLY, then
// write the company ONCE with dedup applied. Much faster than the per-concept chain and
// safe from the save race (a single load/mutate/save at the end). Also sets the company
// logo from the group's own website when the company doesn't already have one.
app.post('/api/company/:id/build-concepts', express.json(), async (req, res) => {
  try {
    if (!aiAllowed(req)) return res.status(403).json({ ok: false, error: 'You do not have access to AI features.' });
    { const c0 = loadCompanies().find(x => x.id === req.params.id); if (!c0) return res.status(404).json({ ok: false, error: 'Company not found.' }); }
    const b = req.body || {};
    const market = titleCaseMarket(String(b.market || '').trim());
    const count = String(b.count || '').trim();
    let names = Array.isArray(b.names) ? b.names.map(n => String(n || '').trim()).filter(Boolean).slice(0, 50) : [];
    { const seen = {}; names = names.filter(n => { const k = normKey(n); if (seen[k]) return false; seen[k] = 1; return true; }); }
    if (!names.length) return res.status(400).json({ ok: false, error: 'No concept names provided.' });

    const _cap = effMaxPullLocations();
    const _rc = parseInt(count, 10);
    const _useCount = String((isFinite(_rc) && _rc > 0) ? Math.min(_rc, _cap) : _cap);
    const locPrompt = loadLocPromptCustom() || undefined;

    // Phase 1 — resolve each brand's profile in parallel (read-only, no save).
    const compName = (loadCompanies().find(x => x.id === req.params.id) || {}).name || '';
    const resolved = await Promise.all(names.map(async (nm) => {
      try {
        const r = await locationgen.resolveConcept({ name: nm, market, conceptTypes: CONCEPT_TYPES, cuisines: effCuisineTypes() });
        return { name: nm, website: String(r.website || '').trim(),
          conceptType: (CONCEPT_TYPES.indexOf(r.conceptType) >= 0) ? r.conceptType : '',
          cuisine: (effCuisineTypes().indexOf(r.cuisine) >= 0) ? r.cuisine : '',
          pricePoint: (PRICE_POINTS.indexOf(r.pricePoint) >= 0) ? r.pricePoint : '' };
      } catch (e) { return { name: nm, website: '', conceptType: '', cuisine: '', pricePoint: '', error: String((e && e.message) || e) }; }
    }));

    // Phase 2 — for brands with a website, find locations in parallel (read-only, no save).
    const locResults = await Promise.all(resolved.map(async (r) => {
      if (!r.website) return { name: r.name, locations: [] };
      try { const fr = await locationgen.findLocations({ company: compName, concept: r.name, website: r.website, count: _useCount, systemPrompt: locPrompt }); return { name: r.name, locations: (fr.locations || []) }; }
      catch (e) { return { name: r.name, locations: [], error: String((e && e.message) || e) }; }
    }));
    const locByName = {}; locResults.forEach(x => { locByName[normKey(x.name)] = x; });

    // Phase 3 — merge into the company ONCE, with dedup. Reload fresh right before writing.
    const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
    c.concepts = c.concepts || []; c.locations = c.locations || [];
    const now = new Date().toISOString();
    const _lk = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    let addedConcepts = 0, addedLocations = 0;
    const newLocs = [];
    resolved.forEach((r) => {
      let cpt = c.concepts.find(x => normKey(x.name) === normKey(r.name));
      if (cpt) {
        if (!String(cpt.website || '').trim() && r.website) cpt.website = r.website.slice(0, 300);
        if (!String(cpt.conceptType || '').trim() && r.conceptType) cpt.conceptType = r.conceptType;
        if (!String(cpt.pricePoint || '').trim() && r.pricePoint) cpt.pricePoint = r.pricePoint;
        if (!String(cpt.cuisine || '').trim() && r.cuisine) cpt.cuisine = r.cuisine;
        if (!String(cpt.logo || '').trim() && r.website) { const lg = logoFromWebsite(r.website); if (lg) cpt.logo = lg; }
        if (market) { const mk = {}; (cpt.markets || []).forEach(m => { if (m) mk[normKey(m)] = m; }); if (!mk[normKey(market)]) mk[normKey(market)] = market; cpt.markets = Object.values(mk).slice(0, 30); }
        cpt.updatedAt = now;
      } else {
        cpt = { id: newConceptId(), name: r.name.slice(0, 120), website: r.website.slice(0, 300), logo: r.website ? logoFromWebsite(r.website) : '', markets: market ? [market] : [], conceptType: r.conceptType, pricePoint: r.pricePoint, cuisine: r.cuisine, createdAt: now };
        c.concepts.push(cpt); addedConcepts++;
      }
      const lr = locByName[normKey(r.name)];
      if (lr && lr.locations && lr.locations.length) {
        lr.locations.slice(0, _cap).forEach((l) => {
          const dupe = c.locations.some(x => {
            if ((x.concept || '') !== cpt.name) return false;
            const ax = _lk(x.address), al = _lk(l.address); if (ax && al && ax === al) return true;
            const px = _lk(x.phone), pl = _lk(l.phone); if (px && pl && px === pl) return true;
            const nx = _lk(x.name), nl = _lk(l.name), cx = _lk(x.city), cl = _lk(l.city); if (nx && nl && nx === nl && cx === cl) return true;
            return false;
          });
          if (dupe) return;
          const rec = { id: newLocationId(), name: l.name || '', concept: cpt.name, address: l.address || '', city: l.city || '', state: l.state || '', phone: l.phone || '', website: r.website, opened: '', status: 'Operating', notes: '', photos: [], source: 'ai-web', createdAt: now };
          c.locations.push(rec); newLocs.push(rec); addedLocations++;
        });
      }
    });

    // Company logo from the GROUP's own website (only fill blanks).
    const groupSite = String(b.website || '').trim() || String((c.office && c.office.website) || '').trim();
    let companyLogoSet = false;
    if (groupSite) {
      c.office = c.office || {};
      if (!String(c.office.website || '').trim()) c.office.website = groupSite.slice(0, 200);
      if (!String(c.logo || '').trim()) { const lg = logoFromWebsite(groupSite); if (lg) { c.logo = lg; companyLogoSet = true; } }
    }

    c.updatedAt = now; saveCompanies(arr);

    // Best-effort storefront photos for brand-new locations (only if a Google key is set).
    const gkey = loadGmapsKey();
    let photos = 0;
    if (gkey && newLocs.length) {
      const arr2 = loadCompanies(); const c2 = arr2.find(x => x.id === req.params.id);
      for (const l of newLocs.slice(0, 60)) {
        try { const live = c2 && (c2.locations || []).find(x => x.id === l.id); if (!live) continue; const pr = await pullPhotosForLocation(gkey, live); if (pr.added) photos++; } catch (e) {}
      }
      if (c2) { c2.updatedAt = new Date().toISOString(); saveCompanies(arr2); }
    }

    const finalC = loadCompanies().find(x => x.id === req.params.id) || c;
    res.json({ ok: true, concepts: finalC.concepts || [], locations: finalC.locations || [], addedConcepts, addedLocations, photos, companyLogoSet, logo: finalC.logo || '', officeWebsite: (finalC.office && finalC.office.website) || '', noSite: resolved.filter(r => !r.website).map(r => r.name) });
  } catch (e) {
    console.error('build-concepts error:', e && e.message);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});
app.post('/api/company/:id/concept-resolve', express.json(), async (req, res) => {
  try {
    const arr = loadCompanies(); const c = arr.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ ok: false, error: 'A concept name is required.' });
    const r = await locationgen.resolveConcept({ name, market: String(b.market || '').trim(), conceptTypes: CONCEPT_TYPES, cuisines: effCuisineTypes() });
    const ct = (CONCEPT_TYPES.indexOf(r.conceptType) >= 0) ? r.conceptType : '';
    const cu = (effCuisineTypes().indexOf(r.cuisine) >= 0) ? r.cuisine : '';
    const pp = (PRICE_POINTS.indexOf(r.pricePoint) >= 0) ? r.pricePoint : '';
    res.json({ ok: true, profile: { website: r.website, conceptType: ct, cuisine: cu, pricePoint: pp, note: r.note } });
  } catch (e) {
    console.error('concept-resolve error:', e && e.message);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});
app.post('/api/company', express.json(), (req, res) => {
  const b = req.body || {};
  const arr = loadCompanies();
  let c = b.id ? arr.find(x => x.id === b.id) : null;
  const now = new Date().toISOString();
  if (!c) {
    const nm = String(b.name || '').trim();
    if (!nm) return res.status(400).json({ ok: false, error: 'A company name is required.' });
    // Prevent duplicates — if a company with this name already exists, point to it.
    const existing = arr.find(x => normKey(x.name) === normKey(nm));
    if (existing) return res.status(409).json({ ok: false, error: 'A company named “' + existing.name + '” already exists.', existingId: existing.id, existing: { id: existing.id, name: existing.name } });
    c = { id: newCompanyId(), name: '', market: '', type: 'Seller', notes: '', createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }; arr.push(c);
  }
  if (typeof b.name === 'string' && b.name.trim()) c.name = b.name.trim().slice(0, 160);
  if (typeof b.market === 'string') c.market = b.market.slice(0, 80);
  if (typeof b.type === 'string' && effCompanyTypes().indexOf(b.type) >= 0) c.type = b.type;
  if (b.tags !== undefined) c.tags = (cleanStrList(b.tags, 30, 40) || []);
  if (typeof b.notes === 'string') c.notes = b.notes.slice(0, 6000);
  if (typeof b.leadSource === 'string') c.leadSource = b.leadSource.slice(0, 160);
  if (typeof b.mainContactId === 'string') c.mainContactId = b.mainContactId.slice(0, 40);
  if (typeof b.logo === 'string') c.logo = b.logo.slice(0, 400);
  if (b.office && typeof b.office === 'object') {
    const o = c.office || {};
    ['address', 'city', 'state', 'phone', 'website', 'email'].forEach(k => { if (typeof b.office[k] === 'string') o[k] = b.office[k].slice(0, 200); });
    c.office = o;
  }
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
  if (p) { p.companyId = c.id; if (typeof b.type === 'string' && effPersonTypes().indexOf(b.type) >= 0) p.type = b.type; if (typeof b.title === 'string') p.title = b.title.slice(0, 120); p.updatedAt = new Date().toISOString(); savePeople(arr); }
  else {
    const first = String(b.firstName || '').trim(), last = String(b.lastName || '').trim();
    const emails = cleanList(b.emails !== undefined ? b.emails : b.email, 10, 160);
    const phones = cleanList(b.phones !== undefined ? b.phones : b.phone, 10, 60);
    if (!first || !last) return res.status(400).json({ ok: false, error: 'First and last name are required.' });
    if (!(typeof b.type === 'string' && effPersonTypes().indexOf(b.type) >= 0)) return res.status(400).json({ ok: false, error: 'A contact type is required.' });
    const clash = emailOwner(arr, emails, '__new__');
    if (clash) return res.status(409).json({ ok: false, error: 'That email is already on ' + (clash.name || 'another contact') + '.', existingId: clash.id });
    p = findOrCreatePerson(req, { firstName: first, lastName: last, name: composeName(first, last), emails: emails, phones: phones, companyId: c.id, type: b.type, strict: true });
    if (p && typeof b.type === 'string' && effPersonTypes().indexOf(b.type) >= 0 && p.type !== b.type) { const _a = loadPeople(); const _pp = _a.find(x => x.id === p.id); if (_pp) { _pp.type = b.type; _pp.updatedAt = new Date().toISOString(); savePeople(_a); p.type = b.type; } }
    if (p && (b.title || b.nickname || b.notes || Array.isArray(b.tags) || b.leadSource || b.referredBy || b.referredById)) { const a2 = loadPeople(); const pp = a2.find(x => x.id === p.id); if (pp) { if (b.title) pp.title = String(b.title).slice(0, 120); if (b.nickname) pp.nickname = String(b.nickname).slice(0, 80); if (b.notes) pp.notes = String(b.notes).slice(0, 4000); if (Array.isArray(b.tags)) pp.tags = b.tags.map(x => String(x || '').slice(0, 60)).filter(Boolean).slice(0, 30); if (Array.isArray(b.prefContact)) pp.prefContact = b.prefContact.filter(x => ['phone','text','email'].indexOf(x) >= 0); if (b.leadSource) pp.leadSource = String(b.leadSource).slice(0, 160); if (b.referredBy) pp.referredBy = String(b.referredBy).slice(0, 160); if (b.referredById) pp.referredById = String(b.referredById).slice(0, 40); pp.updatedAt = new Date().toISOString(); savePeople(a2); } }
  }
  // If the company has no primary contact yet, make this newly-added contact the primary.
  if (p) { try { const _cos = loadCompanies(); const _c = _cos.find(x => x.id === c.id); if (_c && !String(_c.mainContactId || '').trim()) { _c.mainContactId = p.id; _c.updatedAt = new Date().toISOString(); saveCompanies(_cos); } } catch (e) {} }
  const contacts = loadPeople().filter(x => x.companyId === c.id).map(companyContactRow);
  res.json({ ok: true, contacts });
});
// Remove a contact's association from a company (does not delete the person).
app.post('/api/company/:id/contact/:personId/remove', (req, res) => {
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  const arr = loadPeople(); const p = arr.find(x => x.id === req.params.personId);
  if (p && p.companyId === c.id) { p.companyId = ''; p.updatedAt = new Date().toISOString(); savePeople(arr); }
  const contacts = arr.filter(x => x.companyId === c.id).map(companyContactRow);
  res.json({ ok: true, contacts });
});
app.post('/api/company/merge', express.json(), (req, res) => {
  const u = req.user || {};
  const canMerge = isSuper(u) || (permsEnabled() && effectivePerms(u).delete);
  if (!canMerge) return res.status(403).json({ ok: false, error: 'You do not have permission to merge companies.' });
  const b = req.body || {};
  const keepId = String(b.keepId || '');
  let mergeIds = Array.isArray(b.mergeIds) ? b.mergeIds.map(String).filter(Boolean) : [];
  mergeIds = mergeIds.filter(id => id && id !== keepId);
  const companies = loadCompanies();
  const keep = companies.find(c => c.id === keepId);
  if (!keep) return res.status(404).json({ ok: false, error: 'Surviving company not found.' });
  const losers = mergeIds.map(id => companies.find(c => c.id === id)).filter(Boolean);
  if (!losers.length) return res.status(400).json({ ok: false, error: 'Pick at least one other company to merge in.' });
  const loserIds = losers.map(c => c.id);
  const now = new Date().toISOString();
  const _lk = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  // Concepts — union, dedupe by normalized name
  keep.concepts = Array.isArray(keep.concepts) ? keep.concepts : [];
  const cptSeen = {}; keep.concepts.forEach(cp => { cptSeen[normKey(cp.name)] = true; });
  losers.forEach(l => (l.concepts || []).forEach(cp => { const k = normKey(cp.name); if (!cptSeen[k]) { cptSeen[k] = true; keep.concepts.push(cp); } }));

  // Locations — union, dedupe by concept + address / name-in-city
  keep.locations = Array.isArray(keep.locations) ? keep.locations : [];
  losers.forEach(l => (l.locations || []).forEach(loc => {
    const dup = keep.locations.some(x => {
      if ((x.concept || '') !== (loc.concept || '')) return false;
      const ax = _lk(x.address), al = _lk(loc.address); if (ax && al && ax === al) return true;
      const nx = _lk(x.name), nl = _lk(loc.name), cx = _lk(x.city), cl = _lk(loc.city); if (nx && nl && nx === nl && cx === cl) return true;
      return false;
    });
    if (!dup) keep.locations.push(loc);
  }));

  // Fill blank scalar fields from the first loser that has them
  ['market', 'type', 'leadSource', 'logo'].forEach(f => { if (!String(keep[f] || '').trim()) { for (const l of losers) { if (String(l[f] || '').trim()) { keep[f] = l[f]; break; } } } });
  // Office — fill blank subfields
  keep.office = keep.office || {};
  losers.forEach(l => { const o = l.office || {}; ['address', 'city', 'state', 'phone', 'email', 'website'].forEach(k => { if (!String(keep.office[k] || '').trim() && String(o[k] || '').trim()) keep.office[k] = o[k]; }); });
  // Main contact — keep keeper's; else adopt the first loser's
  if (!String(keep.mainContactId || '').trim()) { for (const l of losers) { if (String(l.mainContactId || '').trim()) { keep.mainContactId = l.mainContactId; break; } } }

  // Tags union
  const tg = Array.isArray(keep.tags) ? keep.tags.slice() : [];
  losers.forEach(l => (Array.isArray(l.tags) ? l.tags : []).forEach(t => { if (tg.indexOf(t) < 0) tg.push(t); }));
  keep.tags = tg.slice(0, 30);

  // Notes merge
  const baseNote = String(keep.notes || '').trim();
  const extra = losers.map(l => String(l.notes || '').trim()).filter(n => n && n !== baseNote);
  if (extra.length) keep.notes = [baseNote].concat(extra).filter(Boolean).join('\n\n---\n').slice(0, 8000);

  keep.updatedAt = now;

  // Drop losers, save companies (keeper mutations included)
  saveCompanies(companies.filter(c => loserIds.indexOf(c.id) < 0));

  const inLosers = id => id && loserIds.indexOf(id) >= 0;
  // Reassign every reference from a loser to the keeper
  try { const people = loadPeople(); let ch = false; people.forEach(p => { if (inLosers(p.companyId)) { p.companyId = keepId; if (p.company) p.company = keep.name; ch = true; } }); if (ch) savePeople(people); } catch (e) {}
  try { const deals = loadDeals(); let ch = false; deals.forEach(d => { if (inLosers(d.companyId)) { d.companyId = keepId; ch = true; } }); if (ch) saveDeals(deals); } catch (e) {}
  try { const ags = loadAgreements(); let ch = false; ags.forEach(a => { if (a.companyId && inLosers(a.companyId)) { a.companyId = keepId; ch = true; } }); if (ch) saveAgreements(ags); } catch (e) {}

  res.json({ ok: true, keepId: keepId, merged: loserIds.length });
});
app.delete('/api/company/:id', (req, res) => {
  if (!canDelete(req)) return res.status(403).json({ ok: false, error: 'You do not have permission to delete companies.' });
  const id = req.params.id;
  const companies = loadCompanies();
  const c = companies.find(x => x.id === id);
  if (!c) return res.status(404).json({ ok: false, error: 'Company not found.' });
  // 1) Delete every deal tied to this company, with its full record chain + files.
  const deals = loadDeals();
  const linkedDeals = deals.filter(d => d.companyId === id);
  linkedDeals.forEach(d => { try { purgeDealRecords(d); } catch (e) { console.error('company delete — deal purge failed:', e && e.message); } });
  if (linkedDeals.length) saveDeals(loadDeals().filter(d => d.companyId !== id));
  // 2) Delete the company's location photo files.
  let photos = 0;
  (c.locations || []).forEach(l => (l.photos || []).forEach(p => { try { fs.unlinkSync(path.join(LOCPHOTO_DIR, p.id + '.' + p.ext)); photos++; } catch (e) {} }));
  // 3) Remove the company record (concepts + locations are embedded, so they go with it).
  saveCompanies(companies.filter(x => x.id !== id));
  // 4) Unlink contacts (people are global — keep them, just clear the association).
  const people = loadPeople(); let ch = false; people.forEach(p => { if (p.companyId === id) { p.companyId = ''; ch = true; } }); if (ch) savePeople(people);
  res.json({ ok: true, deletedDeals: linkedDeals.length, deletedPhotos: photos });
});
// ---- Deals (first-class) ----
app.post('/api/deal/new', express.json(), (req, res) => {
  const b = req.body || {};
  const business = String(b.business || '').trim();
  if (!business) return res.status(400).json({ ok: false, error: 'A business / deal name is required.' });
  if (!String(b.contact || '').trim() && !String(b.contactEmail || '').trim()) return res.status(400).json({ ok: false, error: 'A client contact is required — every listing must be linked to a contact.' });
  const rec = {
    id: newDealId(), business: business.slice(0, 120), market: String(b.market || '').slice(0, 80), contact: String(b.contact || '').slice(0, 120),
    screenId: '', roomId: '', contactPersonId: '', companyId: '', createdAt: new Date().toISOString(),
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
  };
  // Onboarding: open the company file for the subject business...
  const company = findOrCreateCompany(req, { name: rec.business, market: rec.market, type: 'Seller' });
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
// Delete every record in a deal's chain (rooms+files, lease, map, cim, bov, questionnaire,
// screening, and overlay). Does NOT touch the deals array — caller removes the deal record.
function purgeDealRecords(rec) {
  const key = rec.screenId ? ('s_' + rec.screenId) : ('d_' + rec.id);
  const group = assignmentsIndex()[key] || {};
  const screenId = rec.screenId || (group.screen && group.screen.id) || '';
  const questId = (group.quest && group.quest.id) || '';
  const bovIds = [], cimIds = [], mapIds = [], leaseIds = [], roomIds = [];
  if (group.bov) bovIds.push(group.bov.id);
  if (group.cim) cimIds.push(group.cim.id);
  if (group.map) mapIds.push(group.map.id);
  if (group.lease) leaseIds.push(group.lease.id);
  if (group.room) roomIds.push(group.room.id);
  if (rec.roomId) roomIds.push(rec.roomId);
  const rooms = loadRooms();
  const roomKeep = [];
  rooms.forEach(r => {
    const linked = roomIds.indexOf(r.id) >= 0 || r.srcDealId === rec.id || (r.srcCimId && cimIds.indexOf(r.srcCimId) >= 0);
    if (linked) { (r.docs || []).forEach(dd => { try { fs.unlinkSync(path.join(ROOMS_DIR, dd.id + '.' + dd.ext)); } catch (e) {} }); }
    else roomKeep.push(r);
  });
  if (roomKeep.length !== rooms.length) saveRooms(roomKeep);
  if (leaseIds.length) saveLeases(loadLeases().filter(x => leaseIds.indexOf(x.id) < 0));
  if (mapIds.length) saveMaps(loadMaps().filter(x => mapIds.indexOf(x.id) < 0));
  if (cimIds.length) saveCims(loadCims().filter(x => cimIds.indexOf(x.id) < 0));
  if (bovIds.length) saveBovs(loadBovs().filter(x => bovIds.indexOf(x.id) < 0));
  if (screenId) {
    saveQuests(loadQuests().filter(x => String(x.formId || '') !== 'qfromscr_' + screenId));
    saveScreens(loadScreens().filter(x => x.id !== screenId));
  } else if (questId) {
    saveQuests(loadQuests().filter(x => x.id !== questId));
  }
  const overlay = loadAssignOverlay(); if (overlay[key]) { delete overlay[key]; saveAssignOverlay(overlay); }
}
app.delete('/api/deal/:id', (req, res) => {
  const arr = loadDeals(); const rec = arr.find(x => x.id === req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Deal not found.' });
  if (!ownsDeal(req, rec)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  purgeDealRecords(rec);
  saveDeals(arr.filter(x => x.id !== rec.id));
  res.json({ ok: true });
});
app.delete('/api/assignment/:key', (req, res) => {
  const key = req.params.key;
  const idx = assignmentsIndex();
  const d = idx[key];
  if (!d) return res.status(404).json({ ok: false, error: 'Listing not found.' });
  if (!canDelete(req)) return res.status(403).json({ ok: false, error: 'You do not have permission to delete listings.' });
  if (!(canSeeAllDeals(req) || ownsAssignment(req, d))) return res.status(403).json({ ok: false, error: 'Not yours.' });
  try {
    if (d.deal) { const arr = loadDeals(); purgeDealRecords(d.deal); saveDeals(arr.filter(x => x.id !== d.deal.id)); }
    else {
      if (d.bov) saveBovs(loadBovs().filter(x => x.id !== d.bov.id));
      if (d.cim) saveCims(loadCims().filter(x => x.id !== d.cim.id));
      if (d.map) saveMaps(loadMaps().filter(x => x.id !== d.map.id));
      if (d.lease) saveLeases(loadLeases().filter(x => x.id !== d.lease.id));
      if (d.room) { const rooms = loadRooms(); const rm = rooms.find(r => r.id === d.room.id); if (rm) { (rm.docs || []).forEach(dd => { try { fs.unlinkSync(path.join(ROOMS_DIR, dd.id + '.' + dd.ext)); } catch (e) {} }); } saveRooms(rooms.filter(r => r.id !== d.room.id)); }
      if (d.quest) saveQuests(loadQuests().filter(x => x.id !== d.quest.id));
      if (d.screen) saveScreens(loadScreens().filter(x => x.id !== d.screen.id));
    }
    const ov = loadAssignOverlay(); if (ov[key]) { delete ov[key]; saveAssignOverlay(ov); }
  } catch (e) { return res.status(500).json({ ok: false, error: 'Could not delete the listing.' }); }
  res.json({ ok: true });
});
// ---- Tickets — reps open requests to the brokerage office; an AI office assistant works each one ----
function ticketBrief(t) {
  const msgs = Array.isArray(t.thread) ? t.thread : [];
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  return {
    id: t.id, num: t.num || 0, no: ticketNo(t), subject: t.subject || '', category: t.category || 'Other',
    department: t.department || '', departmentName: (ticketDept(t) || {}).name || '',
    priority: t.priority || 'Normal', status: t.status || 'Open',
    by: t.by || '', byUser: t.byUser || '', createdAt: t.createdAt || '', updatedAt: t.updatedAt || t.createdAt || '',
    messages: msgs.length, lastFrom: last ? last.from : '', lastAt: last ? last.at : (t.createdAt || ''),
  };
}
function ticketFull(t) {
  return {
    id: t.id, num: t.num || 0, no: ticketNo(t), subject: t.subject || '', category: t.category || 'Other',
    department: t.department || '', departmentName: (ticketDept(t) || {}).name || '',
    priority: t.priority || 'Normal', status: t.status || 'Open', by: t.by || '', byUser: t.byUser || '',
    createdAt: t.createdAt || '', updatedAt: t.updatedAt || t.createdAt || '',
    thread: (Array.isArray(t.thread) ? t.thread : []).map(m => ({ from: m.from, name: m.name || '', at: m.at || '', text: m.text || '', status: m.status || '' })),
  };
}
// Run the AI brokerage-office assistant on a ticket; appends its reply to the thread and sets status.
async function runTicketAI(t, req) {
  const thread = Array.isArray(t.thread) ? t.thread : [];
  const first = thread.find(m => m.from === 'rep');
  try {
    const out = await ticketgen.handleTicket({
      subject: t.subject, category: t.category, priority: t.priority,
      details: (first && first.text) || t.subject || '',
      thread: thread,
      rep: t.by || (req && req.user && req.user.name) || 'an RRG rep',
      systemPrompt: loadTicketPrompt(),
    });
    thread.push({ from: 'office', name: 'RRG Brokerage Office', at: new Date().toISOString(), text: out.reply, status: out.status });
    t.status = out.status || 'Answered';
    if (out.summary) t.aiSummary = String(out.summary).slice(0, 140);
  } catch (e) {
    console.error('ticket AI error:', e && e.message);
    thread.push({ from: 'office', name: 'RRG Brokerage Office', at: new Date().toISOString(),
      text: "Thanks — your request is logged and the office will follow up. (The automated assistant is temporarily unavailable, so a person will review this shortly.)", status: 'Open', failed: true });
    t.status = 'Open';
  }
  t.thread = thread; t.updatedAt = new Date().toISOString();
}
app.get('/api/tickets', (req, res) => {
  const isAdmin = !!(req.user && isSuper(req.user));
  let arr = loadTickets().filter(t => canSeeTicket(req, t));
  arr = arr.slice().sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  res.json({ ok: true, tickets: arr.map(ticketBrief), categories: effTicketCategories(), priorities: TICKET_PRIORITIES, statuses: TICKET_STATUSES, isAdmin, ribbon: effShowRequestRibbon(), departments: effDepartments().map(d => ({ id: d.id, name: d.name, cats: d.cats })), myDepartments: userDepartmentIds(req.user && req.user.username) });
});
app.get('/api/ticket/:id', (req, res) => {
  const t = loadTickets().find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Ticket not found.' });
  if (!canSeeTicket(req, t)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  res.json({ ok: true, ticket: ticketFull(t), categories: effTicketCategories(), priorities: TICKET_PRIORITIES, statuses: TICKET_STATUSES, isAdmin: !!(req.user && isSuper(req.user)), departments: effDepartments().map(d => ({ id: d.id, name: d.name, cats: d.cats })) });
});
app.post('/api/ticket', express.json(), async (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject || '').trim();
  const details = String(b.details || '').trim();
  if (!subject) return res.status(400).json({ ok: false, error: 'A subject is required.' });
  if (!details) return res.status(400).json({ ok: false, error: 'Please describe your request.' });
  const arr = loadTickets();
  const nextNum = arr.reduce((m, x) => Math.max(m, x.num || 0), 1000) + 1;
  const now = new Date().toISOString();
  const _cat = effTicketCategories().indexOf(b.category) >= 0 ? b.category : 'Other';
  const _dept = deptById(b.department) || deptForCategory(_cat);
  const t = {
    id: newTicketId(), num: nextNum, subject: subject.slice(0, 160),
    category: _cat, department: _dept ? _dept.id : '',
    priority: TICKET_PRIORITIES.indexOf(b.priority) >= 0 ? b.priority : 'Normal',
    status: 'Open', createdAt: now, updatedAt: now,
    by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '',
    thread: [{ from: 'rep', name: (req.user && req.user.name) || 'Rep', at: now, text: details.slice(0, 8000) }],
  };
  await runTicketAI(t, req);           // AI office assistant works it immediately
  arr.push(t); saveTickets(arr);
  // Notify the services desk that a new request came in (best-effort).
  const base = appBaseUrl();
  sendNotifyMail(deptNotifyEmails(_dept), 'New request ' + ticketNo(t) + ' · ' + t.subject,
    'A new office request was submitted.\n\nFrom: ' + (t.by || 'a rep') + '\nDepartment: ' + (_dept ? _dept.name : 'Unassigned') + '\nCategory: ' + t.category + '\nPriority: ' + t.priority + '\n\n' + details +
    (base ? ('\n\nOpen it: ' + base + '/rrg_tickets.html') : '')).catch(() => {});
  res.json({ ok: true, ticket: ticketFull(t) });
});
app.post('/api/ticket/:id/reply', express.json(), async (req, res) => {
  const arr = loadTickets(); const t = arr.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Ticket not found.' });
  if (!canSeeTicket(req, t)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Message is empty.' });
  t.thread = Array.isArray(t.thread) ? t.thread : [];
  const now = new Date().toISOString();
  const isOffice = String(t.byUser || '').toLowerCase() !== String((req.user && req.user.username) || '').toLowerCase();
  if (isOffice) {
    // An admin (the office) is answering someone else's request — post as the office, no AI, and notify the rep.
    t.thread.push({ from: 'office', name: (req.user && req.user.name) || 'RRG Brokerage Office', at: now, text: text.slice(0, 8000) });
    if (typeof req.body.status === 'string' && TICKET_STATUSES.indexOf(req.body.status) >= 0) t.status = req.body.status; else t.status = 'Answered';
    t.updatedAt = now; saveTickets(arr);
    const oe = ticketOwnerEmail(t); const base = appBaseUrl();
    sendNotifyMail(oe, 'Reply on your request ' + ticketNo(t) + ' · ' + t.subject,
      'The brokerage office replied to your request ' + ticketNo(t) + ':\n\n"' + text.slice(0, 600) + '"\n\nStatus: ' + t.status +
      (base ? ('\n\nView it: ' + base + '/rrg_tickets.html') : '')).catch(() => {});
    return res.json({ ok: true, ticket: ticketFull(t) });
  }
  // Owner follow-up → the AI office assistant responds.
  t.thread.push({ from: 'rep', name: (req.user && req.user.name) || 'Rep', at: now, text: text.slice(0, 8000) });
  t.status = 'Open';
  await runTicketAI(t, req);
  saveTickets(arr);
  res.json({ ok: true, ticket: ticketFull(t) });
});
app.post('/api/ticket/:id/status', express.json(), (req, res) => {
  const arr = loadTickets(); const t = arr.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Ticket not found.' });
  if (!canSeeTicket(req, t)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  const s = String((req.body && req.body.status) || '');
  if (TICKET_STATUSES.indexOf(s) < 0) return res.status(400).json({ ok: false, error: 'Bad status.' });
  t.status = s; t.updatedAt = new Date().toISOString(); saveTickets(arr);
  res.json({ ok: true, ticket: ticketFull(t) });
});
app.delete('/api/ticket/:id', (req, res) => {
  const arr = loadTickets(); const t = arr.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Ticket not found.' });
  if (!ownsTicket(req, t)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  saveTickets(arr.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});
// Record counts per tool file — powers the little count badges on the dashboard.
app.get('/api/counts', (req, res) => {
  const isAdmin = !!(req.user && isSuper(req.user));
  const tickets = loadTickets();
  // Total deals + how many are still live (not Closed or Lost).
  let dealCount = 0, activeDeals = 0;
  try {
    const idx = assignmentsIndex(); const ov = loadAssignOverlay();
    const keys = Object.keys(idx); dealCount = keys.length;
    keys.forEach(k => { const st = (ov[k] && ov[k].status) || 'New'; if (st !== 'Closed' && st !== 'Lost') activeDeals++; });
  } catch (e) { dealCount = loadDeals().length; activeDeals = dealCount; }
  const counts = {
    'rrg_companies.html': loadCompanies().length,
    'rrg_people.html': loadPeople().length,
    'rrg_assignments.html': dealCount,
    'rrg_tickets.html': isAdmin ? tickets.length : tickets.filter(t => ownsTicket(req, t)).length,
    'rrg_screening_queue.html': loadScreens().length,
    'rrg_questionnaire_queue.html': loadQuests().length,
    'rrg_bov_queue.html': loadBovs().length,
    'rrg_cim_queue.html': loadCims().length,
    'rrg_attack_queue.html': loadMaps().length,
    'rrg_rooms_queue.html': loadRooms().length,
    'rrg_agreements.html': loadAgreements().length,
  };
  // Secondary "active" badges keyed by tool file.
  const active = { 'rrg_assignments.html': activeDeals };
  const _t = new Date(); const _ts = _t.getFullYear()+'-'+String(_t.getMonth()+1).padStart(2,'0')+'-'+String(_t.getDate()).padStart(2,'0');
  let agrExpiring = 0;
  loadAgreements().forEach(a => { if (a.status === 'terminated' || !a.expires || a.expires < _ts) return; const du = daysUntil(a.expires); if (du != null && du <= 60) agrExpiring++; });
  let tasksDue = 0;
  loadTasks().forEach(t => { if (t.status === 'open' && taskVisible(t, req) && t.reminder && String(t.reminder).slice(0, 10) <= _ts) tasksDue++; });
  let tasksOverdue = 0;
  loadTasks().forEach(t => { if (t.status === 'open' && taskVisible(t, req) && t.due && String(t.due).slice(0, 10) < _ts) tasksOverdue++; });
  const expiring = { 'rrg_agreements.html': agrExpiring, 'rrg_tasks.html': tasksDue };
  let reqOverdue = 0;
  const _rnow = Date.now(); const _sla = { Urgent: 1, High: 2, Normal: 4 };
  loadTickets().forEach(t => { if (!canSeeTicket(req, t)) return; const st = t.status || 'Open'; if (st === 'Closed' || st === 'Answered') return; const created = Date.parse(t.createdAt || t.at || '') || 0; if (!created) return; const ageDays = (_rnow - created) / 86400000; const sla = (_sla[t.priority] != null) ? _sla[t.priority] : 4; if (ageDays > sla) reqOverdue++; });
  const overdue = { 'rrg_tasks.html': tasksOverdue, 'rrg_tickets.html': reqOverdue };
  res.json({ ok: true, counts, active, expiring, overdue });
});
// ---- Command Center — management + prospecting intelligence across the book & pipeline ----
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr) + 'T00:00:00'); if (isNaN(d.getTime())) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
function parseMoney(str) {
  if (!str) return 0;
  const m = String(str).replace(/,/g, '').match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*([mMkK])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]); if (!isFinite(n)) return 0;
  const u = (m[2] || '').toLowerCase(); if (u === 'm') n *= 1e6; else if (u === 'k') n *= 1e3;
  return n;
}
app.get('/api/command', (req, res) => {
  const isAdmin = !!(req.user && isSuper(req.user));
  const companies = loadCompanies();
  const people = loadPeople();
  // ---------- Lease ladder (every location with a lease expiration) ----------
  const leaseLadder = [];
  companies.forEach(c => {
    (c.locations || []).forEach(l => {
      const dte = daysUntil(l.leaseExpires);
      if (dte === null) return;
      const cpt = (c.concepts || []).find(x => x.name === l.concept);
      leaseLadder.push({
        companyId: c.id, company: c.name, concept: l.concept || '', name: l.name || l.address || 'Location',
        city: l.city || '', state: l.state || '', markets: (cpt && cpt.markets) || [], status: l.status || 'Open',
        siteType: l.siteType || '', commissary: !!l.commissary, flagship: !!l.flagship,
        leaseStart: l.leaseStart || '', leaseExpires: l.leaseExpires, daysToExpiry: dte,
      });
    });
  });
  leaseLadder.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  const leaseBuckets = { expired: 0, m6: 0, m12: 0, m18: 0, m24: 0, beyond: 0 };
  leaseLadder.forEach(x => {
    const d = x.daysToExpiry;
    if (d < 0) leaseBuckets.expired++; else if (d <= 182) leaseBuckets.m6++; else if (d <= 365) leaseBuckets.m12++;
    else if (d <= 547) leaseBuckets.m18++; else if (d <= 730) leaseBuckets.m24++; else leaseBuckets.beyond++;
  });
  // ---------- Pipeline (seller-side deal management) ----------
  const overlay = loadAssignOverlay();
  const deals = Object.values(assignmentsIndex()).filter(d => isAdmin || ownsAssignment(req, d)).map(d => assignmentView(d, overlay));
  const STAGE_KEYS = ['call', 'questionnaire', 'bov', 'pack', 'attack', 'room'];
  const funnel = {}; STAGE_KEYS.forEach(k => funnel[k] = 0);
  const statusBreak = {}; const byOwner = {};
  let activeVal = 0, activeCount = 0, closedCount = 0, lostCount = 0;
  const now = Date.now();
  const staleRows = [], expiringRows = [], noInterestRows = [];
  deals.forEach(d => {
    STAGE_KEYS.forEach(k => { if (d.stages[k] && d.stages[k].done) funnel[k]++; });
    statusBreak[d.status] = (statusBreak[d.status] || 0) + 1;
    const live = d.status !== 'Closed' && d.status !== 'Lost';
    const own = d.owner || '—';
    byOwner[own] = byOwner[own] || { owner: own, active: 0, total: 0, expiring: 0, value: 0 };
    byOwner[own].total++;
    if (d.status === 'Closed') closedCount++; if (d.status === 'Lost') lostCount++;
    if (live) {
      activeCount++; byOwner[own].active++;
      const v = parseMoney(d.value); activeVal += v; byOwner[own].value += v;
      // stale: no activity in 30+ days
      const la = d.lastActivity ? new Date(d.lastActivity).getTime() : 0;
      const ageDays = la ? Math.round((now - la) / 86400000) : null;
      if (ageDays !== null && ageDays >= 30) staleRows.push({ key: d.key, business: d.business, owner: own, status: d.status, ageDays });
      // no buyer interest but marketed (has pack)
      if (d.stages.pack && d.stages.pack.done && !(d.offers.length || d.tours.length)) noInterestRows.push({ key: d.key, business: d.business, owner: own });
    }
    const dte = daysUntil(d.listingExpires);
    if (dte !== null && dte <= 90) { byOwner[own].expiring++; expiringRows.push({ key: d.key, business: d.business, owner: own, daysToExpiry: dte, autoRenew: d.autoRenew, listingExpires: d.listingExpires }); }
  });
  expiringRows.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  staleRows.sort((a, b) => b.ageDays - a.ageDays);
  // ---------- Portfolio intelligence ----------
  let locTotal = 0, conceptTotal = 0, commissaryCount = 0;
  const statusMix = {}, siteMix = {}, marketCoverage = {};
  const multiUnit = [], singleUnit = [], darkUnits = [], underConstruction = [], noContacts = [], noDeals = [];
  const dealsByCompany = {}; loadDeals().forEach(d => { if (d.companyId) dealsByCompany[d.companyId] = (dealsByCompany[d.companyId] || 0) + 1; });
  RRG_METROS.forEach(m => marketCoverage[m] = { concepts: 0, locations: 0 });
  companies.forEach(c => {
    const locs = c.locations || [];
    locTotal += locs.length;
    (c.concepts || []).forEach(cpt => {
      conceptTotal++;
      const cptLocs = locs.filter(l => l.concept === cpt.name);
      if (cptLocs.length > 1) multiUnit.push({ companyId: c.id, company: c.name, concept: cpt.name, units: cptLocs.length });
      else singleUnit.push({ companyId: c.id, company: c.name, concept: cpt.name, units: cptLocs.length });
      (cpt.markets || []).forEach(mk => { if (marketCoverage[mk]) { marketCoverage[mk].concepts++; marketCoverage[mk].locations += cptLocs.length; } });
    });
    locs.forEach(l => {
      statusMix[l.status || 'Open'] = (statusMix[l.status || 'Open'] || 0) + 1;
      if (l.siteType) siteMix[l.siteType] = (siteMix[l.siteType] || 0) + 1;
      if (l.commissary) commissaryCount++;
      if ((l.status || '') === 'Dark') darkUnits.push({ companyId: c.id, company: c.name, concept: l.concept || '', name: l.name || l.address || 'Location', city: l.city || '' });
      if ((l.status || '') === 'Under Construction') underConstruction.push({ companyId: c.id, company: c.name, concept: l.concept || '', name: l.name || l.address || 'Location', city: l.city || '' });
    });
    const contactCount = people.filter(p => p.companyId === c.id).length;
    if (!contactCount) noContacts.push({ companyId: c.id, company: c.name });
    if (!dealsByCompany[c.id]) noDeals.push({ companyId: c.id, company: c.name });
  });
  multiUnit.sort((a, b) => b.units - a.units);
  res.json({
    ok: true, isAdmin,
    generatedAt: new Date().toISOString(),
    lease: { ladder: leaseLadder, buckets: leaseBuckets },
    pipeline: {
      funnel, funnelOrder: STAGE_KEYS, statusBreak,
      summary: { total: deals.length, active: activeCount, closed: closedCount, lost: lostCount, activeValue: Math.round(activeVal) },
      byOwner: Object.values(byOwner).sort((a, b) => b.active - a.active),
      expiring: expiringRows, stale: staleRows, noInterest: noInterestRows,
    },
    portfolio: {
      totals: { companies: companies.length, concepts: conceptTotal, locations: locTotal, contacts: people.length, commissaries: commissaryCount },
      statusMix, siteMix, marketCoverage,
      multiUnit, singleUnit: singleUnit.length, darkUnits, underConstruction,
      housekeeping: { noContacts, noDeals },
    },
  });
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
  const _assignableRoles = loadRoles().filter(r => r.key !== 'creator');
  const roleOptsHtml = _assignableRoles.map(r => '<option value="' + esc(r.key) + '"' + (r.key === 'associate' ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('');
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
      <td class="nm">${esc(u.name)} ${isSuper(u) ? '<span class="tag admin">Admin</span>' : ''} ${u.disabled ? '<span class="tag off">Disabled</span>' : ''}</td>
      <td class="mono">${esc(u.username)}</td>
      <td class="mono">${esc(u.email) || '—'}</td>
      <td class="ts">${esc((u.createdAt || '').slice(0, 10))}</td>
      <td class="ts">${lastLogin[u.username] ? fmtWhen(lastLogin[u.username]) : '<span class="sub2">Never</span>'}</td>
      <td class="act">
        <form method="post" action="/api/admin/reset" onsubmit="return rp(this)"><input type="hidden" name="username" value="${esc(u.username)}"><button>Reset password</button></form>
        <form method="post" action="/api/admin/toggle"><input type="hidden" name="username" value="${esc(u.username)}"><input type="hidden" name="disabled" value="${u.disabled ? '0' : '1'}"><button>${u.disabled ? 'Enable' : 'Disable'}</button></form>
        <form method="post" action="/api/admin/remove" onsubmit="return confirm('Remove ${esc(u.username)}?')"><input type="hidden" name="username" value="${esc(u.username)}"><button class="danger">Remove</button></form>
      </td></tr>`).join('') || '<tr><td colspan="6" class="empty">No users yet.</td></tr>';
  const userData = users.slice().sort((a,b)=>String(a.name||a.username).toLowerCase().localeCompare(String(b.name||b.username).toLowerCase())).map(u => ({ name: u.name||'', username: u.username||'', email: u.email||'', role: u.role||'', disabled: !!u.disabled, created: (u.createdAt||'').slice(0,10), last: lastLogin[u.username] ? fmtWhen(lastLogin[u.username]) : '' }));
  const usageData = usageAll.slice(-500).reverse().map(u => ({ when: fmtWhen(u.timestamp), ts: u.timestamp||'', user: u.username||'', tool: u.tool||'', ip: u.ip||'' }));
  const loginData = logins.map(l => ({ when: fmtWhen(l.timestamp), ts: l.timestamp||'', user: l.username||'', result: l.result||'', ip: l.ip||'' }));
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
      .uacts{display:flex;gap:6px;flex-wrap:nowrap;justify-content:flex-end;}
      .uacts .ubtn{font:inherit;font-size:12px;padding:6px 10px;border:1px solid #cfd6e2;border-radius:7px;background:#fff;color:#0b1a3a;cursor:pointer;white-space:nowrap;}
      .uacts .ubtn:hover{background:#f2f4f8;}
      .uacts .ubtn.danger{color:#b3261e;border-color:#e6b8b4;}
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
      <div class="grp">Users &amp; Access</div>
      <h2>Add a user</h2>
      <form class="add" method="post" action="/api/admin/add-user" onsubmit="return au(this)">
        <input name="firstName" placeholder="First name" required>
        <input name="lastName" placeholder="Last name" required>
        <input name="username" placeholder="username (lowercase)" required>
        <input name="email" placeholder="Email" required>
        <input name="password" placeholder="password (min 6)" required>
        <select name="role" title="Role — sets this user’s permissions">${roleOptsHtml}</select>
        <input name="title" placeholder="Title (e.g. Associate)">
        <input name="phone" placeholder="Phone (for BOVs)">
        <input name="commissionSplit" placeholder="Commission split (e.g. 50%)">
        <button class="primary">Add user</button>
      </form>
      <div class="sub2" style="margin:-6px 0 4px">Title, phone &amp; email appear as the "prepared by" line on that rep's BOVs. Reps can edit their own under Account.</div>
      <h2>Users <span class="sub2">— ${users.length} total${users.length > 8 ? ' · scroll for more' : ''}</span></h2>
      <div id="userlist"></div>
      <script type="application/json" id="usersdata">${JSON.stringify(userData).replace(/</g, String.fromCharCode(92)+'u003c')}</script>
      <script src="/rrg_list.js"></script>
      <script>
      (function(){
        function uesc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
        var UDATA=[]; try{ UDATA=JSON.parse(document.getElementById('usersdata').textContent)||[]; }catch(e){}
        function renderUsers(){
          RRGList.create({ mount:'#userlist', data:UDATA, key:'adminusers', rowId:function(u){return u.username;}, defaultSort:0, defaultDir:1,
            columns:[
              {label:'Name', width:210, sort:function(a,b){return RRGList.cmp(a.name,b.name);}, cell:function(u){ return '<b>'+uesc(u.name||u.username)+'</b>'+((u.role==='admin'||u.role==='creator')?' <span class="tag admin">Admin</span>':'')+(u.disabled?' <span class="tag off">Disabled</span>':''); }},
              {label:'Username', sort:function(a,b){return RRGList.cmp(a.username,b.username);}, cell:function(u){return '<span class="mono">'+uesc(u.username)+'</span>';}},
              {label:'Email', sort:function(a,b){return RRGList.cmp(a.email,b.email);}, cell:function(u){return '<span class="mono">'+(uesc(u.email)||'—')+'</span>';}},
              {label:'Added', sort:function(a,b){return RRGList.cmp(a.created,b.created);}, cell:function(u){return '<span class="ts">'+(uesc(u.created)||'—')+'</span>';}},
              {label:'Last login', sort:function(a,b){return RRGList.cmp(a.last,b.last);}, cell:function(u){return '<span class="ts">'+(uesc(u.last)||'Never')+'</span>';}},
              {label:'Actions', width:250, align:'right', sortable:false, cell:function(u){ return '<div class="uacts"><button type="button" class="ubtn" data-ureset="'+uesc(u.username)+'">Reset password</button><button type="button" class="ubtn" data-utoggle="'+uesc(u.username)+'" data-dis="'+(u.disabled?'0':'1')+'">'+(u.disabled?'Enable':'Disable')+'</button><button type="button" class="ubtn danger" data-uremove="'+uesc(u.username)+'">Remove</button></div>'; }}
            ]
          });
          wireUsers();
        }
        function wireUsers(){
          document.querySelectorAll('[data-ureset]').forEach(function(b){ b.onclick=function(){ var un=b.getAttribute('data-ureset'); var p=prompt('New password for '+un+' (min 6):'); if(!p) return; post('/api/admin/reset',{username:un,password:p}).then(function(j){ alert(j.ok?'Password reset.':(j.error||'Failed')); }); }; });
          document.querySelectorAll('[data-utoggle]').forEach(function(b){ b.onclick=function(){ var un=b.getAttribute('data-utoggle'); post('/api/admin/toggle',{username:un,disabled:b.getAttribute('data-dis')}).then(function(j){ if(j.ok) location.reload(); else alert(j.error||'Failed'); }); }; });
          document.querySelectorAll('[data-uremove]').forEach(function(b){ b.onclick=function(){ var un=b.getAttribute('data-uremove'); if(!confirm('Remove '+un+'?')) return; post('/api/admin/remove',{username:un}).then(function(j){ if(j.ok) location.reload(); else alert(j.error||'Failed'); }); }; });
        }
        if(window.RRGList){ renderUsers(); } else { var t=setInterval(function(){ if(window.RRGList){ clearInterval(t); renderUsers(); } },40); }
      })();
      </script>

      <div style="margin-top:14px;padding:14px 16px;background:#f7f9fc;border:1px solid #e9edf3;border-radius:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><b style="color:var(--navy)">Roles &amp; permissions</b><div class="sub2" style="margin-top:3px">Assign each user a role (Admin, Senior Associate, Associate, or a custom role) and control exactly which tools and records they can use.</div></div><a href="/rrg_roles.html" class="primary" style="text-decoration:none;padding:10px 16px;border-radius:8px">Manage roles &rarr;</a></div>

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
      <h2 style="margin-top:20px">App Name <span class="sub2">— the product name shown in the browser tab on every page. Change it here to rebrand the whole app.</span></h2>
      <div class="links">
        <div class="sub2" id="appnState" style="margin:0 0 8px">Loading…</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input type="text" id="appName" maxlength="60" placeholder="FullServe" style="flex:1;min-width:220px;border:1px solid #cfd6e2;border-radius:9px;padding:11px 13px;font:inherit;font-size:14px;color:var(--navy)">
          <button class="primary" onclick="saveAppName()">Save name</button>
          <button onclick="resetAppName()">Reset to default</button>
          <span id="appnMsg" class="sub2"></span>
        </div>
      </div>

      <h2 style="margin-top:34px">Header Announcement <span class="sub2">— a short message shown across the top of everyone's dashboard, next to the logo. Use it for notices, reminders, or a rallying line. Leave blank to hide it.</span></h2>
      <div class="links">
        <input type="text" id="hdrMsg" maxlength="160" placeholder="e.g. Q3 push — get your listings loaded by Friday. New: auto-find locations on any concept." style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:11px 13px;font:inherit;font-size:14px;color:var(--navy)">
        <div style="margin-top:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button class="primary" onclick="saveHdrMsg()">Save message</button>
          <button onclick="clearHdrMsg()">Clear</button>
          <label class="sub2" style="display:inline-flex;align-items:center;gap:7px"><input type="checkbox" id="hdrMsgOn" checked> Show on dashboard</label>
          <span id="hdrMsgMsg" class="sub2"></span>
        </div>
      </div>

      <h2 style="margin-top:34px">Company Logo <span class="sub2">— your firm's logo. Used as the default on Marketing Packs (reps can still override per pack). PNG, JPG, SVG, GIF or WEBP, up to 4&nbsp;MB.</span></h2>
      <div class="links">
        <div id="logoPreview" style="margin-bottom:12px"></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input type="text" id="logoUrl" placeholder="Auto-pull from a website (e.g. rrgcre.com)" style="flex:1;min-width:220px;border:1px solid #cfd6e2;border-radius:9px;padding:9px 12px;font:inherit;font-size:13px;color:var(--navy)">
          <button onclick="pullLogo()">Pull from website</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <span class="sub2">or upload:</span>
          <input type="file" id="logoFile" accept=".png,.jpg,.jpeg,.svg,.gif,.webp,image/*" onchange="uploadLogo()" style="font:inherit;font-size:13px">
          <button class="primary" onclick="uploadLogo()">Upload logo</button>
          <button onclick="clearLogo()">Remove</button>
          <span id="logomsg" class="sub2"></span>
        </div>
      </div>

      <h2 style="margin-top:34px">Favicon <span class="sub2">— the little icon in the browser tab. Use a square image (ICO, PNG or SVG), ideally 32×32 or larger, up to 1&nbsp;MB. Applies across every page.</span></h2>
      <div class="links">
        <div id="favPreview" style="margin-bottom:12px"></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input type="text" id="favUrl" placeholder="Auto-pull from a website (e.g. rrgcre.com)" style="flex:1;min-width:220px;border:1px solid #cfd6e2;border-radius:9px;padding:9px 12px;font:inherit;font-size:13px;color:var(--navy)">
          <button onclick="pullFavicon()">Pull from website</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <span class="sub2">or upload:</span>
          <input type="file" id="favFile" accept=".ico,.png,.svg,.gif,.webp,image/*" onchange="uploadFavicon()" style="font:inherit;font-size:13px">
          <button class="primary" onclick="uploadFavicon()">Upload favicon</button>
          <button onclick="clearFavicon()">Remove</button>
          <span id="favmsg" class="sub2"></span>
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
      <h2 style="margin-top:20px" data-open="1">BOV Analyst Prompt <span class="sub2">— the instructions the RRG analyst follows when drafting a BOV. Edit to change how valuations are written; keep the JSON output block at the end intact so the BOV still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="bpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="bovPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveBovPrompt()">Save prompt</button> <button onclick="resetBovPrompt()">Reset to RRG default</button> <span id="bpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px" data-open="1">Marketing Pack Prompt <span class="sub2">— the instructions the RRG analyst follows when drafting the Confidential Information Memorandum inside a Marketing Pack. Keep the JSON output block intact so the pack still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="cpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="cimPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveCimPrompt()">Save prompt</button> <button onclick="resetCimPrompt()">Reset to RRG default</button> <span id="cpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px" data-open="1">Market Attack Plan Prompt <span class="sub2">— the instructions the RRG analyst follows when drafting the sell-side Market Attack Plan advanced from a Marketing Pack. Keep the JSON output block intact so the plan still builds. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="mpstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="mapPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveMapPrompt()">Save prompt</button> <button onclick="resetMapPrompt()">Reset to RRG default</button> <span id="mpmsg" class="sub2"></span></div>
      </div>

      <h2 style="margin-top:34px" data-open="1">Brokerage Office (Requests) Prompt <span class="sub2">— the instructions the AI office assistant follows when it answers rep <b>Requests</b>. This is the office persona: what it can resolve directly, what it flags as an action for the office, and how it asks for missing info. Keep the JSON output block intact so replies still build. Reset any time to restore the RRG default.</span></h2>
      <div class="links">
        <div class="sub2" id="tkstate" style="margin:0 0 8px">Loading…</div>
        <textarea id="ticketPrompt" class="bovprompt" spellcheck="false"></textarea>
        <div style="margin-top:10px"><button class="primary" onclick="saveTicketPrompt()">Save prompt</button> <button onclick="resetTicketPrompt()">Reset to RRG default</button> <span id="tkmsg" class="sub2"></span></div>
      </div>

      <div class="grp">AI Engine</div>
      <h2 style="margin-top:20px">AI Model <span class="sub2">— the model powering every AI feature (valuations, marketing packs, attack plans, offer analysis, the location finder, and the Requests office). Change it here to move to a newer model without a redeploy. Enter the exact model id from your AI provider.</span></h2>
      <div class="links">
        <div class="sub2" id="aimstate" style="margin:0 0 8px">Loading…</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <input type="text" id="aiModel" placeholder="e.g. claude-sonnet-4-5" style="flex:1;min-width:260px;border:1px solid #cfd6e2;border-radius:9px;padding:11px 13px;font:inherit;font-size:14px;color:var(--navy)">
          <button class="primary" onclick="saveAiModel()">Save model</button>
          <button onclick="resetAiModel()">Reset to default</button>
          <span id="aimmsg" class="sub2"></span>
        </div>
        <div class="sub2" style="margin-top:8px">Takes effect immediately for new AI runs. If a saved id isn't valid at your provider, AI features will error until it's corrected — reset to default to recover.</div>
      </div>

      <div class="grp">Integrations</div>
      <h2 style="margin-top:20px">Google Maps API key <span class="sub2">— powers automatic location photos (Street View storefronts + Google Places business photos). Create a key in Google Cloud with the <b>Street View Static</b> and <b>Places</b> APIs enabled, then paste it here. The key is stored on the server only and is never sent to browsers or included in backups.</span></h2>
      <div class="links">
        <div class="sub2" id="gmstate" style="margin:0 0 8px">Loading…</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <input type="password" id="gmapsKey" placeholder="Paste Google Maps API key" autocomplete="off" style="flex:1;min-width:260px;border:1px solid #cfd6e2;border-radius:9px;padding:11px 13px;font:inherit;font-size:14px;color:var(--navy)">
          <button class="primary" onclick="saveGmapsKey()">Save key</button>
          <button onclick="testGmaps()">Test key</button>
          <button onclick="clearGmapsKey()">Remove</button>
          <span id="gmmsg" class="sub2"></span>
        </div>
        <div class="sub2" style="margin-top:8px">Once set, a “Pull photo” button appears on every location and the location finder auto-fetches a storefront for each unit it adds.</div>
      </div>

      <h2 style="margin-top:34px">Email (SMTP) <span class="sub2">— outbound email for the app: contact emails, document sends, and alert digests. Enter your mail provider's SMTP details (Gmail, SendGrid, etc.). Stored on the server only and excluded from backups. Use the test button to confirm it works before relying on it.</span></h2>
      <div class="links">
        <div class="sub2" id="emState" style="margin:0 0 8px">Loading…</div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px">
          <div><label class="sub2">SMTP host</label><input id="em_host" placeholder="smtp.gmail.com" autocomplete="off" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
          <div><label class="sub2">Port</label><input id="em_port" placeholder="587" autocomplete="off" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
          <div><label class="sub2">Security</label><select id="em_secure" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px;background:#fff"><option value="false">STARTTLS (587)</option><option value="true">SSL/TLS (465)</option></select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <div><label class="sub2">Username</label><input id="em_user" placeholder="van@rrgcre.com" autocomplete="off" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
          <div><label class="sub2">Password / app password</label><input type="password" id="em_pass" placeholder="app password" autocomplete="new-password" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:10px;align-items:end">
          <div><label class="sub2">From address</label><input id="em_from" placeholder="Restaurant Realty Group &lt;van@rrgcre.com&gt;" autocomplete="off" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
          <label class="sub2" style="display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding-bottom:10px"><input type="checkbox" id="em_enabled" checked> Email enabled</label>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="primary" onclick="saveEmail()">Save email settings</button>
          <input id="em_test" placeholder="send test to you@email.com" autocomplete="off" style="border:1px solid #cfd6e2;border-radius:9px;padding:9px 12px;font:inherit;font-size:13px;min-width:220px">
          <button onclick="testEmail()">Send test</button>
          <span id="emMsg" class="sub2"></span>
        </div>
        <div class="sub2" style="margin-top:8px">Gmail: use an <b>app password</b> (myaccount.google.com/apppasswords), host <b>smtp.gmail.com</b>, port <b>587</b>. Leave the password blank when saving to keep the current one.</div>
      </div>

      <h2 style="margin-top:34px">SMS (Twilio) <span class="sub2">— outbound text messages for task reminders. Create a Twilio account, then paste your Account SID, Auth Token, and a Twilio phone number. Stored on the server only and excluded from backups. Reps are texted at the phone number on their user profile. Reminders only offer SMS once this is configured.</span></h2>
      <div class="links">
        <div class="sub2" id="smsState" style="margin:0 0 8px">Loading…</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="sub2">Account SID</label><input id="sms_sid" placeholder="ACxxxxxxxxxxxx" autocomplete="off" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
          <div><label class="sub2">Auth Token</label><input type="password" id="sms_token" placeholder="auth token" autocomplete="new-password" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:10px;align-items:end">
          <div><label class="sub2">From number (Twilio)</label><input id="sms_from" placeholder="+15125551234" autocomplete="off" style="width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:14px"></div>
          <label class="sub2" style="display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding-bottom:10px"><input type="checkbox" id="sms_enabled" checked> SMS enabled</label>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="primary" onclick="saveSms()">Save SMS settings</button>
          <input id="sms_test" placeholder="send test to +1512..." autocomplete="off" style="border:1px solid #cfd6e2;border-radius:9px;padding:9px 12px;font:inherit;font-size:13px;min-width:200px">
          <button onclick="testSms()">Send test</button>
          <span id="smsMsg" class="sub2"></span>
        </div>
        <div class="sub2" style="margin-top:8px">Get credentials at twilio.com (Console). Leave the token blank when saving to keep the current one.</div>
      </div>

      <div class="grp">Data Backup</div>
      <h2 style="margin-top:20px" data-open="1">Backups <span class="sub2">— a full copy of everything the team has created: deals, companies, contacts, requests, calls, valuations, marketing packs, and every uploaded data-room file. The server writes an automatic snapshot once a day (kept ${BACKUP_KEEP} days). Download one any time to keep an off-site copy in Drive or Dropbox.</span></h2>
      <div class="links">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
          <a class="primary" href="/api/admin/backup" style="text-decoration:none;display:inline-block">⬇ Download full backup now</a>
          <style>.bkspin{display:inline-block;width:12px;height:12px;border:2px solid #cfd6e2;border-top-color:#DA2B1F;border-radius:50%;animation:bkspin .7s linear infinite;vertical-align:-1px;margin-right:5px}@keyframes bkspin{to{transform:rotate(360deg)}}</style><button id="bkbtn" onclick="runBackup()">Save a snapshot on the server</button>
          <span id="bkmsg" class="sub2"></span>
        </div>
        <div class="sub2" id="bkoffsite" style="margin:2px 0 10px"></div>
        <div id="bklist" class="sub2">Loading saved snapshots…</div>
      </div>

      <div class="grp">Activity &amp; Logs</div>
      <h2 style="margin-top:20px">Tool Usage <span class="sub2">— what your team is using</span></h2>
      <div class="cols">
        <div><h3>By tool</h3><table><thead><tr><th>Tool</th><th>Opens</th></tr></thead><tbody>${toolSummary}</tbody></table></div>
        <div><h3>By user</h3><table><thead><tr><th>User</th><th>Opens</th></tr></thead><tbody>${userSummary}</tbody></table></div>
      </div>
      <h3 style="margin-top:22px">Recent tool activity <span class="sub2">— newest first, last 200</span></h3>
      <div id="usagelist"></div>
      <h2 style="margin-top:34px">Login Activity <span class="sub2">— newest first, last 300</span></h2>
      <div id="loginlist"></div>
      <script type="application/json" id="usagedata">${JSON.stringify(usageData).replace(/</g, String.fromCharCode(92)+'u003c')}</script>
      <script type="application/json" id="logindata">${JSON.stringify(loginData).replace(/</g, String.fromCharCode(92)+'u003c')}</script>
      <script src="/rrg_list.js"></script>
      <script>
      (function(){
        function lesc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
        function pj(id){ try{ return JSON.parse(document.getElementById(id).textContent)||[]; }catch(e){ return []; } }
        var USAGE=pj('usagedata'), LOGINS=pj('logindata');
        function tsCmp(a,b){ return RRGList.cmp(a.ts,b.ts); }
        function go(){
          if(document.getElementById('usagelist')) RRGList.create({ mount:'#usagelist', data:USAGE, key:'adminusage', rowId:function(r){return r.ts+'|'+r.user+'|'+r.tool;}, defaultSort:0, defaultDir:-1, per:50,
            columns:[
              {label:'When (CT)', width:180, sort:tsCmp, cell:function(r){return '<span class="ts">'+lesc(r.when)+'</span>';}},
              {label:'User', sort:function(a,b){return RRGList.cmp(a.user,b.user);}, cell:function(r){return '<span class="mono">'+(lesc(r.user)||'—')+'</span>';}},
              {label:'Tool', sort:function(a,b){return RRGList.cmp(a.tool,b.tool);}, cell:function(r){return '<span class="nm">'+lesc(r.tool)+'</span>';}},
              {label:'IP', sort:function(a,b){return RRGList.cmp(a.ip,b.ip);}, cell:function(r){return '<span class="mono">'+lesc(r.ip)+'</span>';}}
            ]
          });
          if(document.getElementById('loginlist')) RRGList.create({ mount:'#loginlist', data:LOGINS, key:'adminlogins', rowId:function(r){return r.ts+'|'+r.user+'|'+r.ip;}, defaultSort:0, defaultDir:-1, per:50,
            columns:[
              {label:'When (CT)', width:180, sort:tsCmp, cell:function(r){return '<span class="ts">'+lesc(r.when)+'</span>';}},
              {label:'Username', sort:function(a,b){return RRGList.cmp(a.user,b.user);}, cell:function(r){return '<span class="mono">'+(lesc(r.user)||'—')+'</span>';}},
              {label:'Result', sort:function(a,b){return RRGList.cmp(a.result,b.result);}, cell:function(r){return r.result==='success'?'<span class="tag ok">Success</span>':'<span class="tag off">Failed</span>';}},
              {label:'IP', sort:function(a,b){return RRGList.cmp(a.ip,b.ip);}, cell:function(r){return '<span class="mono">'+lesc(r.ip)+'</span>';}}
            ]
          });
        }
        if(window.RRGList){ go(); } else { var t=setInterval(function(){ if(window.RRGList){ clearInterval(t); go(); } },40); }
      })();
      </script>
    </div>
    <script src="/rrg_ambience.js?v=3"></script>
    <script>
      /* visible proof the inline admin script executed (diagnostic) */
      try{ var _eb=document.querySelector('.expandbar'); if(_eb){ _eb.insertAdjacentHTML('beforeend','<span style="margin-left:auto;color:#8a93a8;font-size:11px">admin ${esc(ADMIN_BUILD)} · script loaded ✓</span>'); } }catch(e){}
      function post(action, data){ return fetch(action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json()); }
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
          post('/api/admin/logo',{filename:f.name, dataB64:b64}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓ — new logo is live.'; fi.value=''; renderLogo(true); try{ var _hb=document.getElementById('rrgbrand'); if(_hb) _hb.innerHTML='<img src="/api/brand/logo?v='+Date.now()+'" class="rrgbrandimg" alt="">'; }catch(e){} } else { m.textContent=(j&&j.error)||'Upload failed'; } }).catch(function(){ m.textContent='Upload failed — try again.'; }); };
        rd.onerror=function(){ m.textContent='Could not read that image.'; };
        rd.readAsDataURL(f); }
      function clearLogo(){ if(!confirm('Remove the company logo? Marketing Packs will fall back to the built-in RRG wordmark.')) return; post('/api/admin/logo/clear',{}).then(function(j){ if(j&&j.ok){ renderLogo(false); document.getElementById('logomsg').textContent='Removed.'; } }); }
      function renderFav(has){ var p=document.getElementById('favPreview'); if(!p) return; if(has){ p.innerHTML='<div style="display:inline-flex;align-items:center;gap:12px;background:#fff;border:1px solid #e9edf3;border-radius:10px;padding:10px 14px"><img src="/favicon.ico?v='+Date.now()+'" alt="Favicon" style="width:32px;height:32px;display:block"><span class="sub2">Current favicon</span></div>'; } else { p.innerHTML='<div class="sub2" style="padding:6px 0">No favicon set — the browser shows its default tab icon.</div>'; } }
      function loadFavicon(){ fetch('/api/admin/favicon').then(function(r){return r.json();}).then(function(j){ renderFav(!!(j&&j.hasFavicon)); }).catch(function(){ renderFav(false); }); }
      function uploadFavicon(){ var fi=document.getElementById('favFile'), f=fi&&fi.files&&fi.files[0], m=document.getElementById('favmsg');
        if(!f){ m.textContent='Choose an image first.'; return; }
        if(f.size>1024*1024){ m.textContent='Favicon too large (max 1 MB).'; return; }
        m.textContent='Uploading…';
        var rd=new FileReader(); rd.onload=function(){ var s=String(rd.result||''), i=s.indexOf(','), b64=(i>=0?s.slice(i+1):s);
          post('/api/admin/favicon',{filename:f.name, dataB64:b64}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓ — reload to see the tab icon.'; fi.value=''; renderFav(true); } else { m.textContent=(j&&j.error)||'Upload failed'; } }).catch(function(){ m.textContent='Upload failed — try again.'; }); };
        rd.onerror=function(){ m.textContent='Could not read that image.'; };
        rd.readAsDataURL(f); }
      function clearFavicon(){ if(!confirm('Remove the favicon? The browser will show its default tab icon.')) return; post('/api/admin/favicon/clear',{}).then(function(j){ if(j&&j.ok){ renderFav(false); document.getElementById('favmsg').textContent='Removed.'; } }); }
      function pullLogo(){ var u=document.getElementById('logoUrl').value.trim(), m=document.getElementById('logomsg'); if(!u){ m.textContent='Enter a website.'; return; } m.textContent='Pulling…'; post('/api/admin/logo/pull',{url:u}).then(function(j){ if(j&&j.ok){ m.textContent='Pulled ✓'; renderLogo(true); } else { m.textContent=(j&&j.error)||'Could not pull.'; } }); }
      function pullFavicon(){ var u=document.getElementById('favUrl').value.trim(), m=document.getElementById('favmsg'); if(!u){ m.textContent='Enter a website.'; return; } m.textContent='Pulling…'; post('/api/admin/favicon/pull',{url:u}).then(function(j){ if(j&&j.ok){ m.textContent='Pulled ✓ — reload to see the tab icon.'; renderFav(true); } else { m.textContent=(j&&j.error)||'Could not pull.'; } }); }
      function _appnState(j){ var s=document.getElementById('appnState'); if(s) s.textContent = j.isDefault ? ('Using the default name ('+(j.name||'FullServe')+').') : ('Custom name: '+j.name+'.'); }
      function loadAppName(){ fetch('/api/admin/app-name').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('appName').value=j.name||''; _appnState(j); } }).catch(function(){}); }
      function saveAppName(){ var v=document.getElementById('appName').value.trim(), m=document.getElementById('appnMsg'); m.textContent='Saving…'; post('/api/admin/app-name',{name:v}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓ — reload to see the tab title.'; _appnState(j); } else { m.textContent=(j&&j.error)||'Failed'; } }); }
      function resetAppName(){ post('/api/admin/app-name',{name:''}).then(function(j){ if(j&&j.ok){ document.getElementById('appName').value=j.name||''; document.getElementById('appnMsg').textContent='Reset ✓'; _appnState(j); } }); }
      try{ loadFavicon(); }catch(e){}
      try{ loadAppName(); }catch(e){}
      function loadHdrMsg(){ fetch('/api/admin/header-msg').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('hdrMsg').value=j.msg||''; document.getElementById('hdrMsgOn').checked=(j.on!==false); } }).catch(function(){}); }
      function saveHdrMsg(){ var v=document.getElementById('hdrMsg').value, on=document.getElementById('hdrMsgOn').checked, m=document.getElementById('hdrMsgMsg'); m.textContent='Saving…'; post('/api/admin/header-msg',{msg:v,on:on}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓ — reps see it on their next dashboard load.'; } else { m.textContent=(j&&j.error)||'Failed'; } }); }
      function clearHdrMsg(){ document.getElementById('hdrMsg').value=''; post('/api/admin/header-msg',{msg:'',on:document.getElementById('hdrMsgOn').checked}).then(function(j){ if(j&&j.ok) document.getElementById('hdrMsgMsg').textContent='Cleared.'; }); }
      loadDocList();
      loadLogo();
      loadHdrMsg();
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
      function _tkState(isDefault){ var s=document.getElementById('tkstate'); if(s) s.textContent = isDefault ? 'Currently using the RRG default Brokerage Office prompt.' : 'Currently using a custom Brokerage Office prompt.'; }
      function loadTicketPrompt(){ fetch('/api/admin/ticket-prompt').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('ticketPrompt').value=j.prompt||''; _tkState(j.isDefault); } }).catch(function(){ var s=document.getElementById('tkstate'); if(s) s.textContent='Could not load the prompt.'; }); }
      function saveTicketPrompt(){ var v=document.getElementById('ticketPrompt').value; var m=document.getElementById('tkmsg'); m.textContent='Saving…'; post('/api/admin/ticket-prompt',{prompt:v}).then(function(j){ if(j.ok){ m.textContent = j.isDefault ? 'Saved — matches the default ✓' : 'Saved custom prompt ✓'; document.getElementById('ticketPrompt').value=j.prompt||v; _tkState(j.isDefault); } else m.textContent=j.error||'Failed'; }); }
      function resetTicketPrompt(){ if(!confirm('Reset the Brokerage Office prompt to the RRG default? Your custom prompt will be discarded.')) return; post('/api/admin/ticket-prompt',{reset:true}).then(function(j){ if(j.ok){ document.getElementById('ticketPrompt').value=j.prompt||''; document.getElementById('tkmsg').textContent='Reset to default ✓'; _tkState(true); } }); }
      try{ loadMapPrompt(); }catch(e){}
      try{ loadCimPrompt(); }catch(e){}
      try{ loadTicketPrompt(); }catch(e){}
      function _bkSize(n){ if(!n) return '0 KB'; if(n<1024*1024) return (n/1024).toFixed(0)+' KB'; return (n/1024/1024).toFixed(1)+' MB'; }
      function _bkDate(iso){ try{ var d=new Date(iso); return d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); }catch(e){ return ''; } }
      function loadBackups(){ fetch('/api/admin/backups').then(function(r){return r.json();}).then(function(j){
        if(!j||!j.ok){ document.getElementById('bklist').textContent='Could not load snapshots.'; return; }
        var off=document.getElementById('bkoffsite');
        off.innerHTML = j.tokenSet ? 'Off-site automation is <b style="color:#0e7a53">armed</b> — a scheduled job can pull backups with the backup token.' : 'Tip: to automate a daily <b>off-site</b> copy, set a <code>BACKUP_TOKEN</code> on the server and a scheduled job can pull <code>/api/admin/backup?token=…</code> into Drive.';
        var b=j.backups||[];
        if(!b.length){ document.getElementById('bklist').innerHTML='<div>No saved snapshots yet — the first daily snapshot writes automatically, or click “Save a snapshot” above.</div>'; return; }
        document.getElementById('bklist').innerHTML='<table style="margin-top:4px"><thead><tr><th>Snapshot</th><th>Size</th><th>Saved</th><th></th></tr></thead><tbody>'+
          b.map(function(x){ return '<tr><td>'+x.name+'</td><td>'+_bkSize(x.size)+'</td><td>'+_bkDate(x.at)+'</td><td><a href="/api/admin/backup/file/'+encodeURIComponent(x.name)+'">Download</a></td></tr>'; }).join('')+'</tbody></table>';
      }).catch(function(){ document.getElementById('bklist').textContent='Could not load snapshots.'; }); }
      function runBackup(){ var m=document.getElementById('bkmsg'); var b=document.getElementById('bkbtn'); if(b){ b.disabled=true; b.dataset.lbl=b.textContent; b.textContent='Saving…'; } m.innerHTML='<span class="bkspin"></span>Saving a snapshot on the server — this can take a moment for large data rooms…'; post('/api/admin/backup/run',{}).then(function(j){ if(b){ b.disabled=false; b.textContent=b.dataset.lbl||'Save a snapshot on the server'; } if(j&&j.ok){ m.innerHTML='✓ Snapshot saved'+(j.name?(' — <b>'+j.name+'</b>'):'')+'. It is in the list below and ready to download.'; loadBackups(); setTimeout(function(){ m.textContent=''; },6000); } else { m.textContent=(j&&j.error)||'Backup failed.'; } }).catch(function(){ if(b){ b.disabled=false; b.textContent=b.dataset.lbl||'Save a snapshot on the server'; } m.textContent='Backup failed — network error.'; }); }
      function _aimState(j){ var s=document.getElementById('aimstate'); if(s) s.textContent = j.isDefault ? ('Using the default model ('+j.default+').') : ('Using a custom model ('+j.model+'). Default is '+j.default+'.'); }
      function loadAiModel(){ fetch('/api/admin/ai-model').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('aiModel').value=j.model||''; _aimState(j); } }).catch(function(){ var s=document.getElementById('aimstate'); if(s) s.textContent='Could not load the model setting.'; }); }
      function saveAiModel(){ var v=document.getElementById('aiModel').value.trim(), m=document.getElementById('aimmsg'); m.textContent='Saving…'; post('/api/admin/ai-model',{model:v}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓'; _aimState(j); } else { m.textContent=(j&&j.error)||'Failed'; } }); }
      function resetAiModel(){ if(!confirm('Reset the AI model to the default?')) return; post('/api/admin/ai-model',{reset:true}).then(function(j){ if(j&&j.ok){ document.getElementById('aiModel').value=j.model||''; document.getElementById('aimmsg').textContent='Reset ✓'; _aimState(j); } }); }
      try{ loadAiModel(); }catch(e){}
      function _gmState(j){ var s=document.getElementById('gmstate'); if(s) s.textContent = j.set ? (j.fromEnv?'A key is set from the server environment.':'A key is saved. Photo pulls are enabled.') : 'No key set — automatic location photos are off.'; }
      function loadGmapsKey(){ fetch('/api/admin/gmaps-key').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ _gmState(j); } }).catch(function(){ var s=document.getElementById('gmstate'); if(s) s.textContent='Could not load the key status.'; }); }
      function saveGmapsKey(){ var v=document.getElementById('gmapsKey').value.trim(), m=document.getElementById('gmmsg'); if(!v){ m.textContent='Paste a key first.'; return; } m.textContent='Saving…'; post('/api/admin/gmaps-key',{key:v}).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓'; document.getElementById('gmapsKey').value=''; _gmState(j); } else { m.textContent=(j&&j.error)||'Failed'; } }); }
      function testGmaps(){ var m=document.getElementById('gmmsg'); m.textContent='Testing…'; post('/api/admin/gmaps-key/test',{}).then(function(j){ if(j&&j.ok){ m.textContent='Key works ✓'; } else { m.textContent='Test failed: '+((j&&j.error)||'unknown'); } }); }
      function clearGmapsKey(){ if(!confirm('Remove the Google Maps API key? Automatic location photos will turn off.')) return; post('/api/admin/gmaps-key',{clear:true}).then(function(j){ if(j&&j.ok){ document.getElementById('gmmsg').textContent='Removed.'; _gmState(j); } }); }
      function _emState(j){ var s=document.getElementById('emState'); if(!s) return; if(j&&j.configured){ s.innerHTML='<b style="color:#0e7a53">Email is on</b> — sending as '+(j.from||'')+' via '+(j.host||''); } else { s.textContent=(j&&j.host)?'Configured but disabled — turn on Email enabled and save.':'Not configured yet. Enter your SMTP details below.'; } }
      function loadEmail(){ fetch('/api/admin/email').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('em_host').value=j.host||''; document.getElementById('em_port').value=j.port||587; document.getElementById('em_secure').value=j.secure?'true':'false'; document.getElementById('em_user').value=j.user||''; document.getElementById('em_from').value=j.from||''; document.getElementById('em_enabled').checked=(j.enabled!==false); document.getElementById('em_pass').placeholder=j.hasPass?'leave blank to keep current':'app password'; _emState(j); } }).catch(function(){ var s=document.getElementById('emState'); if(s) s.textContent='Could not load email settings.'; }); }
      function saveEmail(){ var m=document.getElementById('emMsg'); m.textContent='Saving…'; var body={ host:document.getElementById('em_host').value.trim(), port:document.getElementById('em_port').value.trim(), secure:document.getElementById('em_secure').value==='true', user:document.getElementById('em_user').value.trim(), from:document.getElementById('em_from').value.trim(), enabled:document.getElementById('em_enabled').checked }; var pw=document.getElementById('em_pass').value; if(pw) body.pass=pw; post('/api/admin/email',body).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓'; document.getElementById('em_pass').value=''; loadEmail(); } else { m.textContent=(j&&j.error)||'Failed'; } }); }
      function testEmail(){ var to=document.getElementById('em_test').value.trim(), m=document.getElementById('emMsg'); if(!to){ m.textContent='Enter a destination email for the test.'; return; } m.textContent='Sending test…'; post('/api/admin/email/test',{to:to}).then(function(j){ if(j&&j.ok){ m.textContent='Test sent ✓ — check that inbox.'; } else { m.textContent='Test failed: '+((j&&j.error)||'unknown'); } }); }
      function _smsState(j){ var s=document.getElementById('smsState'); if(!s) return; if(j&&j.configured){ s.innerHTML='<b style="color:#0e7a53">SMS is on</b> — texting from '+(j.from||''); } else { s.textContent=(j&&j.sid)?'Configured but incomplete or disabled — fill all fields, turn on, and save.':'Not configured yet. Enter your Twilio details below.'; } }
      function loadSms(){ fetch('/api/admin/sms').then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ document.getElementById('sms_sid').value=j.sid||''; document.getElementById('sms_from').value=j.from||''; document.getElementById('sms_enabled').checked=(j.enabled!==false); document.getElementById('sms_token').placeholder=j.hasToken?'leave blank to keep current':'auth token'; _smsState(j); } }).catch(function(){ var s=document.getElementById('smsState'); if(s) s.textContent='Could not load SMS settings.'; }); }
      function saveSms(){ var m=document.getElementById('smsMsg'); m.textContent='Saving…'; var body={ sid:document.getElementById('sms_sid').value.trim(), from:document.getElementById('sms_from').value.trim(), enabled:document.getElementById('sms_enabled').checked }; var tk=document.getElementById('sms_token').value; if(tk) body.token=tk; post('/api/admin/sms',body).then(function(j){ if(j&&j.ok){ m.textContent='Saved ✓'; document.getElementById('sms_token').value=''; loadSms(); } else { m.textContent=(j&&j.error)||'Failed'; } }); }
      function testSms(){ var to=document.getElementById('sms_test').value.trim(), m=document.getElementById('smsMsg'); if(!to){ m.textContent='Enter a mobile number for the test.'; return; } m.textContent='Sending test…'; post('/api/admin/sms/test',{to:to}).then(function(j){ if(j&&j.ok){ m.textContent='Test sent ✓ — check that phone.'; } else { m.textContent='Test failed: '+((j&&j.error)||'unknown'); } }); }
      try{ loadGmapsKey(); }catch(e){}
      try{ loadEmail(); }catch(e){}
      try{ loadSms(); }catch(e){}
      try{ loadBackups(); }catch(e){}
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
        var moreA=document.createElement('a'); moreA.className='snav'; moreA.href='/rrg_admin_settings.html'; moreA.style.marginTop='12px'; moreA.style.borderTop='1px solid #e9edf3'; moreA.style.paddingTop='15px'; moreA.innerHTML='<span class="si"></span>More settings →'; nav.appendChild(moreA);
        var tplA=document.createElement('a'); tplA.className='snav'; tplA.href='/rrg_agreement_templates.html'; tplA.innerHTML='<span class="si"></span>Agreement templates →'; nav.appendChild(tplA);
        var rolesA=document.createElement('a'); rolesA.className='snav'; rolesA.href='/rrg_roles.html'; rolesA.innerHTML='<span class="si"></span>Roles & permissions →'; nav.appendChild(rolesA);
        var deptA=document.createElement('a'); deptA.className='snav'; deptA.href='/rrg_departments.html'; deptA.innerHTML='<span class="si"></span>Departments →'; nav.appendChild(deptA);
      })();
      function accAll(){}
    </script>`));
});
app.post('/api/admin/add-user', requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const validKeys = loadRoles().filter(r => r.key !== 'creator').map(r => r.key);
    let role = String(b.role || '').trim().toLowerCase();
    if (validKeys.indexOf(role) < 0) role = (validKeys.indexOf('associate') >= 0) ? 'associate' : 'rep';
    auth.addUser(Object.assign({}, b, { role: role }));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
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
// Ticket office-assistant prompt — mirror of the CIM prompt routes.
app.get('/api/admin/ticket-prompt', requireAdmin, (req, res) => {
  const custom = loadTicketPromptCustom();
  res.json({ ok: true, prompt: custom || ticketgen.DEFAULT_SYSTEM, isDefault: !custom });
});
// ---- AI model selection ----
app.get('/api/admin/ai-model', requireAdmin, (req, res) => res.json({ ok: true, model: loadAiModel(), default: DEFAULT_AI_MODEL, isDefault: loadAiModel() === DEFAULT_AI_MODEL }));
app.post('/api/admin/ai-model', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  if (b.reset) { saveAiModel(''); applyAiModel(); return res.json({ ok: true, model: loadAiModel(), default: DEFAULT_AI_MODEL, isDefault: true }); }
  const m = String(b.model || '').trim();
  if (!m) { saveAiModel(''); applyAiModel(); return res.json({ ok: true, model: loadAiModel(), default: DEFAULT_AI_MODEL, isDefault: true }); }
  if (!/^[a-zA-Z0-9._-]+$/.test(m) || m.length > 80) return res.status(400).json({ ok: false, error: 'That doesn’t look like a valid model id (letters, numbers, dots and dashes only).' });
  saveAiModel(m); applyAiModel();
  res.json({ ok: true, model: loadAiModel(), default: DEFAULT_AI_MODEL, isDefault: m === DEFAULT_AI_MODEL });
});
// ---- Data backup routes ----
// List saved daily snapshots + whether off-site automation is armed.
app.get('/api/admin/backups', requireAdmin, (req, res) => {
  res.json({ ok: true, backups: listBackups(), keep: BACKUP_KEEP, tokenSet: !!process.env.BACKUP_TOKEN });
});
// Create a fresh snapshot on the disk right now.
app.post('/api/admin/backup/run', requireAdmin, async (req, res) => {
  try { const name = await makeSnapshot(backupStampFull()); res.json({ ok: true, name, backups: listBackups() }); }
  catch (e) { console.error('backup run error:', e && e.message); res.status(500).json({ ok: false, error: 'Backup failed: ' + String((e && e.message) || e) }); }
});
// Download a live backup of everything, generated on the fly (admin session or token).
app.get('/api/admin/backup', async (req, res) => {
  if (!(req.user && isSuper(req.user))) return res.status(403).json({ ok: false, error: 'Admin only.' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="rrg-backup-' + backupStampFull() + '.zip"');
  try { await writeBackupZip(res); } catch (e) { console.error('backup stream error:', e && e.message); try { res.status(500).end(); } catch (e2) {} }
});
// Download a specific saved snapshot (admin session or token).
app.get('/api/admin/backup/file/:name', (req, res) => {
  if (!(req.user && isSuper(req.user))) return res.status(403).json({ ok: false, error: 'Admin only.' });
  const name = path.basename(String(req.params.name || ''));
  if (!/^rrg-backup-[\w.\-]+\.zip$/.test(name)) return res.status(400).json({ ok: false, error: 'Bad backup name.' });
  const fp = path.join(BACKUP_DIR, name);
  if (!fp.startsWith(BACKUP_DIR) || !fs.existsSync(fp)) return res.status(404).json({ ok: false, error: 'Snapshot not found.' });
  res.download(fp, name);
});
app.post('/api/admin/ticket-prompt', requireAdmin, (req, res) => {
  const b = req.body || {};
  const def = String(ticketgen.DEFAULT_SYSTEM || '');
  if (b.reset) { clearTicketPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  const p = String(b.prompt || '').trim();
  if (!p || p === def.trim()) { clearTicketPromptCustom(); return res.json({ ok: true, prompt: def, isDefault: true }); }
  saveTicketPromptCustom(p);
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

// Automatic daily data backup: write today's snapshot shortly after boot, then
// re-check every hour so a fresh snapshot always lands each day the server runs.
setTimeout(() => { ensureDailyBackup(); }, 15000);
setInterval(() => { ensureDailyBackup(); }, 60 * 60 * 1000);

// ================= User Tasks =================
const TASKS_FILE = path.join(BOV_DATA_DIR, 'tasks.json');
function loadTasks() { try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveTasks(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(TASKS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newTaskId() { return 'tsk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const TASK_PRIORITIES = ['Low', 'Normal', 'High'];
function taskVisible(t, req) {
  if (req.user && isSuper(req.user)) return true;
  const u = req.user && req.user.username;
  return t.assignee === u || t.createdBy === u;
}
// ---- Pipelines (admin-defined; multi-pipeline) ----
const PIPELINES_FILE = path.join(BOV_DATA_DIR, 'pipelines.json');
function _seedPipeline(id, name, area, names, days) { return { id: id, name: name, area: area, stages: names.map(function(n, i){ return { name: n, number: i + 1, targetDays: days }; }) }; }
function defaultPipelines() {
  return [
    _seedPipeline('p_bizsales', 'Business Sales', 'Business Sales', ['Data Room','Outreach','Seller Qualification Call','Valuation Questionnaire','BOV','Agreed','Marketing Pack','Market Attack Plan','Lease Abstract','Offers','Due Diligence','Closing'], 7),
    _seedPipeline('p_tenantrep', 'Tenant Rep', 'Tenant Rep', ['Needs Analysis','Site Search','Tours','LOI Out','Lease Negotiation','Build-out','Open'], 14),
    _seedPipeline('p_llrep', 'Landlord Rep', 'Landlord Rep', ['Listing Setup','Marketing','Tours','LOI Received','Lease Negotiation','Executed'], 14)
  ];
}
function loadPipelines() { try { const a = JSON.parse(fs.readFileSync(PIPELINES_FILE, 'utf8')); if (Array.isArray(a) && a.length) return a; } catch (e) {} const d = defaultPipelines(); try { savePipelines(d); } catch (e) {} return d; }
function savePipelines(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(PIPELINES_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newPipelineId() { return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function cleanStages(arr) { return (Array.isArray(arr) ? arr : []).slice(0, 40).map(function(st, i){ return { name: String((st && st.name) || '').slice(0, 80) || ('Stage ' + (i + 1)), number: i + 1, targetDays: Math.max(0, Math.min(3650, parseInt((st && st.targetDays), 10) || 0)) }; }).filter(function(st){ return st.name; }); }
app.get('/api/pipelines', (req, res) => { res.json({ ok: true, pipelines: loadPipelines(), isAdmin: !!(req.user && isSuper(req.user)) }); });
app.post('/api/admin/pipelines', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {}; const all = loadPipelines();
  const name = String(b.name || '').trim().slice(0, 80); if (!name) return res.status(400).json({ ok: false, error: 'Pipeline name is required.' });
  let p;
  if (b.id) { p = all.find(x => x.id === b.id); if (!p) return res.status(404).json({ ok: false, error: 'Pipeline not found.' }); }
  else { p = { id: newPipelineId() }; all.push(p); }
  p.name = name; p.area = String(b.area || '').slice(0, 60); p.stages = cleanStages(b.stages);
  savePipelines(all);
  res.json({ ok: true, pipeline: p, pipelines: all });
});
app.delete('/api/admin/pipelines/:id', requireAdmin, (req, res) => {
  let all = loadPipelines(); const before = all.length; all = all.filter(x => x.id !== req.params.id);
  if (all.length === before) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!all.length) return res.status(400).json({ ok: false, error: 'Keep at least one pipeline.' });
  savePipelines(all); res.json({ ok: true, pipelines: all });
});
// ---- Saved searches (per-list, per-user, shareable) ----
const SAVED_SEARCH_FILE = path.join(BOV_DATA_DIR, 'saved_searches.json');
function loadSavedSearches() { try { return JSON.parse(fs.readFileSync(SAVED_SEARCH_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveSavedSearches(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(SAVED_SEARCH_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newSearchId() { return 'ss_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
app.get('/api/saved-searches', (req, res) => {
  const list = String(req.query.list || '').slice(0, 40);
  const meU = (req.user && req.user.username) || '';
  const rows = loadSavedSearches().filter(x => (!list || x.list === list) && (x.shared || x.owner === meU));
  res.json({ ok: true, searches: rows.map(x => ({ id: x.id, list: x.list, name: x.name, shared: !!x.shared, mine: x.owner === meU, ownerName: x.ownerName || '', payload: x.payload || {} })) });
});
app.post('/api/saved-searches', express.json(), (req, res) => {
  const b = req.body || {}; const meU = (req.user && req.user.username) || '', meN = (req.user && req.user.name) || '';
  const name = String(b.name || '').trim().slice(0, 80); const list = String(b.list || '').slice(0, 40);
  if (!name || !list) return res.status(400).json({ ok: false, error: 'Name and list are required.' });
  const all = loadSavedSearches(); let it;
  if (b.id) { it = all.find(x => x.id === b.id); if (!it) return res.status(404).json({ ok: false, error: 'Not found.' }); if (it.owner !== meU && !(req.user && isSuper(req.user))) return res.status(403).json({ ok: false, error: 'Not yours.' }); }
  else { it = { id: newSearchId(), list: list, owner: meU, ownerName: meN, createdAt: new Date().toISOString() }; all.push(it); }
  it.name = name; it.shared = !!b.shared; it.payload = (b.payload && typeof b.payload === 'object') ? b.payload : {};
  saveSavedSearches(all);
  res.json({ ok: true, id: it.id });
});
app.delete('/api/saved-searches/:id', (req, res) => {
  const meU = (req.user && req.user.username) || ''; const all = loadSavedSearches(); const i = all.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (all[i].owner !== meU && !(req.user && isSuper(req.user))) return res.status(403).json({ ok: false, error: 'Not yours.' });
  all.splice(i, 1); saveSavedSearches(all); res.json({ ok: true });
});
// ---- Feedback tracker (feature requests / bugs, ranked, with status) ----
const FEEDBACK_FILE = path.join(BOV_DATA_DIR, 'feedback.json');
function loadFeedback() { try { return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveFeedback(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newFeedbackId() { return 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const FEEDBACK_TYPES = ['Feature request', 'Bug', 'Improvement', 'Question', 'Other'];
const FEEDBACK_STATUSES = ['New', 'Under review', 'Planned', 'In progress', 'Done', 'Declined'];
const FEEDBACK_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
app.get('/api/feedback', (req, res) => {
  res.json({ ok: true, items: loadFeedback(), types: FEEDBACK_TYPES, statuses: FEEDBACK_STATUSES, priorities: FEEDBACK_PRIORITIES, isAdmin: !!(req.user && isSuper(req.user)), canDelete: canDelete(req), me: (req.user && req.user.username) || '' });
});
app.post('/api/feedback', express.json(), (req, res) => {
  const b = req.body || {}; const all = loadFeedback(); const now = new Date().toISOString();
  const meU = (req.user && req.user.username) || '', meN = (req.user && req.user.name) || '';
  let it;
  if (b.id) {
    it = all.find(x => x.id === b.id);
    if (!it) return res.status(404).json({ ok: false, error: 'Item not found.' });
    if (typeof b.title === 'string' && b.title.trim()) it.title = b.title.trim().slice(0, 200);
    if (typeof b.detail === 'string') it.detail = b.detail.slice(0, 6000);
    if (typeof b.type === 'string' && FEEDBACK_TYPES.indexOf(b.type) >= 0) it.type = b.type;
    if (typeof b.status === 'string' && FEEDBACK_STATUSES.indexOf(b.status) >= 0) it.status = b.status;
    if (typeof b.priority === 'string' && FEEDBACK_PRIORITIES.indexOf(b.priority) >= 0) it.priority = b.priority;
    if (typeof b.adminNotes === 'string') it.adminNotes = b.adminNotes.slice(0, 4000);
    it.updatedAt = now; saveFeedback(all);
    return res.json({ ok: true, item: it });
  }
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) return res.status(400).json({ ok: false, error: 'A short title is required.' });
  it = { id: newFeedbackId(), title: title, type: (FEEDBACK_TYPES.indexOf(b.type) >= 0 ? b.type : 'Feature request'), detail: String(b.detail || '').slice(0, 6000), status: 'New', priority: (FEEDBACK_PRIORITIES.indexOf(b.priority) >= 0 ? b.priority : 'Medium'), votes: 0, submittedBy: meU, submittedByName: meN, adminNotes: '', createdAt: now, updatedAt: now };
  all.push(it); saveFeedback(all);
  res.json({ ok: true, item: it });
});
app.post('/api/feedback/:id/vote', express.json(), (req, res) => {
  const all = loadFeedback(); const it = all.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ ok: false, error: 'Not found.' });
  it.votes = (it.votes || 0) + ((req.body && req.body.dir === 'down') ? -1 : 1); if (it.votes < 0) it.votes = 0;
  it.updatedAt = new Date().toISOString(); saveFeedback(all);
  res.json({ ok: true, votes: it.votes });
});
app.delete('/api/feedback/:id', (req, res) => {
  if (!canDelete(req)) return res.status(403).json({ ok: false, error: 'You do not have permission to delete.' });
  const all = loadFeedback(); const i = all.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Not found.' });
  all.splice(i, 1); saveFeedback(all);
  res.json({ ok: true });
});
app.get('/api/tasks', (req, res) => {
  const all = loadTasks();
  const mine = all.filter(t => taskVisible(t, req));
  const contacts = loadPeople().map(p => ({ id: p.id, name: p.name })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const deals = [];
  try { const ov = loadAssignOverlay(), idx = assignmentsIndex(); for (const k in idx) { try { deals.push({ key: k, business: assignmentView(idx[k], ov).business }); } catch (e) {} } } catch (e) {}
  deals.sort((a, b) => String(a.business || '').localeCompare(String(b.business || '')));
  res.json({ ok: true, tasks: mine, contacts, deals, priorities: TASK_PRIORITIES, activityTypes: effActivityTypes(), emailReady: isEmailConfigured(), smsReady: isSmsConfigured(), isAdmin: !!(req.user && isSuper(req.user)), me: (req.user && req.user.username) || '' });
});
app.post('/api/tasks', express.json(), (req, res) => {
  const b = req.body || {}; const all = loadTasks(); const now = new Date().toISOString();
  const title = String(b.title || '').trim().slice(0, 300);
  if (!title) return res.status(400).json({ ok: false, error: 'A task title is required.' });
  const users = auth.loadUsers();
  const findUser = un => users.find(u => u.username === un);
  const meU = req.user && req.user.username, isAdmin = req.user && isSuper(req.user);
  let t;
  if (b.id) {
    t = all.find(x => x.id === b.id);
    if (!t) return res.status(404).json({ ok: false, error: 'Task not found.' });
    if (!isAdmin && t.createdBy !== meU && t.assignee !== meU) return res.status(403).json({ ok: false, error: 'Not yours.' });
  } else {
    t = { id: newTaskId(), createdBy: meU || '', createdByName: (req.user && req.user.name) || '', createdAt: now, status: 'open', doneAt: '' };
    all.push(t);
  }
  t.title = title;
  if (typeof b.notes === 'string') t.notes = b.notes.slice(0, 4000);
  if (typeof b.due === 'string') t.due = b.due.slice(0, 16);
  if (typeof b.priority === 'string') t.priority = TASK_PRIORITIES.indexOf(b.priority) >= 0 ? b.priority : (t.priority || 'Normal');
  if (typeof b.type === 'string') t.type = effActivityTypes().indexOf(b.type) >= 0 ? b.type : (b.type === '' ? '' : (t.type || ''));
  if (!t.priority) t.priority = 'Normal';
  t.assignee = t.createdBy || meU || ''; t.assigneeName = t.assigneeName || t.createdByName || (req.user && req.user.name) || '';
  if (typeof b.status === 'string' && ['open', 'done'].indexOf(b.status) >= 0) { t.status = b.status; t.doneAt = b.status === 'done' ? now : ''; }
  if (typeof b.linkType === 'string') t.linkType = ['contact', 'deal', ''].indexOf(b.linkType) >= 0 ? b.linkType : (t.linkType || '');
  if (typeof b.linkId === 'string') t.linkId = b.linkId.slice(0, 60);
  if (typeof b.linkLabel === 'string') t.linkLabel = b.linkLabel.slice(0, 200);
  if (b.linkType === '') { t.linkId = ''; t.linkLabel = ''; }
  if (typeof b.reminder === 'string') { t.reminder = b.reminder.slice(0, 16); t.remSent = false; }
  if (Array.isArray(b.remChannels)) t.remChannels = b.remChannels.filter(x => ['popup', 'email', 'sms'].indexOf(x) >= 0);
  if (!Array.isArray(t.remChannels) || !t.remChannels.length) t.remChannels = taskChannels(t);
  t.updatedAt = now;
  saveTasks(all);
  res.json({ ok: true, task: t });
});
app.post('/api/tasks/:id/toggle', (req, res) => {
  const all = loadTasks(); const t = all.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Task not found.' });
  if (!taskVisible(t, req)) return res.status(403).json({ ok: false, error: 'Not yours.' });
  t.status = t.status === 'done' ? 'open' : 'done'; t.doneAt = t.status === 'done' ? new Date().toISOString() : ''; t.updatedAt = new Date().toISOString();
  saveTasks(all); res.json({ ok: true, task: t });
});
app.delete('/api/tasks/:id', (req, res) => {
  const all = loadTasks(); const t = all.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Task not found.' });
  if (!(req.user && isSuper(req.user)) && t.createdBy !== (req.user && req.user.username)) return res.status(403).json({ ok: false, error: 'Only the creator or an admin can delete this.' });
  saveTasks(all.filter(x => x.id !== t.id)); res.json({ ok: true });
});

// ================= Agreements =================
const AGREEMENTS_FILE = path.join(BOV_DATA_DIR, 'agreements.json');
function loadAgreements() { try { return JSON.parse(fs.readFileSync(AGREEMENTS_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveAgreements(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(AGREEMENTS_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newAgreementId() { return 'agr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const AGREEMENT_TYPES = [
  { key: 'NDA', label: 'NDA' },
  { key: 'CA', label: 'CA' },
  { key: 'ETRA', label: 'ETRA' },
  { key: 'Referral', label: 'Referral Agreement' },
  { key: 'Listing', label: 'Exclusive Business Listing' },
  { key: 'TenantRep', label: 'Tenant Rep Agreement' },
  { key: 'BizSeller', label: 'Business Seller Agreement' },
  { key: 'AssocBroker', label: 'Associate Broker Agreement' }
];
const AGREEMENT_TYPE_KEYS = AGREEMENT_TYPES.map(t => t.key);
function agreementBrief(a) {
  return { id: a.id, type: a.type, name: a.name || '', personId: a.personId || '', personName: a.personName || '', companyId: a.companyId || '', dealKey: a.dealKey || '', effective: a.effective || '', expires: a.expires || '', status: a.status || 'active', notes: a.notes || '', createdByName: a.createdByName || '', createdAt: a.createdAt || '', docExt: a.docExt || '', docName: a.docName || '', signStatus: a.signStatus || '', sentAt: a.sentAt || '', sentTo: a.sentTo || '', signedDate: a.signedDate || '', signToken: a.signToken || '', signedName: a.signedName || '', signedAt: a.signedAt || '', hasSignature: !!a.hasSignature, repSignedName: a.repSignedName || '', repSignedAt: a.repSignedAt || '', executedAt: a.executedAt || '', hasCountersign: !!a.hasCountersign, signedResponses: a.signedResponses || null, templateId: a.templateId || '', templateName: a.templateName || '', signers: Array.isArray(a.signers) ? a.signers.map(s => ({ order: s.order, role: s.role, label: s.label, name: s.name || '', email: s.email || '', status: s.status || 'pending', signedAt: s.signedAt || '' })) : [], signerCount: a.signerCount === 2 ? 2 : 1, hasFinal: !!a.hasFinal, pdfFieldCount: Array.isArray(a.pdfFields) ? a.pdfFields.length : 0 };
}
app.get('/api/agreements', (req, res) => {
  let all = loadAgreements();
  const pid = req.query.personId;
  if (pid) all = all.filter(a => a.personId === pid);
  const nameById = {}; loadPeople().forEach(p => { nameById[p.id] = p.name; });
  const coNameById = {}; loadCompanies().forEach(c => { coNameById[c.id] = c.name; });
  const bizByKey = {}; try { const ov = loadAssignOverlay(), idx = assignmentsIndex(); for (const k in idx) { try { bizByKey[k] = assignmentView(idx[k], ov).business; } catch (e) {} } } catch (e) {}
  if (restrictToOwn(req)) all = all.filter(a => permOwnerMatch(req, a.createdBy));
  all = all.map(a => Object.assign(agreementBrief(a), { personName: a.personName || nameById[a.personId] || '', companyName: coNameById[a.companyId] || '', dealName: bizByKey[a.dealKey] || '' }));
  all.sort((x, y) => String(x.expires || '9999').localeCompare(String(y.expires || '9999')));
  res.json({ ok: true, agreements: all, types: AGREEMENT_TYPES, isAdmin: !!(req.user && isSuper(req.user)) });
});
app.post('/api/agreements', express.json(), (req, res) => {
  const b = req.body || {}; const all = loadAgreements(); const now = new Date().toISOString();
  const type = String(b.type || '').trim();
  if (AGREEMENT_TYPE_KEYS.indexOf(type) < 0) return res.status(400).json({ ok: false, error: 'Pick an agreement type.' });
  let a;
  if (b.id) {
    a = all.find(x => x.id === b.id);
    if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  } else {
    a = { id: newAgreementId(), createdBy: (req.user && req.user.username) || '', createdByName: (req.user && req.user.name) || '', createdAt: now };
    all.push(a);
  }
  a.type = type;
  if (typeof b.name === 'string') a.name = b.name.slice(0, 160);
  if (typeof b.personId === 'string') { a.personId = b.personId; const p = personById(b.personId); a.personName = p ? p.name : (b.personName || a.personName || ''); }
  if (typeof b.companyId === 'string') a.companyId = b.companyId;
  if (typeof b.dealKey === 'string') a.dealKey = b.dealKey;
  if (!a.companyId && a.personId) { const pp = personById(a.personId); if (pp && pp.companyId) a.companyId = pp.companyId; }
  if (typeof b.effective === 'string') a.effective = b.effective.slice(0, 10);
  if (typeof b.expires === 'string') a.expires = b.expires.slice(0, 10);
  if (typeof b.status === 'string' && ['active', 'expired', 'terminated'].indexOf(b.status) >= 0) a.status = b.status;
  if (!a.status) a.status = 'active';
  if (typeof b.notes === 'string') a.notes = b.notes.slice(0, 2000);
  a.updatedAt = now;
  saveAgreements(all);
  // No activity is logged when an agreement is merely created — only when it is actually sent or signed.
  res.json({ ok: true, agreement: agreementBrief(a) });
});
// Executed-agreements roll-up — real agreements tied to clients & deals (for the Agreements page).
app.get('/api/agreements/executed', (req, res) => {
  const seeAll = isSuper(req.user) || !restrictToOwn(req);
  const uname = (req.user && req.user.username) || '';
  const nameById = {}; loadPeople().forEach(p => nameById[p.id] = p.name || '');
  const coById = {}; loadCompanies().forEach(c => coById[c.id] = c.name || '');
  let bizByKey = {};
  try { const idx = assignmentsIndex(), ov = loadAssignOverlay(); for (const k in idx) { try { bizByKey[k] = assignmentView(idx[k], ov).business; } catch (e) {} } } catch (e) {}
  let all = loadAgreements().filter(a => seeAll || a.createdBy === uname);
  all = all.map(a => Object.assign(agreementBrief(a), {
    personName: a.personName || nameById[a.personId] || '',
    companyName: coById[a.companyId] || '',
    dealName: bizByKey[a.dealKey] || '',
  })).sort((x, y) => String(x.expires || '9999').localeCompare(String(y.expires || '9999')));
  res.json({ ok: true, agreements: all, types: AGREEMENT_TYPES, canDelete: canDelete(req), isAdmin: !!(req.user && isSuper(req.user)) });
});
app.delete('/api/agreements/:id', (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  if (!canDelete(req) && a.createdBy !== (req.user && req.user.username)) return res.status(403).json({ ok: false, error: 'You do not have permission to delete this agreement.' });
  saveAgreements(all.filter(x => x.id !== a.id)); res.json({ ok: true });
});

// ---- Agreement documents + send-for-signature ----
const AGREEMENT_DOC_DIR = path.join(BOV_DATA_DIR, 'agreedocs');
function agreementTypeLabel(k) { const t = AGREEMENT_TYPES.find(x => x.key === k); return t ? t.label : (k || 'Agreement'); }
function agreementDocExt(n) { const m = String(n || '').toLowerCase().match(/\.(pdf|docx|doc|png|jpe?g)$/); return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'pdf'; }
function agreementDocMime(ext) { return ({ pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg' })[ext] || 'application/octet-stream'; }
app.post('/api/agreements/:id/doc', express.json({ limit: '28mb' }), (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  const b = req.body || {}; const dataB64 = String(b.dataB64 || '').replace(/^data:[^,]*,/, '');
  if (!dataB64) return res.status(400).json({ ok: false, error: 'No file data.' });
  const ext = agreementDocExt(b.filename); const buf = Buffer.from(dataB64, 'base64');
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large (max 20 MB).' });
  try { if (!fs.existsSync(AGREEMENT_DOC_DIR)) fs.mkdirSync(AGREEMENT_DOC_DIR, { recursive: true }); if (a.docExt && a.docExt !== ext) { try { fs.unlinkSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + a.docExt)); } catch (e) {} } fs.writeFileSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + ext), buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the file.' }); }
  a.docExt = ext; a.docName = String(b.filename || ('agreement.' + ext)).slice(0, 200); a.updatedAt = new Date().toISOString();
  saveAgreements(all); res.json({ ok: true, agreement: agreementBrief(a) });
});
app.get('/api/agreements/:id/doc', (req, res) => {
  const a = loadAgreements().find(x => x.id === req.params.id);
  if (!a || !a.docExt) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + a.docExt)); res.set('Content-Type', agreementDocMime(a.docExt)); res.set('Content-Disposition', 'inline; filename="' + String(a.docName || ('agreement.' + a.docExt)).replace(/[^\w.\- ]+/g, '') + '"'); res.send(buf); }
  catch (e) { res.status(404).end(); }
});
app.post('/api/agreements/:id/doc/clear', (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  if (a.docExt) { try { fs.unlinkSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + a.docExt)); } catch (e) {} }
  a.docExt = ''; a.docName = ''; a.updatedAt = new Date().toISOString(); saveAgreements(all);
  res.json({ ok: true, agreement: agreementBrief(a) });
});
app.post('/api/agreements/:id/send', express.json(), async (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, error: "Email isn't set up. Configure it in Admin -> Email." });
  const p = a.personId ? personById(a.personId) : null; const b = req.body || {};
  const to = String(b.to || '').trim() || (p ? preferredEmailOf(p) : '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ ok: false, error: 'No valid recipient email — add one to the contact or type one.' });
  const label = agreementTypeLabel(a.type);
  if (!a.signToken) a.signToken = newSignToken();
  const signUrl = reqOrigin(req) + '/sign/' + a.signToken;
  const subject = String(b.subject || (label + ' for your signature')).slice(0, 300);
  const message = String(b.message || ('Please review and sign your ' + label + ' online here:\n' + signUrl + '\n\nThank you,\nRestaurant Realty Group')).slice(0, 20000);
  // The signing page now shows an inline preview of the document, so the email is a clean link only (no heavy attachment).
  try { await buildTransport().sendMail({ from: mailFrom(), to, subject, text: message }); }
  catch (e) { console.error('agreement send:', e && e.message); return res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
  const now = new Date().toISOString(); a.signStatus = 'sent'; a.sentAt = now; a.sentTo = to; if (Array.isArray(b.values)) a.fieldValues = b.values.map(function(v){return String(v==null?'':v).slice(0,500);}); a.updatedAt = now; saveAgreements(all);
  if (p) { try { const ppl = loadPeople(); const pp = ppl.find(x => x.id === p.id); if (pp) { logActivity(pp, 'Agreement Sent', label + ' sent for signature to ' + to, { auto: true, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); savePeople(ppl); } } catch (e) {} }
  res.json({ ok: true, agreement: agreementBrief(a), to });
});
app.post('/api/agreements/:id/sign', express.json(), (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  const now = new Date().toISOString(); const b = req.body || {};
  a.signStatus = 'signed'; a.signedDate = (typeof b.date === 'string' && b.date) ? b.date.slice(0, 10) : now.slice(0, 10); a.status = 'active'; a.updatedAt = now; saveAgreements(all);
  if (a.personId) { try { const ppl = loadPeople(); const pp = ppl.find(x => x.id === a.personId); if (pp) { logActivity(pp, 'Agreement Signed', agreementTypeLabel(a.type) + ' signed', { auto: true, date: a.signedDate, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); savePeople(ppl); } } catch (e) {} }
  res.json({ ok: true, agreement: agreementBrief(a) });
});

// ---- Lightweight in-app e-signature (tokenized public signing page) ----
function newSignToken() { return crypto.randomBytes(18).toString('base64url'); }
function defaultSignFields() { return [{ label: 'Full name', required: true, type: 'text' }, { label: 'Title / Company', required: false, type: 'text' }]; }
function reqOrigin(req) { const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0]; return String(process.env.APP_URL || (proto + '://' + req.get('host'))).replace(/\/$/, ''); }
app.get('/sign/:token', (req, res) => {
  const _found = findAgrByToken(loadAgreements(), req.params.token); const a = _found ? _found.a : null;
  if (!a) return res.status(404).send(roomShell('Signature', { head: '<div class="kick">Signature</div><h1>Link not found</h1><div class="sub">This signing link is invalid or has been retired.</div>', body: '<div class="card"><div style="padding:20px;color:#6b7488">Please contact your RRG representative for a current link.</div></div>' }));
  if (_found.signer && Array.isArray(a.pdfFields) && a.pdfFields.length) return res.send(advancedSignPage(a, _found.signer, req));
  const label = agreementTypeLabel(a.type);
  const p = a.personId ? personById(a.personId) : null;
  const head = `<div class="kick">Signature Request</div><h1>${esc(label)}</h1><div class="sub">Provided by Restaurant Realty Group${p ? (' for ' + esc(p.name)) : ''}</div>`;
  if (a.signStatus === 'signed' || a.signStatus === 'awaiting_countersign' || a.signStatus === 'executed') {
    const _done = a.signStatus === 'executed' || a.signStatus === 'signed';
    const _msg = _done ? ('This ' + esc(label) + ' is fully executed' + (a.signedDate ? (' \u2014 signed ' + esc(a.signedDate)) : '') + '.') : ('You have signed this ' + esc(label) + (a.signedDate ? (' on ' + esc(a.signedDate)) : '') + '. It has been sent back to Restaurant Realty Group for the final signature; you will receive the fully executed copy by email.');
    const _dl = a.docExt ? ('<div style="margin-top:14px"><a href="/sign/' + esc(a.signToken) + '/doc" target="_blank" rel="noopener" style="color:#2647b0;font-weight:700;text-decoration:none">View the ' + esc(label) + ' document \u2192</a></div>') : '';
    const _sigs = _done ? ('<div style="margin-top:18px;display:flex;gap:26px;flex-wrap:wrap">' + (a.hasSignature ? ('<div><div style="font-size:11px;color:#8a93a8;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Signer</div><img src="/api/agreements/' + esc(a.id) + '/signature" style="height:56px;max-width:220px"><div style="font-size:12.5px;color:#1a2236;margin-top:3px">' + esc(a.signedName || '') + (a.signedDate ? (' \u00b7 ' + esc(a.signedDate)) : '') + '</div></div>') : '') + (a.hasCountersign ? ('<div><div style="font-size:11px;color:#8a93a8;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Restaurant Realty Group</div><img src="/api/agreements/' + esc(a.id) + '/countersignature" style="height:56px;max-width:220px"><div style="font-size:12.5px;color:#1a2236;margin-top:3px">' + esc(a.repSignedName || '') + (a.repSignedAt ? (' \u00b7 ' + esc(String(a.repSignedAt).slice(0,10))) : '') + '</div></div>') : '') + '</div>') : '';
    return res.send(roomShell(label + (_done ? ' — Executed' : ' — Signed'), { head, body: '<div class="card"><div style="padding:22px"><b>' + _msg + '</b><div style="color:#6b7488;margin-top:8px">Thank you — no further action is needed.</div>' + _dl + _sigs + '</div></div>' }));
  }
  const fields = (Array.isArray(a.signFields) && a.signFields.length) ? a.signFields : defaultSignFields();
  const _party = p ? p.name : (a.personName || '');
  const _coName = a.companyId ? ((companyById(a.companyId) || {}).name || '') : '';
  const _today = new Date().toISOString().slice(0, 10);
  function prefillFor(fld) { const k = String(fld.autofill || '').toLowerCase(); const L = String(fld.label || '').toLowerCase(); if (k === 'party_name' || k === 'name' || (!k && /\bname\b/.test(L))) return _party; if (k === 'company' || k === 'title' || (!k && /(company|firm|title)/.test(L))) return _coName; if (k === 'date' || (!k && /date/.test(L))) return _today; if (k === 'email' || (!k && /email/.test(L))) return (p ? preferredEmailOf(p) : ''); return ''; }
  const _vals = Array.isArray(a.fieldValues) ? a.fieldValues : [];
  const fieldHtml = '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#8a93a8;margin:4px 0 8px">Agreement details</div>'+fields.map(function(fld, i){ var val=(_vals[i]!=null && String(_vals[i])!=='')?_vals[i]:prefillFor(fld); return '<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #eef1f6"><span style="font-size:12.5px;font-weight:700;color:#8a93a8">'+esc(fld.label)+'</span><span style="font-size:14.5px;color:#1a2236;font-weight:600;text-align:right">'+esc(fmtSignVal(fld.type==='autofill'?(fld.autofill||'text'):fld.type, val)||'\u2014')+'</span></div>'; }).join('');
  const docLink = (function(){ if(!a.docExt) return ''; var src='/sign/'+esc(a.signToken)+'/doc'; var open='<div style="text-align:right;margin-top:8px"><a href="'+src+'" target="_blank" rel="noopener" style="color:#2647b0;font-weight:700;font-size:12.5px;text-decoration:none">Open full document ↗</a></div>'; var hdr='<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#8a93a8;margin:4px 0 10px">Document preview</div>'; if(a.docExt==='pdf') return hdr+'<div style="border:1px solid #e6e9f0;border-radius:10px;overflow:hidden;background:#f5f7fb"><iframe src="'+src+'#view=FitH" title="Agreement document" style="width:100%;height:540px;border:0;display:block"></iframe></div>'+open; if(a.docExt==='png'||a.docExt==='jpg') return hdr+'<div style="border:1px solid #e6e9f0;border-radius:10px;overflow:hidden;background:#f5f7fb;text-align:center"><img src="'+src+'" alt="Agreement document" style="max-width:100%;display:block;margin:0 auto"></div>'+open; return hdr+'<a href="'+src+'" target="_blank" rel="noopener" style="display:block;text-align:center;border:1px dashed #cfd6e2;border-radius:10px;padding:18px;color:#2647b0;font-weight:700;text-decoration:none;background:#f8fafc">Open the '+esc(label)+' document to review →</a>'; })();
  const note = a.notes ? `<div style="color:#55607a;font-size:13.5px;margin-bottom:16px;white-space:pre-wrap">${esc(a.notes)}</div>` : '';
  const body = `<div class="card"><div style="padding:22px">${note}${docLink}${fieldHtml}<label style="display:block;font-size:12px;font-weight:700;color:#3a4560;margin:6px 0 6px">Signature *</label><div style="border:1px solid #cfd6e2;border-radius:9px;background:#fff;overflow:hidden"><canvas id="sigpad" style="width:100%;height:180px;touch-action:none;display:block"></canvas></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span style="font-size:11.5px;color:#98a1b5">Draw your signature above</span><button type="button" id="sigclear" style="background:none;border:none;color:#DA2B1F;font-weight:700;cursor:pointer;font-size:12.5px">Clear</button></div><label style="display:block;font-size:12px;font-weight:700;color:#3a4560;margin:16px 0 6px">Date signed <span style="color:#98a1b5;font-weight:600">(autofilled &amp; time stamped)</span></label><input type="text" value="${_today}" readonly style="width:100%;background:#f5f7fb;border:1px solid #cfd6e2;border-radius:9px;padding:12px;font:inherit;font-size:14px;color:#1a2236;font-weight:600"><label style="display:flex;align-items:flex-start;gap:8px;margin:16px 0;font-size:12.5px;color:#3a4560"><input type="checkbox" id="sigagree" style="margin-top:2px"> I agree this electronic signature is legally binding and equivalent to my handwritten signature.</label><button type="button" id="sigsubmit" style="width:100%;background:#000E31;color:#fff;border:none;border-radius:10px;padding:14px;font:inherit;font-size:15px;font-weight:700;cursor:pointer">Sign &amp; submit</button><div id="sigmsg" style="text-align:center;font-size:13px;color:#DA2B1F;margin-top:10px"></div></div></div>
<script>
(function(){
  var c=document.getElementById('sigpad'),ctx=c.getContext('2d');
  function fit(){var r=c.getBoundingClientRect();c.width=r.width*2;c.height=r.height*2;ctx.scale(2,2);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#0b1a3a';}
  fit();
  var draw=false,last=null,dirty=false;
  function pos(e){var r=c.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
  function dn(e){draw=true;last=pos(e);e.preventDefault();}
  function mv(e){if(!draw)return;var q=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(q.x,q.y);ctx.stroke();last=q;dirty=true;e.preventDefault();}
  function up(){draw=false;}
  c.addEventListener('mousedown',dn);c.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);
  c.addEventListener('touchstart',dn,{passive:false});c.addEventListener('touchmove',mv,{passive:false});c.addEventListener('touchend',up);
  document.getElementById('sigclear').onclick=function(){ctx.clearRect(0,0,c.width,c.height);dirty=false;};
  document.getElementById('sigsubmit').onclick=function(){
    var m=document.getElementById('sigmsg'),flds=[],ok=true;
    document.querySelectorAll('[data-sf]').forEach(function(el){var v=el.value.trim();if(el.getAttribute('data-req')&&!v){ok=false;el.style.borderColor='#DA2B1F';}flds.push(v);});
    if(!ok){m.textContent='Please fill the required fields.';return;}
    if(!dirty){m.textContent='Please draw your signature.';return;}
    if(!document.getElementById('sigagree').checked){m.textContent='Please check the agreement box.';return;}
    var name=${JSON.stringify(_party||"")};
    var btn=document.getElementById('sigsubmit');btn.disabled=true;btn.textContent='Submitting…';
    fetch('/api/sign/'+encodeURIComponent(${JSON.stringify(a.signToken)}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,responses:flds,signature:c.toDataURL('image/png')})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.ok){document.querySelector('.wrap').innerHTML='<div class="card"><div style="padding:26px;text-align:center"><div style="font-size:40px">✓</div><b style="font-size:17px;color:#000E31">Signed — thank you.</b><div style="color:#6b7488;margin-top:8px">A copy has been recorded with Restaurant Realty Group.</div></div></div>';window.scrollTo(0,0);}
        else{btn.disabled=false;btn.textContent='Sign & submit';m.textContent=(j&&j.error)||'Could not submit.';}
      }).catch(function(){btn.disabled=false;btn.textContent='Sign & submit';m.textContent='Could not reach the server.';});
  };
})();
</script>`;
  res.send(roomShell(label + ' — Signature', { head, body }));
});
app.get('/sign/:token/doc', (req, res) => {
  const _fd = findAgrByToken(loadAgreements(), req.params.token); const a = _fd ? _fd.a : null;
  if (!a || !a.docExt) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + a.docExt)); res.set('Content-Type', agreementDocMime(a.docExt)); res.set('Content-Disposition', 'inline'); res.send(buf); } catch (e) { res.status(404).end(); }
});
app.post('/api/sign/:token', express.json({ limit: '8mb' }), async (req, res) => {
  const all = loadAgreements(); const _f = findAgrByToken(all, req.params.token); const a = _f ? _f.a : null;
  if (!a) return res.status(404).json({ ok: false, error: 'Invalid signing link.' });
  if (_f.signer && Array.isArray(a.pdfFields) && a.pdfFields.length) return submitAdvancedSign(req, res, all, a, _f.signer);
  if (['signed','awaiting_countersign','executed'].indexOf(a.signStatus) >= 0) return res.status(400).json({ ok: false, error: 'This agreement has already been signed.' });
  const b = req.body || {};
  const sig = String(b.signature || '');
  if (!/^data:image\/png;base64,/.test(sig)) return res.status(400).json({ ok: false, error: 'A signature is required.' });
  const fields = (Array.isArray(a.signFields) && a.signFields.length) ? a.signFields : defaultSignFields();
  const _vals = Array.isArray(a.fieldValues) ? a.fieldValues : [];
  const responses = {}; fields.forEach(function(fld, i){ responses[fld.label] = String((_vals[i] != null ? _vals[i] : (Array.isArray(b.responses) ? b.responses[i] : '')) || '').slice(0, 500); });
  const now = new Date().toISOString();
  try { if (!fs.existsSync(AGREEMENT_DOC_DIR)) fs.mkdirSync(AGREEMENT_DOC_DIR, { recursive: true }); const buf = Buffer.from(sig.replace(/^data:image\/png;base64,/, ''), 'base64'); if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Signature too large.' }); fs.writeFileSync(path.join(AGREEMENT_DOC_DIR, 'sig_' + a.id + '.png'), buf); a.hasSignature = true; } catch (e) {}
  a.signStatus = 'awaiting_countersign'; a.signedDate = now.slice(0, 10); a.signedAt = now; a.signedName = String(b.name || a.personName || responses['Full name'] || '').slice(0, 160); a.signedResponses = responses; a.signedIp = req.ip; a.status = 'active'; a.updatedAt = now;
  saveAgreements(all);
  if (a.personId) { try { const ppl = loadPeople(); const pp = ppl.find(x => x.id === a.personId); if (pp) { logActivity(pp, 'Agreement Signed', agreementTypeLabel(a.type) + ' signed by ' + (a.signedName || 'contact') + ' \u2014 awaiting your countersignature', { auto: true, date: a.signedDate }); savePeople(ppl); } } catch (e) {} }
  res.json({ ok: true });
});
app.get('/api/agreements/:id/signature', (req, res) => {
  const a = loadAgreements().find(x => x.id === req.params.id);
  if (!a || !a.hasSignature) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(AGREEMENT_DOC_DIR, 'sig_' + a.id + '.png')); res.set('Content-Type', 'image/png'); res.send(buf); } catch (e) { res.status(404).end(); }
});
app.post('/api/agreements/:id/countersign', express.json({ limit: '8mb' }), (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  if (!(a.signStatus === 'awaiting_countersign' || a.signStatus === 'signed')) return res.status(400).json({ ok: false, error: 'This agreement is not awaiting your signature yet.' });
  const b = req.body || {};
  const sig = String(b.signature || '');
  if (!/^data:image\/png;base64,/.test(sig)) return res.status(400).json({ ok: false, error: 'Draw your signature to countersign.' });
  const now = new Date().toISOString();
  try { if (!fs.existsSync(AGREEMENT_DOC_DIR)) fs.mkdirSync(AGREEMENT_DOC_DIR, { recursive: true }); const buf = Buffer.from(sig.replace(/^data:image\/png;base64,/, ''), 'base64'); if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Signature too large.' }); fs.writeFileSync(path.join(AGREEMENT_DOC_DIR, 'countersig_' + a.id + '.png'), buf); a.hasCountersign = true; } catch (e) {}
  a.repSignedName = String(b.name || (req.user && req.user.name) || '').slice(0, 160);
  a.repSignedAt = now; a.executedAt = now; a.signStatus = 'executed'; a.signedDate = a.signedDate || now.slice(0, 10); a.status = 'active'; a.updatedAt = now;
  saveAgreements(all);
  const label = agreementTypeLabel(a.type);
  if (a.personId) {
    try {
      const ppl = loadPeople(); const pp = ppl.find(x => x.id === a.personId);
      if (pp) { logActivity(pp, 'Agreement Executed', label + ' fully executed \u2014 countersigned by ' + (a.repSignedName || 'RRG'), { auto: true, date: now.slice(0, 10), by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); savePeople(ppl); }
    } catch (e) {}
  }
  try {
    if (isEmailConfigured()) {
      const origin = reqOrigin(req);
      const link = a.signToken ? (origin + '/sign/' + a.signToken) : '';
      const p = a.personId ? personById(a.personId) : null;
      const signerTo = a.sentTo || (p ? preferredEmailOf(p) : '');
      const repTo = (req.user && req.user.email) || mailFrom();
      const list = [signerTo, repTo].filter(x => x && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
      const uniq = list.filter((x, i) => list.indexOf(x) === i);
      const attachments = [];
      if (a.docExt === 'pdf') { try { attachments.push({ filename: a.docName || 'agreement.pdf', content: fs.readFileSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + a.docExt)) }); } catch (e) {} }
      const text = 'Good news \u2014 your ' + label + ' is now fully executed by all parties.\n\nView the executed agreement here:\n' + link + '\n\nThank you,\nRestaurant Realty Group';
      uniq.forEach(to => { buildTransport().sendMail({ from: mailFrom(), to, subject: label + ' \u2014 fully executed', text, attachments }).catch(() => {}); });
    }
  } catch (e) {}
  res.json({ ok: true, agreement: agreementBrief(a) });
});
app.get('/api/agreements/:id/countersignature', (req, res) => {
  const a = loadAgreements().find(x => x.id === req.params.id);
  if (!a || !a.hasCountersign) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(AGREEMENT_DOC_DIR, 'countersig_' + a.id + '.png')); res.set('Content-Type', 'image/png'); res.send(buf); } catch (e) { res.status(404).end(); }
});

// ---- Reusable agreement templates (admin-managed library) ----
const TEMPLATES_FILE = path.join(BOV_DATA_DIR, 'agreement_templates.json');
const AGREEMENT_TPL_DIR = path.join(BOV_DATA_DIR, 'agreetemplates');
function loadTemplates() { try { return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveTemplates(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(a, null, 2)); } catch (e) {} }
function newTemplateId() { return 'tpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _cleanFieldType(t) { t = String(t || 'text').toLowerCase(); return ['text','date','time','number','currency','email'].indexOf(t) >= 0 ? t : 'text'; }
function cleanSignFields(arr) { if (!Array.isArray(arr)) return []; return arr.map(f => ({ label: String((f && f.label) || '').slice(0, 80), required: !!(f && f.required), type: _cleanFieldType(f && f.type), autofill: String((f && f.autofill) || '').slice(0, 20) })).filter(f => f.label).slice(0, 12); }
function fmtSignVal(type, val) {
  val = String(val == null ? '' : val); if (!val) return '';
  type = String(type || 'text').toLowerCase();
  if (type === 'date') { const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (m[2] + '/' + m[3] + '/' + m[1]) : val; }
  if (type === 'time') { const t = val.match(/^(\d{1,2}):(\d{2})/); if (t) { let h = parseInt(t[1], 10); const ap = h < 12 ? 'AM' : 'PM'; const hh = (h % 12) || 12; return hh + ':' + t[2] + ' ' + ap; } return val; }
  if (type === 'number') { const raw = val.replace(/[^0-9.\-]/g, ''); const n = Number(raw); return (raw !== '' && isFinite(n)) ? n.toLocaleString('en-US') : val; }
  if (type === 'currency') { const raw = val.replace(/[^0-9.\-]/g, ''); const c = Number(raw); return (raw !== '' && isFinite(c)) ? ('$' + c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : val; }
  return val;
}
function templateBrief(t) { return { id: t.id, name: t.name || '', type: t.type || '', fileExt: t.fileExt || '', fileName: t.fileName || '', signFields: Array.isArray(t.signFields) ? t.signFields : [], emailMessage: t.emailMessage || '', pdfFields: Array.isArray(t.pdfFields) ? t.pdfFields : [], signerCount: t.signerCount === 2 ? 2 : 1, signer1Label: t.signer1Label || 'Signer 1', signer2Label: t.signer2Label || 'Signer 2', active: t.active !== false, updatedAt: t.updatedAt || '', createdAt: t.createdAt || '' }; }
app.get('/api/agreement-templates', (req, res) => {
  const isAdmin = !!(req.user && isSuper(req.user));
  let all = loadTemplates().map(templateBrief);
  if (!isAdmin) all = all.filter(t => t.active);
  all.sort((x, y) => String(x.name).localeCompare(String(y.name)));
  res.json({ ok: true, templates: all, types: AGREEMENT_TYPES, isAdmin });
});
app.post('/api/admin/agreement-templates', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {}; const all = loadTemplates(); const now = new Date().toISOString();
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'Give the template a name.' });
  let t;
  if (b.id) { t = all.find(x => x.id === b.id); if (!t) return res.status(404).json({ ok: false, error: 'Template not found.' }); }
  else { t = { id: newTemplateId(), createdAt: now, active: true }; all.push(t); }
  t.name = name.slice(0, 120);
  if (typeof b.type === 'string') t.type = AGREEMENT_TYPE_KEYS.indexOf(b.type) >= 0 ? b.type : '';
  if (b.signFields !== undefined) t.signFields = cleanSignFields(b.signFields);
  if (b.emailMessage !== undefined) t.emailMessage = String(b.emailMessage || '').slice(0, 4000);
  if (b.active !== undefined) t.active = !!b.active;
  t.updatedAt = now; saveTemplates(all);
  res.json({ ok: true, template: templateBrief(t) });
});
app.post('/api/admin/agreement-templates/:id/file', requireAdmin, express.json({ limit: '28mb' }), (req, res) => {
  const all = loadTemplates(); const t = all.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Template not found.' });
  const b = req.body || {}; const dataB64 = String(b.dataB64 || '').replace(/^data:[^,]*,/, '');
  if (!dataB64) return res.status(400).json({ ok: false, error: 'No file data.' });
  const ext = agreementDocExt(b.filename); const buf = Buffer.from(dataB64, 'base64');
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large (max 20 MB).' });
  try { if (!fs.existsSync(AGREEMENT_TPL_DIR)) fs.mkdirSync(AGREEMENT_TPL_DIR, { recursive: true }); if (t.fileExt && t.fileExt !== ext) { try { fs.unlinkSync(path.join(AGREEMENT_TPL_DIR, t.id + '.' + t.fileExt)); } catch (e) {} } fs.writeFileSync(path.join(AGREEMENT_TPL_DIR, t.id + '.' + ext), buf); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save the file.' }); }
  t.fileExt = ext; t.fileName = String(b.filename || ('template.' + ext)).slice(0, 200); t.updatedAt = new Date().toISOString();
  saveTemplates(all); res.json({ ok: true, template: templateBrief(t) });
});
app.get('/api/agreement-templates/:id/file', (req, res) => {
  const t = loadTemplates().find(x => x.id === req.params.id);
  if (!t || !t.fileExt) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(AGREEMENT_TPL_DIR, t.id + '.' + t.fileExt)); res.set('Content-Type', agreementDocMime(t.fileExt)); res.set('Content-Disposition', 'inline; filename="' + String(t.fileName || ('template.' + t.fileExt)).replace(/[^\w.\- ]+/g, '') + '"'); res.send(buf); }
  catch (e) { res.status(404).end(); }
});
app.delete('/api/admin/agreement-templates/:id', requireAdmin, (req, res) => {
  const all = loadTemplates(); const t = all.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Template not found.' });
  if (t.fileExt) { try { fs.unlinkSync(path.join(AGREEMENT_TPL_DIR, t.id + '.' + t.fileExt)); } catch (e) {} }
  saveTemplates(all.filter(x => x.id !== t.id)); res.json({ ok: true });
});
function clamp01(v) { v = parseFloat(v); if (!isFinite(v)) return 0; return Math.max(0, Math.min(1, v)); }
function cleanPdfFields(arr) {
  if (!Array.isArray(arr)) return [];
  const T = ['text', 'signature', 'checkbox', 'date', 'initials'];
  return arr.slice(0, 200).map(f => ({
    id: String((f && f.id) || ('f' + Math.random().toString(36).slice(2, 8))).slice(0, 40),
    page: Math.max(0, Math.min(999, parseInt((f && f.page) || 0, 10) || 0)),
    x: clamp01(f && f.x), y: clamp01(f && f.y), w: clamp01(f && f.w) || 0.18, h: clamp01(f && f.h) || 0.03,
    type: T.indexOf(String(f && f.type)) >= 0 ? String(f.type) : 'text',
    signer: (parseInt((f && f.signer), 10) === 2) ? 2 : 1,
    label: String((f && f.label) || '').slice(0, 80),
    required: !!(f && f.required),
    autofill: String((f && f.autofill) || '').slice(0, 20)
  }));
}
app.post('/api/admin/agreement-templates/:id/fields', requireAdmin, express.json({ limit: '1mb' }), (req, res) => {
  const all = loadTemplates(); const t = all.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Template not found.' });
  const b = req.body || {};
  if (b.pdfFields !== undefined) t.pdfFields = cleanPdfFields(b.pdfFields);
  if (b.signerCount !== undefined) t.signerCount = (parseInt(b.signerCount, 10) === 2) ? 2 : 1;
  if (typeof b.signer1Label === 'string') t.signer1Label = b.signer1Label.slice(0, 60);
  if (typeof b.signer2Label === 'string') t.signer2Label = b.signer2Label.slice(0, 60);
  t.updatedAt = new Date().toISOString(); saveTemplates(all);
  res.json({ ok: true, template: templateBrief(t) });
});
app.post('/api/agreements/:id/apply-template', express.json(), (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  const t = loadTemplates().find(x => x.id === String((req.body || {}).templateId || ''));
  if (!t) return res.status(404).json({ ok: false, error: 'Template not found.' });
  if (!t.fileExt) return res.status(400).json({ ok: false, error: 'That template has no document uploaded yet.' });
  try {
    if (!fs.existsSync(AGREEMENT_DOC_DIR)) fs.mkdirSync(AGREEMENT_DOC_DIR, { recursive: true });
    const src = fs.readFileSync(path.join(AGREEMENT_TPL_DIR, t.id + '.' + t.fileExt));
    if (a.docExt && a.docExt !== t.fileExt) { try { fs.unlinkSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + a.docExt)); } catch (e) {} }
    fs.writeFileSync(path.join(AGREEMENT_DOC_DIR, a.id + '.' + t.fileExt), src);
  } catch (e) { return res.status(500).json({ ok: false, error: 'Could not copy the template document.' }); }
  a.docExt = t.fileExt; a.docName = t.fileName || ('template.' + t.fileExt);
  a.templateId = t.id; a.templateName = t.name || '';
  a.pdfFields = Array.isArray(t.pdfFields) ? t.pdfFields : [];
  a.signerCount = t.signerCount === 2 ? 2 : 1;
  a.signer1Label = t.signer1Label || 'Signer 1';
  a.signer2Label = t.signer2Label || 'Signer 2';
  if (Array.isArray(t.signFields) && t.signFields.length) a.signFields = t.signFields;
  if (t.type && AGREEMENT_TYPE_KEYS.indexOf(t.type) >= 0) a.type = t.type;
  a.updatedAt = new Date().toISOString(); saveAgreements(all);
  res.json({ ok: true, agreement: agreementBrief(a) });
});

// ==== Advanced in-PDF signing engine (placed fields, multi-signer, final PDF) ====
function findAgrByToken(list, token) {
  if (!token) return null;
  for (const a of list) {
    if (a.signToken && a.signToken === token) return { a, signer: null };
    if (Array.isArray(a.signers)) { const sg = a.signers.find(s => s.token && s.token === token); if (sg) return { a, signer: sg }; }
  }
  return null;
}
function ensureSigners(a) {
  const n = a.signerCount === 2 ? 2 : 1;
  if (!Array.isArray(a.signers) || !a.signers.length) {
    a.signers = [];
    for (let i = 1; i <= n; i++) a.signers.push({ order: i, role: 's' + i, label: (i === 1 ? (a.signer1Label || 'Signer 1') : (a.signer2Label || 'Signer 2')), name: '', email: '', status: 'pending', token: '', signedAt: '', ip: '' });
  }
  return a.signers;
}
function signerFieldPrefill(a, fld) {
  const p = a.personId ? personById(a.personId) : null;
  const k = String(fld.autofill || '').toLowerCase();
  if (k === 'party_name') return p ? p.name : (a.personName || '');
  if (k === 'company') return a.companyId ? ((companyById(a.companyId) || {}).name || '') : '';
  if (k === 'date') return new Date().toISOString().slice(0, 10);
  if (k === 'email') return p ? preferredEmailOf(p) : '';
  return '';
}
function sigFieldPath(a, fid) { return path.join(AGREEMENT_DOC_DIR, 'fld_' + a.id + '_' + String(fid).replace(/[^a-z0-9]/gi, '') + '.png'); }

app.post('/api/agreements/:id/signers', express.json(), (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  ensureSigners(a);
  const arr = Array.isArray((req.body || {}).signers) ? req.body.signers : [];
  arr.forEach(inp => { const sg = a.signers.find(s => s.order === parseInt(inp.order, 10)); if (sg) { if (typeof inp.name === 'string') sg.name = inp.name.slice(0, 160); if (typeof inp.email === 'string') sg.email = inp.email.slice(0, 200); } });
  a.updatedAt = new Date().toISOString(); saveAgreements(all);
  res.json({ ok: true, agreement: agreementBrief(a) });
});

app.post('/api/agreements/:id/send-adv', express.json(), async (req, res) => {
  const all = loadAgreements(); const a = all.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'Agreement not found.' });
  if (!(Array.isArray(a.pdfFields) && a.pdfFields.length)) return res.status(400).json({ ok: false, error: 'This agreement has no placed fields.' });
  if (a.docExt !== 'pdf') return res.status(400).json({ ok: false, error: 'The document must be a PDF.' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, error: "Email isn't set up. Configure it in Admin -> Email." });
  ensureSigners(a);
  for (const sg of a.signers) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(sg.email || ''))) return res.status(400).json({ ok: false, error: 'Add a valid email for ' + (sg.label || ('Signer ' + sg.order)) + '.' }); }
  const next = a.signers.slice().sort((x, y) => x.order - y.order).find(s => s.status !== 'signed');
  if (!next) return res.status(400).json({ ok: false, error: 'All signers have already signed.' });
  if (!next.token) next.token = newSignToken();
  next.status = 'sent';
  const now = new Date().toISOString();
  a.signStatus = a.signers.some(s => s.status === 'signed') ? 'partial' : 'sent'; a.sentAt = now; a.updatedAt = now; saveAgreements(all);
  const label = agreementTypeLabel(a.type); const signUrl = reqOrigin(req) + '/sign/' + next.token;
  const subject = String((req.body || {}).subject || (label + ' for your signature')).slice(0, 300);
  const message = String((req.body || {}).message || ('Please review and sign your ' + label + ' online here:\n' + signUrl + '\n\nThank you,\nRestaurant Realty Group')).slice(0, 20000);
  try { await buildTransport().sendMail({ from: mailFrom(), to: next.email, subject, text: message }); }
  catch (e) { console.error('send-adv:', e && e.message); return res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
  if (a.personId) { try { const ppl = loadPeople(); const pp = ppl.find(x => x.id === a.personId); if (pp) { logActivity(pp, 'Agreement Sent', label + ' sent for signature to ' + (next.label || '') + ' ' + next.email, { auto: true }); savePeople(ppl); } } catch (e) {} }
  res.json({ ok: true, agreement: agreementBrief(a), to: next.email, signer: next.label });
});

app.get('/api/sign/:token/data', (req, res) => {
  const found = findAgrByToken(loadAgreements(), req.params.token);
  if (!found || !found.signer) return res.status(404).json({ ok: false, error: 'Invalid link.' });
  const a = found.a, me = found.signer;
  const fields = (a.pdfFields || []).map(f => {
    const mine = (f.signer === me.order);
    const signerObj = (a.signers || []).find(s => s.order === f.signer);
    const locked = !!(signerObj && signerObj.status === 'signed');
    let value = (a.fieldValues && a.fieldValues[f.id]) || '';
    if (mine && !value) value = signerFieldPrefill(a, f);
    return { id: f.id, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, type: f.type, label: f.label, required: f.required, mine, locked, value };
  });
  res.json({ ok: true, label: agreementTypeLabel(a.type), notes: a.notes || '', signerLabel: me.label, signerName: me.name, order: me.order, already: (me.status === 'signed'), fields });
});

app.get('/sign/:token/fieldimg/:fid', (req, res) => {
  const found = findAgrByToken(loadAgreements(), req.params.token);
  if (!found) return res.status(404).end();
  try { const buf = fs.readFileSync(sigFieldPath(found.a, req.params.fid)); res.set('Content-Type', 'image/png'); res.send(buf); } catch (e) { res.status(404).end(); }
});

app.get('/api/agreements/:id/final', (req, res) => {
  const a = loadAgreements().find(x => x.id === req.params.id);
  if (!a || !a.hasFinal) return res.status(404).end();
  try { const buf = fs.readFileSync(path.join(AGREEMENT_DOC_DIR, 'final_' + a.id + '.pdf')); res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', 'inline; filename="signed-agreement.pdf"'); res.send(buf); } catch (e) { res.status(404).end(); }
});

async function burnFinalPdf(a) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const bytes = fs.readFileSync(path.join(AGREEMENT_DOC_DIR, a.id + '.pdf'));
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  for (const f of (a.pdfFields || [])) {
    const page = pages[f.page]; if (!page) continue;
    const sz = page.getSize(); const pw = sz.width, ph = sz.height;
    const bx = f.x * pw, bw = f.w * pw, bh = f.h * ph, byTop = f.y * ph; const byBottom = ph - (byTop + bh);
    if (f.type === 'signature' || f.type === 'initials') {
      const ip = sigFieldPath(a, f.id);
      if (fs.existsSync(ip)) { try { const png = await pdf.embedPng(fs.readFileSync(ip)); const scl = Math.min(bw / png.width, bh / png.height); const dw = png.width * scl, dh = png.height * scl; page.drawImage(png, { x: bx + (bw - dw) / 2, y: byBottom + (bh - dh) / 2, width: dw, height: dh }); } catch (e) {} }
    } else if (f.type === 'checkbox') {
      const v = (a.fieldValues && a.fieldValues[f.id]); if (v === '1' || v === true || v === 'true') { const s = Math.min(bw, bh); page.drawText('X', { x: bx + Math.max(1, (bw - s * 0.6) / 2), y: byBottom + Math.max(1, (bh - s * 0.72) / 2), size: s * 0.9, font: bold, color: rgb(0.05, 0.09, 0.2) }); }
    } else {
      const v = String((a.fieldValues && a.fieldValues[f.id]) || ''); if (v) { const size = Math.max(7, Math.min(12, bh * 0.62)); page.drawText(v.slice(0, 120), { x: bx + 2, y: byBottom + Math.max(2, (bh - size) / 2), size, font, color: rgb(0.05, 0.09, 0.2) }); }
    }
  }
  const ap = pdf.addPage(); const asz = ap.getSize(); const ah = asz.height; let y = ah - 60;
  ap.drawText('Electronic Signature Certificate', { x: 50, y, size: 16, font: bold, color: rgb(0.05, 0.09, 0.2) });
  ap.drawText('Restaurant Realty Group', { x: 50, y: y - 16, size: 10, font, color: rgb(0.4, 0.45, 0.55) }); y -= 50;
  ap.drawText('Agreement: ' + agreementTypeLabel(a.type), { x: 50, y, size: 11, font: bold }); y -= 24;
  (a.signers || []).forEach(sg => {
    ap.drawText((sg.label || ('Signer ' + sg.order)) + ':  ' + (sg.name || '') + '   <' + (sg.email || '') + '>', { x: 50, y, size: 10, font: bold }); y -= 15;
    ap.drawText('Signed: ' + (sg.signedAt || '-') + '     IP: ' + (sg.ip || '-'), { x: 64, y, size: 9, font, color: rgb(0.4, 0.45, 0.55) }); y -= 24;
  });
  ap.drawText('Each party consented to sign electronically. Drawn signatures are legally binding equivalents of', { x: 50, y: 46, size: 8, font, color: rgb(0.5, 0.55, 0.62) });
  ap.drawText('handwritten signatures under applicable e-signature law.', { x: 50, y: 36, size: 8, font, color: rgb(0.5, 0.55, 0.62) });
  const out = await pdf.save();
  fs.writeFileSync(path.join(AGREEMENT_DOC_DIR, 'final_' + a.id + '.pdf'), Buffer.from(out));
  a.hasFinal = true;
}

function submitAdvancedSign(req, res, all, a, me) {
  if (me.status === 'signed') return res.status(400).json({ ok: false, error: 'You have already signed this document.' });
  const b = req.body || {};
  const values = (b.values && typeof b.values === 'object') ? b.values : {};
  const sigs = (b.sigs && typeof b.sigs === 'object') ? b.sigs : {};
  const myFields = (a.pdfFields || []).filter(f => f.signer === me.order);
  for (const f of myFields) {
    if (f.type === 'signature' || f.type === 'initials') { if (f.required && !sigs[f.id] && !fs.existsSync(sigFieldPath(a, f.id))) return res.status(400).json({ ok: false, error: 'Please complete: ' + (f.label || 'Signature') }); }
    else if (f.type === 'checkbox') {} 
    else { if (f.required && !String(values[f.id] || '').trim()) return res.status(400).json({ ok: false, error: 'Please complete: ' + (f.label || 'a required field') }); }
  }
  a.fieldValues = a.fieldValues || {};
  try { if (!fs.existsSync(AGREEMENT_DOC_DIR)) fs.mkdirSync(AGREEMENT_DOC_DIR, { recursive: true }); } catch (e) {}
  myFields.forEach(f => {
    if (f.type === 'signature' || f.type === 'initials') { const d = String(sigs[f.id] || ''); if (/^data:image\/png;base64,/.test(d)) { try { const buf = Buffer.from(d.replace(/^data:image\/png;base64,/, ''), 'base64'); if (buf.length <= 3 * 1024 * 1024) fs.writeFileSync(sigFieldPath(a, f.id), buf); } catch (e) {} } }
    else if (f.type === 'checkbox') { a.fieldValues[f.id] = values[f.id] ? '1' : ''; }
    else { a.fieldValues[f.id] = String(values[f.id] || '').slice(0, 500); }
  });
  const now = new Date().toISOString(); me.status = 'signed'; me.signedAt = now; me.ip = req.ip;
  const next = a.signers.slice().sort((x, y) => x.order - y.order).find(s => s.status !== 'signed');
  (async () => {
    if (!next) {
      try { await burnFinalPdf(a); } catch (e) { console.error('burnFinalPdf:', e && e.message); }
      a.signStatus = 'signed'; a.signedDate = now.slice(0, 10); a.signedAt = now; a.status = 'active'; a.updatedAt = now; saveAgreements(all);
      if (a.personId) { try { const ppl = loadPeople(); const pp = ppl.find(x => x.id === a.personId); if (pp) { logActivity(pp, 'Agreement Signed', agreementTypeLabel(a.type) + ' fully signed', { auto: true, date: a.signedDate }); savePeople(ppl); } } catch (e) {} }
      try { if (isEmailConfigured() && a.hasFinal) { const fp = path.join(AGREEMENT_DOC_DIR, 'final_' + a.id + '.pdf'); (a.signers || []).map(s => s.email).filter(Boolean).forEach(to => { buildTransport().sendMail({ from: mailFrom(), to, subject: agreementTypeLabel(a.type) + ' - fully signed', text: 'All parties have signed. A copy is attached.', attachments: [{ filename: 'signed-agreement.pdf', path: fp }] }).catch(() => {}); }); } } catch (e) {}
      return res.json({ ok: true, done: true });
    } else {
      if (!next.token) next.token = newSignToken(); next.status = 'sent'; a.signStatus = 'partial'; a.updatedAt = now; saveAgreements(all);
      try { if (isEmailConfigured()) { const url = reqOrigin(req) + '/sign/' + next.token; buildTransport().sendMail({ from: mailFrom(), to: next.email, subject: agreementTypeLabel(a.type) + ' for your signature', text: 'Please review and sign your ' + agreementTypeLabel(a.type) + ' online here:\n' + url + '\n\nThank you,\nRestaurant Realty Group' }).catch(() => {}); } } catch (e) {}
      return res.json({ ok: true, done: false, next: next.label });
    }
  })();
}

function advancedSignPage(a, me, req) {
  const label = agreementTypeLabel(a.type);
  const head = `<div class="kick">Signature Request</div><h1>${esc(label)}</h1><div class="sub">${esc(me.label || ('Signer ' + me.order))}${me.name ? (' &middot; ' + esc(me.name)) : ''} &middot; Provided by Restaurant Realty Group</div>`;
  if (me.status === 'signed') return roomShell(label + ' - Signed', { head, body: `<div class="card"><div style="padding:24px"><b>You have already signed this ${esc(label)}.</b><div style="color:#6b7488;margin-top:8px">Thank you - no further action is needed.</div></div></div>` });
  const body = `<div class="card"><div style="padding:14px 16px"><div id="advmsg" style="color:#6b7488;font-size:13px;margin-bottom:10px">Loading document&hellip;</div><div id="pages"></div>
  <div style="margin-top:16px"><label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:#3a4560"><input type="checkbox" id="agree"> I agree the entries and drawn signatures I provide are legally binding equivalents of my handwritten signature.</label></div>
  <button id="submitBtn" style="width:100%;margin-top:14px;background:#000E31;color:#fff;border:none;border-radius:10px;padding:14px;font:inherit;font-size:15px;font-weight:700;cursor:pointer">Finish &amp; submit</button>
  <div id="err" style="text-align:center;color:#DA2B1F;font-size:13px;margin-top:10px"></div></div></div>
  <div id="sigmodal" style="display:none;position:fixed;inset:0;background:rgba(6,16,41,.55);z-index:99;align-items:center;justify-content:center;padding:14px">
    <div style="background:#fff;border-radius:14px;padding:18px;width:min(460px,94vw)"><div style="font-weight:800;color:#000E31;margin-bottom:8px" id="sigmodaltitle">Draw your signature</div>
    <div style="border:1px solid #cfd6e2;border-radius:9px;overflow:hidden"><canvas id="mpad" style="width:100%;height:180px;touch-action:none;display:block"></canvas></div>
    <div style="display:flex;justify-content:space-between;margin-top:10px"><button id="mclear" style="background:none;border:none;color:#DA2B1F;font-weight:700;cursor:pointer">Clear</button><div><button id="mcancel" style="background:#eef1f6;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;margin-right:6px">Cancel</button><button id="mapply" style="background:#000E31;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer">Apply</button></div></div></div>
  </div>
<style>.fbox{border:1px dashed rgba(38,71,176,.55);background:rgba(38,71,176,.06);border-radius:3px;font-size:11px;color:#2647b0;display:flex;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box}.fbox.mine{border-color:#DA2B1F;background:rgba(218,43,31,.08);color:#DA2B1F;cursor:pointer}.fbox.locked{border-style:solid;border-color:#1f8a5b;background:rgba(31,138,91,.07);color:#14603f}.fbox.other{opacity:.45}.fbox input{outline:none}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
(function(){
  var TOKEN=${JSON.stringify(me.token)};
  if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var DATA=null, SIGS={}, VALS={}, curField=null;
  var mpad=document.getElementById('mpad'), mctx=mpad.getContext('2d'), mdirty=false, mdraw=false, mlast=null;
  function fitpad(){var r=mpad.getBoundingClientRect();mpad.width=r.width*2;mpad.height=r.height*2;mctx.scale(2,2);mctx.lineWidth=2.2;mctx.lineCap='round';mctx.strokeStyle='#0b1a3a';}
  function mpos(e){var r=mpad.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
  mpad.addEventListener('mousedown',function(e){mdraw=true;mlast=mpos(e);e.preventDefault();});
  mpad.addEventListener('mousemove',function(e){if(!mdraw)return;var q=mpos(e);mctx.beginPath();mctx.moveTo(mlast.x,mlast.y);mctx.lineTo(q.x,q.y);mctx.stroke();mlast=q;mdirty=true;e.preventDefault();});
  window.addEventListener('mouseup',function(){mdraw=false;});
  mpad.addEventListener('touchstart',function(e){mdraw=true;mlast=mpos(e);e.preventDefault();},{passive:false});
  mpad.addEventListener('touchmove',function(e){if(!mdraw)return;var q=mpos(e);mctx.beginPath();mctx.moveTo(mlast.x,mlast.y);mctx.lineTo(q.x,q.y);mctx.stroke();mlast=q;mdirty=true;e.preventDefault();},{passive:false});
  document.getElementById('mclear').onclick=function(){mctx.clearRect(0,0,mpad.width,mpad.height);mdirty=false;};
  document.getElementById('mcancel').onclick=function(){document.getElementById('sigmodal').style.display='none';};
  document.getElementById('mapply').onclick=function(){ if(!mdirty){document.getElementById('sigmodal').style.display='none';return;} SIGS[curField.id]=mpad.toDataURL('image/png'); document.getElementById('sigmodal').style.display='none'; renderField(curField); };
  function openPad(f){ curField=f; document.getElementById('sigmodaltitle').textContent=(f.type==='initials'?'Draw your initials':'Draw your signature'); document.getElementById('sigmodal').style.display='flex'; setTimeout(function(){fitpad();mctx.clearRect(0,0,mpad.width,mpad.height);mdirty=false;},30); }

  function renderField(f){
    var box=document.querySelector('[data-fid="'+f.id+'"]'); if(!box) return;
    box.innerHTML=''; box.className='fbox';
    if(f.locked){ box.classList.add('locked'); if(f.type==='signature'||f.type==='initials'){ var im=document.createElement('img'); im.src='/sign/'+encodeURIComponent(TOKEN)+'/fieldimg/'+encodeURIComponent(f.id); im.style.maxWidth='100%'; im.style.maxHeight='100%'; box.appendChild(im); } else if(f.type==='checkbox'){ box.textContent=f.value?'X':''; } else { box.textContent=f.value||''; } return; }
    if(!f.mine){ box.classList.add('other'); box.textContent=(f.type==='signature'||f.type==='initials')?'Signature':(f.label||''); return; }
    box.classList.add('mine');
    if(f.type==='signature'||f.type==='initials'){ if(SIGS[f.id]){ var im2=document.createElement('img'); im2.src=SIGS[f.id]; im2.style.maxWidth='100%'; im2.style.maxHeight='100%'; box.appendChild(im2); } else { box.textContent=(f.type==='initials'?'Initial':'Sign here'); } box.onclick=function(){openPad(f);}; }
    else if(f.type==='checkbox'){ var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!VALS[f.id]; cb.style.margin='0'; cb.onchange=function(){VALS[f.id]=cb.checked?'1':'';}; box.style.cursor='default'; box.appendChild(cb); }
    else { var inp=document.createElement('input'); inp.type=(f.type==='date'?'date':'text'); inp.value=(VALS[f.id]!=null?VALS[f.id]:(f.value||'')); VALS[f.id]=inp.value; inp.style.width='100%'; inp.style.height='100%'; inp.style.border='none'; inp.style.background='transparent'; inp.style.font='inherit'; inp.style.fontSize='12px'; inp.style.padding='0 3px'; inp.style.color='#0b1a3a'; box.style.cursor='text'; inp.oninput=function(){VALS[f.id]=inp.value;}; box.appendChild(inp); }
  }

  function renderPdf(){
    var pagesEl=document.getElementById('pages'); pagesEl.innerHTML='';
    fetch('/sign/'+encodeURIComponent(TOKEN)+'/doc',{credentials:'same-origin'}).then(function(r){return r.arrayBuffer();}).then(function(buf){
      return pdfjsLib.getDocument({data:buf}).promise;
    }).then(function(pdf){
      var chain=Promise.resolve();
      for(var i=1;i<=pdf.numPages;i++){(function(pn){ chain=chain.then(function(){ return pdf.getPage(pn).then(function(page){
        var vp1=page.getViewport({scale:1}); var targetW=Math.min(760,(pagesEl.clientWidth||760)); var scale=targetW/vp1.width; var vp=page.getViewport({scale:scale});
        var wrap=document.createElement('div'); wrap.style.position='relative'; wrap.style.margin='0 auto 16px'; wrap.style.width=vp.width+'px'; wrap.style.height=vp.height+'px'; wrap.style.boxShadow='0 2px 12px rgba(10,20,50,.14)';
        var cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height; wrap.appendChild(cv);
        var ov=document.createElement('div'); ov.style.position='absolute'; ov.style.left='0'; ov.style.top='0'; ov.style.right='0'; ov.style.bottom='0'; wrap.appendChild(ov);
        pagesEl.appendChild(wrap);
        (DATA.fields||[]).filter(function(f){return f.page===(pn-1);}).forEach(function(f){
          var el=document.createElement('div'); el.setAttribute('data-fid',f.id); el.className='fbox';
          el.style.position='absolute'; el.style.left=(f.x*vp.width)+'px'; el.style.top=(f.y*vp.height)+'px'; el.style.width=(f.w*vp.width)+'px'; el.style.height=(f.h*vp.height)+'px';
          ov.appendChild(el); renderField(f);
        });
        return page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      }); }); })(i); }
      return chain;
    }).catch(function(){ document.getElementById('advmsg').textContent='Could not load the document.'; });
  }

  fetch('/api/sign/'+encodeURIComponent(TOKEN)+'/data',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
    if(!j||!j.ok){document.getElementById('advmsg').textContent='This link is no longer valid.';return;}
    DATA=j; document.getElementById('advmsg').textContent=j.notes||'Fill your fields, draw your signature, then submit.';
    renderPdf();
  }).catch(function(){document.getElementById('advmsg').textContent='Could not reach the server.';});

  document.getElementById('submitBtn').onclick=function(){
    var err=document.getElementById('err'); err.textContent='';
    if(!document.getElementById('agree').checked){err.textContent='Please check the agreement box.';return;}
    var miss=null;
    (DATA.fields||[]).filter(function(f){return f.mine&&f.required;}).forEach(function(f){
      if(f.type==='signature'||f.type==='initials'){ if(!SIGS[f.id]) miss=miss||(f.label||'Signature'); }
      else if(f.type==='checkbox'){} else { if(!String(VALS[f.id]||'').trim()) miss=miss||(f.label||'a field'); }
    });
    if(miss){err.textContent='Please complete: '+miss;return;}
    var btn=document.getElementById('submitBtn'); btn.disabled=true; btn.textContent='Submitting...';
    fetch('/api/sign/'+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:VALS,sigs:SIGS})}).then(function(r){return r.json();}).then(function(j){
      if(j&&j.ok){ var done=j.done; document.querySelector('.wrap').innerHTML='<div class="card"><div style="padding:26px;text-align:center"><div style="font-size:40px">&#10003;</div><b style="font-size:17px;color:#000E31">Signed - thank you.</b><div style="color:#6b7488;margin-top:8px">'+(done?'All parties have signed. A copy has been recorded.':'Your part is complete. We have sent it to the next signer.')+'</div></div></div>'; window.scrollTo(0,0); }
      else { btn.disabled=false; btn.textContent='Finish & submit'; err.textContent=(j&&j.error)||'Could not submit.'; }
    }).catch(function(){ btn.disabled=false; btn.textContent='Finish & submit'; err.textContent='Could not reach the server.'; });
  };
})();
</script>`;
  return roomShell(label + ' - Signature', { head, body });
}

// ==== Roles & permissions (admin-managed; enforced only when the master switch is ON) ====
const PERM_CORE = [
  { key: 'see_all', cat: 'Records', label: 'See all records', note: 'Off = only records they own' },
  { key: 'edit_all', cat: 'Records', label: "Edit others' records" },
  { key: 'delete', cat: 'Records', label: 'Delete records', note: 'Companies, contacts & other records' },
  { key: 'reassign', cat: 'Records', label: 'Reassign ownership' },
  { key: 'export_data', cat: 'Records', label: 'Export & print lists', note: 'Off = cannot download CSV or print lists' },
  { key: 'manage_loi', cat: 'LOI', label: 'Manage LOI clause library' },
  { key: 'use_ai', cat: 'AI', label: 'Use AI features', note: 'Space & LOI AI, call-prep, RRG Brief, enrichment' },
  { key: 'admin_console', cat: 'Admin', label: 'Open admin console / settings' },
  { key: 'manage_users', cat: 'Admin', label: 'Manage users & roles' },
  { key: 'manage_templates', cat: 'Admin', label: 'Manage agreement templates' },
  { key: 'data_reset', cat: 'Admin', label: 'Reset / back up data' },
];
const GATEABLE_TOOLS = [
  { file: 'rrg_companies.html', name: 'Companies', cat: 'CRM & Records' },
  { file: 'rrg_people.html', name: 'Contacts', cat: 'CRM & Records' },
  { file: 'rrg_assignments.html', name: 'Listings', cat: 'CRM & Records' },
  { file: 'rrg_deals.html', name: 'Deals', cat: 'CRM & Records' },
  { file: 'rrg_tasks.html', name: 'Tasks', cat: 'CRM & Records' },
  { file: 'rrg_agreements.html', name: 'Agreements', cat: 'CRM & Records' },
  { file: 'rrg_tickets.html', name: 'Requests', cat: 'CRM & Records' },
  { file: 'rrg_screening_queue.html', name: 'Seller Qualification Calls', cat: 'Sell-Side' },
  { file: 'rrg_questionnaire_queue.html', name: 'Valuation Questionnaires', cat: 'Sell-Side' },
  { file: 'rrg_bov_queue.html', name: 'Business Valuations', cat: 'Sell-Side' },
  { file: 'rrg_rooms_queue.html', name: 'Data Rooms', cat: 'Sell-Side' },
  { file: 'rrg_cim_queue.html', name: 'Marketing Packs', cat: 'Sell-Side' },
  { file: 'rrg_attack_queue.html', name: 'Market Attack Plans', cat: 'Sell-Side' },
  { file: 'rrg_loi_builder.html', name: 'LOI Builder', cat: 'Tenant Rep' },
  { file: 'ssc_form.html', name: 'Site Selection Criteria', cat: 'Tenant Rep' },
  { file: 'rrg_site_fit.html', name: 'Site & Concept Fit', cat: 'Tenant Rep' },
  { file: 'rrg_tour_tracker.html', name: 'Tour Tracker', cat: 'Tenant Rep' },
  { file: 'rrg_lease_queue.html', name: 'Lease Abstracts', cat: 'Tenant Rep' },
  { file: 'rrg_tenant_attack_plan.html', name: 'Market Attack Plan (Tenant)', cat: 'Tenant Rep' },
];
function toolPermKey(file) { return 'tool:' + file; }
const ALL_PERM_KEYS = PERM_CORE.map(p => p.key).concat(GATEABLE_TOOLS.map(t => toolPermKey(t.file)));
function allPerms() { const p = {}; ALL_PERM_KEYS.forEach(k => p[k] = true); return p; }
function defaultRolePerms(kind) {
  const p = {};
  GATEABLE_TOOLS.forEach(t => p[toolPermKey(t.file)] = true); // both defaults get all tools
  p.use_ai = true; // AI on by default for standard roles
  if (kind === 'senior') { ['see_all', 'edit_all', 'delete', 'reassign', 'export_data'].forEach(k => p[k] = true); }
  return p; // associate: core all off, tools on
}
function loadRoles() {
  const s = loadSettings();
  if (Array.isArray(s.roles) && s.roles.length) {
    let roles = s.roles.map(r => ({ key: String(r.key || ''), name: String(r.name || ''), builtin: !!r.builtin, perms: (r.perms && typeof r.perms === 'object') ? r.perms : {} })).filter(r => r.key && r.name);
    if (!roles.some(r => r.key === 'admin')) roles.unshift({ key: 'admin', name: 'Admin', builtin: true, perms: {} });
    if (!roles.some(r => r.key === 'creator')) roles.unshift({ key: 'creator', name: 'Creator (Master)', builtin: true, perms: {} });
    roles = roles.map(r => (r.key === 'admin' || r.key === 'creator') ? Object.assign({}, r, { perms: allPerms() }) : r);
    return roles;
  }
  return [
    { key: 'creator', name: 'Creator (Master)', builtin: true, perms: allPerms() },
    { key: 'admin', name: 'Admin', builtin: true, perms: allPerms() },
    { key: 'senior', name: 'Senior Associate', builtin: true, perms: defaultRolePerms('senior') },
    { key: 'associate', name: 'Associate', builtin: true, perms: defaultRolePerms('associate') },
  ];
}
function saveRoles(roles) { const s = loadSettings(); s.roles = roles; saveSettings(s); }
function permsEnabled() { return !!loadSettings().permsEnabled; }
function effectivePerms(user) {
  const out = {};
  const roles = loadRoles();
  const rkey = (user && user.role) || 'associate';
  let rd = roles.find(r => r.key === rkey) || roles.find(r => r.key === 'associate') || { perms: {} };
  const base = rd.perms || {};
  const ov = (user && user.perms && typeof user.perms === 'object') ? user.perms : {};
  ALL_PERM_KEYS.forEach(k => { out[k] = (k in ov) ? !!ov[k] : !!base[k]; });
  return out;
}
// Dormant while the master switch is OFF (returns true for everything). Wired into gates in Stage 2.
function userCan(user, key) {
  if (!permsEnabled()) return true;
  if (user && isSuper(user)) return true;
  return !!effectivePerms(user)[key];
}
function permOwnerMatch(req, owner) { if (!owner) return true; const u = req.user || {}; return owner === u.name || owner === u.username; }
function restrictToOwn(req) { if (!permsEnabled()) return false; if (req.user && isSuper(req.user)) return false; return !effectivePerms(req.user).see_all; }
function canSeeAllDeals(req) { if (req.user && isSuper(req.user)) return true; return permsEnabled() && !!effectivePerms(req.user).see_all; }

app.get('/api/admin/permissions', requireAdmin, (req, res) => {
  res.json({
    ok: true, enabled: permsEnabled(), core: PERM_CORE, tools: GATEABLE_TOOLS, roles: loadRoles(),
    users: auth.loadUsers().map(u => ({ username: u.username, name: u.name || u.username, role: u.role || 'associate', perms: (u.perms && typeof u.perms === 'object') ? u.perms : {}, commissionSplit: u.commissionSplit || '', disabled: !!u.disabled })),
  });
});
app.post('/api/admin/permissions/toggle', requireAdmin, express.json(), (req, res) => {
  const s = loadSettings(); s.permsEnabled = !!(req.body || {}).enabled; saveSettings(s);
  res.json({ ok: true, enabled: s.permsEnabled });
});
app.post('/api/admin/roles', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'Name the role.' });
  let roles = loadRoles();
  let key = String(b.key || '').trim();
  if (!key) { key = 'role_' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || Math.random().toString(36).slice(2, 7)); }
  const perms = (b.perms && typeof b.perms === 'object') ? b.perms : {};
  const clean = {}; ALL_PERM_KEYS.forEach(k => clean[k] = !!perms[k]);
  const existing = roles.find(x => x.key === key);
  if (existing) { if (existing.key !== 'admin') { existing.name = name.slice(0, 60); existing.perms = clean; } }
  else { roles.push({ key: key, name: name.slice(0, 60), builtin: false, perms: clean }); }
  roles = roles.map(x => x.key === 'admin' ? Object.assign({}, x, { perms: allPerms() }) : x);
  saveRoles(roles);
  res.json({ ok: true, roles: loadRoles() });
});
app.post('/api/admin/roles/delete', requireAdmin, express.json(), (req, res) => {
  const key = String((req.body || {}).key || '');
  const roles = loadRoles();
  const r = roles.find(x => x.key === key);
  if (!r) return res.status(404).json({ ok: false, error: 'Role not found.' });
  if (r.builtin) return res.status(400).json({ ok: false, error: 'Built-in roles cannot be deleted.' });
  try { auth.loadUsers().forEach(u => { if (u.role === key) { try { auth.setUserAccess(u.username, { role: 'associate' }); } catch (e) {} } }); } catch (e) {}
  saveRoles(roles.filter(x => x.key !== key));
  res.json({ ok: true, roles: loadRoles() });
});
app.post('/api/admin/user-access', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {};
  try { const prof = auth.setUserAccess(b.username, { role: b.role, perms: b.perms, commissionSplit: b.commissionSplit }); res.json({ ok: true, user: { username: prof.username, name: prof.name, role: prof.role, perms: prof.perms } }); }
  catch (e) { res.status(400).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/reassign', requireAdmin, express.json(), (req, res) => {
  const from = String((req.body || {}).from || ''), to = String((req.body || {}).to || '');
  if (!from || !to) return res.status(400).json({ ok: false, error: 'Pick both reps.' });
  if (from === to) return res.status(400).json({ ok: false, error: 'Pick two different reps.' });
  const fromU = auth.findUser(from), toU = auth.findUser(to);
  const fromKeys = [from]; if (fromU) { if (fromU.name) fromKeys.push(fromU.name); if (fromU.username) fromKeys.push(fromU.username); }
  const toName = (toU && toU.name) || to;
  let people = 0, companies = 0;
  try { const ppl = loadPeople(); ppl.forEach(p => { if (fromKeys.indexOf(p.by || '') >= 0) { p.by = toName; p.byUser = (toU && toU.username) || p.byUser; people++; } }); if (people) savePeople(ppl); } catch (e) {}
  try { const cos = loadCompanies(); cos.forEach(c => { if (fromKeys.indexOf(c.owner || c.by || '') >= 0) { c.owner = toName; companies++; } }); if (companies) saveCompanies(cos); } catch (e) {}
  res.json({ ok: true, people, companies });
});
app.get('/api/permissions/me', (req, res) => {
  res.json({ ok: true, enabled: permsEnabled(), role: (req.user && req.user.role) || '', perms: effectivePerms(req.user || {}) });
});

// ---- Task reminders: due-list (for pop-ups) + background email sender ----
app.get('/api/reminders/due', (req, res) => {
  const meU = req.user && req.user.username;
  const nowIso = new Date().toISOString().slice(0, 16);
  const due = loadTasks().filter(t => t.status !== 'done' && t.reminder && taskChannels(t).indexOf('popup') >= 0 && String(t.reminder).slice(0, 16) <= nowIso && (t.assignee === meU || t.createdBy === meU))
    .map(t => ({ id: t.id, title: t.title, due: t.due || '', linkLabel: t.linkLabel || '', reminder: t.reminder }));
  res.json({ ok: true, reminders: due });
});
function runReminderSender() {
  try {
    if (!isEmailConfigured()) return;
    const nowIso = new Date().toISOString().slice(0, 16);
    const all = loadTasks(); let changed = false; const users = auth.loadUsers();
    all.forEach(t => {
      if (t.status !== 'done' && t.reminder && !t.remSent && String(t.reminder).slice(0, 16) <= nowIso) {
        const ch = taskChannels(t);
        const u = users.find(x => x.username === (t.assignee || t.createdBy));
        const to = u && u.email;
        if (ch.indexOf('email') >= 0 && to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          const link = (process.env.APP_URL || '') + '/rrg_tasks.html';
          buildTransport().sendMail({ from: mailFrom(), to, subject: 'Reminder: ' + t.title, text: 'Task reminder from Restaurant Realty Group:\n\n' + t.title + (t.due ? ('\nDue: ' + t.due) : '') + (t.linkLabel ? ('\nRe: ' + t.linkLabel) : '') + '\n\nYour tasks: ' + link }).catch(() => {});
        }
        if (ch.indexOf('sms') >= 0 && isSmsConfigured() && u && u.phone) { sendSms(u.phone, 'Reminder: ' + t.title + (t.due ? (' (due ' + t.due + ')') : '')).catch(() => {}); }
        t.remSent = true; changed = true;
      }
    });
    if (changed) saveTasks(all);
  } catch (e) { console.error('reminder sender:', e && e.message); }
}
setInterval(runReminderSender, 60000);

// ---- SMS (Twilio) config + sender ----
const SMS_CFG_FILE = path.join(BOV_DATA_DIR, 'sms.key');
function rawSmsCfg() { try { return JSON.parse(fs.readFileSync(SMS_CFG_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function loadSmsConfig() { const c = rawSmsCfg(); return { sid: c.sid || process.env.TWILIO_SID || '', token: (c.token != null && c.token !== '') ? c.token : (process.env.TWILIO_TOKEN || ''), from: c.from || process.env.TWILIO_FROM || '', enabled: c.enabled != null ? !!c.enabled : true }; }
function saveSmsConfig(c) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(SMS_CFG_FILE, JSON.stringify(c, null, 2)); } catch (e) {} }
function isSmsConfigured() { const c = loadSmsConfig(); return !!(c.enabled && c.sid && c.token && c.from); }
function formatE164(p) { const raw = String(p || '').trim(); let d = raw.replace(/[^0-9]/g, ''); if (!d) return ''; if (raw[0] === '+') return '+' + d; if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return d.length >= 10 ? '+' + d : ''; }
async function sendSms(to, body) {
  const c = loadSmsConfig();
  if (!(c.enabled && c.sid && c.token && c.from)) throw new Error('SMS is not configured.');
  const num = formatE164(to); if (!num) throw new Error('Invalid phone number.');
  const url = 'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(c.sid) + '/Messages.json';
  const params = new URLSearchParams(); params.append('To', num); params.append('From', c.from); params.append('Body', String(body || '').slice(0, 1500));
  const authb = Buffer.from(c.sid + ':' + c.token).toString('base64');
  const r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Basic ' + authb, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.message) || ('Twilio error ' + r.status));
  return j;
}
app.get('/api/admin/sms', requireAdmin, (req, res) => { const c = loadSmsConfig(); res.json({ ok: true, sid: c.sid, from: c.from, enabled: c.enabled, hasToken: !!c.token, configured: isSmsConfigured() }); });
app.post('/api/admin/sms', requireAdmin, express.json(), (req, res) => {
  const b = req.body || {}; const cur = rawSmsCfg();
  const c = { sid: typeof b.sid === 'string' ? b.sid.trim().slice(0, 120) : (cur.sid || ''), from: typeof b.from === 'string' ? b.from.trim().slice(0, 40) : (cur.from || ''), enabled: b.enabled != null ? !!b.enabled : (cur.enabled != null ? cur.enabled : true), token: cur.token || '' };
  if (typeof b.token === 'string' && b.token !== '') c.token = b.token;
  if (b.clearToken) c.token = '';
  saveSmsConfig(c); res.json({ ok: true, configured: isSmsConfigured() });
});
app.post('/api/admin/sms/test', requireAdmin, express.json(), async (req, res) => {
  const to = String((req.body && req.body.to) || '').trim();
  if (!to) return res.status(400).json({ ok: false, error: 'Enter a destination mobile number.' });
  if (!isSmsConfigured()) return res.status(400).json({ ok: false, error: 'Save your SMS settings first (SID, token, from — enabled on).' });
  try { await sendSms(to, 'RRG toolkit test text — if you got this, SMS is working.'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});
function taskChannels(t) { if (Array.isArray(t.remChannels)) return t.remChannels; if (t.remChannel === 'email') return ['email']; if (t.remChannel === 'popup') return ['popup']; return ['popup', 'email']; }

// ================= LOI Builder (tenant-rep + business-sale letters of intent) =================
function newLoiClauseId() { return 'loic_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const LOI_TYPES = [ { key: 'tenant_rep', name: 'Tenant Rep (Lease)' }, { key: 'business_sale', name: 'Business Sale' } ];
const LOI_NEGO_STATUSES = ['Draft', 'Sent', 'Countered', 'Negotiating', 'Accepted', 'Dead'];
const LOI_TR_DEFAULTS = { term: '10', free_rent: '90', renewal_count: '2', renewal_years: '5', expiration: '14', pg_years: '', pg_burnoff: '', pg_rolling: '', pg_burnoff_years: '' };
const LOI_VENUES = ['Restaurant', 'Bar', 'Dance Hall'];
const LOI_CLAUSE_VENUES = { c_bar:['Bar'], c_indoormusic:['Bar','Dance Hall'], c_outdoormusic:['Bar','Dance Hall'], c_entertainment:['Dance Hall'], c_assembly:['Dance Hall'], c_sound:['Bar','Dance Hall'], c_security:['Bar','Dance Hall'], c_afterhours:['Bar','Dance Hall'], c_patio:['Restaurant','Bar'], c_grease:['Restaurant'], c_hvac:['Restaurant'], c_drivethru:['Restaurant'], c_walkin:['Restaurant'], c_deliverycond:['Restaurant'], c_delivery:['Restaurant'], c_utilcap:['Restaurant'], c_trash:['Restaurant'] };
const LOI_TERM_STATES = ['Open', 'Proposed', 'Accepted', 'Countered', 'Rejected'];

const EXTRA_TR_CLAUSES = [
  { id: 'c_ti', title: "Tenant Improvement Allowance", body: "Landlord shall provide a tenant improvement allowance of {{ti_allowance}} toward Tenant's build-out, payable within thirty (30) days after completion and delivery of lien waivers, or in the alternative deliver the Premises turnkey per Tenant's approved plans. Any unused allowance may be applied to rent." },
  { id: 'c_freerent', title: "Free Rent / Rent Abatement", body: "Base rent and additional rent shall be fully abated for the first {{free_rent_months}} months following the Commencement Date to allow for Tenant's build-out and grand opening, in addition to any early-access/fixturing period." },
  { id: 'c_pctrent', title: "Percentage Rent", body: "If the parties agree to percentage rent, it shall equal {{pct_rent}}% of gross sales above a natural breakpoint (annual base rent divided by the percentage), with no percentage rent due below the breakpoint and customary exclusions from gross sales (sales taxes, employee comps, third-party delivery fees, and gift-card sales until redeemed)." },
  { id: 'c_goodguy', title: "Good-Guy / Limited Guaranty", body: "Any personal guaranty shall be a good-guy guaranty only, limited to rent accruing through the date Tenant surrenders the Premises broom-clean with keys, and shall burn off in full after {{guaranty_years}} years of the Term provided no default is then continuing." },
  { id: 'c_kickout', title: "Kick-Out / Sales Threshold", body: "If Tenant's gross sales do not exceed {{kickout_sales}} in any consecutive twelve-month period after the third Lease year, Tenant may terminate on ninety (90) days' notice, subject to Landlord's right to keep the lease in force by waiving the shortfall for that period." },
  { id: 'c_deliverycond', title: "Delivery Condition / Second-Generation", body: "Landlord shall deliver the Premises in {{delivery_condition}} condition. Where the Premises is a former restaurant (second-generation), all existing kitchen infrastructure, hood, grease trap, walk-in(s), and FF&E shall convey with the Premises in working order at no additional cost to Tenant." },
  { id: 'c_walkin', title: "Walk-In Cooler & Freezer", body: "Tenant shall have the right to install and operate walk-in cooler(s) and freezer(s), including exterior condensing units in a Landlord-approved location; where existing walk-ins are present they shall convey in working order at no additional cost." },
  { id: 'c_assembly', title: "Assembly Occupancy / Fire & Life Safety", body: "Landlord shall deliver the Premises suitable for the Assembly occupancy classification required by Tenant's use, including a code-compliant fire sprinkler and alarm system for the intended occupant load. Any life-safety work required as a condition of the assembly occupancy at delivery shall be Landlord's responsibility and expense." },
  { id: 'c_sound', title: "Sound Attenuation / Noise", body: "Landlord shall deliver, or provide an allowance for, commercially reasonable sound attenuation for the Premises. Tenant's amplified sound shall comply with the applicable municipal noise ordinance; neither Landlord nor any association shall impose sound limits stricter than that ordinance, and any noise complaints shall be routed to Tenant for good-faith resolution." },
  { id: 'c_entertainment', title: "Live Entertainment & Dance Floor", body: "The Permitted Use includes operation as a bar and live-entertainment/dance venue, including a stage, DJ booth, and dance floor. Landlord represents the Premises may be so used under applicable zoning and shall reasonably cooperate with Tenant in obtaining any dance-hall, entertainment, or cabaret permits required." },
  { id: 'c_security', title: "Security & Crowd Control", body: "Tenant may staff licensed security personnel, operate video surveillance, and conduct ID verification consistent with responsible late-night operation. Landlord shall not restrict such measures and shall reasonably cooperate on shared-area security, lighting, and camera placement." },
  { id: 'c_afterhours', title: "After-Hours Access", body: "Tenant, its staff, and its vendors shall have 24-hour access to the Premises and to the common areas reasonably necessary to serve the Premises for late-night operation, deliveries, cleaning, and maintenance, at no additional charge." },
];
function defaultLoiConfig() {
  return {
    tenant_rep: {
      name: 'Tenant Rep (Lease)',
      top: `{{date}}

{{landlord}}
RE: Letter of Intent to Lease - {{property}}

Dear {{landlord}}:

On behalf of {{tenant}} ("Tenant"), Restaurant Realty Group, LLC submits this non-binding Letter of Intent setting forth the principal terms under which Tenant would lease space at {{property}}. This letter is intended solely to facilitate negotiation of a definitive lease and creates no binding obligation on either party except as expressly stated below.`,
      bottom: `Non-Binding. This Letter of Intent is a non-binding expression of interest only. No party is bound unless and until a definitive lease is executed by both parties, and either party may withdraw at any time prior to such execution.

Confidentiality. The parties shall keep the terms of this Letter of Intent confidential and shall not disclose them to any third party except their respective attorneys, accountants, and advisors.

Governing Law. This Letter of Intent shall be governed by the laws of the State of Texas.

Expiration. This Letter of Intent shall expire if not accepted in writing within {{expiration}} days of the date above.

Accepted and Agreed:

TENANT: {{tenant}}

By: ______________________________   Date: __________

LANDLORD: {{landlord}}

By: ______________________________   Date: __________

Broker: {{rep}}, Restaurant Realty Group, LLC`,
      info: [
        { key: 'date', label: 'Date' },
        { key: 'tenant', label: 'Tenant (entity)', type: 'party' },
        { key: 'landlord', label: 'Landlord', type: 'party' },
        { key: 'property', label: 'Property / building address' },
        { key: 'rep', label: 'RRG rep' }
      ],
      terms: [
        { key: 'premises', label: 'Premises / Suite' },
        { key: 'rsf', label: 'Rentable Square Feet', type: 'number', unit: 'SF', comma: true },
        { key: 'use', label: 'Permitted Use' },
        { key: 'term', label: 'Lease Term', type: 'number', unit: 'years' },
        { key: 'options', label: 'Renewal Options', type: 'renewal' },
        { key: 'commencement', label: 'Commencement / Delivery', type: 'number', unit: 'days' },
        { key: 'rent_structure', label: 'Rent Structure', type: 'select', options: ['NNN (Triple Net)', 'Modified Gross', 'Full-Service Gross', 'Industrial Gross', 'Absolute Net', 'Percentage Rent'] },
        { key: 'base_rent', label: 'Base Rent ($/SF/yr)' },
        { key: 'escalations', label: 'Annual Escalations', type: 'escalation' },
        { key: 'free_rent', label: 'Free Rent / Abatement', type: 'number', unit: 'days' },
        { key: 'ti', label: 'TI Allowance', type: 'number', prefix: '$', unit: '/SF' },
        { key: 'delivery_condition', label: 'Delivery Condition', type: 'select', options: ['Warm shell', 'Cold / dark shell', 'Vanilla box', 'As-is', 'Turnkey (Landlord build-out)', 'Second-generation restaurant (as-is)'] },
        { key: 'security', label: 'Security Deposit' },
        { key: 'guaranty', label: 'Personal Guaranty', type: 'guaranty' },
        { key: 'expiration', label: 'LOI Expiration', type: 'number', unit: 'days' }
      ],
      clauses: [
        { id: 'c_patio', order: 0, title: 'Patio / Outdoor Seating', body: `Tenant shall have the exclusive right to use the outdoor/patio area adjacent to the Premises for seating and service at no additional base rent. Landlord shall deliver the patio area in a condition suitable for restaurant use, including any required railings, drainage, and utility connections, and shall reasonably cooperate with Tenant in obtaining any municipal permits required for outdoor service.` },
        { id: 'c_parking', order: 1, title: 'Parking', body: `Landlord shall provide not fewer than {{parking_spaces}} parking spaces for the non-exclusive use of Tenant, its employees, and its patrons at no additional charge, and shall maintain the parking area, lighting, and access drives in good condition throughout the Term.` },
        { id: 'c_bar', order: 2, title: 'Bar Service / TABC Liquor', body: `The Permitted Use shall include the sale and on-premises consumption of alcoholic beverages. Landlord represents that the Premises may be used for such purpose under applicable zoning and that no deed restriction, covenant, or other tenant exclusive prohibits the sale of alcohol at the Premises. Tenant's obligations are contingent upon Tenant obtaining all required TABC permits.` },
        { id: 'c_grease', order: 3, title: 'Grease Trap, Hood & Venting', body: `Landlord shall deliver the Premises with an adequately sized grease trap/interceptor and a code-compliant kitchen exhaust hood, make-up air, and roof-penetration venting suitable for a full-service restaurant, or shall provide a corresponding allowance for Tenant to install same, and shall permit Tenant to install and maintain rooftop and exterior equipment as reasonably required.` },
        { id: 'c_signage', order: 4, title: 'Signage', body: `Tenant shall have the right to install building, storefront, and, where available, pylon/monument signage identifying Tenant's business, subject to Landlord's reasonable approval and applicable codes. Landlord shall provide Tenant its proportionate share of any multi-tenant pylon or monument sign.` },
        { id: 'c_hours', order: 5, title: 'Hours of Operation', body: `Tenant shall have the right to operate during such days and hours as Tenant determines appropriate for its concept, including late-night and weekend hours, subject only to applicable law. No lease provision or association rule shall restrict Tenant's operating hours.` },
        { id: 'c_hvac', order: 6, title: 'HVAC Responsibility', body: `Landlord shall deliver the HVAC system serving the Premises in good working order and shall warrant the same for not less than one (1) year following the Commencement Date. Thereafter Tenant shall maintain the HVAC under a service contract, provided that replacement of any major component shall remain Landlord's responsibility.` },
        { id: 'c_excl', order: 7, title: 'Exclusive Use / Radius', body: `During the Term, Landlord shall not lease or permit the use of any other space in the property, or any adjacent property owned by Landlord, to a business whose primary use is {{exclusive_use}}. This exclusive shall run with the Premises and inure to the benefit of Tenant and its successors and assigns.` },
        { id: 'c_coten', order: 8, title: 'Co-Tenancy', body: `Tenant's obligation to open and to pay full base rent shall be conditioned upon the property maintaining occupancy of not less than {{cotenancy_pct}}% of leasable area and continued operation of the anchor tenant(s). If the co-tenancy condition is not satisfied, Tenant shall be entitled to reduced (alternative) rent and, if the failure continues, the right to terminate.` },
        { id: 'c_assign', order: 9, title: 'Assignment & Subletting', body: `Tenant shall have the right to assign the lease or sublet the Premises to an affiliate, franchisee, or in connection with the sale of substantially all of Tenant's business without Landlord's consent, and otherwise with Landlord's consent, not to be unreasonably withheld, conditioned, or delayed.` },
        { id: 'c_snda', order: 10, title: 'SNDA / Non-Subordination', body: `The lease shall not be subordinate to any current or future mortgage unless the holder delivers to Tenant a commercially reasonable Subordination, Non-Disturbance and Attornment Agreement recognizing Tenant's rights under the lease so long as Tenant is not in default.` },
        { id: 'c_ada', order: 11, title: 'ADA & Compliance', body: `Landlord shall deliver the Premises and all common areas in compliance with all applicable laws, including the Americans with Disabilities Act, and free of hazardous materials. Any compliance work required as of delivery that is not the result of Tenant's specific improvements shall be Landlord's responsibility and expense.` },
        { id: 'c_delay', order: 12, title: 'Delivery Delay / Outside Date', body: `If Landlord is unable to deliver the Premises in the required condition by the target delivery date, base rent and the rent commencement date shall be postponed day-for-day, and if delivery is delayed beyond {{outside_date}}, Tenant may terminate this transaction without penalty.` },
        { id: 'c_indoormusic', order: 13, title: 'Amplified & Live Music (Interior)', body: `Tenant may play recorded, amplified, and live music inside the Premises during operating hours. No lease provision or association rule shall restrict interior sound levels or entertainment except as required by applicable law.` },
        { id: 'c_outdoormusic', order: 14, title: 'Outdoor Music & Entertainment', body: `Tenant may provide recorded, amplified, and live music and entertainment on the patio/outdoor area during operating hours, subject only to the applicable municipal noise ordinance; Landlord shall not impose sound limits stricter than the applicable code.` },
        { id: 'c_staffparking', order: 15, title: 'Employee / Staff Parking', body: `Landlord shall provide not fewer than {{staff_spaces}} spaces for Tenant's employees at no additional charge, available during all prep, operating, and closing hours, and shall not restrict staff parking on the site.` },
        { id: 'c_delivery', order: 16, title: 'Delivery, Takeout & Curbside', body: `Tenant may operate takeout, curbside, and third-party delivery services, including designated short-term pickup parking and a reasonable staging area for delivery drivers near the Premises.` },
        { id: 'c_drivethru', order: 17, title: 'Drive-Thru', body: `Landlord shall permit, and reasonably cooperate in permitting, a drive-thru lane serving the Premises — including vehicle stacking, directional signage, and a menu/order board — subject to applicable governmental approvals.` },
        { id: 'c_trash', order: 18, title: 'Trash, Grease & Dumpster Enclosure', body: `Landlord shall provide a dedicated, screened trash and grease enclosure of adequate size within reasonable proximity to the Premises, with unobstructed access for Tenant's waste and grease haulers.` },
        { id: 'c_utilcap', order: 19, title: 'Utility Capacity (Gas & Electric)', body: `Landlord shall deliver electrical service of not less than {{electric_service}} and natural gas service adequate for a full-service commercial kitchen, or provide a corresponding allowance to upgrade the service to the Premises.` },
        { id: 'c_earlyaccess', order: 20, title: 'Early Access / Fixturing Period', body: `Landlord shall deliver possession not fewer than {{fixturing_days}} days before the Rent Commencement Date for Tenant's fixturing, equipment installation, and staff training, with no base rent or additional rent accruing during that period.` },
        { id: 'c_godark', order: 21, title: 'Go-Dark Rights (No Continuous Operation)', body: `Tenant shall have the right to cease operations without being in default, provided Tenant continues to pay rent. No continuous-operation covenant shall require Tenant to remain open, and recapture shall be Landlord's sole remedy.` },
        { id: 'c_relocation', order: 22, title: 'No Relocation', body: `Landlord shall have no right to relocate the Premises during the initial Term or any extension.` },
        { id: 'c_rofr', order: 23, title: 'Right of First Refusal (Expansion)', body: `Tenant shall have an ongoing right of first refusal to lease any adjacent or contiguous space that becomes available during the Term, on the same terms Landlord is prepared to offer a third party.` },
        { id: 'c_valet', order: 24, title: 'Valet Parking', body: `Tenant shall have the right to operate or arrange valet parking serving the Premises, with Landlord's reasonable cooperation regarding staging, drop-off, and queuing areas.` }
      ]
    },
    business_sale: {
      name: 'Business Sale',
      top: `{{date}}

{{seller}}
RE: Letter of Intent to Purchase - {{business}}

Dear {{seller}}:

On behalf of {{buyer}} ("Buyer"), Restaurant Realty Group, LLC submits this non-binding Letter of Intent setting forth the principal terms under which Buyer would acquire {{business}}. This letter is intended solely to facilitate negotiation of a definitive purchase agreement and creates no binding obligation except as expressly stated below.`,
      bottom: `Non-Binding. This Letter of Intent is a non-binding expression of interest only, except for the Confidentiality and Exclusivity provisions, if any. No party is bound to complete the transaction unless and until a definitive purchase agreement is executed by both parties.

Confidentiality. The parties shall keep the existence and terms of this Letter of Intent strictly confidential.

Governing Law. This Letter of Intent shall be governed by the laws of the State of Texas.

Expiration. This Letter of Intent shall expire if not accepted in writing within {{expiration}} days of the date above.

Accepted and Agreed:

BUYER: {{buyer}}

By: ______________________________   Date: __________

SELLER: {{seller}}

By: ______________________________   Date: __________

Broker: {{rep}}, Restaurant Realty Group, LLC`,
      info: [
        { key: 'date', label: 'Date' },
        { key: 'buyer', label: 'Buyer (entity)', type: 'party' },
        { key: 'seller', label: 'Seller', type: 'party' },
        { key: 'business', label: 'Business / concept' },
        { key: 'rep', label: 'RRG rep' }
      ],
      terms: [
        { key: 'purchase_price', label: 'Purchase Price' },
        { key: 'structure', label: 'Structure (Asset / Entity)' },
        { key: 'earnest', label: 'Earnest Money Deposit' },
        { key: 'allocation', label: 'Price Allocation' },
        { key: 'financing', label: 'Financing / Seller Note' },
        { key: 'dd_period', label: 'Due Diligence Period' },
        { key: 'closing', label: 'Target Closing' },
        { key: 'lease', label: 'Lease Assignment / New Lease' },
        { key: 'expiration', label: 'LOI Expiration', type: 'number', unit: 'days' }
      ],
      clauses: [
        { id: 'b_sellerfin', order: 0, title: 'Seller Financing', body: `A portion of the Purchase Price in the amount of {{seller_note}} shall be seller-financed under a promissory note bearing interest at {{note_rate}} per annum, amortized over {{note_term}}, secured by the assets sold and personally guaranteed by Buyer's principals.` },
        { id: 'b_transition', order: 1, title: 'Training & Transition', body: `Seller shall provide Buyer with training and transition assistance for a period of {{training_period}} following Closing at no additional cost, to ensure an orderly transfer of operations, vendor relationships, and recipes/systems.` },
        { id: 'b_noncompete', order: 2, title: 'Non-Compete', body: `Seller and its principals shall execute a non-competition and non-solicitation agreement for a period of {{noncompete_years}} years within a {{noncompete_radius}} radius of the business location(s).` },
        { id: 'b_inventory', order: 3, title: 'Inventory', body: `Usable food, beverage, and supply inventory on hand at Closing shall be purchased by Buyer at Seller's documented cost, in addition to the Purchase Price, based on a joint physical count taken at Closing.` },
        { id: 'b_tabc', order: 4, title: 'TABC / Liquor License', body: `The transaction is contingent on transfer or issuance of all required TABC permits. Consistent with RRG practice, the Texas liquor license is assigned no separate value and is not a price component (except in San Marcos, Texas, where transferable license value may apply).` },
        { id: 'b_lease', order: 5, title: 'Lease Assignment', body: `Closing is contingent upon assignment of the existing lease to Buyer on terms acceptable to Buyer, or the execution of a new lease with the landlord, with Seller and broker reasonably cooperating to obtain landlord consent.` },
        { id: 'b_exclusivity', order: 6, title: 'Exclusivity / No-Shop', body: `For a period of {{exclusivity_days}} days following acceptance, Seller shall not solicit, encourage, or entertain any competing offer for the business and shall negotiate exclusively and in good faith with Buyer toward a definitive agreement.` }
      ]
    }
  };
}
function loadLoiConfig() { const s = loadSettings(); const cfg = (s.loi && s.loi.tenant_rep) ? s.loi : defaultLoiConfig(); if (cfg.tenant_rep && !cfg.tenant_rep.defaults) cfg.tenant_rep.defaults = {}; if (cfg.business_sale && !cfg.business_sale.defaults) cfg.business_sale.defaults = {}; return cfg; }
function saveLoiConfig(cfg) { const s = loadSettings(); s.loi = cfg; saveSettings(s); }
(function seedLoiVenues(){
  try {
    const st = loadSettings();
    if (st.loiVenueSeeded) return;
    const cfg = (st.loi && st.loi.tenant_rep) ? st.loi : defaultLoiConfig();
    (cfg.tenant_rep && cfg.tenant_rep.clauses || []).forEach(function(c){ if (!c.venue && LOI_CLAUSE_VENUES[c.id]) c.venue = LOI_CLAUSE_VENUES[c.id].slice(); });
    st.loi = cfg; st.loiVenueSeeded = true; saveSettings(st);
  } catch (e) { console.error('LOI venue seed error:', e && e.message); }
})();
(function seedLoiDefaults(){
  try {
    const st = loadSettings();
    if (st.loiDefaultsSeeded) return;
    const cfg = (st.loi && st.loi.tenant_rep) ? st.loi : defaultLoiConfig();
    const t = cfg.tenant_rep; t.defaults = t.defaults || {};
    Object.keys(LOI_TR_DEFAULTS).forEach(function(k){ if (t.defaults[k] == null || t.defaults[k] === '') t.defaults[k] = LOI_TR_DEFAULTS[k]; });
    (t.terms || []).forEach(function(term){ if (term.key === 'free_rent') term.unit = 'days'; });
    st.loi = cfg; st.loiDefaultsSeeded = true; saveSettings(st);
  } catch (e) { console.error('LOI defaults seed error:', e && e.message); }
})();
// One-time seed of restaurant/bar/dance-hall LOI sections into the live library (admins can edit/delete after).
(function seedExtraLoiClauses(){
  try {
    const st = loadSettings();
    if (st.loiExtraSeeded) return;
    const cfg = (st.loi && st.loi.tenant_rep) ? st.loi : defaultLoiConfig();
    const t = cfg.tenant_rep; t.clauses = Array.isArray(t.clauses) ? t.clauses : [];
    const have = new Set(t.clauses.map(c => c.id));
    let maxOrder = t.clauses.reduce((m, c) => Math.max(m, c.order || 0), -1);
    EXTRA_TR_CLAUSES.forEach(c => { if (!have.has(c.id)) { maxOrder++; t.clauses.push({ id: c.id, order: maxOrder, title: c.title, body: c.body }); } });
    st.loi = cfg; st.loiExtraSeeded = true; saveSettings(st);
  } catch (e) { console.error('LOI clause seed error:', e && e.message); }
})();

function loiFill(text, vals) { return String(text == null ? '' : text).replace(/\{\{(\w+)\}\}/g, function (_, k) { var v = vals[k]; return (v != null && String(v).trim() !== '') ? String(v) : '____________'; }); }
function loiFmtTerm(f, vals) {
  var t = f.type;
  if (t === 'number') {
    var raw = vals[f.key]; if (raw == null) return ''; raw = String(raw).trim(); if (!raw) return '';
    var out = raw; var digits = raw.replace(/[^0-9.\-]/g, '');
    if (f.comma && digits !== '' && !isNaN(Number(digits))) out = Number(digits).toLocaleString('en-US');
    var u = f.unit || ''; var sp = (u && /^[\/%]/.test(u)) ? '' : ' ';
    return (f.prefix || '') + out + (u ? sp + u : '');
  }
  if (t === 'escalation') {
    var a = (vals.esc_amount != null ? String(vals.esc_amount) : '').trim(); if (!a) return '';
    var un = vals.esc_unit || '%';
    return un === '%' ? (a + '% per year') : ('$' + a + '/SF per year');
  }
  if (t === 'renewal') {
    var c = (vals.renewal_count != null ? String(vals.renewal_count) : '').trim();
    var y = (vals.renewal_years != null ? String(vals.renewal_years) : '').trim();
    if (!c && !y) return '';
    return (c || '____') + ' option' + (c === '1' ? '' : 's') + ' to renew, each ' + (y || '____') + ' years';
  }
  if (t === 'guaranty') {
    var gy = (vals.pg_years != null ? String(vals.pg_years) : '').trim();
    var bo = !!vals.pg_burnoff; var boy = (vals.pg_burnoff_years != null ? String(vals.pg_burnoff_years) : '').trim();
    if (!gy && !bo && !boy) return '';
    var g = 'Personal guaranty' + (gy ? (' of ' + gy + ' years') : '');
    if (bo) { if (vals.pg_rolling === 'rolling' || vals.pg_rolling === true || vals.pg_rolling === 'on') g += boy ? (', on a rolling ' + boy + '-year basis') : ', on a rolling basis'; else g += boy ? (', burning off after ' + boy + ' years') : ', with burn-off'; }
    return g;
  }
  var v = vals[f.key]; return (v != null ? String(v) : '');
}
function loiRtfEsc(s) {
  s = String(s == null ? '' : s);
  s = s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  s = s.replace(/\r\n|\r|\n/g, '\\par ');
  s = s.replace(/[^\x00-\x7F]/g, function (c) { return '\\u' + c.charCodeAt(0) + '?'; });
  return s;
}

app.get('/api/loi', (req, res) => {
  res.json({ ok: true, types: LOI_TYPES, venues: LOI_VENUES, config: loadLoiConfig(), isAdmin: !!(req.user && isSuper(req.user)), canManage: manageLoiOk(req), rep: (req.user && req.user.name) || '', logoUrl: (function(){ const _b = loadBrand(); return _b.logoExt ? ('/api/brand/logo?v=' + encodeURIComponent(_b.updatedAt || '')) : ''; })(), appName: loadAppName() });
});
const LOIS_FILE = path.join(BOV_DATA_DIR, 'lois.json');
function loadLois() { try { return JSON.parse(fs.readFileSync(LOIS_FILE, 'utf8')) || []; } catch (e) { return []; } }
function saveLois(a) { try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); fs.writeFileSync(LOIS_FILE, JSON.stringify(a || [], null, 2)); } catch (e) {} }
function newLoiId() { return 'loi_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
app.get('/api/loi/parties', (req, res) => {
  const out = [];
  try { loadPeople().forEach(p => out.push({ id: p.id, kind: 'contact', name: p.name || '', sub: p.company || preferredEmailOf(p) || '' })); } catch (e) {}
  try { loadCompanies().forEach(c => out.push({ id: c.id, kind: 'company', name: c.name || '', sub: c.type || '' })); } catch (e) {}
  res.json({ ok: true, parties: out });
});
app.post('/api/loi/save', express.json(), (req, res) => {
  const b = req.body || {}; const now = new Date().toISOString();
  const lois = loadLois();
  const rec = { id: newLoiId(), type: b.type || 'tenant_rep', property: (b.values && b.values.property) || '', tenant: b.tenant || null, landlord: b.landlord || null, values: b.values || {}, clauses: Array.isArray(b.clauses) ? b.clauses : [], createdAt: now, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' };
  lois.push(rec); saveLois(lois);
  const label = (rec.type === 'business_sale' ? 'Business Sale' : 'Tenant Rep') + (rec.property ? (' - ' + rec.property) : '');
  const logged = [];
  [b.tenant, b.landlord].forEach(function (party) {
    if (party && party.kind === 'contact' && party.id) {
      try { const arr = loadPeople(); const p = arr.find(x => x.id === party.id); if (p) { logActivity(p, 'LOI Sent', label, { auto: true, by: (req.user && req.user.name) || '', byUser: (req.user && req.user.username) || '' }); savePeople(arr); logged.push(p.name || party.name || ''); } } catch (e) {}
    }
  });
  res.json({ ok: true, id: rec.id, logged: logged });
});
app.get('/api/lois', (req, res) => {
  const lois = loadLois().slice().reverse().map(function (l) { return { id: l.id, type: l.type || 'tenant_rep', typeName: (l.type === 'business_sale' ? 'Business Sale' : 'Tenant Rep'), property: l.property || '', tenant: (l.tenant && l.tenant.name) || '', tenantId: (l.tenant && l.tenant.id) || '', tenantKind: (l.tenant && l.tenant.kind) || '', landlord: (l.landlord && l.landlord.name) || '', landlordId: (l.landlord && l.landlord.id) || '', landlordKind: (l.landlord && l.landlord.kind) || '', createdAt: l.createdAt || '', by: l.by || '', status: l.status || '', updatedAt: l.updatedAt || '', rounds: Array.isArray(l.rounds) ? l.rounds.length : 0 }; });
  res.json({ ok: true, lois: lois });
});
app.post('/api/loi/defaults', requireManageLoi, express.json(), (req, res) => {
  const b = req.body || {}; const cfg = loadLoiConfig(); const tkey = (b.type === 'business_sale') ? 'business_sale' : 'tenant_rep';
  const t = cfg[tkey]; if (!t) return res.status(400).json({ ok: false, error: 'Bad type.' });
  const d = (b.defaults && typeof b.defaults === 'object') ? b.defaults : {};
  const clean = {}; Object.keys(d).slice(0, 40).forEach(function(k){ clean[String(k).slice(0,40)] = String(d[k] == null ? '' : d[k]).slice(0, 60); });
  t.defaults = clean; saveLoiConfig(cfg);
  res.json({ ok: true, defaults: t.defaults });
});
app.get('/api/loi/:id', (req, res) => {
  const l = loadLois().find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'LOI not found.' });
  const cfg = loadLoiConfig(); const tkey = (l.type === 'business_sale') ? 'business_sale' : 'tenant_rep';
  const terms = ((cfg[tkey] && cfg[tkey].terms) || []).map(t => ({ key: t.key, label: t.label }));
  res.json({ ok: true, loi: l, terms, statuses: LOI_NEGO_STATUSES, termStates: LOI_TERM_STATES });
});
app.post('/api/loi/:id/nego', express.json({ limit: '256kb' }), (req, res) => {
  const b = req.body || {}; const lois = loadLois(); const l = lois.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'LOI not found.' });
  const now = new Date().toISOString();
  if (typeof b.status === 'string' && LOI_NEGO_STATUSES.indexOf(b.status) >= 0) l.status = b.status;
  if (b.termStatus && typeof b.termStatus === 'object') l.termStatus = Object.assign({}, l.termStatus || {}, b.termStatus);
  if (b.round && typeof b.round === 'object') { l.rounds = Array.isArray(l.rounds) ? l.rounds : []; l.rounds.push({ at: now, direction: (b.round.direction === 'received' ? 'received' : 'sent'), by: (req.user && req.user.name) || '', note: String(b.round.note || '').slice(0, 4000), changes: Array.isArray(b.round.changes) ? b.round.changes.slice(0, 60) : [] }); }
  l.updatedAt = now; saveLois(lois);
  if (typeof b.logActivity === 'string' && ['Countered', 'Accepted'].indexOf(b.logActivity) >= 0) {
    const label = (l.type === 'business_sale' ? 'Business Sale' : 'Tenant Rep') + (l.property ? (' - ' + l.property) : '');
    [l.tenant, l.landlord].forEach(function (party) { if (party && party.kind === 'contact' && party.id) { try { const arr = loadPeople(); const p = arr.find(x => x.id === party.id); if (p) { logActivity(p, 'LOI ' + b.logActivity, label, { auto: true, by: (req.user && req.user.name) || '' }); savePeople(arr); } } catch (e) {} } });
  }
  res.json({ ok: true, loi: l });
});
app.post('/api/ai/loi-counter', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const b = req.body || {}; const l = loadLois().find(x => x.id === b.id);
    if (!l) return res.status(404).json({ ok: false, error: 'LOI not found.' });
    const cfg = loadLoiConfig(); const tkey = (l.type === 'business_sale') ? 'business_sale' : 'tenant_rep';
    const terms = ((cfg[tkey] && cfg[tkey].terms) || []).map(t => ({ key: t.key, label: t.label }));
    const result = await aiassist.counterDiff({ text: b.text || '', current: l.values || {}, terms });
    res.json({ ok: true, result: result || {} });
  } catch (e) { res.status(502).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/loi/generate', express.json(), (req, res) => {
  const b = req.body || {};
  const cfg = loadLoiConfig();
  const type = (b.type && cfg[b.type]) ? b.type : 'tenant_rep';
  const t = cfg[type];
  const vals = Object.assign({}, b.values || {});
  if (!vals.date) vals.date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const sel = Array.isArray(b.clauses) ? b.clauses : [];
  const modern = b.format === 'modern';
  const fontTbl = modern ? '{\\fonttbl{\\f0\\froman Times New Roman;}{\\f1\\fswiss Calibri;}}{\\colortbl;\\red24\\green59\\blue86;\\red46\\green116\\blue181;}' : '{\\fonttbl{\\f0\\froman Times New Roman;}}';
  const baseFont = modern ? '\\f1\\fs21 ' : '\\f0\\fs22 ';
  const hc = modern ? '\\cf2' : '';
  const parts = ['{\\rtf1\\ansi\\ansicpg1252\\deff0' + fontTbl + '\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440' + baseFont];
  parts.push(loiRtfEsc(loiFill(t.top, vals)) + '\\par \\par ');
  parts.push('{\\b' + hc + '\\fs24 KEY TERMS}\\par ');
  (t.terms || []).forEach(function (f) { var disp = loiFmtTerm(f, vals); if (disp && String(disp).trim() !== '') parts.push('{\\b ' + loiRtfEsc(f.label) + ': }' + loiRtfEsc(String(disp)) + '\\par '); });
  parts.push('\\par ');
  (t.clauses || []).filter(function (c) { return sel.indexOf(c.id) >= 0; }).sort(function (a, c) { return (a.order || 0) - (c.order || 0); }).forEach(function (c) {
    parts.push('{\\b' + hc + ' ' + loiRtfEsc(c.title) + '}\\par ');
    parts.push(loiRtfEsc(loiFill(c.body, vals)) + '\\par \\par ');
  });
  parts.push(loiRtfEsc(loiFill(t.bottom, vals)));
  parts.push('}');
  const rtf = parts.join('');
  const who = String(vals.tenant || vals.buyer || vals.business || 'Draft').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'Draft';
  const fname = 'LOI_' + (type === 'business_sale' ? 'Business' : 'TenantRep') + '_' + who + '.rtf';
  res.setHeader('Content-Type', 'application/rtf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
  res.send(rtf);
});
app.post('/api/loi/boilerplate', requireManageLoi, express.json(), (req, res) => {
  const b = req.body || {}; const cfg = loadLoiConfig(); const t = cfg[b.type];
  if (!t) return res.status(400).json({ ok: false, error: 'Unknown LOI type.' });
  if (typeof b.top === 'string') t.top = b.top.slice(0, 20000);
  if (typeof b.bottom === 'string') t.bottom = b.bottom.slice(0, 20000);
  saveLoiConfig(cfg); res.json({ ok: true, config: cfg });
});
app.post('/api/loi/terms', requireManageLoi, express.json(), (req, res) => {
  const b = req.body || {}; const cfg = loadLoiConfig(); const t = cfg[b.type];
  if (!t) return res.status(400).json({ ok: false, error: 'Unknown LOI type.' });
  if (Array.isArray(b.terms)) {
    t.terms = b.terms.map(function (f) { const o = { key: String(f.key || '').slice(0, 40), label: String(f.label || '').slice(0, 80) }; const ty = f.type; if (ty === 'select') { o.type = 'select'; o.options = (Array.isArray(f.options) ? f.options : []).map(x => String(x).slice(0, 80)).filter(Boolean).slice(0, 24); } else if (ty === 'number') { o.type = 'number'; if (f.unit) o.unit = String(f.unit).slice(0, 20); if (f.prefix) o.prefix = String(f.prefix).slice(0, 8); if (f.comma) o.comma = true; } else if (ty === 'renewal' || ty === 'guaranty') { o.type = ty; } if (f.hint) o.hint = String(f.hint).slice(0, 80); return o; }).filter(f => f.key && f.label);
  }
  saveLoiConfig(cfg); res.json({ ok: true, config: cfg });
});
app.post('/api/loi/clause', requireManageLoi, express.json(), (req, res) => {
  const b = req.body || {}; const cfg = loadLoiConfig(); const t = cfg[b.type];
  if (!t) return res.status(400).json({ ok: false, error: 'Unknown LOI type.' });
  const list = t.clauses = Array.isArray(t.clauses) ? t.clauses : [];
  let c = b.id ? list.find(x => x.id === b.id) : null;
  if (!c) { c = { id: newLoiClauseId(), order: list.length }; list.push(c); }
  if (typeof b.title === 'string') c.title = b.title.slice(0, 160);
  if (typeof b.body === 'string') c.body = b.body.slice(0, 8000);
  if (Array.isArray(b.venue)) c.venue = b.venue.filter(function(v){ return LOI_VENUES.indexOf(v) >= 0; });
  saveLoiConfig(cfg); res.json({ ok: true, clause: c, config: cfg });
});
app.delete('/api/loi/clause/:type/:id', requireManageLoi, (req, res) => {
  const cfg = loadLoiConfig(); const t = cfg[req.params.type];
  if (!t) return res.status(400).json({ ok: false, error: 'Unknown LOI type.' });
  t.clauses = (t.clauses || []).filter(c => c.id !== req.params.id);
  saveLoiConfig(cfg); res.json({ ok: true, config: cfg });
});
app.post('/api/loi/clause/reorder', requireManageLoi, express.json(), (req, res) => {
  const b = req.body || {}; const cfg = loadLoiConfig(); const t = cfg[b.type];
  if (!t) return res.status(400).json({ ok: false, error: 'Unknown LOI type.' });
  const order = Array.isArray(b.order) ? b.order : [];
  (t.clauses || []).forEach(c => { const i = order.indexOf(c.id); c.order = i < 0 ? 999 : i; });
  (t.clauses || []).sort((a, c) => (a.order || 0) - (c.order || 0));
  saveLoiConfig(cfg); res.json({ ok: true, config: cfg });
});


const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`RRG toolkit server listening on :${PORT}`));
