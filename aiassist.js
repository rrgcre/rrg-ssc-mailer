// aiassist.js — lightweight Claude helpers for in-app enrichment (listing intake,
// LOI parsing, space↔client matching). Reuses the same API/key pattern as the
// BOV/CIM generators. Requires env ANTHROPIC_API_KEY (admin-settable at runtime).
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

async function callClaude(system, userText, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('AI is not configured — set the Anthropic API key in Admin → Settings.');
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens || 1500, temperature: 0,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    }),
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 300)); }
  const data = await resp.json();
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}
function extractJson(t) { if (!t) return null; const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} } return null; }

// 1) Parse a pasted listing (CoStar/LoopNet/Crexi/broker email/flyer) into space fields.
async function parseSpaceListing({ text, types, features }) {
  const sys =
    "You are a restaurant/bar commercial real estate broker's assistant. Extract ONE available-space listing from the pasted text into STRICT JSON. Return ONLY this object, no prose:\n" +
    '{"address":"","center":"","market":"","spaceType":"","size":null,"rent":null,"nnn":null,"features":[],"notes":""}\n' +
    'Field rules:\n' +
    '- address: street address of the space. center: shopping center / building name. market: city.\n' +
    '- spaceType: MUST be one of ' + JSON.stringify(types) + ' or "" if unclear.\n' +
    '- size: square feet as digits only (no commas/units), else null.\n' +
    '- rent: BASE rent in $/SF/YR as a number, else null. nnn: NNN/CAM in $/SF/YR as a number, else null. If a rent is only given as a monthly or lump figure and size is known, convert to $/SF/yr; otherwise leave rent null and put the raw figure in notes.\n' +
    '- features: the subset of ' + JSON.stringify(features) + ' the text EXPLICITLY says is already built/present. Do NOT infer or guess — only what is stated (e.g. "grease trap", "hood", "drive-thru", "existing bar", "walk-in cooler").\n' +
    '- notes: any other key terms (available SF, term, TI/allowance, delivery condition, second-gen restaurant, timing).\n' +
    'Use ONLY facts in the text. Never fabricate. Numbers are digits only. Output JSON only.';
  const out = await callClaude(sys, 'LISTING TEXT:\n' + String(text || '').slice(0, 12000), 1200);
  const j = extractJson(out) || {};
  return {
    address: String(j.address || ''), center: String(j.center || ''), market: String(j.market || ''),
    spaceType: (types.indexOf(j.spaceType) >= 0 ? j.spaceType : ''),
    size: (j.size == null ? null : Number(j.size)), rent: (j.rent == null ? null : Number(j.rent)), nnn: (j.nnn == null ? null : Number(j.nnn)),
    features: Array.isArray(j.features) ? j.features.filter(f => features.indexOf(f) >= 0) : [],
    notes: String(j.notes || ''),
  };
}

// 2) Parse a pasted (received) LOI into the builder's key-term values.
async function parseLoiText({ text, terms }) {
  const fieldLines = terms.map(t => '- "' + t.key + '" (' + (t.type || 'text') + '): ' + t.label).join('\n');
  const sys =
    'You extract the business terms from a pasted Letter of Intent (restaurant/bar tenant-rep lease OR business sale) into STRICT JSON for a brokerage. ' +
    'Return ONLY a JSON object with these keys (plus "party_tenant","party_landlord","party_buyer","party_seller","property","summary"). ' +
    'Values: numbers as digits only (no units/commas), text as short plain strings, "" if not stated. Never fabricate.\n' +
    'KEY-TERM FIELDS:\n' + fieldLines + '\n' +
    '"summary": a 1-2 sentence plain-English recap of the deal. "property": the address/space. party_* : the named parties if present.';
  const out = await callClaude(sys, 'LOI TEXT:\n' + String(text || '').slice(0, 14000), 1600);
  return extractJson(out) || {};
}

// 3) Rank available spaces against a client's criteria.
async function matchSpaces({ criteria, spaces }) {
  const list = spaces.map(s => ({ id: s.id, name: s.name || s.address || '', center: s.center || '', market: s.market || '', type: s.spaceType || '', size: s.size || null, rent: s.rent || null, nnn: s.nnn || null, features: s.features || [], status: s.status || '' }));
  const sys =
    "You are a restaurant/bar tenant-rep broker. Given a client's site criteria and a list of available spaces, rank EVERY space by fit for THIS client, best first. " +
    'Return ONLY JSON: {"ranked":[{"id":"","score":0,"reason":""}]} where score is 0-100 and reason is one concrete sentence. ' +
    'Weigh market/trade area, size, budget (base $/SF + NNN), position type, and the bones already built (drive-thru, hood, grease trap, gas, walk-in, bar, patio) against what the concept needs. Be honest — a poor fit gets a low score and a clear reason.';
  const user = 'CLIENT CRITERIA:\n' + String(criteria).slice(0, 4000) + '\n\nAVAILABLE SPACES (JSON):\n' + JSON.stringify(list).slice(0, 20000);
  const out = await callClaude(sys, user, 2200);
  const j = extractJson(out);
  return (j && Array.isArray(j.ranked)) ? j.ranked : [];
}

