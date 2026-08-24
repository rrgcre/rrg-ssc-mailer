'use strict';
/* ============================================================================
 * Email Finder — restaurant prospecting
 * ----------------------------------------------------------------------------
 * Given a city, state, and restaurant type, finds matching restaurants via the
 * Google Places API (Text Search + Place Details), then crawls each restaurant's
 * website for a public contact email. Results are saved to their OWN standalone
 * JSON store (finder_lists.json) — deliberately NOT the CRM contacts or the Bulk
 * Email subscriber tables.
 *
 * NOTE: The Google Places API does not return email addresses. Places gives us
 * the restaurant's website; the email is scraped from that public website.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'finder_lists.json');

/* ---------------- tiny JSON store (self-contained) ---------------- */
function _read() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) || []; } catch (e) { return []; } }
function _write(arr) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, STORE);
  return true;
}
function _id() { return 'fl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------------- helpers ---------------- */
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _clean(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n || 300); }

// Fetch with a hard timeout so one slow site can't hang the whole run.
async function _fetchText(url, ms, maxBytes) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms || 7000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RRG-EmailFinder/1.0; +https://restaurantrealty.com)', 'Accept': 'text/html,application/xhtml+xml' }
    });
    if (!r.ok) return '';
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct && ct.indexOf('html') < 0 && ct.indexOf('text') < 0) return '';
    const buf = await r.arrayBuffer();
    let txt = Buffer.from(buf).toString('utf8');
    if (maxBytes && txt.length > maxBytes) txt = txt.slice(0, maxBytes);
    return txt;
  } catch (e) { return ''; }
  finally { clearTimeout(to); }
}

/* ---------------- email extraction ---------------- */
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
// Junk we never want: asset filenames, tracking, placeholder, CDN/theme vendors.
const BAD_LOCAL = /^(no-?reply|noreply|donotreply|do-not-reply|example|test|email|your|name|user|username|abuse|postmaster|hostmaster|webmaster@?)$/i;
const BAD_HOST = /(sentry|wixpress|example\.com|example\.org|domain\.com|yourdomain|email\.com|godaddy|squarespace|wordpress|shopify|cloudflare|googleusercontent|schema\.org|w3\.org|sentry\.io|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp|\.css|\.js)/i;
const IMG_TAIL = /\.(png|jpe?g|gif|svg|webp|css|js|ico)$/i;

function _extractEmails(html, siteHost) {
  if (!html) return [];
  const found = {};
  // Prefer explicit mailto: links first.
  const mailtos = html.match(/mailto:([^"'>\s?]+)/gi) || [];
  mailtos.forEach(m => { const e = m.replace(/^mailto:/i, '').trim(); if (e) found[e.toLowerCase()] = (found[e.toLowerCase()] || 0) + 3; });
  // Then any address in the text.
  const raw = html.match(EMAIL_RE) || [];
  raw.forEach(e => { const k = e.toLowerCase(); found[k] = (found[k] || 0) + 1; });

  const out = [];
  Object.keys(found).forEach(e => {
    if (IMG_TAIL.test(e)) return;
    if (BAD_HOST.test(e)) return;
    const at = e.split('@'); if (at.length !== 2) return;
    const local = at[0], host = at[1];
    if (BAD_LOCAL.test(local)) return;
    if (host.length < 4 || host.indexOf('.') < 0) return;
    // score: mailto weight + domain-match bonus + friendly-local bonus
    let score = found[e];
    if (siteHost && host === siteHost) score += 5;
    else if (siteHost && (host.indexOf(siteHost) >= 0 || siteHost.indexOf(host) >= 0)) score += 2;
    if (/^(info|contact|hello|reservations|events|catering|office|admin|manager|sales|bookings|eat|dine)@/i.test(e)) score += 2;
    out.push({ email: e, score: score });
  });
  out.sort((a, b) => b.score - a.score);
  return out.map(x => x.email);
}

function _hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase(); } catch (e) { return ''; }
}
function _baseOf(url) {
  try { const u = new URL(url); return u.protocol + '//' + u.host; } catch (e) { return ''; }
}

// Crawl a site's homepage + a couple of likely contact pages for an email.
async function _findEmailForSite(website) {
  if (!website) return { email: '', source: '' };
  const base = _baseOf(website);
  if (!base) return { email: '', source: '' };
  const host = _hostOf(website);
  const candidates = [website];
  ['/contact', '/contact-us', '/contactus', '/about', '/about-us', '/reservations'].forEach(p => { candidates.push(base + p); });
  const seen = {};
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    if (seen[url]) continue; seen[url] = 1;
    const html = await _fetchText(url, 7000, 600000);
    if (!html) continue;
    const emails = _extractEmails(html, host);
    if (emails.length) return { email: emails[0], source: url };
    // Only spend the extra page-loads when the homepage had nothing.
    if (i === 0 && /mailto:/i.test(html) === false && emails.length === 0) { /* keep going to contact pages */ }
  }
  return { email: '', source: '' };
}

