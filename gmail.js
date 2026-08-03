// gmail.js — per-user Gmail OAuth + read/send for the RRG toolkit.
// SaaS model: ONE vendor OAuth app (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
// Each user connects their own mailbox in one click; tokens are stored per
// username on the persistent disk and are excluded from backups.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOK_DIR = path.join(DATA_DIR, 'gmail');
const SESSION_KEYFILE = path.join(DATA_DIR, 'session.key');

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || '';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/calendar.events',
];

function isConfigured() { return !!(CLIENT_ID() && CLIENT_SECRET()); }

// --- shared HMAC secret (same source as the session cookie signer) ---
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return fs.readFileSync(SESSION_KEYFILE, 'utf8'); }
  catch (e) { return 'rrg-gmail-fallback-secret'; }
}
function sign(s) { return crypto.createHmac('sha256', secret()).update(s).digest('base64url'); }

// --- CSRF state (username + timestamp, signed) ---
function makeState(username) {
  const body = Buffer.from(JSON.stringify({ u: username, t: Date.now() })).toString('base64url');
  return body + '.' + sign(body);
}
function readState(state) {
  if (!state || state.indexOf('.') < 0) return null;
  const [body, sig] = state.split('.');
  const expect = sign(body);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
  if (!p || !p.t || (Date.now() - p.t) > 15 * 60000) return null; // 15-min window
  return p;
}

// --- token storage (one file per user) ---
function tokFile(username) { return path.join(TOK_DIR, encodeURIComponent(String(username || '').toLowerCase()) + '.json'); }
function loadToken(username) { try { return JSON.parse(fs.readFileSync(tokFile(username), 'utf8')); } catch (e) { return null; } }
function saveToken(username, tok) {
  try { if (!fs.existsSync(TOK_DIR)) fs.mkdirSync(TOK_DIR, { recursive: true }); } catch (e) {}
  try { fs.writeFileSync(tokFile(username), JSON.stringify(tok, null, 2)); return true; } catch (e) { return false; }
}
function deleteToken(username) { try { fs.unlinkSync(tokFile(username)); } catch (e) {} }

function statusFor(username) {
  const t = loadToken(username);
  const sc = (t && t.scope) || '';
  return { configured: isConfigured(), connected: !!(t && t.refresh_token), email: (t && t.email) || '', hasContacts: /auth\/contacts/.test(sc), hasCalendar: /auth\/calendar/.test(sc), scope: sc };
}
function grantedScopes(username) { const t = loadToken(username); return (t && t.scope) || ''; }

// --- OAuth URLs ---
function redirectUri(req) {
  if (process.env.GOOGLE_OAUTH_REDIRECT) return process.env.GOOGLE_OAUTH_REDIRECT;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host + '/api/gmail/callback';
}
function authUrl(username, req) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: makeState(username),
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

async function exchangeCode(code, redirect) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code, client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(),
      redirect_uri: redirect, grant_type: 'authorization_code',
    }).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && (j.error_description || j.error)) || 'Token exchange failed.');
  return j; // { access_token, refresh_token, expires_in, id_token, ... }
}

function decodeIdEmail(idToken) {
  try { const p = idToken.split('.')[1]; return (JSON.parse(Buffer.from(p, 'base64url').toString()) || {}).email || ''; }
  catch (e) { return ''; }
}

// Store the result of a successful code exchange.
async function connectFromCode(username, code, redirect) {
  const j = await exchangeCode(code, redirect);
  let email = decodeIdEmail(j.id_token || '');
  const existing = loadToken(username) || {};
  const tok = {
    email: email || existing.email || '',
    access_token: j.access_token || '',
    refresh_token: j.refresh_token || existing.refresh_token || '',
    expiry: Date.now() + ((j.expires_in || 3600) * 1000) - 60000,
    scope: j.scope || SCOPES.join(' '),
    connectedAt: existing.connectedAt || new Date().toISOString(),
  };
  if (!email && tok.access_token) {
    try {
      const ur = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
      if (ur.ok) { const uj = await ur.json(); tok.email = uj.email || tok.email; }
    } catch (e) {}
  }
  saveToken(username, tok);
  return { email: tok.email };
}

async function refresh(username, tok) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(),
      refresh_token: tok.refresh_token, grant_type: 'refresh_token',
    }).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && (j.error_description || j.error)) || 'Token refresh failed.');
  tok.access_token = j.access_token || tok.access_token;
  tok.expiry = Date.now() + ((j.expires_in || 3600) * 1000) - 60000;
  saveToken(username, tok);
  return tok;
}

async function accessToken(username) {
  let tok = loadToken(username);
  if (!tok || !tok.refresh_token) throw new Error('Gmail not connected.');
  if (!tok.access_token || Date.now() >= (tok.expiry || 0)) tok = await refresh(username, tok);
  return tok;
}

