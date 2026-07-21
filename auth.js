// RRG toolkit — multi-user auth: hashed passwords, signed-cookie sessions,
// and a login activity log. No external dependencies (Node crypto only).
//
// Data lives on the persistent disk (DATA_DIR):
//   users.json      — [{username,name,role,salt,hash,createdAt,disabled}]
//   logins.jsonl    — one JSON record per login attempt (success or fail)
//   logins.csv      — flat summary (open in Excel)
//   session.key     — auto-generated HMAC secret (survives restarts)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS = path.join(DATA_DIR, 'users.json');
const LOG_JSONL = path.join(DATA_DIR, 'logins.jsonl');
const LOG_CSV = path.join(DATA_DIR, 'logins.csv');
const USAGE_JSONL = path.join(DATA_DIR, 'usage.jsonl');
const USAGE_CSV = path.join(DATA_DIR, 'usage.csv');
const KEYFILE = path.join(DATA_DIR, 'session.key');
const LOGIN_COLS = ['timestamp', 'username', 'result', 'ip', 'userAgent'];
const USAGE_COLS = ['timestamp', 'username', 'tool', 'path', 'ip'];
const SESSION_DAYS = 7;

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

/* ---------- password hashing (scrypt) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- user store ---------- */
function loadUsers() {
  ensureDir();
  try { return JSON.parse(fs.readFileSync(USERS, 'utf8')); } catch (e) { return []; }
}
function saveUsers(users) { ensureDir(); fs.writeFileSync(USERS, JSON.stringify(users, null, 2)); }

/* ---------- dashboard quick links (admin-managed, shared) ---------- */
const LINKS = path.join(DATA_DIR, 'links.json');
// Company links the admin curates. "default:true" links appear on every user's
// dashboard automatically; users can also add their own personal quick links.
const DEFAULT_LINKS = [
  { name: 'RRG', url: 'https://www.rrgcre.com', default: true },
  { name: 'Copper', url: 'https://www.copper.com', default: true },
  { name: 'CoStar', url: 'https://secure.costargroup.com/login?signin=7380e0b9c209f54617739184e77b6293', default: true },
  { name: 'Placer', url: 'https://www.placer.ai', default: true },
  { name: 'Alcohol Sales', url: 'https://alcoholsales.com', default: true },
];
function loadLinks() {
  let raw; try { raw = JSON.parse(fs.readFileSync(LINKS, 'utf8')); } catch (e) { return DEFAULT_LINKS.slice(); }
  if (!Array.isArray(raw)) return DEFAULT_LINKS.slice();
  // migrate: old "adminOnly" links become non-default (hidden from users until re-checked); everything else defaults to shown.
  return raw.map(l => ({ name: l.name, url: l.url, default: (l.default != null ? !!l.default : !(l && l.adminOnly)) }));
}

/* ---------- admin-only tool access (which tool files reps can't see) ---------- */
const TOOLACC = path.join(DATA_DIR, 'tool_access.json');
function loadToolAccess() { try { const o = JSON.parse(fs.readFileSync(TOOLACC, 'utf8')); return Array.isArray(o.adminOnly) ? o.adminOnly : []; } catch (e) { return []; } }
function saveToolAccess(list) {
  ensureDir();
  const clean = (Array.isArray(list) ? list : []).map(f => String(f || '').trim()).filter(f => /^[\w.-]+\.html$/.test(f)).slice(0, 50);
  fs.writeFileSync(TOOLACC, JSON.stringify({ adminOnly: clean }, null, 2));
  return clean;
}
// Normalize a list of {name,url[,default]} — trims, caps, forces https, limits count.
function cleanLinkList(list, keepDefault, max) {
  return (Array.isArray(list) ? list : []).map(l => ({
    name: String((l && l.name) || '').trim().slice(0, 60),
    url: String((l && l.url) || '').trim().slice(0, 300),
    default: !!(l && l.default),
  })).filter(l => l.name && l.url).slice(0, max || 20)
    .map(l => {
      const url = /^https?:\/\//i.test(l.url) ? l.url : 'https://' + l.url;
      return keepDefault ? { name: l.name, url, default: l.default } : { name: l.name, url };
    });
}
function saveLinks(list) {
  ensureDir();
  const clean = cleanLinkList(list, true, 20);
  fs.writeFileSync(LINKS, JSON.stringify(clean, null, 2));
  return clean;
}
// Per-user personal quick links (stored on the user record).
function userLinksOf(u) { return (u && Array.isArray(u.links)) ? u.links : []; }
function setUserLinks(username, list) {
  const n = normUser(username);
  const users = loadUsers();
  const u = users.find(x => x.username === n);
  if (!u) throw new Error('User not found.');
  u.links = cleanLinkList(list, false, 12);
  saveUsers(users);
  return u.links;
}
// Most recent successful login timestamp per username (from the login log).
function lastLoginMap() {
  const map = {};
  readLogins().forEach(l => { if (l.result === 'success' && l.username) map[l.username] = l.timestamp; });
  return map;
}
function normUser(u) { return String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, ''); }
function findUser(username) { const n = normUser(username); return loadUsers().find(u => u.username === n) || null; }