// 4) Daily pipeline brief — grounded in the rep's live data.
async function dailyBrief({ data, repName, today }) {
  const sys =
    'You are a deeply experienced restaurant/bar commercial real estate broker acting as ' + (repName ? (repName + "'s") : 'the') + ' chief of staff. You receive a JSON snapshot of the live pipeline and produce a tight, prioritized daily brief. No fluff, best practice, plays to win. ' +
    'Focus on what makes or protects money: listings expiring, deals under contract or closing, commissions owed, LOIs awaiting a response, agreements about to lapse, overdue tasks. Be specific — name the business/party and the number.\n' +
    'Return ONLY JSON: {"headline":"","today":[{"what":"","detail":"","urgency":"high|med|low"}],"thisWeek":[""],"note":""}. ' +
    '"today" = the 3-7 highest-leverage actions right now, most urgent first. "thisWeek" = 0-5 heads-up items. "note" = one sharp strategic line. ' +
    'Ground every item strictly in the data — never invent a name, number, or date. If the pipeline is quiet, say so honestly and point to prospecting.';
  const out = await callClaude(sys, 'TODAY: ' + (today || '') + '\n\nPIPELINE SNAPSHOT (JSON):\n' + JSON.stringify(data).slice(0, 24000), 2000);
  return extractJson(out) || null;
}

