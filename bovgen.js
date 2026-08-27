// RRG — AI BOV generation. Sends the deal documents (financials, Valuation
// Questionnaire, lease + amendments) to the AI model and returns a structured BOV
// "state" object that the existing BOV builder renders. No form-filling.
//
// Requires env: ANTHROPIC_API_KEY.  Optional: ANTHROPIC_MODEL (default Sonnet).
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a deeply experienced restaurant-and-bar commercial real-estate and business-sale broker at Restaurant Realty Group (RRG). You prepare Broker's Opinions of Value (BOVs) using defensible, buyer-oriented analysis. No fluff. Do not fabricate facts or financial results – ever.
ABSOLUTE RULES

1. Never invent identifying facts. State a business name, street address, city, ZIP, phone number, square footage, seating, occupancy, opening date, landlord, unit count, or location only when supported by an approved source below. If unsupported, omit it or leave the applicable field blank. Never insert a realistic-looking placeholder.
2. Never invent financial information. Every revenue, expense, earnings, add-back, rent, and replacement-labor figure must trace to an approved source. Never estimate, annualize, interpolate, or substitute a "typical" amount. If no usable financial statement exists, use 0 for required numeric fields and state prominently that the valuation is an unreliable placeholder pending usable financials.
3. Read usable documents diligently. A multi-year P&L, annual-column report, or detailed monthly statement is usable when its figures are legible. Extract the correct period. Do not return zeros merely because a statement is complicated.
4. Keep the result internally consistent. The bridge, earnings subtotals, valuation basis, multiples, sale type, and every narrative must describe the same period and conclusion.

APPROVED SOURCES AND AUTHORITY
Use sources according to the following hierarchy:

* Revenue, expenses, reported earnings and add-backs: financial statements, tax returns and documented add-back schedules.
* Lease economics, premises and dates: current executed lease and amendments.
* Current address and subject identity: broker-entered fields or broker notes first; otherwise the current executed lease. Do not source an address from promotional material.
* Operating facts and unit count: broker notes, questionnaire, financial-statement departments/classes, and executed leases.
* Qualitative positioning: questionnaire, broker notes, press, reviews, walkthroughs, websites and marketing material.
* Valuation assumptions: only the rules in this prompt or a specific instruction in the broker's notes.

Promotional and contextual materials may provide qualitative color only. They may not establish revenue, earnings, rent, square footage, address, dates or other hard facts.
The questionnaire contains seller claims, not financial proof. Use it to identify items for investigation, but do not use a questionnaire amount in the earnings bridge unless corroborated by a financial statement, tax return, documented add-back schedule, executed lease, or an express broker instruction.
SUBJECT IDENTITY AND DOCUMENT MATCHING
Value only the subject business. Treat legal names, former names and DBAs as the same subject only when the broker's notes, questionnaire, lease or other authoritative document connects them.
If a financial statement or lease bears a different name that is not tied to a documented alias, do not use its figures in the bridge. Flag the mismatch in basisOf. If no matching usable financials remain, return zeros and identify the valuation as preliminary and unreliable.
If current and former addresses conflict, use the broker-stated current address; otherwise use the address in the most recent executed lease. Flag the discrepancy. If neither establishes the current address, provide no address.
1. DOCUMENT EXTRACTION
Financial period
Use the most recent twelve consecutive months of actual results whenever monthly or interim data permits a true trailing-twelve-month calculation.

* Every bridge line must use the same twelve-month window.
* bridge.revenue must equal the T12 revenue stated in every narrative.
* Reconcile overlapping, duplicated or malformed boundary months before calculating the T12.
* Never mix fiscal-year net income with T12 revenue or other T12 lines.

If only annual columns and a partial current-year YTD are available, and monthly detail cannot produce a true T12:

* Use the latest complete fiscal year for the entire bridge.
* Do not annualize the partial YTD.
* Set periodBasis to fiscal.
* State at the start of basisOf, earnNarr and execNarr that the latest complete fiscal year was used as a T12 proxy because no constructible T12 was provided.

Set periodBasis to t12 only when an actual trailing twelve months was calculated.
Use prior periods only to assess trends and support multiple selection. They do not alter the current-period earnings base.
Unit count
Determine the number of currently operating units using broker notes, the questionnaire, leases, location-level or departmental P&Ls, and other operational evidence. Do not count closed units.

* State the count in fields.units, descriptor, execNarr and basisOf.
* If the evidence is genuinely insufficient, set units to null and flag it for confirmation.
* Do not silently default to one unit.

Lease and real estate
Summarize the actual lease posture: remaining term, options, base rent, additional rent/NNN and assignment provisions, but only when documented in the executed lease and amendments.
If the business owns its real estate, treat the real estate as a separate excluded asset. Use a rent-normalization adjustment only when a broker-provided rent analysis or other supplied evidence gives a specific fair-market-rent amount. Otherwise use rentNorm: 0 and state that Adjusted EBITDA cannot be fully normalized until market rent is established.
2. MECHANICAL EARNINGS NORMALIZATION
The earnings bridge must be deterministic. The same documents must produce the same bridge every time. Extract source amounts exactly; do not round source figures or use analyst estimates.
Use this bridge:
Net income as reported