// Authenticated Gmail API call; refreshes once on 401.
async function gapi(username, url, opts, _retry) {
  const tok = await accessToken(username);
  const o = Object.assign({}, opts);
  o.headers = Object.assign({ Authorization: 'Bearer ' + tok.access_token }, (opts && opts.headers) || {});
  const r = await fetch(url, o);
  if (r.status === 401 && !_retry) {
    const t = loadToken(username); if (t) { await refresh(username, t); return gapi(username, url, opts, true); }
  }
  return r;
}

function hdr(headers, name) { const h = (headers || []).find(x => x.name.toLowerCase() === name.toLowerCase()); return h ? h.value : ''; }

// List sent+received messages exchanged with a contact's email address(es).
async function messagesForContact(username, emails, max) {
  const list = (emails || []).map(e => String(e || '').trim()).filter(Boolean);
  if (!list.length) return [];
  const q = list.map(e => '(from:' + e + ' OR to:' + e + ')').join(' OR ');
  const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + (max || 25) + '&q=' + encodeURIComponent(q);
  const r = await gapi(username, u, {});
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail list failed.');
  const ids = (j.messages || []).map(m => m.id);
  const me = (loadToken(username) || {}).email || '';
  const out = await Promise.all(ids.map(async id => {
    try {
      const mu = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date';
      const mr = await gapi(username, mu, {});
      const mj = await mr.json();
      if (!mr.ok) return null;
      const H = mj.payload && mj.payload.headers;
      const from = hdr(H, 'From');
      const outbound = me && from.toLowerCase().indexOf(me.toLowerCase()) >= 0;
      return {
        id: mj.id, threadId: mj.threadId,
        from: from, to: hdr(H, 'To'), subject: hdr(H, 'Subject'),
        date: hdr(H, 'Date') || (mj.internalDate ? new Date(Number(mj.internalDate)).toISOString() : ''),
        ts: mj.internalDate ? Number(mj.internalDate) : 0,
        snippet: mj.snippet || '', direction: outbound ? 'out' : 'in',
        unread: (mj.labelIds || []).indexOf('UNREAD') >= 0,
      };
    } catch (e) { return null; }
  }));
  return out.filter(Boolean).sort((a, b) => b.ts - a.ts);
}

