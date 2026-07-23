// RRG — AI CIM (Confidential Information Memorandum) generation. Mirrors bovgen:
// sends the deal's BOV valuation, the completed Valuation Questionnaire, financial
// docs, reference links, and rep-provided photo captions to Claude and returns a
// structured CIM "state" the CIM builder renders. Requires ANTHROPIC_API_KEY.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a deeply experienced restaurant & bar business-sale advisor at Restaurant Realty Group (RRG). You write Confidential Information Memorandums (CIMs) — the sell-side marketing document a qualified, NDA'd buyer reads to evaluate acquiring a restaurant or bar. You write in RRG's voice: confident, precise, no fluff, defensible, and quietly persuasive. You are selling the business honestly — highlighting real strengths and framing risks as normal diligence items, never hiding them.

You are given: the RRG Broker's Opinion of Value (the concluded valuation, the earnings bridge, and the basis) already built for this business; the completed Valuation Questionnaire; the notes from the Seller Qualification Call (the rep's first conversation with the owner — motivation, story, operating color, expectations); optionally reference links (press, reviews, web presence); and a list of the photo captions the rep is including. Use ALL of it — the questionnaire and the call are your richest source of the story, the operating model, and the owner's own words. The CIM's financial numbers MUST match the BOV exactly — do not re-derive or change the revenue, earnings, adjustments, or concluded value. Pull them straight from the BOV.

Write the full CIM as a single JSON object — no prose, no markdown fences — with EXACTLY this shape (all values are strings unless noted; use "" for anything you genuinely cannot support, and never invent facts not grounded in the inputs):
{
 "cover": {
   "title": "The business name as it should headline the cover",
   "tagline": "one short italic positioning line, e.g. 'Three-Restaurant Go-Forward Platform · A San Antonio Institution Since 2000'",
   "foundingLine": "founding + format line, e.g. 'Founded 2000 · Breakfast, Brunch & Lunch · Daily 7 AM–2 PM · Scratch-Made · San Antonio, Texas'",
   "stats": [ {"v":"~$9.2M","k":"TTM Revenue"}, {"v":"3","k":"Go-Forward Restaurants"}, {"v":"26 Years","k":"Brand Heritage"}, {"v":"~$1.12M","k":"Adj. TTM EBITDA"} ]
 },
 "execSummary": {
   "quote": "a real, attributable praise quote if one exists in the inputs (press/reviews), else \\"\\"",
   "quoteBy": "attribution for the quote, e.g. '— AFAR TRAVEL GUIDE · FEATURED TWICE ON FOOD NETWORK'S DINERS, DRIVE-INS & DIVES'",
   "para1": "the opportunity paragraph — what is being offered and why it matters",
   "para2": "the operating model / moat paragraph",
   "highlights": [ {"title":"Iconic, Defensible Brand","body":"2-3 sentences"}, ... exactly 6 investment highlights ]
 },
 "story": { "paras": ["history paragraph 1","paragraph 2","paragraph 3"], "calloutTitle":"a one-line bolded pull-quote title", "calloutBody":"1-2 sentences" },
 "concept": { "intro":"concept paragraph", "signature":[ {"name":"Buttermilk pancakes","desc":"why it matters"}, ... 3-6 signature-equity items ], "closing":"one italic closing line" },
 "portfolio": { "intro":"store portfolio paragraph (locations, unit economics, AUVs)", "notes":"any per-unit color as one paragraph or ''" },
 "brand": { "intro":"brand recognition & guest loyalty paragraph", "proof":"press, awards, ratings, loyalty proof points as one paragraph or ''" },
 "management": { "intro":"management & operating model paragraph (owner role, team, transferability, systems)" },
 "market": { "para1":"why this market paragraph", "para2":"why this segment/daypart paragraph", "cards":[ {"title":"High-Growth Trade Areas","body":"2 sentences"}, ... exactly 4 market cards ] },
 "financial": { "intro":"financial overview framing paragraph — sources, basis (management-basis, unaudited), and how the go-forward is presented", "revenueNote":"one paragraph decoding the revenue trend (reshaping vs decline, per-unit)", "bridgeNote":"one paragraph explaining the earnings normalization / adjusted earnings, consistent with the BOV bridge", "callout1Title":"", "callout1Body":"", "callout2Title":"", "callout2Body":"" },
 "value": { "intro":"value-creation framing paragraph (upside is illustrative, not required to perform)", "cards":[ {"title":"Marketing White Space","body":"2-3 sentences"}, ... 4-6 value-creation levers ], "calloutTitle":"", "calloutBody":"" },
 "risks": [ {"title":"Earnings quality / occupancy normalization","body":"2-3 sentences, framed as a normal diligence item"}, ... exactly 5 risk considerations ],
 "transaction": { "intro":"transaction overview paragraph (what's for sale — asset/equity, leases assumed, what's excluded, deal posture)", "process":"process paragraph (invitation-based, IOIs, exclusively through RRG)" },
 "dueDiligence": { "intro":"due-diligence process paragraph — what materials are available and how the process runs" }
}

