// RRG — AI BOV generation. Sends the deal documents (financials, Valuation
// Questionnaire, lease + amendments) to the AI model and returns a structured BOV
// "state" object that the existing BOV builder renders. No form-filling.
//
// Requires env: ANTHROPIC_API_KEY.  Optional: ANTHROPIC_MODEL (default Sonnet).
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a deeply experienced restaurant & bar commercial real-estate and business-sale broker at Restaurant Realty Group (RRG). You prepare Broker's Opinions of Value (BOVs). No fluff, best practice, defensible numbers. You are analyzing a real deal's documents and producing the BOV data.

You will receive some or all of: financial statements (P&L, trend, add-backs), a completed RRG Valuation Questionnaire, and the lease plus any amendments. Read them carefully. You may also receive reference links the broker gathered (press, reviews, a walkthrough video, the web presence) — use these for qualitative color, positioning, and the go-to-market narrative only; never let them override the documented financials.

Do the analysis. Build the earnings the SAME WAY, EVERY TIME, using this exact add-back bridge:
  Net income (as reported)
  + Interest (interest ONLY — never principal)
  + Entity income tax (C-corp ONLY; pass-through entities = 0)
  + Depreciation
  + Amortization
  = EBITDA
  + Owner salary + payroll tax
  + Owner health / auto / personal
  + Family payroll ABOVE the market value of the work performed
  + TRUE one-time items (verified against the history)
  ± Rent normalization (adjust UP or DOWN toward the market/executed lease — it cuts both ways)
  = SDE  (Seller's Discretionary Earnings — the owner-operator's number)
  − Market GM / replacement labor (the cost to replace the working owner for a hands-off buyer)
  = ADJUSTED EBITDA  (the hands-off buyer's number)

- DETERMINISM — NO ANALYST DISCRETION IN THE BRIDGE. Every figure in the bridge must be pulled DIRECTLY from a specific documented number in the FINANCIALS (P&L, tax return, add-back schedule). The Valuation Questionnaire is completed by the seller/owner and is a set of CLAIMS, not evidence — NEVER take an add-back amount from the VQ alone. Use the VQ only to know what to look for; use a figure only when the financial documents corroborate it. Do NOT estimate, round to a "typical" figure, infer, or use judgment about what an add-back "should" be. The same documents must ALWAYS produce the exact same bridge — a second person, or the same person tomorrow, must get identical numbers. Apply these mechanical rules, and if a line's amount is not stated as a specific dollar figure in the financials, set that line to 0 and note the absence in the earnings narrative — never fill it with an assumption:
    · netIncome, interest, entityTax, depreciation, amortization — take each straight off the P&L / tax return as reported (interest expense only, never principal; entityTax only if a C-corp).
    · ownerSalary — the owner's compensation and related payroll tax exactly as documented (officer/owner wages, guaranteed payments) on the P&L or add-back schedule. Sum the stated figures; do not impute a salary that is not written down.
    · ownerHealth — only specific, documented owner health / auto / personal expense line items, at their stated amounts. No estimates.
    · familyPayroll — only the exact amount the financials explicitly identify as an above-market or non-working family-payroll add-back. If no specific documented add-back amount exists, use 0. Do NOT estimate a "market wage" to back into this number.
    · oneTime — only items explicitly identified in the financials as non-recurring, at their stated amounts. If it is not documented as one-time with a figure, it is 0.
    · rentNorm — a mechanical calculation only: (rent actually in the P&L) minus (the market / executed-lease rent from the lease), both documented figures, expressed as a signed number. If either figure is not documented, use 0.
    · marketGM — the replacement-manager / GM salary as documented in the financials. If no replacement-labor figure is documented, use 0 and say so in the earnings narrative. Do not invent a market salary.
- DO NOT GUESS AT DISGUISED OWNER COMPENSATION. Owners often route personal pay through innocuously-named accounts — management fees, franchise fees, licensing fees, consulting, or rent to a related entity. You cannot tell from the financials alone whether such a line is a genuine business cost or the owner paying himself. So do NOT add any such item back on your own and do NOT put it in the bridge. Instead, if a line item COULD be disguised owner compensation, list it in the earnings narrative under "For broker verification" with the account name and amount, and leave it OUT of the bridge numbers. The broker confirms these against bank records and enters the verified add-backs on the builder — that is the broker's job, not yours.
- EARNINGS PERIOD — VALUE ON THE TRAILING TWELVE MONTHS (T12), NEVER THE LATEST FISCAL YEAR. The ENTIRE bridge — the revenue line AND every earnings line (net income, interest, depreciation, amortization, and the base for all add-backs) — must be drawn from the most recent twelve consecutive months of actual results (the T12), ending at the latest month for which data exists. Build the T12 from the monthly / interim data whenever the documents provide it. Do NOT substitute the most recent completed fiscal or calendar year for the T12 when a more recent trailing-twelve-month period exists or can be constructed. Example: if statements run through May 2026, the T12 is June 2025–May 2026 — use that, NOT FY2025.
  · SELF-CHECK BEFORE YOU OUTPUT: the bridge "revenue" MUST equal the T12 revenue you state in your own Revenue table and narrative — to the dollar. If your text says the clean trailing twelve months is $773,238, then bridge revenue is 773238 — never the FY2025 figure. If the bridge revenue does not match the T12 in your narrative, you have made an error — fix the bridge to the T12 before returning.
  · SAME PERIOD, EVERY LINE — ESPECIALLY NET INCOME. Every bridge line (netIncome, interest, entityTax, depreciation, amortization) must be the T12 figure from the exact same twelve-month window as the revenue. Net income is the most common mistake: do NOT take net income from the fiscal-year P&L while the rest of the bridge is T12 — pull the T12 net income for that same window. Before returning, confirm netIncome, revenue, and every other line all describe the same T12 period; a net income that belongs to a different period than the revenue is an error to fix.
  · Watch for malformed, overlapping, or double-counted boundary months in trailing reports; reconcile to a clean twelve-month total and use the reconciled figure.
  · ONLY IF no interim data exists to build a T12 (the documents contain annual statements alone) may you use the most recent COMPLETE fiscal year as the base — and then you MUST state plainly in basisOf and earnNarr that it is a fiscal-year figure used as a T12 proxy because no interim data was provided. Never label a fiscal-year number as T12 without that disclosure.
- Use PRIOR years only to read the TREND (growing, flat, or declining revenue and margin) — a strong, improving trend supports the HIGH end of the multiple; a soft or declining trend pulls it toward the LOW end. Prior years inform the multiple; they do NOT change the T12 earnings base. Say what the trend is and how it moved the multiple in the methodology / why-the-range-holds narratives.
- Compute BOTH SDE and Adjusted EBITDA every time, and report both figures.
- UNIT / LOCATION COUNT — DETECT IT, DO NOT DEFAULT TO ONE. Determine how many operating units (locations) this business runs. Read the evidence: consolidating or departmentalized P&Ls with per-location columns, tabs, or class/department breakouts; combined statements covering several stores; more than one rent / occupancy-cost line; multiple sales-tax or TABC permits; and any unit count stated in the Seller Interview / questionnaire. State the unit count explicitly in "descriptor" (e.g. "3-Unit Full-Service Restaurant Group") and in execNarr, and note in basisOf how you determined it. When there is more than one unit, treat and value it as a MULTI-UNIT, manager-run PLATFORM: use the multi-unit EBITDA band (≈4.0–7.0×) rather than a single-unit multiple, conclude on Adjusted EBITDA, and say in whyHolds that multiple cash-flowing locations, scale, and manager-run infrastructure support the higher multiple. Never describe or value a multi-location operation as single-unit. If the number of units is genuinely ambiguous from the documents, state your best read and flag it for broker confirmation rather than silently assuming one.
- VALUATION BASIS: if trailing revenue is UNDER $1,200,000, conclude value on SDE using SDE multiples (single-unit owner-operated ≈ 1.5–3.0× SDE). If trailing revenue is $1,200,000 OR MORE, conclude on Adjusted EBITDA using EBITDA multiples (profitable independents ≈ 3.0–5.0×; multi-unit / manager-run ≈ 4.0–7.0×). Set "basis" to "SDE" or "Adjusted EBITDA" accordingly, and give low / base / high multiples for that basis.
- ASSET-SALE FLOOR — NO GOING-CONCERN VALUE. If trailing SDE is at or below the asset-sale floor (a low, marginal, break-even, or negative owner's earnings), the business has little or no going-concern value: do NOT apply an earnings multiple. Conclude the value as an ASSET SALE — the worth is in the tangible assets (FF&E, leasehold improvements, a transferable or below-market lease, and any transferable licenses — but see the TEXAS LIQUOR LICENSE rule below), NOT the earnings. Set "assetSale" to true, set "basis" to "Asset Sale", and write concNarr and gtmNarr to state plainly that the business is best marketed as an asset sale, that the price reflects tangible assets rather than a multiple of earnings, and why (marginal / negative earnings, owner-dependent, etc.). A losing or barely-profitable restaurant is an asset sale, not a going concern. When SDE is healthy and above the floor, set "assetSale" to false and value normally.
- PHOTO GALLERY (for the marketing package). The Marketing Pack / CIM built from this valuation always includes a dedicated Property Gallery page of photography (sometimes two pages). This does not change any BOV number or JSON field — but where you note go-to-market readiness, flag whether strong exterior, interior, and food photography is available or should be gathered, since the package needs a full photo page.
- TEXAS LIQUOR LICENSE — NO VALUE (except San Marcos). A Texas liquor license / TABC permit carries NO separate resale or transfer value and must NOT be assigned any dollar value in the valuation — not in a going-concern conclusion and not in an asset sale — with ONE exception: a business located in San Marcos, Texas, where the liquor license does hold transferable value and may be valued. Everywhere else in Texas, treat the liquor license as $0 and do not list it among the value-bearing assets. Only when the business is in San Marcos may you ascribe value to the license, and say so explicitly.
- MULTIPLE DISCIPLINE — price to SELL, not to a top-of-market ask. For a single-unit owner-operated restaurant/bar, anchor the SDE multiple around 2.0–2.5× and only reach the top of the band (or above) when the fundamentals clearly earn it. Pull the multiple DOWN for: short remaining lease term (not SBA-financeable), small or rural market, heavy owner/operator dependence, below-market wages that will normalize up, customer/daypart concentration, or no seller financing. Push UP only for: a long, assignable, below-market lease; manager-run / low owner dependence; clean, growing financials; strong brand and AUVs; and real multiple-buyer demand. State the multiple you chose and the one or two factors that set it. Do NOT apply an EBITDA-scale multiple (4×+) to an SDE deal.
- CROSS-CHECK: always sanity-check the earnings-multiple conclusion against a revenue multiple (roughly 0.3–0.5× of trailing revenue for a full-service restaurant/bar) and reconcile. Conclude where the methods CONVERGE, not at the top of any single method.
- Note lease posture from the actual lease (term remaining, base + NNN, options, assignability) and normalize rent if needed.
- OWNED REAL ESTATE: if there is no lease because the business owns its real estate, do NOT skip rent — impute a fair market rent via the rent-normalization line so earnings are comparable to a leased peer, and state clearly that the real estate is a SEPARATE asset excluded from the business value. Say what you did in the earnings and excluded narratives.
- Give a range, not false precision. Flag anything off the books that moves value (owner dependence, related-party landlord, deferred capex, concentration).

Return ONLY a single JSON object — no prose, no markdown fences — with EXACTLY this shape (all string values unless noted):
{
 "periodBasis": "t12 or fiscal — set to 't12' when you built the earnings from an actual trailing-twelve-month period (interim/monthly data available). Set to 'fiscal' ONLY when no interim data existed and you used the latest complete fiscal year as a proxy for the T12.",
 "assetSale": "boolean (true/false, not a string) — true when trailing SDE is at or below the asset-sale floor so the business is valued as an asset sale with no going-concern value; false otherwise.",
 "fields": {
   "subject": "Business name",
   "descriptor": "state the ACTUAL unit count, e.g. 'Single-Unit Full-Service Restaurant · Operating Business' or '3-Unit Full-Service Restaurant Group · Operating Business'",
   "tagline": "short positioning line",
   "preparedFor": "Ownership of ...",
   "preparedBy": "Van Rinn, President & Founder · 210-362-0678 · van@rrgcre.com",
   "preparedBy2": "",
   "date": "YYYY-MM (the valuation month, e.g. 2026-07)",
   "basis": "SDE or Adjusted EBITDA — which earnings the multiple is applied to, per the revenue rule",
   "multLow": "4.0", "multBase": "4.5", "multHigh": "5.0",
   "revLo": "0.50", "revHi": "0.60",
   "ebLow": "conservative earnings scenario on the valuation basis, as a number, e.g. 1020000",
   "ebUp": "upside earnings scenario on the valuation basis, as a number, e.g. 1250000",
   "purpose": "1 paragraph — purpose & scope of this opinion",
   "subjectOf": "what exactly is being valued",
   "excluded": "what is excluded (real estate, etc.)",
   "basisOf": "the financial basis and sources",
   "execNarr": "executive colour: what the conclusion derives from",
   "whyHolds": "why the range holds — what supports high end vs anchors floor",
   "earnNarr": "earnings-quality / normalization commentary",
   "methodNarr": "methodology: market approach, positioning in band, income & revenue cross-checks",
   "premium": "factors toward the HIGH end, one per line (use \\n)",
   "tempers": "factors toward the LOW end, one per line (use \\n)",
   "concNarr": "concluded value — the range and most-likely clearing value and why",
   "gtmNarr": "recommended pricing / go-to-market strategy (INTERNAL — anchor/target/floor)"
 },
 "bridge": {
   "revenue": 900000, "netIncome": 120000,
   "interest": 3000, "entityTax": 0, "depreciation": 45000, "amortization": 0,
   "ownerSalary": 95000, "ownerHealth": 18000, "familyPayroll": 12000, "oneTime": 8000, "rentNorm": 0,
   "marketGM": 70000
 },
 "bench": [["Business profile","typical multiple"], ["...","..."]],
 "buyers": [["Buyer type","likely multiple","what moves them"], ["...","...","..."]]
}
IMPORTANT: "bridge" is an OBJECT of plain numbers (no $, no commas). The system computes the subtotals from it, the same way every time: EBITDA = netIncome + interest + entityTax + depreciation + amortization; SDE = EBITDA + ownerSalary + ownerHealth + familyPayroll + oneTime + rentNorm; ADJUSTED EBITDA = SDE − marketGM. Give rentNorm as a SIGNED number (negative to reduce earnings toward market rent). Give marketGM as a POSITIVE cost (it is subtracted). Use 0 for any line that does not apply. Output ONLY the fixed keyed lines shown above — do NOT output any itemized add-back lists; the broker adds verified, itemized add-backs (e.g. disguised owner comp) on the builder. If a document is missing, make the most defensible assumption and say so in the relevant narrative. Output the JSON object only.`;

function num(s) { return Number(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')) || 0; }
function moneyM(n) {
  n = Number(n) || 0; const a = Math.abs(n);
  if (a >= 1e6) { const m = n / 1e6; return '$' + (a >= 1e7 ? m.toFixed(1) : m.toFixed(2)) + 'M'; }
  if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';   // never "$0.45M" — use "$450K"
  return '$' + Math.round(n);
}
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
  const lo = num(f.multLow), ba = num(f.multBase), hi = num(f.multHigh);
  return {
    basis: basis, basisVal: basisVal, sde: sub.sde, adjEbitda: sub.adj, revenue: sub.revenue,
    ebitda: basisVal,   // headline earnings = the basis figure the multiple is applied to
    rangeText: basisVal > 0 ? (moneyM(basisVal * lo) + ' – ' + moneyM(basisVal * hi)) : '—',
    targetText: basisVal > 0 ? ('~' + moneyM(basisVal * ba)) : '—',
    multText: (lo && hi) ? (lo.toFixed(1) + '–' + hi.toFixed(1) + '×') : '—',
    ebitdaText: basisVal > 0 ? ('~' + moneyM(basisVal)) : '—',
    sdeText: sub.sde > 0 ? ('~' + moneyM(sub.sde)) : '—',
    adjText: sub.adj > 0 ? ('~' + moneyM(sub.adj)) : '—',
  };
}

// Build the AI model content blocks from uploaded files (PDF -> document, image -> image, else text).
function fileBlocks(files) {
  const blocks = [];
  (files || []).forEach(f => {
    const mt = String(f.type || '').toLowerCase();
    const label = f.label || f.name || 'Document';
    if (mt === 'application/pdf' && f.dataB64) {
      blocks.push({ type: 'document', title: label, source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
    } else if (mt.indexOf('image/') === 0 && f.dataB64) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: f.dataB64 } });
    } else if (f.text) {
      blocks.push({ type: 'text', text: '=== ' + label + ' ===\n' + String(f.text).slice(0, 60000) });
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
    `Prepared by: ${preparedBy || 'Van Rinn, President & Founder · 210-362-0678 · van@rrgcre.com'}.\n` +
    `VALUATION BASIS RULE (current setting): if trailing revenue is UNDER $${threshold.toLocaleString('en-US')}, conclude value on SDE; at or above $${threshold.toLocaleString('en-US')}, conclude on Adjusted EBITDA. Set "basis" accordingly.\n` +
    `ASSET-SALE FLOOR (current setting): if trailing SDE is AT OR BELOW $${floor.toLocaleString('en-US')} (marginal, break-even, or losing), the business has NO going-concern value — set "assetSale" to true, set "basis" to "Asset Sale", do NOT apply an earnings multiple, and value on tangible assets (FF&E, leasehold improvements, a transferable/below-market lease, licenses). Write concNarr and gtmNarr as an asset sale.\n` +
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
  if (!state.fields.preparedBy) state.fields.preparedBy = preparedBy || 'Van Rinn, President & Founder · 210-362-0678 · van@rrgcre.com';
  if (!state.bridge || typeof state.bridge !== 'object') state.bridge = {};  // keep object OR legacy array; both are handled downstream
  if (!Array.isArray(state.bench)) state.bench = [];
  if (!Array.isArray(state.buyers)) state.buyers = [];
  // Sort the buyer-type list by likely multiple, highest first — reads best to
  // worst regardless of the order the model happened to return. Handled here in
  // code (not the prompt) so it stays correct even if the prompt is edited.
  state.buyers = sortBuyersByMultiple(state.buyers);
  const summary = summarize(state, threshold);
  const usage = data.usage || {};
  return { state, summary, business: state.fields.subject || business || 'Untitled', date: state.fields.date || '', usage };
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  generateBov, MODEL, DEFAULT_SYSTEM: SYSTEM };