function cleanContact(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 120); }

// Format a user's "prepared by" line for BOVs/CIMs: "Name, Title · Phone · Email"
function preparedByFor(u) {
  if (!u) return '';
  const nameTitle = [u.name, u.title].filter(Boolean).join(', ');
  return [nameTitle, u.phone, u.email].filter(Boolean).join(' · ');
}

function addUser({ username, firstName, lastName, name, password, role, title, phone, email }) {
  const n = normUser(username);
  if (!n) throw new Error('Username required.');
  if (!password || String(password).length < 6) throw new Error('Password must be at least 6 characters.');
  const users = loadUsers();
  if (users.some(u => u.username === n)) throw new Error('That username already exists.');
  const first = cleanContact(firstName, 60), last = cleanContact(lastName, 60);
  const full = [first, last].filter(Boolean).join(' ') || cleanContact(name, 120) || n;
  const { salt, hash } = hashPassword(password);
  users.push({
    username: n, firstName: first, lastName: last, name: full, role: role === 'admin' ? 'admin' : 'rep',
    title: cleanContact(title, 80), phone: cleanContact(phone, 40), email: cleanContact(email, 120),
    links: [], salt, hash, createdAt: new Date().toISOString(), disabled: false,
  });
  saveUsers(users);
  return { username: n };
}

// A user updates their own contact info (used in BOVs/CIMs). Username/role unchanged.
function updateProfile(username, { name, title, phone, email }) {
  const n = normUser(username);
  const users = loadUsers();
  const u = users.find(x => x.username === n);
  if (!u) throw new Error('User not found.');
  if (name != null) { const nm = cleanContact(name, 120); if (!nm) throw new Error('Name cannot be blank.'); u.name = nm; }
  if (title != null) u.title = cleanContact(title, 80);
  if (phone != null) u.phone = cleanContact(phone, 40);
  if (email != null) u.email = cleanContact(email, 120);
  saveUsers(users);
  return profileOf(u);
}

// A user changes their own password — must supply the correct current one.
function changePassword(username, currentPassword, newPassword) {
  const n = normUser(username);
  const users = loadUsers();
  const u = users.find(x => x.username === n);
  if (!u) throw new Error('User not found.');
  if (!verifyPassword(currentPassword, u.salt, u.hash)) throw new Error('Current password is incorrect.');
  if (!newPassword || String(newPassword).length < 6) throw new Error('New password must be at least 6 characters.');
  Object.assign(u, hashPassword(newPassword));
  saveUsers(users);
}

function profileOf(u) {
  if (!u) return null;
  return {
    username: u.username, name: u.name, firstName: u.firstName || '', lastName: u.lastName || '', role: u.role,
    title: u.title || '', phone: u.phone || '', email: u.email || '',
    links: (Array.isArray(u.links) ? u.links : []),
    preparedBy: preparedByFor(u),
  };
}
function removeUser(username) {
  const n = normUser(username);
  let users = loadUsers();
  const before = users.length;
  users = users.filter(u => u.username !== n);
  if (users.length === before) throw new Error('User not found.');
  if (!users.some(u => u.role === 'admin' && !u.disabled)) throw new Error('Cannot remove the last active admin.');
  saveUsers(users);
}
function resetPassword(username, password) {
  const n = normUser(username);
  if (!password || String(password).length < 6) throw new Error('Password must be at least 6 characters.');
  const users = loadUsers();
  const u = users.find(x => x.username === n);
  if (!u) throw new Error('User not found.');
  Object.assign(u, hashPassword(password));
  saveUsers(users);
}
function setDisabled(username, disabled) {
  const n = normUser(username);
  const users = loadUsers();
  const u = users.find(x => x.username === n);
  if (!u) throw new Error('User not found.');
  u.disabled = !!disabled;
  if (disabled && !users.some(x => x.role === 'admin' && !x.disabled)) throw new Error('Cannot disable the last active admin.');
  saveUsers(users);
}

// On boot, guarantee an admin exists (from ADMIN_USER / ADMIN_PASS env).
function seedAdmin() {
  const au = normUser(process.env.ADMIN_USER || 'van');
  const ap = process.env.ADMIN_PASS || '';
  const users = loadUsers();
  if (users.some(u => u.role === 'admin')) return { seeded: false };
  if (!ap) { console.warn('[auth] No admin and ADMIN_PASS not set — set ADMIN_PASS to create the first login.'); return { seeded: false }; }
  const { salt, hash } = hashPassword(ap);
  users.push({
    username: au, name: 'Van Rinn', role: 'admin',
    title: 'President & Founder', phone: '210-362-0678', email: 'van@rrgcre.com',
    salt, hash, createdAt: new Date().toISOString(), disabled: false,
  });
  saveUsers(users);
  console.log(`[auth] Seeded admin account "${au}".`);
  return { seeded: true, username: au };
}