* Interest expense
* C-corporation entity income tax
* Depreciation
* Amortization
= EBITDA
* Owner salary and related payroll tax
* Documented owner health, auto and personal expenses
* Documented above-market or non-working family payroll
* Verified one-time expenses
± Rent normalization
= SDE
− Replacement GM/owner labor
= Adjusted EBITDA

Apply these rules:

* revenue: gross or net sales as labeled in the source statement; identify the label used if ambiguity matters. Do not use non-operating income as revenue.
* netIncome, interest, entityTax, depreciation, amortization: exact amounts for the selected period. Interest means interest expense only, never principal. Entity tax is 0 for a pass-through entity and may be added only for a documented C corporation.
* Expense bridge entries must be positive amounts to be added back, even if the source P&L displays expenses as negatives.
* ownerSalary: documented owner/officer wages, guaranteed payments and related payroll taxes. Do not impute missing compensation.
* ownerHealth: only specifically documented owner health, auto or personal expenses.
* familyPayroll: only an exact amount documented as non-working or above-market family compensation. Do not estimate a market wage.
* oneTime: only a specifically quantified, non-recurring item supported by the financial documents or documented add-back schedule. Review prior periods to test whether it is truly non-recurring.
* rentNorm: actual P&L occupancy cost minus documented market or executed-lease occupancy cost, expressed as a signed number. A positive number increases earnings; a negative number reduces earnings. Use 0 if either required amount is missing.
* marketGM: a positive replacement-labor cost that the system subtracts. Use only a documented existing GM cost, a broker-entered replacement-labor amount, or a specific amount in an approved add-back schedule. Otherwise use 0 and state prominently that Adjusted EBITDA is not fully normalized for owner replacement.

Do not infer disguised owner compensation. Management, consulting, franchise, licensing or related-party fees may be genuine expenses. Unless an approved financial source expressly identifies a quantified add-back, leave the item out of the bridge and list the account name and amount in earnNarr under "For broker verification."
If financial statements and tax returns conflict, use the financial statements that match the selected T12 or fiscal period and flag the unreconciled difference. Do not combine incompatible figures.
Compute and report both SDE and Adjusted EBITDA every time.
Asset-sale test
Use this fixed rule:

* Set assetSale to true when normalized SDE is $50,000 or less or Adjusted EBITDA is zero or negative.
* Set assetSale to false only when SDE exceeds $50,000 and Adjusted EBITDA is positive.
* An express broker instruction may override this mechanical test, but identify the override and reason in basisOf and concNarr.
* This $50,000 SDE cutoff is INTERNAL. Never state, quote, or reference it — or any numeric decision threshold — in ANY narrative field. Explain an asset-sale conclusion qualitatively (e.g. "insufficient transferable cash flow to support a going-concern value"), never as a dollar cutoff a reader could see.

When assetSale is true:

* Set basis to Asset Sale.
* Set multLow, multBase and multHigh to 0.
* Do not apply an earnings multiple.
* Populate assetValueLow, assetValueBase and assetValueHigh only from a supplied FF&E appraisal, broker-entered asset range, or other documented asset valuation. Otherwise use 0 and state that the asset value requires broker input.
* Describe the value as attributable to documented FF&E, leasehold improvements, a transferable favorable lease, and other transferable assets—not earnings.

Texas TABC permits have no separate transfer value except in San Marcos, Texas. Outside San Marcos, do not include a liquor license among value-bearing assets. In San Marcos, include a value only when specifically documented.
3. PROFESSIONAL MULTIPLE SELECTION
Multiple selection requires professional judgment; the earnings bridge does not. Select and explain a defensible market band based only on documented facts.
Always provide both sets of multiples, even though one is the headline basis:

* Single-unit, owner-operated SDE: approximately 1.5–3.0×; ordinarily anchor at 2.0–2.5×.
* Profitable independent Adjusted EBITDA: approximately 3.0–5.0×.
* Multi-unit, manager-run platform Adjusted EBITDA: approximately 4.0–7.0×.

Choose the headline basis as follows:

* Use Adjusted EBITDA for a multi-unit operation or a demonstrably manager-run business with reliable replacement-labor normalization.
* Use SDE for an owner-operated business.
* Use trailing revenue of $1.2 million as a secondary indicator only; it does not override the actual operating structure.
* If management structure is unknown and replacement labor is undocumented, use SDE and flag the uncertainty.