/* ---------------- Google Places ---------------- */
async function _placesTextSearch(query, key, maxWanted) {
  const rows = [];
  let token = '';
  for (let page = 0; page < 3 && rows.length < maxWanted; page++) {
    let url = 'https://maps.googleapis.com/maps/api/place/textsearch/json?query=' + encodeURIComponent(query) + '&type=restaurant&key=' + encodeURIComponent(key);
    if (token) { url += '&pagetoken=' + encodeURIComponent(token); await _sleep(2100); } // next_page_token needs a moment to activate
    let j;
    try { const r = await fetch(url); j = await r.json(); } catch (e) { break; }
    if (j.status && j.status !== 'OK' && j.status !== 'ZERO_RESULTS') {
      const err = new Error(j.error_message || ('Places error: ' + j.status)); err.gstatus = j.status; throw err;
    }
    (j.results || []).forEach(p => {
      rows.push({
        placeId: p.place_id || '',
        name: _clean(p.name, 200),
        address: _clean(p.formatted_address, 300),
        rating: p.rating || 0,
        userRatingsTotal: p.user_ratings_total || 0,
        website: '', phone: '', email: '', emailSource: ''
      });
    });
    token = j.next_page_token || '';
    if (!token) break;
  }
  return rows.slice(0, maxWanted);
}

async function _placeDetails(placeId, key) {
  const fields = 'name,formatted_address,formatted_phone_number,international_phone_number,website';
  const url = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + encodeURIComponent(placeId) + '&fields=' + fields + '&key=' + encodeURIComponent(key);
  try {
    const r = await fetch(url); const j = await r.json();
    const d = j.result || {};
    return { website: _clean(d.website, 300), phone: _clean(d.formatted_phone_number || d.international_phone_number, 60) };
  } catch (e) { return { website: '', phone: '' }; }
}

// small concurrency runner
async function _pool(items, size, worker) {
  const out = new Array(items.length); let idx = 0;
  async function run() { while (idx < items.length) { const my = idx++; out[my] = await worker(items[my], my); } }
  const runners = []; for (let i = 0; i < Math.min(size, items.length); i++) runners.push(run());
  await Promise.all(runners);
  return out;
}

/* ---------------- CSV ---------------- */
function _csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function _toCsv(list) {
  const head = ['Name', 'Email', 'Phone', 'Website', 'Address', 'Rating', 'Reviews'];
  const lines = [head.join(',')];
  (list.rows || []).forEach(r => {
    lines.push([r.name, r.email, r.phone, r.website, r.address, r.rating || '', r.userRatingsTotal || ''].map(_csvCell).join(','));
  });
  return lines.join('\r\n');
}