function authenticate(username, password) {
  const u = findUser(username);
  if (!u || u.disabled) return null;
  if (!verifyPassword(password, u.salt, u.hash)) return null;
  return profileOf(u);
}

/* ---------- login activity log ---------- */
function csvCell(v) { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function logLogin({ username, result, ip, userAgent }) {
  ensureDir();
  const ts = new Date().toISOString();
  const rec = { timestamp: ts, username: normUser(username), result, ip: ip || '', userAgent: (userAgent || '').slice(0, 300) };
  try { fs.appendFileSync(LOG_JSONL, JSON.stringify(rec) + '\n'); } catch (e) {}
  try {
    if (!fs.existsSync(LOG_CSV)) fs.writeFileSync(LOG_CSV, LOGIN_COLS.join(',') + '\n');
    fs.appendFileSync(LOG_CSV, [ts, rec.username, result, rec.ip, rec.userAgent].map(csvCell).join(',') + '\n');
  } catch (e) {}
  return rec;
}
function readLogins() {
  ensureDir();
  if (!fs.existsSync(LOG_JSONL)) return [];
  return fs.readFileSync(LOG_JSONL, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}

/* ---------- tool-usage log ---------- */
// Friendly names for the toolkit pages (fallback: prettified filename).
const TOOL_NAMES = {
  '/': 'Dashboard', '/index.html': 'Dashboard',
  '/ssc_form.html': 'Site Selection Criteria',
  '/seller_screening.html': 'Seller Screening',
  '/valuation_questionnaire.html': 'Valuation Questionnaire',
  '/rrg_bov_builder.html': "Broker's Opinion of Value",
  '/rrg_cim_builder.html': 'CIM Builder',
  '/rrg_seller_attack_plan.html': 'Market Attack Plan (Sell)',
  '/rrg_tenant_attack_plan.html': 'Market Attack Plan (Tenant)',
  '/rrg_site_fit.html': 'Site & Concept Fit',
  '/rrg_tour_tracker.html': 'Tour Tracker',
  '/rrg_commission_calculator.html': 'Sale Commission',
  '/rrg_lease_commission_calculator.html': 'Lease Commission',
};
function toolName(p) {
  if (TOOL_NAMES[p]) return TOOL_NAMES[p];
  const base = p.replace(/^\//, '').replace(/\.[^.]+$/, '').replace(/^rrg[_-]/, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, c => c.toUpperCase()) : 'Dashboard';
}
function logUsage({ username, path: p, ip }) {
  ensureDir();
  const ts = new Date().toISOString();
  const rec = { timestamp: ts, username: normUser(username), tool: toolName(p), path: p, ip: ip || '' };
  try { fs.appendFileSync(USAGE_JSONL, JSON.stringify(rec) + '\n'); } catch (e) {}
  try {
    if (!fs.existsSync(USAGE_CSV)) fs.writeFileSync(USAGE_CSV, USAGE_COLS.join(',') + '\n');
    fs.appendFileSync(USAGE_CSV, [ts, rec.username, rec.tool, rec.path, rec.ip].map(csvCell).join(',') + '\n');
  } catch (e) {}
  return rec;
}
function readUsage() {
  ensureDir();
  if (!fs.existsSync(USAGE_JSONL)) return [];
  return fs.readFileSync(USAGE_JSONL, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}

/* ---------- signed-cookie sessions ---------- */
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  ensureDir();
  try { return fs.readFileSync(KEYFILE, 'utf8'); }
  catch (e) { const k = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(KEYFILE, k); } catch (_) {} return k; }
}
function sign(payloadB64) { return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url'); }
function makeSession(user) {
  const payload = { u: user.username, r: user.role, n: user.name, exp: Date.now() + SESSION_DAYS * 864e5 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b64 + '.' + sign(b64);
}
function readSession(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [b64, sig] = token.split('.');
  const expect = sign(b64);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let p; try { p = JSON.parse(Buffer.from(b64, 'base64url').toString()); } catch (e) { return null; }
  if (!p || !p.exp || p.exp < Date.now()) return null;
  // make sure the user still exists and is active; return fresh profile so
  // contact-info edits take effect immediately (no re-login needed).
  const u = findUser(p.u);
  if (!u || u.disabled) return null;
  return profileOf(u);
}

module.exports = {
  DATA_DIR, LOGIN_COLS, LOG_CSV, USAGE_COLS, USAGE_CSV, SESSION_DAYS,
  loadUsers, findUser, addUser, removeUser, resetPassword, setDisabled, seedAdmin, authenticate,
  updateProfile, changePassword, profileOf, preparedByFor,
  logLogin, readLogins, logUsage, readUsage, toolName, makeSession, readSession,
  loadLinks, saveLinks, userLinksOf, setUserLinks, lastLoginMap, loadToolAccess, saveToolAccess,
};