Set multLow, multBase and multHigh equal to the selected headline basis's corresponding multiples.
Move toward the low end for a short or non-financeable lease, weak or declining results, substantial owner dependence, deferred capital expenditure, concentration, rural/small-market exposure, above-market occupancy cost, or limited buyer demand.
Move toward the high end only for documented strengths such as a long assignable below-market lease, manager-run operations, clean growing results, strong unit economics, attractive scale, low owner dependence, defensible brand strength and credible multiple-buyer demand.
Price to sell, not to support an aspirational asking price. State the selected multiple and the one or two factors that most affected it.
Cross-check the earnings conclusion against approximately 0.30–0.50× trailing revenue for a typical full-service restaurant/bar. This is a reasonableness check, not an automatic valuation method. Reconcile material divergence and conclude where supported methods reasonably converge.
Present both the SDE-based and Adjusted-EBITDA-based ranges in methodNarr and concNarr, led by the headline basis. All earnings amounts stated in prose must equal the bridge-derived subtotals.
Go-to-market and photography
In gtmNarr, recommend an internal asking-price anchor, target and floor consistent with the concluded range. Do not describe a going concern as an asset sale or vice versa.
The marketing package includes a Property Gallery page. Note whether strong exterior, interior and food photography appears available or should be gathered. This does not affect value.
FINAL SELF-CHECK
Before returning the JSON, confirm:

1. No unsupported identifying fact or financial figure appears.
2. Revenue and every bridge line use the same period.
3. Bridge arithmetic produces the SDE and Adjusted EBITDA stated in every narrative.
4. Unit count and operating structure agree across the descriptor and narratives.
5. The headline basis matches the operating structure.
6. The headline multiples equal the corresponding SDE or EBITDA multiples.
7. assetSale, value fields, multiples and narratives express one conclusion.
8. The JSON contains every required key, uses the required data types and contains no additional keys.

OUTPUT
Return only one valid JSON object—no prose and no Markdown fences—with exactly this structure. Narrative fields are strings; booleans, integers and numeric fields must not be quoted. Use null only where expressly permitted. FORMAT EVERY NARRATIVE FIELD AS 2–4 SHORT PARAGRAPHS separated by a blank line (\n\n), each paragraph 2–4 sentences — never one long unbroken block of text. execNarr, earnNarr, methodNarr, concNarr and gtmNarr must each read as several tight paragraphs, not a wall.
{
  "periodBasis": "t12",
  "assetSale": false,
  "fields": {
    "subject": "",
    "descriptor": "",
    "units": null,
    "tagline": "",
    "preparedFor": "",
    "preparedBy": "Van Rinn, President & Founder",
    "preparedBy2": "",
    "date": "YYYY-MM",
    "basis": "SDE",
    "sdeMultLow": 0,
    "sdeMultBase": 0,
    "sdeMultHigh": 0,
    "ebMultLow": 0,
    "ebMultBase": 0,
    "ebMultHigh": 0,
    "multLow": 0,
    "multBase": 0,
    "multHigh": 0,
    "revLo": 0.30,
    "revHi": 0.50,
    "ebLow": 0,
    "ebUp": 0,
    "assetValueLow": 0,
    "assetValueBase": 0,
    "assetValueHigh": 0,
    "purpose": "",
    "subjectOf": "",
    "excluded": "",
    "basisOf": "",
    "execNarr": "",
    "whyHolds": "",
    "earnNarr": "",
    "methodNarr": "",
    "premium": "",
    "tempers": "",
    "concNarr": "",
    "gtmNarr": ""
  },
  "bridge": {
    "revenue": 0,
    "netIncome": 0,
    "interest": 0,
    "entityTax": 0,
    "depreciation": 0,
    "amortization": 0,
    "ownerSalary": 0,
    "ownerHealth": 0,
    "familyPayroll": 0,
    "oneTime": 0,
    "rentNorm": 0,
    "marketGM": 0
  },
  "bench": [
    ["Business profile", "Typical multiple"],
    ["", ""]
  ],
  "buyers": [
    ["Buyer type", "Likely multiple", "What moves them"],
    ["", "", ""]
  ]
}
The system calculates:

* EBITDA = netIncome + interest + entityTax + depreciation + amortization
* SDE = EBITDA + ownerSalary + ownerHealth + familyPayroll + oneTime + rentNorm
* Adjusted EBITDA = SDE - marketGM