Rules:
- Ground every claim in the inputs (BOV, questionnaire, docs, links). Do not fabricate awards, press, AUVs, or numbers. If you don't have it, leave the field "".
- The cover stats and all financial figures MUST equal the BOV's concluded figures — same revenue, same adjusted earnings, same basis. If the BOV is SDE-basis, present SDE; if Adjusted EBITDA, present that.
- Match the sample's tone: section intros are 1-2 tight paragraphs; card bodies are 2-3 sentences; risk items are honest and framed as underwritable, never disqualifying.
- Write for a buyer. Sell the strengths, present the risks as transparency, and make the go-to-market posture clear.
- Output the JSON object only.`;

function isSafeUrl(u) { try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:'); } catch (e) { return false; } }
function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
async function fetchLinkText(url) {
  if (!isSafeUrl(url)) return null;
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 RRG-CIM' } });
    if (!r.ok) return { url, note: 'could not fetch (' + r.status + ')' };
    const t = await r.text();
    return { url, text: stripHtml(t).slice(0, 5000) };
  } catch (e) { return { url, note: 'could not fetch' }; }
}
// Build content blocks for uploaded financial docs (PDF/image/text), same shape as bovgen.
function fileBlocks(files) {
  const out = [];
  (files || []).forEach(f => {
    if (!f) return;
    if (f.dataB64 && f.type === 'application/pdf') out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
    else if (f.dataB64 && /^image\//.test(f.type || '')) out.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.dataB64 } });
    else if (f.text) out.push({ type: 'text', text: '=== ' + (f.name || 'document') + ' ===\n' + String(f.text).slice(0, 60000) });
  });
  return out;
}
function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function generateCim({ business, bovSummary, bovState, questionnaire, call, files, links, photoCaptions, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const content = fileBlocks(files);

  // The concluded BOV — the CIM's financials must match this exactly.
  if (bovSummary || bovState) {
    content.push({ type: 'text', text:
      '=== RRG Broker\'s Opinion of Value (already concluded for this business — the CIM financials MUST match this) ===\n' +
      JSON.stringify({ summary: bovSummary || null, bridge: (bovState && bovState.bridge) || null, fields: (bovState && bovState.fields) || null }).slice(0, 40000) });
  }
  if (questionnaire && String(questionnaire).trim()) {
    content.push({ type: 'text', text: '=== Valuation Questionnaire (completed in the RRG system) ===\n' + String(questionnaire).slice(0, 60000) });
  }
  if (call && String(call).trim()) {
    content.push({ type: 'text', text: '=== Seller Qualification Call (the rep\'s first conversation with the owner) ===\n' + String(call).slice(0, 40000) });
  }
  const urls = Array.isArray(links) ? links.filter(u => u && String(u).trim()).slice(0, 6) : [];
  if (urls.length) {
    const fetched = await Promise.all(urls.map(fetchLinkText));
    let ref = '=== Reference links the rep provided (press, reviews, web presence) — use for qualitative color and real quotes, never to override documented financials ===\n';
    fetched.forEach(f => { if (f) ref += '\n--- ' + f.url + ' ---\n' + (f.text ? String(f.text).slice(0, 5000) : ('[' + (f.note || 'link') + ']')) + '\n'; });
    content.push({ type: 'text', text: ref.slice(0, 30000) });
  }
  const caps = Array.isArray(photoCaptions) ? photoCaptions.filter(Boolean).slice(0, 12) : [];
  content.push({ type: 'text', text:
    'Business / concept name: ' + (business || '(infer from the inputs)') + '.\n' +
    (caps.length ? ('Photos the rep is including (write the CIM assuming these images appear; you may reference them): ' + caps.join('; ') + '.\n') : '') +
    'Write the full CIM JSON object now, with every financial figure matching the BOV above.' });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, temperature: 0.3, system: sys, messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (/too long|prompt is too|maximum.*tokens|context.*length|exceed/i.test(t)) {
      throw new Error('The uploaded documents are too large for the analyst to read in one pass. Send just the essentials and build again.');
    }
    throw new Error('Claude API error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const state = extractJson(text);
  if (!state || !state.cover) throw new Error('Could not parse a CIM from the model response.');
  return { state, business: (state.cover && state.cover.title) || business || 'Untitled', usage: data.usage || null };
}

module.exports = { generateCim, MODEL, DEFAULT_SYSTEM: SYSTEM };