/* ============================ mount ============================ */
function mount(app, deps) {
  deps = deps || {};
  const requireAdmin = deps.requireAdmin || function (req, res, next) { next(); };
  const loadKey = deps.loadGmapsKey || function () { return process.env.GOOGLE_MAPS_API_KEY || ''; };
  const express = require('express');
  const json = express.json({ limit: '4mb' });

  // Is the Google key configured? (Places must be enabled on the same key.)
  app.get('/api/finder/key-status', requireAdmin, (req, res) => {
    res.json({ ok: true, hasKey: !!loadKey() });
  });

  // Phase 1 — discover restaurants (fast). Returns rows with website + phone, email blank.
  app.post('/api/finder/search', requireAdmin, json, async (req, res) => {
    try {
      const key = loadKey();
      if (!key) return res.status(400).json({ ok: false, error: 'No Google Maps API key is set. Add one in Admin, and enable the Places API on that Google Cloud project.' });
      const b = req.body || {};
      const city = _clean(b.city, 80), state = _clean(b.state, 40), type = _clean(b.type, 60);
      if (!city || !state) return res.status(400).json({ ok: false, error: 'City and state are required.' });
      const max = Math.max(1, Math.min(60, parseInt(b.max, 10) || 40));
      const q = (type ? (type + ' ') : '') + 'restaurants in ' + city + ', ' + state;
      let rows;
      try { rows = await _placesTextSearch(q, key, max); }
      catch (e) {
        const gs = e && e.gstatus;
        let msg = (e && e.message) || 'Places search failed.';
        if (gs === 'REQUEST_DENIED') msg = 'Google denied the request — the Places API is likely not enabled on this key, or the key is restricted. ' + msg;
        else if (gs === 'OVER_QUERY_LIMIT') msg = 'Google quota/billing limit hit. ' + msg;
        return res.status(502).json({ ok: false, error: msg });
      }
      // Enrich with website + phone (Place Details), modest concurrency.
      await _pool(rows, 6, async (r) => {
        if (!r.placeId) return;
        const d = await _placeDetails(r.placeId, key);
        r.website = d.website; r.phone = d.phone;
      });
      const withSite = rows.filter(r => r.website).length;
      res.json({ ok: true, query: q, count: rows.length, withWebsite: withSite, rows: rows });
    } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
  });

  // Phase 2 — crawl a batch of rows for emails. Client calls this in chunks for progress.
  app.post('/api/finder/enrich', requireAdmin, json, async (req, res) => {
    try {
      const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows.slice(0, 20) : [];
      const results = await _pool(rows, 5, async (r) => {
        const website = _clean(r.website, 300);
        if (!website) return { placeId: r.placeId || '', email: '', emailSource: '' };
        const f = await _findEmailForSite(website);
        return { placeId: r.placeId || '', email: f.email, emailSource: f.source };
      });
      res.json({ ok: true, results: results });
    } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
  });

  // ---- saved lists (own store) ----
  app.get('/api/finder/lists', requireAdmin, (req, res) => {
    const all = _read();
    res.json({ ok: true, lists: all.map(l => ({ id: l.id, name: l.name, city: l.city, state: l.state, type: l.type, createdAt: l.createdAt, createdByName: l.createdByName || '', total: (l.rows || []).length, withEmail: (l.rows || []).filter(r => r.email).length })) });
  });

  app.get('/api/finder/lists/:id', requireAdmin, (req, res) => {
    const l = _read().find(x => x.id === req.params.id);
    if (!l) return res.status(404).json({ ok: false, error: 'List not found.' });
    res.json({ ok: true, list: l });
  });

  app.post('/api/finder/lists', requireAdmin, json, (req, res) => {
    const b = req.body || {};
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: 'Nothing to save.' });
    const all = _read();
    const now = new Date().toISOString();
    let l;
    if (b.id) {
      l = all.find(x => x.id === b.id);
      if (!l) return res.status(404).json({ ok: false, error: 'List not found.' });
    } else {
      l = { id: _id(), createdAt: now, createdByName: (req.user && req.user.name) || '' };
      all.push(l);
    }
    l.name = _clean(b.name, 120) || (_clean(b.type, 40) + ' — ' + _clean(b.city, 40)).replace(/^ — /, '') || 'Restaurant list';
    l.city = _clean(b.city, 80); l.state = _clean(b.state, 40); l.type = _clean(b.type, 60);
    l.updatedAt = now;
    l.rows = rows.map(r => ({
      placeId: _clean(r.placeId, 120), name: _clean(r.name, 200), address: _clean(r.address, 300),
      phone: _clean(r.phone, 60), website: _clean(r.website, 300), email: _clean(r.email, 160),
      emailSource: _clean(r.emailSource, 300), rating: r.rating || 0, userRatingsTotal: r.userRatingsTotal || 0
    }));
    _write(all);
    res.json({ ok: true, id: l.id, total: l.rows.length, withEmail: l.rows.filter(r => r.email).length });
  });

  app.delete('/api/finder/lists/:id', requireAdmin, (req, res) => {
    const all = _read();
    const next = all.filter(x => x.id !== req.params.id);
    if (next.length === all.length) return res.status(404).json({ ok: false, error: 'List not found.' });
    _write(next);
    res.json({ ok: true });
  });

  app.get('/api/finder/lists/:id/export.csv', requireAdmin, (req, res) => {
    const l = _read().find(x => x.id === req.params.id);
    if (!l) return res.status(404).send('List not found.');
    const csv = _toCsv(l);
    const fn = (l.name || 'restaurants').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'restaurants';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fn + '.csv"');
    res.send('﻿' + csv);
  });
}

module.exports = { mount };