// 5) Contact call-prep from the CRM record.
async function callPrep({ person }) {
  const sys = 'You are a restaurant/bar CRE broker\'s chief of staff. Given a CRM contact record (details, recent activities, deals, agreements), write a tight pre-call briefing so the broker walks in sharp. ' +
    'Return ONLY JSON: {"snapshot":"","lastTouch":"","openItems":[""],"openers":[""],"watchOut":""}. ' +
    'snapshot: 1-2 sentences on who they are and where things stand. lastTouch: the last meaningful interaction. openItems: 2-4 concrete things to move forward. openers: 2-3 natural ways to start the call. watchOut: one sensitivity or "". Ground strictly in the record; if data is thin, say what is unknown rather than inventing.';
  return extractJson(await callClaude(sys, 'CONTACT RECORD:\n' + JSON.stringify(person).slice(0, 12000), 1200)) || {};
}
// 6) Contact enrichment from sparse details.
async function enrichContact({ name, company, email, phone, title, notes }) {
  const sys = 'You are a restaurant/bar CRE broker\'s research assistant. From the sparse contact details, infer a helpful CRM profile. ' +
    'Return ONLY JSON: {"title":"","type":"","markets":[],"talkingPoints":[""],"summary":""}. ' +
    'type is their likely role: one of Buyer, Seller, Landlord, Tenant, Investor, Operator, Broker, Vendor, or "". markets: cities/areas they likely operate in if inferable. talkingPoints: 2-4 concrete openers for THIS person. summary: 1-2 sentence who-they-are. Do not fabricate deal history or specifics.';
  return extractJson(await callClaude(sys, 'CONTACT:\n' + JSON.stringify({ name, company, email, phone, title, notes }), 900)) || {};
}
// 7) Company enrichment from name/website.
async function enrichCompany({ name, website, markets }) {
  const sys = 'You are a restaurant/bar CRE broker\'s assistant. From a company/group name and website, infer a concise CRM profile. ' +
    'Return ONLY JSON: {"summary":"","conceptType":"","pricePoint":"","markets":[],"positioning":""}. ' +
    'Use general knowledge if the brand is recognizable; if not, infer conservatively from the name and note uncertainty in summary. Do NOT invent location counts or financials.';
  return extractJson(await callClaude(sys, 'COMPANY: ' + JSON.stringify({ name, website, markets }), 800)) || {};
}
// 8) LOI: suggest which optional sections this deal needs.
async function suggestSections({ dealInfo, sections }) {
  const sys = 'You are a restaurant/bar tenant-rep broker. Given the deal context and the library of optional LOI sections, recommend which sections THIS deal should include and why. ' +
    'Return ONLY JSON: {"recommend":[{"id":"","title":"","why":""}],"customIdeas":[{"title":"","clause":""}]}. ' +
    'Only recommend from the provided section list, by id. customIdeas: 0-3 clauses the deal may need that are NOT in the library (e.g. outdoor music, drive-thru hours, grease-trap responsibility), each with short draft language. Ground in the deal context.';
  const user = 'DEAL CONTEXT:\n' + JSON.stringify(dealInfo).slice(0, 4000) + '\n\nAVAILABLE SECTIONS:\n' + JSON.stringify(sections).slice(0, 6000);
  return extractJson(await callClaude(sys, user, 1400)) || {};
}
// 9) LOI: red-flag review of a drafted letter.
async function reviewLoi({ text }) {
  const sys = 'You are a restaurant/bar tenant-rep broker reviewing a drafted Letter of Intent before it goes out. Identify issues that would hurt your client or draw pushback. ' +
    'Return ONLY JSON: {"flags":[{"severity":"high|med|low","issue":"","fix":""}],"missing":[""],"verdict":""}. ' +
    'flags: aggressive, unclear, or one-sided terms. missing: important terms absent (options to renew, TI, delivery condition, guaranty burn-off, exclusivity, contingencies). verdict: one-line overall read. Be specific and practical; ground in the text.';
  return extractJson(await callClaude(sys, 'LOI DRAFT:\n' + String(text || '').slice(0, 14000), 1600)) || {};
}
// 10) Concept positioning for BOV/CIM.
async function conceptPositioning({ concept, locations }) {
  const sys = 'You are a restaurant/bar CRE broker writing crisp positioning for a concept, for valuations and marketing packs. ' +
    'Return ONLY JSON: {"positioning":"","signatureItems":[""],"daypart":"","expansionMarkets":[""]}. ' +
    'positioning: one sharp sentence (segment, price point, who it is for). signatureItems: 2-5 equity items if known. daypart: primary dayparts. expansionMarkets: 2-4 fitting markets if inferable. Use general knowledge if recognizable; else infer conservatively. Do not fabricate specifics.';
  return extractJson(await callClaude(sys, 'CONCEPT:\n' + JSON.stringify({ concept, locations }).slice(0, 8000), 1000)) || {};
}
// 11) Location site-read.
async function locationSiteRead({ location }) {
  const sys = 'You are a restaurant/bar CRE broker giving a fast site read on a location for a BOV/CIM. ' +
    'Return ONLY JSON: {"strengths":[""],"risks":[""],"note":""}. ' +
    'strengths/risks: 2-4 each, concrete (visibility, access, co-tenancy, daypart, parking, drive-thru, trade area, lease posture) from the attributes given. note: one-line overall. Ground in the data; flag unknowns rather than inventing.';
  return extractJson(await callClaude(sys, 'LOCATION:\n' + JSON.stringify(location).slice(0, 4000), 900)) || {};
}
// 12) Calculator client-ready summary.
async function calcSummary({ kind, inputs, outputs }) {
  const sys = 'You are a restaurant/bar CRE broker. Turn these calculator inputs and results into a clean, client-ready summary paragraph, then a one-line market sanity check. ' +
    'Return ONLY JSON: {"summary":"","sanity":""}. summary: 2-4 sentences a client could read. sanity: whether the numbers look reasonable for a restaurant/bar deal and any caveat. Use ONLY the numbers provided; do not invent figures.';
  const user = 'CALCULATOR: ' + kind + '\nINPUTS:\n' + JSON.stringify(inputs).slice(0, 3000) + '\nRESULTS:\n' + JSON.stringify(outputs).slice(0, 3000);
  return extractJson(await callClaude(sys, user, 900)) || {};
}

// 13) Placer.ai report -> structured trade-area / foot-traffic fields (paste-and-parse).
async function parsePlacer({ text }) {
  const sys = 'You extract the key figures from a pasted Placer.ai report (foot-traffic / trade-area analytics for a retail or restaurant location) into STRICT JSON for a restaurant/bar broker. ' +
    'Return ONLY: {"visits":"","visitsPeriod":"","visitTrend":"","tradeArea":"","topOrigins":[""],"dwellMinutes":"","peakDayparts":[""],"demographics":"","highlights":[""]}. ' +
    'visits: the visit/foot-traffic count with its unit as written (e.g. "142K annual visits"). visitsPeriod: the period it covers. visitTrend: YoY or trend direction if stated. tradeArea: the true trade area / drive-time or radius if given. topOrigins: top visitor origin areas/ZIPs. dwellMinutes: average dwell time. peakDayparts: busiest dayparts/days. demographics: a short line on the visitor profile (income, age) if stated. highlights: 2-4 notable takeaways. ' +
    'Use ONLY what is in the pasted report. Leave "" or [] for anything not stated. Never fabricate figures. Output JSON only.';
  return extractJson(await callClaude(sys, 'PLACER REPORT:\n' + String(text || '').slice(0, 14000), 1400)) || {};
}

