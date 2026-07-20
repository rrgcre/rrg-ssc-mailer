// RRG — AI BOV generation. Sends the deal documents (financials, Valuation
// Questionnaire, lease + amendments) to Claude and returns a structured BOV
// "state" object that the existing BOV builder renders. No form-filling.
//
// Requires env: ANTHROPIC_API_KEY.  Optional: ANTHROPIC_MODEL (default Sonnet).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a deeply experienced restaurant & bar commercial real-estate and business-sale broker at Restaurant Realty Group (RRG). You prepare Broker's Opinions of Value (BOVs). No fluff, best practice, defensible numbers. You are analyzing a real deal's documents and producing the BOV data.

You will receive some or all of: financial statements (P&L, trend, add-backs), a completed RRG Valuation Questionnaire, and the lease plus any amendments. Read them carefully.

Do the analysis:
- Normalize trailing earnings to ADJUSTED EBITDA via an add-back bridge (start from revenue, then net income as reported, then each add-back: depreciation, interest, non-recurring, discretionary/owner, rent normalization to the executed lease, etc.).
- Select a defensible market MULTIPLE range for this concept and size (single-unit owner-operated ~1.5–3.0× SDE; profitable independents ~3.0–5.0×; multi-unit/manager-run ~4.0–7.0× adj. EBITDA). Give low / base / high.
- Note lease posture from the actual lease (term remaining, base + NNN, options, assignability) and normalize rent if needed.
- Give a range, not false precision. Flag anything off the books that moves value (owner dependence, related-party landlord, deferred capex, concentration).

Return ONLY a single JSON object — no prose, no markdown fences — with EXACTLY this shape (all string values unless noted):
{
 "fields": {
   "subject": "Business name",
   "descriptor": "e.g. Single-Unit Full-Service Restaurant · Operating Business",
   "tagline": "short positioning line",
   "preparedFor": "Ownership of ...",
   "preparedBy": "Van Rinn, President & Founder · 210-362-0678 · van@rrgcre.com",
   "preparedBy2": "",
   "date": "Month YYYY",
   "multLow": "4.0", "multBase": "4.5", "multHigh": "5.0",
   "revLo": "0.50", "revHi": "0.60",
   "ebLow": "conservative adjusted-EBITDA scenario as a number, e.g. 1020000",
   "ebUp": "upside adjusted-EBITDA scenario as a number, e.g. 1250000",
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
 "bridge": [
   {"label":"Trailing revenue","amt":"9195755"},
   {"label":"Net income (as reported)","amt":"553161"},
   {"label":"Add back: depreciation","amt":"133561"},
   {"label":"Add back: interest","amt":"965"},
   {"label":"Add back: non-recurring","amt":"56408"},
   {"label":"Add back: discretionary / owner","amt":"24782"},
   {"label":"Rent normalization to executed lease","amt":"352962"}
 ],
 "bench": [["Business profile","typical multiple"], ["...","..."]],
 "buyers": [["Buyer type","likely multiple","what moves them"], ["...","...","..."]]
}
IMPORTANT: bridge row 0 MUST be revenue (it is excluded from the Adjusted EBITDA total); every other bridge row sums to Adjusted EBITDA. Amounts are plain numbers (no $ or commas). If a document is missing, make the most defensible assumption you can from what's provided and say so in the relevant narrative. Output the JSON object only.`;

function num(s) { return Number(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')) || 0; }
function moneyM(n) { n = n / 1e6; return '$' + (n >= 10 ? n.toFixed(1) : n.toFixed(2)) + 'M'; }
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

// Compute the headline summary from a generated state (same math as the BOV builder).
function summarize(state) {
  const b = (state && state.bridge) || [];
  let e = 0; b.forEach((r, i) => { if (i === 0) return; e += num(r.amt); });
  const f = (state && state.fields) || {};
  const lo = num(f.multLow), ba = num(f.multBase), hi = num(f.multHigh);
  return {
    ebitda: e,
    rangeText: e > 0 ? (moneyM(e * lo) + ' – ' + moneyM(e * hi)) : '—',
    targetText: e > 0 ? ('~' + moneyM(e * ba)) : '—',
    multText: (lo && hi) ? (lo.toFixed(1) + '–' + hi.toFixed(1) + '×') : '—',
    ebitdaText: e > 0 ? ('~' + moneyM(e)) : '—',
  };
}

// Build Claude content blocks from uploaded files (PDF -> document, image -> image, else text).
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
      blocks.push({ type: 'text', text: '=== ' + label + ' ===\n' + String(f.text).slice(0, 120000) });
    }
  });
  return blocks;
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/,'').trim();
  try { return JSON.parse(t); } catch (e) {}
  const s = t.indexOf('{'), en = t.lastIndexOf('}');
  if (s >= 0 && en > s) { try { return JSON.parse(t.slice(s, en + 1)); } catch (e) {} }
  return null;
}

async function generateBov({ business, files, preparedBy }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const content = fileBlocks(files);
  content.push({ type: 'text', text:
    `Business / concept name: ${business || '(not given — infer from documents)'}.\n` +
    `Prepared by: ${preparedBy || 'Van Rinn, President & Founder · 210-362-0678 · van@rrgcre.com'}.\n` +
    `Analyze the attached documents and output the BOV JSON object now.` });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('Claude API error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const state = extractJson(text);
  if (!state || !state.fields) throw new Error('Could not parse a BOV from the model response.');
  // enforce the prepared-by defaults and clean shape
  state.fields = state.fields || {};
  if (!state.fields.preparedBy) state.fields.preparedBy = preparedBy || 'Van Rinn, President & Founder · 210-362-0678 · van@rrgcre.com';
  if (!Array.isArray(state.bridge)) state.bridge = [];
  if (!Array.isArray(state.bench)) state.bench = [];
  if (!Array.isArray(state.buyers)) state.buyers = [];
  const summary = summarize(state);
  const usage = data.usage || {};
  return { state, summary, business: state.fields.subject || business || 'Untitled', date: state.fields.date || '', usage };
}

module.exports = { generateBov, MODEL };