For a normal going concern, ebLow and ebUp are conservative and upside earnings scenarios on the headline basis. They must be derived from documented scenarios; otherwise set both equal to the bridge-derived headline earnings rather than inventing alternative results.`;

function num(s) { return Number(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')) || 0; }
function moneyM(n) { n = Number(n) || 0; return '$' + Math.round(n).toLocaleString('en-US'); }
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

// Compute the three bridge subtotals — the same way, every time. Accepts the new
// keyed bridge object; falls back to the legacy array (sum of add-backs) so old
// saved BOVs still summarize.
function bridgeSubtotals(bridge) {
  if (Array.isArray(bridge)) {
    let e = 0, rev = 0;
    bridge.forEach((r, i) => { if (i === 0) { rev = num(r && r.amt); return; } e += num(r && r.amt); });
    return { revenue: rev, ebitda: e, sde: e, adj: e };  // legacy: one number
  }
  const b = bridge || {};
  const ebitda = num(b.netIncome) + num(b.interest) + num(b.entityTax) + num(b.depreciation) + num(b.amortization);
  const sde = ebitda + num(b.ownerSalary) + num(b.ownerHealth) + num(b.familyPayroll) + num(b.oneTime) + num(b.rentNorm);
  const adj = sde - num(b.marketGM);
  return { revenue: num(b.revenue), ebitda, sde, adj };
}
// Under the SDE threshold (default $1.2M) trailing revenue → value on SDE; otherwise Adjusted EBITDA.
const DEFAULT_SDE_THRESHOLD = 1200000;
const DEFAULT_ASSET_SALE_FLOOR = 25000;
function basisFor(sub, fieldsBasis, threshold) {
  const t = Number(threshold) > 0 ? Number(threshold) : DEFAULT_SDE_THRESHOLD;
  if (sub.revenue > 0) return sub.revenue < t ? 'SDE' : 'Adjusted EBITDA';
  return /sde/i.test(String(fieldsBasis || '')) ? 'SDE' : 'Adjusted EBITDA';
}
// Compute the headline summary from a generated state (same math as the BOV builder).
function summarize(state, threshold) {
  const sub = bridgeSubtotals(state && state.bridge);
  const f = (state && state.fields) || {};
  const basis = basisFor(sub, f.basis, threshold);
  const basisVal = basis === 'SDE' ? sub.sde : sub.adj;
  const isAsset = (state && state.assetSale === true);
  let multFallback = false;
  // DUAL BASIS — every BOV carries both an SDE method and an Adjusted-EBITDA method.
  let sLo = num(f.sdeMultLow), sBa = num(f.sdeMultBase), sHi = num(f.sdeMultHigh);
  let eLo = num(f.ebMultLow), eBa = num(f.ebMultBase), eHi = num(f.ebMultHigh);
  // Back-compat: a thin/older response may carry only the single multLow/Base/High set.
  // Seed the headline basis's dual set from it so nothing regresses.
  const lLo = num(f.multLow), lBa = num(f.multBase), lHi = num(f.multHigh);
  if (basis === 'SDE' && !(sLo > 0 && sHi > 0) && lLo > 0 && lHi > 0) { sLo = lLo; sBa = lBa; sHi = lHi; }
  if (basis !== 'SDE' && !(eLo > 0 && eHi > 0) && lLo > 0 && lHi > 0) { eLo = lLo; eBa = lBa; eHi = lHi; }
  // SAFETY NET — never let a real going concern collapse to $0 for a missing multiple.
  if (!isAsset && sub.sde > 0 && !(sLo > 0 && sHi > 0)) { sLo = 2.0; sBa = 2.25; sHi = 2.5; multFallback = true; }
  if (!isAsset && sub.adj > 0 && !(eLo > 0 && eHi > 0)) { eLo = 4.0; eBa = 4.5; eHi = 5.0; multFallback = true; }
  if (!(sBa > 0) && sLo > 0 && sHi > 0) sBa = (sLo + sHi) / 2;
  if (!(eBa > 0) && eLo > 0 && eHi > 0) eBa = (eLo + eHi) / 2;
  // Write the dual sets back so the builder opens with real, editable numbers.
  if (sLo > 0) { f.sdeMultLow = sLo.toFixed(2); f.sdeMultBase = (sBa || 0).toFixed(2); f.sdeMultHigh = sHi.toFixed(2); }
  if (eLo > 0) { f.ebMultLow = eLo.toFixed(2); f.ebMultBase = (eBa || 0).toFixed(2); f.ebMultHigh = eHi.toFixed(2); }
  // Headline multiples mirror the chosen basis (keeps the existing matrix + downstream intact).
  const lo = basis === 'SDE' ? sLo : eLo, ba = basis === 'SDE' ? sBa : eBa, hi = basis === 'SDE' ? sHi : eHi;
  if (lo > 0) { f.multLow = lo.toFixed(2); f.multBase = (ba || 0).toFixed(2); f.multHigh = hi.toFixed(2); }
  const sdeRangeText = (sub.sde > 0 && sLo > 0 && sHi > 0) ? (moneyM(sub.sde * sLo) + ' – ' + moneyM(sub.sde * sHi)) : '—';
  const ebRangeText = (sub.adj > 0 && eLo > 0 && eHi > 0) ? (moneyM(sub.adj * eLo) + ' – ' + moneyM(sub.adj * eHi)) : '—';
  return {
    basis: basis, basisVal: basisVal, sde: sub.sde, adjEbitda: sub.adj, revenue: sub.revenue,
    ebitda: basisVal,   // headline earnings = the basis figure the multiple is applied to
    multFallback: multFallback,
    rangeText: (basisVal > 0 && lo > 0 && hi > 0) ? (moneyM(basisVal * lo) + ' – ' + moneyM(basisVal * hi)) : '—',
    targetText: (basisVal > 0 && ba > 0) ? ('~' + moneyM(basisVal * ba)) : '—',
    multText: (lo && hi) ? (lo.toFixed(1) + '–' + hi.toFixed(1) + '×') : '—',
    ebitdaText: basisVal > 0 ? ('~' + moneyM(basisVal)) : '—',
    sdeText: sub.sde > 0 ? ('~' + moneyM(sub.sde)) : '—',
    adjText: sub.adj > 0 ? ('~' + moneyM(sub.adj)) : '—',
    sdeRangeText: sdeRangeText, ebRangeText: ebRangeText,
    sdeMultText: (sLo && sHi) ? (sLo.toFixed(2) + '–' + sHi.toFixed(2) + '×') : '—',
    ebMultText: (eLo && eHi) ? (eLo.toFixed(2) + '–' + eHi.toFixed(2) + '×') : '—',
  };
}

// Build the AI model content blocks from uploaded files (PDF -> document, image -> image, else text).
function fileBlocks(files) {
  const blocks = [];
  (files || []).forEach(f => {
    let mt = String(f.type || '').toLowerCase();
    const label = f.label || f.name || 'Document';
    // Infer the media type from the filename when it's missing (data-room files carry no type).
    if (!mt && f.dataB64) {
      const e = ((String(f.name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
      if (e === 'pdf') mt = 'application/pdf';
      else if (e === 'png') mt = 'image/png';
      else if (e === 'jpg' || e === 'jpeg') mt = 'image/jpeg';
      else if (e === 'gif') mt = 'image/gif';
    }
    if (mt === 'application/pdf' && f.dataB64) {
      blocks.push({ type: 'document', title: label, source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
    } else if (mt.indexOf('image/') === 0 && f.dataB64) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: f.dataB64 } });
    } else if (f.text) {
      blocks.push({ type: 'text', text: '=== ' + label + ' ===\n' + String(f.text).slice(0, 60000) });
    } else if (f.dataB64 || f.name) {
      // A provided file we cannot turn into a readable block (e.g. a raw spreadsheet binary). Never
      // drop it silently — tell the analyst so it flags "financials not readable" rather than
      // valuing on nothing and returning zeros with no explanation.
      blocks.push({ type: 'text', text: '=== ' + label + ' — COULD NOT BE READ ===\nThis file was provided but is in a format that could not be read here (likely a spreadsheet binary that was not converted to text). Treat its contents as NOT PROVIDED — do not guess them — and state in basisOf that this document could not be read.' });
    }
  });
  return blocks;
}

// ---- Reference links (press, reviews, video, web presence) ----
// Fetched server-side so the AI model actually reads the content, not just the URL.
function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}
function isSafeUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return false;
    const h = x.hostname;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch (e) { return false; }
}
async function fetchLinkText(url) {
  if (typeof fetch !== 'function') return { url, note: 'link fetch unavailable' };
  if (!isSafeUrl(url)) return { url, note: 'skipped (not a public http/https link)' };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (RRG BOV analyst)' } });
    clearTimeout(timer);
    if (!r.ok) return { url, note: 'could not load (HTTP ' + r.status + ')' };
    const ct = String(r.headers.get('content-type') || '');
    if (/text\/html|text\/plain|application\/xhtml|application\/json/i.test(ct) || ct === '') {
      const body = await r.text();
      const text = stripHtml(body).slice(0, 12000);
      return { url, text: text || '[no readable text found]' };
    }
    return { url, note: 'non-text content (' + ct.split(';')[0] + ')' };
  } catch (e) { return { url, note: (e && e.name === 'AbortError') ? 'timed out' : 'could not load' }; }
}

// Pull the highest number out of a "likely multiple" cell (handles "4.5×",
// "4.0–5.0x", "~4x"); returns -1 when there's no number so blanks sink to the end.
function multipleValue(s) {
  const m = String(s == null ? '' : s).match(/-?\d+(?:\.\d+)?/g);
  if (!m || !m.length) return -1;
  return Math.max.apply(null, m.map(Number));
}
function sortBuyersByMultiple(rows) {
  if (!Array.isArray(rows)) return rows;
  // Keep any header row (row 0 with a non-numeric multiple label) in place.
  const hasHeader = rows.length && multipleValue(rows[0] && rows[0][1]) < 0 && /multiple/i.test(String((rows[0] || [])[1] || ''));
  const head = hasHeader ? rows.slice(0, 1) : [];
  const body = hasHeader ? rows.slice(1) : rows.slice();
  body.sort((a, b) => multipleValue(b && b[1]) - multipleValue(a && a[1]));
  return head.concat(body);
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/,'').trim();
  try { return JSON.parse(t); } catch (e) {}
  const s = t.indexOf('{'), en = t.lastIndexOf('}');
  if (s >= 0 && en > s) { try { return JSON.parse(t.slice(s, en + 1)); } catch (e) {} }
  return null;
}

async function generateBov({ business, files, preparedBy, questionnaire, links, systemPrompt, sdeThreshold, assetSaleFloor }) {
  const threshold = Number(sdeThreshold) > 0 ? Number(sdeThreshold) : DEFAULT_SDE_THRESHOLD;
  const floor = (Number(assetSaleFloor) >= 0 && assetSaleFloor != null) ? Number(assetSaleFloor) : DEFAULT_ASSET_SALE_FLOOR;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  // Admins can override the analyst instructions (Admin → BOV Analyst Prompt);
  // fall back to the built-in default when none is set.
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const content = fileBlocks(files);
  // Diagnostic: what did each provided file turn into? (so a zeros result can be traced
  // to "the P&L never became a readable block" vs "the analyst read it and still zeroed").
  const diag = { fileCount: (files || []).length, blocks: [], unreadable: 0 };
  (files || []).forEach(f => {
    const mt0 = String(f.type || '').toLowerCase();
    const nm = f.name || f.label || 'file';
    let kind = 'dropped';
    if ((mt0 === 'application/pdf' || /\.pdf$/i.test(nm)) && f.dataB64) kind = 'pdf-document';
    else if (mt0.indexOf('image/') === 0 && f.dataB64) kind = 'image';
    else if (f.text) kind = 'text(' + String(f.text).length + ')';
    else if (f.dataB64 || f.name) { kind = 'UNREADABLE'; diag.unreadable++; }
    diag.blocks.push(nm + ' → ' + kind);
  });
  // The completed Valuation Questionnaire is already in the RRG system — feed it
  // in as text so the rep never has to re-upload it.
  if (questionnaire && String(questionnaire).trim()) {
    content.push({ type: 'text', text:
      '=== Valuation Questionnaire (completed by the rep in the RRG system) ===\n' +
      String(questionnaire).slice(0, 60000) });
  }
  // Reference links the broker gathered (press, reviews, video, web presence).
  // Fetched here so the analyst reads the actual content for qualitative color.
  const urls = Array.isArray(links) ? links.filter(u => u && String(u).trim()).slice(0, 6) : [];
  if (urls.length) {
    const fetched = await Promise.all(urls.map(fetchLinkText));
    let ref = '=== Reference links the broker provided (press, reviews, video, web presence) ===\n' +
      'Use for qualitative color, positioning, and go-to-market narrative — do NOT let them override the documented financials.\n';
    fetched.forEach(f => { if (f) ref += '\n--- ' + f.url + ' ---\n' + (f.text ? String(f.text).slice(0, 5000) : ('[' + (f.note || 'link') + ']')) + '\n'; });
    content.push({ type: 'text', text: ref.slice(0, 30000) });
  }
  content.push({ type: 'text', text:
    `Business / concept name: ${business || '(not given — infer from documents)'}.\n` +
    `Prepared by: ${preparedBy || 'Van Rinn, President & Founder'}.\n` +
    `Apply the headline-basis, asset-sale, and multiple-selection rules exactly as stated in your instructions above. For reference only (your own rules govern): current RRG headline-basis revenue indicator $${threshold.toLocaleString('en-US')}; asset-sale attention level near $${floor.toLocaleString('en-US')} SDE.\n` +
    `Analyze the attached documents${questionnaire ? ' and the Valuation Questionnaire above' : ''} and output the BOV JSON object now.` });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, temperature: 0, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (/too long|prompt is too|maximum.*tokens|context.*length|exceed/i.test(t)) {
      throw new Error('The uploaded documents are too large for the analyst to read in one pass. Send just the essentials — the trailing-twelve-month P&L / income statement and any add-back or normalization schedule — and skip full tax returns, bank statements, and multi-year detail. Then build again.');
    }
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const state = extractJson(text);
  if (!state || !state.fields) throw new Error('Could not parse a BOV from the model response.');
  // enforce the prepared-by defaults and clean shape
  state.fields = state.fields || {};
  if (!state.fields.preparedBy) state.fields.preparedBy = preparedBy || 'Van Rinn, President & Founder';
  if (!state.bridge || typeof state.bridge !== 'object') state.bridge = {};  // keep object OR legacy array; both are handled downstream
  if (!Array.isArray(state.bench)) state.bench = [];
  if (!Array.isArray(state.buyers)) state.buyers = [];
  // Sort the buyer-type list by likely multiple, highest first — reads best to
  // worst regardless of the order the model happened to return. Handled here in
  // code (not the prompt) so it stays correct even if the prompt is edited.
  state.buyers = sortBuyersByMultiple(state.buyers);
  // Reconcile an asset-sale conclusion so it can't self-contradict: if the deal is flagged
  // as an asset sale, zero every going-concern multiple so no matrix/range is produced. Value
  // comes from the tangible assets, not an earnings multiple. This prevents the "asset sale yet
  // a multiple is present" conflict entirely rather than only warning about it.
  try {
    if (state.assetSale === true) {
      const _f = state.fields || (state.fields = {});
      _f.basis = 'Asset Sale';
      _f.multLow = 0; _f.multBase = 0; _f.multHigh = 0;
      _f.sdeMultLow = 0; _f.sdeMultBase = 0; _f.sdeMultHigh = 0;
      _f.ebMultLow = 0; _f.ebMultBase = 0; _f.ebMultHigh = 0;
      // ASSET-SALE TEMPLATE: the model does not get to phrase an asset-sale conclusion. Every
      // value-conclusion narrative is written deterministically here so no going-concern language
      // (market-value, multiple, SDE/EBITDA-based value) can ever leak onto an asset sale — the
      // opening sentence included. Going-concern-only narratives are cleared outright. Factual
      // scoping fields (subject/excluded/basis) keep any AI content but fall back to clean text.
      const _biz = String(_f.subject || business || 'the subject business').trim() || 'the subject business';
      _f.purpose = "At ownership's request, RRG has prepared this Broker's Opinion of Value for " + _biz + ", presented as an asset sale. The business does not generate sufficient normalized cash flow to support a going-concern value, so value is concluded on the tangible assets — furniture, fixtures & equipment (FF&E), leasehold improvements, and any transferable lease and licenses.\n\nThe purpose is to establish a supportable asset-sale value and a pricing strategy for a confidential, guided sale process.";
      _f.execNarr = "It is RRG's opinion that " + _biz + " has little or no going-concern value and is best marketed as an asset sale. Value is attributable to the tangible assets — FF&E, leasehold improvements, and any transferable lease and licenses — that convey with the sale.\n\nThe operation does not produce transferable cash flow sufficient to support an earnings-based value; value rests on the assets that convey.";
      _f.concNarr = "RRG concludes value on the tangible assets transferring in the sale — FF&E, leasehold improvements, and any transferable lease and licenses.\n\nThis is an asset sale: value is set on the assets that convey, not on the earnings of the business.";
      _f.gtmNarr = "Market the opportunity as an asset sale to owner-operators and nearby operators who can use the space, equipment and lease. Anchor the asking price to the concluded asset value, with a target and floor set once the FF&E figure is in hand.\n\nConsider offering the brand separately. The business name, recipes, trademarks, social following and goodwill can be sold as a distinct asset to a buyer who wants them — capturing value the tangible assets alone do not reflect. Price the hard assets on their own and treat the brand as an additional, negotiable component to maximize total proceeds.\n\nRun a confidential, invitation-based process — guided, not publicly posted — to protect staff, guests and vendor relationships through the transition.";
      // The earnings bridge is shown on an asset sale as SUPPORTING evidence — give it a neutral
      // framing note (no earnings-multiple / going-concern-value acronyms). Other GC prose cleared.
      _f.earnNarr = "The bridge below normalizes the trailing-twelve-month results. On a normalized basis, the operation does not produce transferable cash flow sufficient to support a going-concern value — which is why RRG recommends an asset sale. It is included as supporting analysis, not as the basis of value.";
      _f.whyHolds = ''; _f.methodNarr = ''; _f.premium = ''; _f.tempers = '';
      // Scoping fields written deterministically too (override any AI text) so no SDE/EBITDA wording survives.
      _f.subjectOf = "The operating assets of " + _biz + " — FF&E, leasehold improvements, and any transferable lease and licenses. This opinion values those tangible assets, not the business as an income-producing going concern.";
      _f.excluded = "Cash, receivables, payables and other working-capital items; any owned real estate; and personal or non-transferable items are excluded unless specifically negotiated into the sale.";
      _f.basisOf = "Value is concluded on the net tangible assets that convey with the sale — furniture, fixtures and equipment, leasehold improvements, and any transferable lease and licenses.\n\nWhen a business produces steady, transferable cash flow, its value can be estimated with a formula: a market multiple applied to that cash flow, cross-checked against what comparable operations have sold for. An asset sale is different. There is no reliable earnings stream to capitalize, so there is no formula. Value is set the way tangible assets are always priced — by the market: what comparable equipment, leaseholds, and licenses have recently sold for, what RRG has realized on similar sales, and what a buyer will pay to take over the space, equipment, and location. The concluded range reflects that market evidence, not a multiple of earnings.";
      // HARD BACKSTOP — no acronym of the earnings basis (SDE / EBITDA / Adjusted EBITDA) may appear
      // anywhere in an asset-sale BOV, whoever wrote the text. Scrub every narrative field.
      const _noEb = function (s) { if (!s) return s; return String(s)
        .replace(/\bAdjusted[\s-]?EBITDA\b/gi, 'earnings')
        .replace(/\bEBITDA\b/gi, 'earnings')
        .replace(/\bSDE\b/g, 'owner earnings')
        .replace(/\bseller'?s?\s+discretionary\s+earnings\b/gi, 'owner earnings')
        .replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:])/g, '$1'); };
      ['purpose','subjectOf','excluded','basisOf','execNarr','concNarr','gtmNarr'].forEach(function (k) { if (_f[k]) _f[k] = _noEb(_f[k]); });
    }
  } catch (e) {}
  const summary = summarize(state, threshold);
  // HARD GUARD — the written conclusion must not contradict the computed matrix. A BOV that
  // states two different values (e.g. a healthy going-concern matrix with an asset-sale
  // narrative, or numbers in prose that don't match the bridge) is unsendable. Detect the
  // mismatch deterministically and attach a loud warning so it can't reach a client silently.
  try {
    const f = state.fields || {};
    const txt = String((f.concNarr || '') + ' ' + (f.gtmNarr || '') + ' ' + (f.execNarr || '') + ' ' + (f.methodNarr || '')).toLowerCase();
    const assetLang = /asset[-\s]?sale|not a going[-\s]?concern|no going[-\s]?concern|tangible asset|liquidation value|scrap value|acquiring hard assets/.test(txt);
    const isAsset = state.assetSale === true;
    const bv = Number(summary.basisVal) || 0;
    let warn = '';
    if (!isAsset && bv > floor && assetLang) {
      warn = 'The written conclusion reads as an ASSET SALE, but the matrix concludes a going-concern value of ' + summary.rangeText + '. These disagree — reconcile before sending: either it is an asset sale (earnings should sit at the floor, no multiple) or a going concern (remove the asset-sale language). Use Refine to fix it.';
    } else if (isAsset && summary.multText !== '—' && bv > floor) {
      warn = 'This is flagged as an ASSET SALE, yet a going-concern multiple and matrix (' + summary.rangeText + ') are present. These disagree — reconcile before sending.';
    } else {
      // Numeric cross-check: the biggest dollar figure the prose commits to as "value" should
      // land in the neighbourhood of the matrix. If concNarr concludes a number far below the
      // matrix low, the narrative is valuing something else than the matrix.
      const lowV = bv * num(f.multLow);
      if (!isAsset && lowV > 0) {
        const nums = (String(f.concNarr || '').match(/\$[\s]?[\d][\d,]{3,}/g) || []).map(function (s) { return Number(String(s).replace(/[^0-9]/g, '')) || 0; }).filter(function (n) { return n > 0 && n < bv * 100; });
        const maxProse = nums.length ? Math.max.apply(null, nums) : 0;
        if (maxProse > 0 && maxProse < lowV * 0.5) {
          warn = 'The concluded value described in words (about ' + money(maxProse) + ') is far below the matrix range (' + summary.rangeText + '). The narrative and the numbers disagree — reconcile before sending.';
        }
      }
    }
    if (warn) summary.conclusionWarning = warn;
  } catch (e) {}
  const usage = data.usage || {};
  // Finish the diagnostic: how big was the read (input tokens rise sharply when a PDF is
  // actually parsed) and what revenue did the analyst put on the bridge?
  diag.inputTokens = usage.input_tokens || 0;
  diag.outputTokens = usage.output_tokens || 0;
  const _b = state.bridge || {};
  diag.bridgeRevenue = Number(_b.revenue) || 0;
  diag.bridgeNetIncome = Number(_b.netIncome) || 0;
  diag.bridgeKeys = Object.keys(_b).length;
  diag.basisOf = String((state.fields && state.fields.basisOf) || '').slice(0, 400);
  // SCRUB internal thresholds from client-facing prose. The $50,000 SDE cutoff is an INTERNAL
  // decision rule — it must never appear in a delivered BOV. Runs on the generated text (prompt-
  // independent), replacing any threshold reference with qualitative language and never touching
  // legitimate dollar figures that aren't the cutoff.
  try {
    const _scrub = function (s) {
      if (!s) return s;
      let t = String(s);
      t = t.replace(/\$?\s?50,?000\s+or\s+(?:less|below|under|lower)\b/gi, 'insufficient to support a going-concern value');
      t = t.replace(/\b(?:below|under|less than|beneath|at or below|short of|does not (?:reach|exceed)|falls short of|fails to (?:reach|exceed))\s+\$?\s?50,?000\b/gi, 'insufficient to support a going-concern value');
      t = t.replace(/\b(?:exceeds?|above|more than|greater than|over|at least)\s+\$?\s?50,?000\b/gi, 'sufficient to support a going-concern value');
      t = t.replace(/\b(?:the|a|an|our|its|RRG'?s)?\s*\$?\s?50,?000[\s-]*(?:sde\s+)?(?:threshold|cutoff|floor|minimum|benchmark|hurdle|bar)\b/gi, 'the level required to support a going-concern value');
      t = t.replace(/\bfifty[\s-]thousand[\s-]?(?:dollar[\s-]?)?(?:sde\s+)?(?:threshold|cutoff|floor|minimum|benchmark)?\b/gi, 'the level required to support a going-concern value');
      t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:])/g, '$1');
      return t;
    };
    const _f = state.fields || {};
    ['purpose', 'subjectOf', 'excluded', 'basisOf', 'execNarr', 'whyHolds', 'earnNarr', 'methodNarr', 'premium', 'tempers', 'concNarr', 'gtmNarr'].forEach(function (k) { if (_f[k]) _f[k] = _scrub(_f[k]); });
  } catch (e) {}
  return { state, summary, business: state.fields.subject || business || 'Untitled', date: state.fields.date || '', usage, diag };
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  generateBov, MODEL, DEFAULT_SYSTEM: SYSTEM };