// List the user's recently SENT messages (for logging Gmail sends into contact records).
async function sentMessages(username, days, max) {
  const lim = Math.min(max || 200, 500);
  const q = 'in:sent newer_than:' + (days || 30) + 'd';
  const listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + lim + '&q=' + encodeURIComponent(q);
  const list = await gapiJSON(username, listUrl, {});
  const ids = (list.messages || []).map(function(m){ return m.id; });
  const out = [];
  for (const id of ids) {
    try {
      const mu = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From';
      const mj = await gapiJSON(username, mu, {});
      const H = (mj.payload && mj.payload.headers) || [];
      out.push({ id: mj.id, threadId: mj.threadId || '', to: hdr(H, 'To'), cc: hdr(H, 'Cc'), from: hdr(H, 'From'), subject: hdr(H, 'Subject'), sentAt: (mj.internalDate ? new Date(Number(mj.internalDate)).toISOString() : (hdr(H, 'Date') ? new Date(hdr(H, 'Date')).toISOString() : '')), snippet: mj.snippet || '' });
    } catch (e) {}
  }
  return out;
}
function decodeBody(payload) {
  if (!payload) return '';
  function walk(part) {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body && part.body.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
    if (part.parts) { for (const p of part.parts) { const t = walk(p); if (t) return t; } }
    return '';
  }
  let text = walk(payload);
  if (!text) { // fall back to first html stripped
    function walkHtml(part) {
      if (!part) return '';
      if (part.mimeType === 'text/html' && part.body && part.body.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
      if (part.parts) { for (const p of part.parts) { const t = walkHtml(p); if (t) return t; } }
      return '';
    }
    const html = walkHtml(payload);
    if (html) text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').trim();
  }
  return text;
}

async function messageFull(username, id) {
  const r = await gapi(username, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=full', {});
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail get failed.');
  const H = j.payload && j.payload.headers;
  return {
    id: j.id, threadId: j.threadId,
    from: hdr(H, 'From'), to: hdr(H, 'To'), subject: hdr(H, 'Subject'),
    date: hdr(H, 'Date'), messageId: hdr(H, 'Message-ID'),
    body: decodeBody(j.payload), snippet: j.snippet || '',
  };
}

// Search the mailbox by a Gmail query and return decoded bodies (for lead parsing).
async function searchLeadBodies(username, q, max) {
  const lim = Math.min(max || 40, 60);
  const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + lim + '&q=' + encodeURIComponent(q || '');
  const r = await gapi(username, u, {});
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail search failed.');
  const ids = (j.messages || []).map(m => m.id).slice(0, lim);
  const out = await Promise.all(ids.map(async id => { try { const m = await messageFull(username, id); return { id: m.id, subject: m.subject, from: m.from, date: m.date, body: m.body || '', snippet: m.snippet || '' }; } catch (e) { return null; } }));
  return out.filter(Boolean);
}

// Send a plain-text message via the Gmail API. Optionally thread a reply.
async function sendMessage(username, opts) {
  const tok = loadToken(username);
  if (!tok || !tok.email) throw new Error('Gmail not connected.');
  const from = tok.email;
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('A recipient is required.');
  const subject = String(opts.subject || '(no subject)');
  const extra = [];
  if (opts.inReplyTo) { extra.push('In-Reply-To: ' + opts.inReplyTo); extra.push('References: ' + (opts.references || opts.inReplyTo)); }
  if (opts.cc) extra.push('Cc: ' + String(opts.cc));
  if (opts.bcc) extra.push('Bcc: ' + String(opts.bcc));
  let raw;
  if (opts.html) {
    const boundary = 'rrgb_' + crypto.randomBytes(9).toString('hex');
    const head = [
      'From: ' + from, 'To: ' + to, 'Subject: ' + subject, 'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    ].concat(extra).join('\r\n');
    const parts = [
      '--' + boundary,
      'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '',
      String(opts.body || ''), '',
      '--' + boundary,
      'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '',
      String(opts.html), '',
      '--' + boundary + '--', '',
    ].join('\r\n');
    raw = head + '\r\n\r\n' + parts;
  } else {
    const head = [
      'From: ' + from, 'To: ' + to, 'Subject: ' + subject, 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
    ].concat(extra).join('\r\n');
    raw = head + '\r\n\r\n' + String(opts.body || '');
  }
  const encoded = Buffer.from(raw).toString('base64url');
  const payload = { raw: encoded };
  if (opts.threadId) payload.threadId = opts.threadId;
  const r = await gapi(username, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail send failed.');
  return { id: j.id, threadId: j.threadId, from: from, to: to, subject: subject };
}

function parseAddrs(str) {
  const out = [];
  String(str || '').split(',').forEach(function (part) {
    part = part.trim(); if (!part) return;
    let name = '', email = '';
    const m = part.match(/^(.*?)<([^>]+)>\s*$/);
    if (m) { name = m[1].trim().replace(/^["']+|["']+$/g, ''); email = m[2].trim(); }
    else if (part.indexOf('@') >= 0) { email = part.trim(); }
    email = email.replace(/mailto:/gi, '').replace(/[<>]/g, '').trim();
    name = name.replace(/mailto:/gi, '').replace(/<[^<>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push({ name: name, email: email.toLowerCase() });
  });
  return out;
}
// Walk a message payload and collect downloadable file attachments.
function collectAttachments(payload) {
  const out = [];
  (function walk(part) {
    if (!part) return;
    if (part.filename && part.body && part.body.attachmentId) out.push({ filename: part.filename, attachmentId: part.body.attachmentId, mimeType: part.mimeType || '', size: (part.body && part.body.size) || 0 });
    if (part.parts) part.parts.forEach(walk);
  })(payload);
  return out;
}
// Search the mailbox for messages that likely carry an agreement document; return candidates with attachment metadata.
async function listAgreementCandidates(username, max) {
  const lim = Math.min(max || 40, 60);
  const q = 'has:attachment (filename:pdf OR filename:doc OR filename:docx) (agreement OR NDA OR "non-disclosure" OR "non disclosure" OR LOI OR "letter of intent" OR listing OR "tenant rep" OR representation OR referral OR ETRA OR confidentiality OR "co-broke" OR broker)';
  const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + lim + '&q=' + encodeURIComponent(q);
  const r = await gapi(username, u, {});
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail search failed.');
  const ids = (j.messages || []).map(m => m.id);
  const out = await Promise.all(ids.map(async id => {
    try {
      const mr = await gapi(username, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=full', {});
      const mj = await mr.json();
      if (!mr.ok) return null;
      const H = mj.payload && mj.payload.headers;
      const atts = collectAttachments(mj.payload).filter(a => /\.(pdf|docx?)$/i.test(a.filename));
      if (!atts.length) return null;
      return { id: mj.id, threadId: mj.threadId, from: hdr(H, 'From'), to: hdr(H, 'To'), subject: hdr(H, 'Subject'), date: hdr(H, 'Date') || (mj.internalDate ? new Date(Number(mj.internalDate)).toISOString() : ''), ts: mj.internalDate ? Number(mj.internalDate) : 0, snippet: mj.snippet || '', attachments: atts };
    } catch (e) { return null; }
  }));
  return out.filter(Boolean).sort((a, b) => b.ts - a.ts);
}
// Download a single attachment; returns a Buffer.
async function getAttachment(username, messageId, attachmentId) {
  const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(messageId) + '/attachments/' + encodeURIComponent(attachmentId);
  const r = await gapi(username, u, {});
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Attachment download failed.');
  return Buffer.from(String(j.data || ''), 'base64url');
}
async function listCorrespondents(username, months, maxMsgs) {
  const mo = Math.min(Math.max(parseInt(months, 10) || 12, 1), 120);
  const cap = Math.min(Math.max(parseInt(maxMsgs, 10) || 2000, 1), 5000);
  const q = 'newer_than:' + mo + 'm';
  let ids = []; let pageToken = '';
  do {
    const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=' + encodeURIComponent(q) + (pageToken ? ('&pageToken=' + encodeURIComponent(pageToken)) : '');
    const r = await gapi(username, u, {});
    const j = await r.json();
    if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail list failed.');
    (j.messages || []).forEach(m => ids.push(m.id));
    pageToken = j.nextPageToken || '';
  } while (pageToken && ids.length < cap);
  const capped = !!(pageToken && ids.length >= cap);
  ids = ids.slice(0, cap);
  const me = ((loadToken(username) || {}).email || '').toLowerCase();
  const map = {};
  const CHUNK = 12;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    await Promise.all(batch.map(async function (id) {
      try {
        const mu = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc';
        const mr = await gapi(username, mu, {}); const mj = await mr.json(); if (!mr.ok) return;
        const H = mj.payload && mj.payload.headers;
        ['From', 'To', 'Cc'].forEach(function (hn) {
          parseAddrs(hdr(H, hn)).forEach(function (a) {
            if (!a.email || a.email === me) return;
            if (!map[a.email]) map[a.email] = { name: a.name || '', email: a.email, count: 0 };
            map[a.email].count++;
            if (!map[a.email].name && a.name) map[a.email].name = a.name;
          });
        });
      } catch (e) {}
    }));
  }
  const people = Object.keys(map).map(k => map[k]).sort((a, b) => b.count - a.count);
  return { people: people, scanned: ids.length, capped: capped };
}

// Find likely commercial-listing emails (broker flyers, CoStar/LoopNet/Crexi, available space) — body + PDF attachments.
async function listListingCandidates(username, max, daysArg) {
  const lim = Math.min(max || 30, 50);
  const days = Math.min(Math.max(parseInt(daysArg, 10) || 90, 1), 730);
  const q = 'newer_than:' + days + 'd (listing OR "for lease" OR "for sublease" OR "available space" OR "sq ft" OR "square feet" OR NNN OR "triple net" OR "end cap" OR "2nd gen" OR "second generation" OR "lease rate" OR CoStar OR LoopNet OR Crexi OR "retail space" OR "restaurant space")';
  const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + lim + '&q=' + encodeURIComponent(q);
  const r = await gapi(username, u, {});
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gmail search failed.');
  const ids = (j.messages || []).map(m => m.id);
  const out = await Promise.all(ids.map(async id => {
    try {
      const mr = await gapi(username, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=full', {});
      const mj = await mr.json();
      if (!mr.ok) return null;
      const H = mj.payload && mj.payload.headers;
      const atts = collectAttachments(mj.payload).filter(a => /\.(pdf|docx?)$/i.test(a.filename));
      return { id: mj.id, from: hdr(H, 'From'), subject: hdr(H, 'Subject'), date: hdr(H, 'Date') || '', ts: mj.internalDate ? Number(mj.internalDate) : 0, snippet: mj.snippet || '', body: (decodeBody(mj.payload) || ''), attachments: atts };
    } catch (e) { return null; }
  }));
  return out.filter(Boolean).sort((a, b) => b.ts - a.ts);
}
// Generic authenticated Google API JSON call (People, Calendar, etc.).
async function gapiJSON(username, url, opts) {
  const r = await gapi(username, url, opts || {});
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const msg = (j && j.error && j.error.message) || ('HTTP ' + r.status); const err = new Error(msg); err.status = r.status; err.body = j; throw err; }
  return j;
}
module.exports = {
  isConfigured, SCOPES, statusFor, grantedScopes, redirectUri, authUrl, readState,
  connectFromCode, deleteToken, loadToken, statusForUser: statusFor,
  messagesForContact, messageFull, searchLeadBodies, listCorrespondents, sendMessage, TOK_DIR,
  gapi, gapiJSON, accessToken, parseAddrs, listAgreementCandidates, getAttachment, listListingCandidates,
  sentMessages,
};