// 14) LOI counter diff — compare a pasted counter/response to the current terms.
async function counterDiff({ text, current, terms }) {
  const lines = terms.map(t => '- "' + t.key + '": ' + t.label + ' (current: ' + (((current || {})[t.key]) || '\u2014') + ')').join('\n');
  const sys = 'You are a restaurant/bar tenant-rep broker tracking an LOI negotiation. The rep pastes the other side\'s counter or response. Compare it to the CURRENT position on each key term and classify each term the counter addresses. ' +
    'Return ONLY JSON: {"summary":"","changes":[{"key":"","label":"","from":"","to":"","status":"accepted|countered|rejected|open"}]}. ' +
    'status: "accepted" if they agree to the current value; "countered" if they propose a different value (set from=current, to=their value); "rejected" if they reject it outright; "open" if unresolved. Include ONLY terms the counter actually addresses. summary: one plain line on what moved. Ground strictly in the pasted text; never invent a number.\n' +
    'KEY TERMS (with current values):\n' + lines;
  return extractJson(await callClaude(sys, 'COUNTER / RESPONSE TEXT:\n' + String(text || '').slice(0, 12000), 1500)) || {};
}

// 15) Find every concept (brand) a restaurant group operates.
async function findGroupConcepts({ name, website }) {
  const sys = "You are a restaurant/bar CRE broker's research assistant. Given the name of a restaurant GROUP or hospitality company, list the distinct restaurant/bar CONCEPTS (brands) it owns or operates. " +
    'Return ONLY JSON: {"concepts":[{"name":"","cuisine":"","note":""}]}. List EVERY distinct customer-facing brand — a restaurant group usually operates several. Use each brand\'s consumer-facing name, once. Do NOT return the parent/holding-company name itself unless it is also a restaurant brand people dine at. Rely on knowledge of the group; include only brands you are reasonably confident it operates. If it is truly a single-concept operator, return just that one.';
  const out = await callClaude(sys, 'GROUP: ' + JSON.stringify({ name, website }), 1200);
  const j = extractJson(out); return (j && Array.isArray(j.concepts)) ? j.concepts : [];
}


// Consult — natural-language data analyst over the book of business. Answers ONLY from the snapshot.
async function consult({ question, snapshot, history, agentName }) {
  const name = agentName || 'Consult';
  const sys = 'You are ' + name + ', the built-in data analyst inside FullServe, the CRM for Restaurant Realty Group, a brokerage that sells restaurants and bars. Answer the user question using ONLY the DATA SNAPSHOT in the message. Never invent contacts, companies, listings, or numbers. If the snapshot is capped or lacks what is needed, say so plainly and answer what you can. Think like a seasoned restaurant and bar broker: direct, lead with the number or the name, no fluff. Keep the answer to 1 to 4 short sentences. Offer a chart only when a breakdown or comparison genuinely helps. Return ONLY a JSON object and nothing else: {"answer":"plain text, no markdown","bullets":["0 to 6 short supporting lines"],"chart":{"type":"bar|pie|none","title":"","data":[{"label":"","value":0}]},"followups":["2 to 3 natural next questions"]}';
  const parts = [];
  parts.push('=== DATA SNAPSHOT (the only data you may use) ===\n' + JSON.stringify(snapshot).slice(0, 140000));
  if (Array.isArray(history) && history.length) parts.push('=== Recent conversation (oldest first) ===\n' + JSON.stringify(history.slice(-6)).slice(0, 8000));
  parts.push('=== The user asks ===\n' + String(question || '').slice(0, 1200) + '\n\nAnswer now as the JSON object only.');
  const text = await callClaude(sys, parts.join('\n\n'), 1500);
  const r = extractJson(text) || { answer: (text || 'I could not read a result.').slice(0, 800), chart: { type: 'none' } };
  if (!r.answer) r.answer = 'I could not find that in your data.';
  if (!r.chart || ['bar','pie','none'].indexOf(r.chart.type) < 0) r.chart = { type: 'none' };
  if (r.chart && Array.isArray(r.chart.data)) r.chart.data = r.chart.data.filter(d => d && d.label != null).slice(0, 12).map(d => ({ label: String(d.label).slice(0,40), value: Number(d.value) || 0 }));
  if (!Array.isArray(r.bullets)) r.bullets = [];
  r.bullets = r.bullets.slice(0, 6).map(x => String(x).slice(0, 200));
  if (!Array.isArray(r.followups)) r.followups = [];
  r.followups = r.followups.slice(0, 3).map(x => String(x).slice(0, 120));
  return r;
}

module.exports = { parseSpaceListing, parseLoiText, matchSpaces, dailyBrief, callPrep, enrichContact, enrichCompany, suggestSections, reviewLoi, conceptPositioning, locationSiteRead, calcSummary, parsePlacer, counterDiff, findGroupConcepts, consult };
