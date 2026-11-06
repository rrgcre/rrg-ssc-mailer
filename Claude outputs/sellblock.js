// ---- Seller site pages + editable text (Settings → Seller Site) ----
// Three pages: home (a one-or-several fork), /restaurant (single-unit owners) and /groups (multi-unit operators).
// Every element marked data-k="…" is a text slot; saved wording replaces the default at serve time, so edits go
// live on save. Brand, phone and footer are shared; everything else is per page.
const SELL_CONTENT_FILE = path.join(BOV_DATA_DIR, 'sell_site_content.json');
const _SF = (g, k, l, long) => [g, k, l, long ? 1 : 0];
const SELL_SHARED = [_SF('Brand & contact', 'brand', 'Brand name'), _SF('Brand & contact', 'phone', 'Phone (footer link and the owner email)'), _SF('Footer', 'footer1', 'Who we are', 1), _SF('Footer', 'footer2', 'Estimate disclaimer', 1)];
const SELL_LANDING = [
  _SF('Search & browser', 'title', 'Browser tab title'), _SF('Search & browser', 'metaDesc', 'Google description', 1),
  _SF('Top of page', 'navCta', 'Top-right link'), _SF('Top of page', 'heroTitle', 'Headline'), _SF('Top of page', 'heroIntro', 'Intro paragraph', 1),
  _SF('Top of page', 'f1t', 'Point 1 — bold'), _SF('Top of page', 'f1d', 'Point 1 — text', 1), _SF('Top of page', 'f2t', 'Point 2 — bold'), _SF('Top of page', 'f2d', 'Point 2 — text', 1),
  _SF('Top of page', 'f3t', 'Point 3 — bold'), _SF('Top of page', 'f3d', 'Point 3 — text', 1),
  _SF('Estimator form', 'estTitle', 'Estimator heading'), _SF('Estimator form', 'legend1', 'Step 1 heading'), _SF('Estimator form', 'lBiz', 'Name field'), _SF('Estimator form', 'lMkt', 'Market field'),
  _SF('Estimator form', 'lYrs', 'Years field'), _SF('Estimator form', 'lLoc', 'Locations field'), _SF('Estimator form', 'legend2', 'Step 2 heading'), _SF('Estimator form', 'lSales', 'Sales field'),
  _SF('Estimator form', 'lRent', 'Rent field'), _SF('Estimator form', 'lTrend', 'Trend question'),
  _SF('How it works', 'howTitle', 'Heading'), _SF('How it works', 'howIntro', 'Intro', 1), _SF('How it works', 's1t', 'Step 1 — title'), _SF('How it works', 's1d', 'Step 1 — text', 1),
  _SF('How it works', 's2t', 'Step 2 — title'), _SF('How it works', 's2d', 'Step 2 — text', 1), _SF('How it works', 's3t', 'Step 3 — title'), _SF('How it works', 's3d', 'Step 3 — text', 1),
  _SF('Buyers & questions', 'whoTitle', 'Buyers heading'), _SF('Buyers & questions', 'who1', 'Buyer line 1'), _SF('Buyers & questions', 'who2', 'Buyer line 2'), _SF('Buyers & questions', 'who3', 'Buyer line 3'), _SF('Buyers & questions', 'who4', 'Buyer line 4'),
  _SF('Buyers & questions', 'faqTitle', 'Questions heading'),
  _SF('Buyers & questions', 'q1', 'Question 1'), _SF('Buyers & questions', 'a1', 'Answer 1', 1), _SF('Buyers & questions', 'q2', 'Question 2'), _SF('Buyers & questions', 'a2', 'Answer 2', 1),
  _SF('Buyers & questions', 'q3', 'Question 3'), _SF('Buyers & questions', 'a3', 'Answer 3', 1), _SF('Buyers & questions', 'q4', 'Question 4'), _SF('Buyers & questions', 'a4', 'Answer 4', 1),
  _SF('Buyers & questions', 'q5', 'Question 5'), _SF('Buyers & questions', 'a5', 'Answer 5', 1),
  _SF('Bottom of page', 'ctaTitle', 'Closing heading'), _SF('Bottom of page', 'ctaIntro', 'Closing line'), _SF('Bottom of page', 'ctaBtn', 'Closing button'),
];
const SELL_HOME = [
  _SF('Search & browser', 'title', 'Browser tab title'), _SF('Search & browser', 'metaDesc', 'Google description', 1),
  _SF('Page', 'homeTitle', 'Headline'), _SF('Page', 'homeIntro', 'Intro', 1),
  _SF('One restaurant card', 'homeOne', 'Title'), _SF('One restaurant card', 'homeOneSub', 'Text', 1), _SF('One restaurant card', 'homeOneBtn', 'Button'),
  _SF('Several restaurants card', 'homeMany', 'Title'), _SF('Several restaurants card', 'homeManySub', 'Text', 1), _SF('Several restaurants card', 'homeManyBtn', 'Button'),
  _SF('Page', 'homeTrust', 'Line under the cards', 1),
];
const SELL_PAGES = [
  { id: 'shared', label: 'Brand & footer (all pages)', fields: SELL_SHARED },
  { id: 'home', label: 'Home — one or several', path: '/', tpl: 'sell_home.html', fields: SELL_HOME },
  { id: 'restaurant', label: 'One restaurant page', path: '/restaurant', tpl: 'sell_site.html', fields: SELL_LANDING },
  { id: 'groups', label: 'Restaurant groups page', path: '/groups', tpl: 'sell_site.html', fields: SELL_LANDING },
];
// The single-unit page shares the groups page's layout; these are its own default words.
const SELL_RESTAURANT_DEFAULTS = {
  title: 'Sell My Texas Restaurant — What is your restaurant worth?',
  metaDesc: 'Get a free value range for your Texas restaurant in two minutes, then meet qualified buyers. Confidential, no cost to talk.',
  heroTitle: 'What would a buyer pay for your restaurant?',
  heroIntro: 'Answer a few questions about the last 12 months and see a value range in about two minutes. If the number makes sense to you, we put your restaurant in front of buyers who are looking right now. Quietly.',
  f1d: 'Buyers sign an NDA before they learn your name or location. Your staff won’t hear it from us.',
  f2t: 'Real buyers.', f2d: 'Owner-operators, growing restaurant groups and investors buying restaurants in Texas today.',
  f3t: 'No cost to find out.', f3d: 'The value range and the first conversation are free.',
  legend1: 'Your restaurant', lBiz: 'Restaurant name', lMkt: 'Where', lYrs: 'Years open', lLoc: 'Locations', legend2: 'The last 12 months', lSales: 'Total sales', lRent: 'Monthly rent', lTrend: 'Sales compared with last year',
  s1d: 'Two minutes of questions about sales, costs and rent. The range is based on what buyers pay for Texas restaurants with similar earnings.',
  s2d: 'A specialist calls within one business day, looks at your real numbers with you, and tells you what a sale would look like.',
  s3d: 'If you decide to sell, we market your restaurant without naming it, screen every buyer, and handle the deal through closing.',
  who1: 'Profitable restaurants and bars with at least two years of history', who3: 'Owner-run spots and ones with a manager in place',
  q3: 'What if my sales are down?', a3: 'You still have options. Many restaurants sell as a space with its build-out and equipment, priced on the lease and location rather than earnings.',
  ctaTitle: 'Find out what your restaurant is worth',
};
function loadSellContent() {
  let c = {}; try { c = rj(SELL_CONTENT_FILE) || {}; } catch (e) { c = {}; }
  // Older saves were one flat list for a single page: brand/phone/footer → shared, the rest → groups.
  if (!c.shared && !c.groups && !c.home && !c.restaurant) { const o = { shared: {}, groups: {} }; Object.keys(c).forEach(k => { if (k.charAt(0) === '_') o[k] = c[k]; else if (['brand', 'phone', 'footer1', 'footer2'].indexOf(k) >= 0) o.shared[k] = c[k]; else o.groups[k] = c[k]; }); c = o; }
  return c;
}
function _htmlUnesc(t) { return String(t || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
const _sellTplCache = {};
function _sellTemplate(file) { const f = path.join(__dirname, 'public', file); try { const st = fs.statSync(f); const c = _sellTplCache[file]; if (!c || c.at !== st.mtimeMs) _sellTplCache[file] = { at: st.mtimeMs, html: fs.readFileSync(f, 'utf8') }; } catch (e) { return ''; } return _sellTplCache[file].html; }
const _sellSlotRe = k => new RegExp('(<([a-z0-9]+)\\b[^>]*\\bdata-k="' + k + '"[^>]*>)([\\s\\S]*?)(</\\2>)', 'g');
function _tplDefaults(html, keys) { const out = {}; keys.forEach(k => { if (k === 'metaDesc') { const m = html.match(/data-k="metaDesc" content="([^"]*)"/); out[k] = m ? _htmlUnesc(m[1]) : ''; return; } const m = _sellSlotRe(k).exec(html); out[k] = m ? _htmlUnesc(m[3]) : ''; }); return out; }
function sellDefaults(pageId) {
  const pg = SELL_PAGES.find(p => p.id === pageId); if (!pg) return {};
  if (pageId === 'shared') return Object.assign(_tplDefaults(_sellTemplate('sell_site.html'), SELL_SHARED.map(f => f[1])), { phone: '' });
  const d = _tplDefaults(_sellTemplate(pg.tpl), pg.fields.map(f => f[1]));
  return pageId === 'restaurant' ? Object.assign(d, SELL_RESTAURANT_DEFAULTS) : d;
}
function renderSellPage(pageId, base) {
  const pg = SELL_PAGES.find(p => p.id === pageId && p.tpl) || SELL_PAGES.find(p => p.id === 'home');
  let html = _sellTemplate(pg.tpl); const c = loadSellContent();
  const vals = Object.assign({}, pg.id === 'restaurant' ? SELL_RESTAURANT_DEFAULTS : {}, c[pg.id] || {}, c.shared || {});
  const E = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  Object.keys(vals).forEach(k => {
    const v = String(vals[k] == null ? '' : vals[k]).trim(); if (!v) return;
    if (k === 'metaDesc') { html = html.replace(/(data-k="metaDesc" content=")[^"]*(")/, (m0, a, b) => a + E(v) + b); return; }
    const txt = k === 'phone' ? (' · <a href="tel:' + E(v.replace(/[^0-9+]/g, '')) + '">' + E(v) + '</a>') : E(v.replace(/\s*\n\s*/g, ' '));
    html = html.replace(_sellSlotRe(k), (all, open, tag, inner, close) => open + txt + close);
  });
  html = html.replace(/data-variant="[a-z]+"/, 'data-variant="' + pg.id + '"').replace(/\{\{BASE\}\}/g, base || '');
  return html;
}
function renderSellSite() { return renderSellPage('home', ''); }   // back-compat
function _sellPageFor(p) { p = String(p || '/').replace(/\/+$/, '') || '/'; if (p === '/' || p === '/index.html') return 'home'; if (p === '/restaurant') return 'restaurant'; if (p === '/groups') return 'groups'; return ''; }
// Staff previews on the app's own domain (login required).
['/sell-site', '/sell-site/restaurant', '/sell-site/groups'].forEach(r => app.get(r, (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(renderSellPage(_sellPageFor(req.path.replace('/sell-site', '') || '/'), '/sell-site')); }));
app.get('/api/admin/sell-site', requireAdmin, (req, res) => {
  const c = loadSellContent();
  res.json({ ok: true, host: String(process.env.SELL_SITE_HOST || '').split(/[\s,]+/).filter(Boolean)[0] || '', updatedAt: c._updatedAt || '', by: c._by || '',
    pages: SELL_PAGES.map(pg => { const d = sellDefaults(pg.id), sv = c[pg.id] || {}; return { id: pg.id, label: pg.label, path: pg.path || '', fields: pg.fields.map(f => ({ group: f[0], k: f[1], label: f[2], long: !!f[3], def: d[f[1]] || '', value: sv[f[1]] || '' })) }; }) });
});
app.post('/api/admin/sell-site', requireAdmin, express.json({ limit: '256kb' }), (req, res) => {
  const pages = (req.body && req.body.pages) || {}; const out = {};
  SELL_PAGES.forEach(pg => { const vals = pages[pg.id] || {}; const d = sellDefaults(pg.id); const o = {};
    pg.fields.forEach(f => { const k = f[1]; const v = String(vals[k] == null ? '' : vals[k]).trim().slice(0, f[3] ? 1200 : 200); if (v && v !== d[k]) o[k] = v; });
    out[pg.id] = o; });
  out._updatedAt = new Date().toISOString(); out._by = (req.user && req.user.name) || '';
  try { if (!fs.existsSync(BOV_DATA_DIR)) fs.mkdirSync(BOV_DATA_DIR, { recursive: true }); if (!writeJsonGuarded(SELL_CONTENT_FILE, out, 'saveSellContent')) throw new Error('write'); } catch (e) { return res.status(500).json({ ok: false, error: 'Could not save. Try again.' }); }
  res.json({ ok: true, updatedAt: out._updatedAt });
});
