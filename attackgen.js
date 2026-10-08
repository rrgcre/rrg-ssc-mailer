// RRG — AI Market Attack Plan (MAP) generation for the SELL side. Mirrors cimgen:
// the deal's Marketing Pack (CIM) is advanced to a MAP. We send the concluded BOV
// valuation, the CIM state, the completed Valuation Questionnaire, and the Seller
// Qualification Call, and return a structured MAP "state" the attack-plan builder
// renders. Requires ANTHROPIC_API_KEY.
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a deeply experienced restaurant & bar business-sale broker at Restaurant Realty Group (RRG). You write the confidential Market Attack Plan (MAP) — the internal, ownership-facing go-to-market strategy for selling a restaurant or bar business. It is NOT the buyer-facing CIM; it is the campaign playbook prepared for the seller: how RRG takes the business to market, who we go after, how we run a controlled confidential process, and how we drive competitive tension to the best price and terms. Write in RRG's voice: confident, precise, no fluff, strategic, and quietly persuasive to ownership.

You are given the deal that has already moved through the RRG pipeline: the concluded Broker's Opinion of Value (the valuation, earnings bridge, and basis), the Confidential Information Memorandum state (the story, positioning, highlights, market, and financials already written for buyers), the completed Valuation Questionnaire, and the Seller Qualification Call notes (the owner's motivation, story, and expectations). Use ALL of it. Every number MUST match the BOV and CIM exactly — do not re-derive or change the revenue, earnings, adjustments, concluded range, or multiple. The MAP's job is strategy and process, anchored to those numbers.

Write the full Market Attack Plan as a single JSON object — no prose, no markdown fences — with EXACTLY this shape (all values are strings unless noted; use "" for anything you genuinely cannot support, and never invent facts not grounded in the inputs):
{
 "header": {
   "business": "The business / platform name",
   "mission": "the engagement in one line, e.g. 'Confidential sale of a 3-unit San Antonio breakfast & brunch platform'",
   "markets": "market & buyer reach, e.g. 'San Antonio · buyers sourced regionally and nationally'",
   "preparedFor": "who this is prepared for, e.g. 'Ownership of <business>'",
   "guidance": "go-to-market guidance number or range anchored to the BOV, e.g. '$1.8–2.2M'",
   "exclusive": "recommended exclusive listing term, e.g. '9–12 months'"
 },
 "bov": {
   "range": "the BOV concluded value range (verbatim from the BOV)",
   "target": "the recommended go-to-market target (anchor high within/above the range)",
   "multiple": "the concluded multiple, e.g. '2.4x SDE' or '4.1x Adj. EBITDA'",
   "basis": "the earnings basis + figure, e.g. 'SDE $420K' or 'Adj. EBITDA $1.12M'",
   "note": "one sentence on the pricing posture — we anchor high and let the process find the ceiling; guided, not posted"
 },
 "engagement": {
   "included": "what's included in the sale (units, brands, FF&E, IP, leases, commissary, etc.)",
   "ebitda": "the earnings headline consistent with the BOV, e.g. '~$1.12M Adj. EBITDA' or 'SDE ~$420K'",
   "ask": "asking / guidance (guided, not posted)",
   "structure": "structures ownership is open to, e.g. 'Full sale · asset sale · majority w/ rollover'",
   "reason": "the reason for sale, grounded in the call/questionnaire (owner transition, retirement, etc.)",
   "confid": "the confidentiality posture, e.g. 'Blind until NDA; no staff / vendor / landlord contact'",
   "narr": "one tight paragraph: what the business is, why it's a rare or compelling asset, and what a successful outcome looks like for ownership"
 },
 "positioning": {
   "narr": "the positioning paragraph — what makes this a must-see asset, the growth story, and the specific value a new owner captures (draw from the CIM)",
   "hooks": [ "headline selling point 1", "point 2", "point 3", "point 4", "point 5" ]
 },
 "buyers": [
   { "segment":"Strategic / Operator", "who":"who specifically — named types of buyers, e.g. 'Local multi-unit operators; regional breakfast/brunch groups'", "moves":"the angle that moves them — what this deal gives them", "targets":"a rough count or 'TBD', e.g. '15–20'" }
   /* 3–6 distinct, well-reasoned buyer segments covering strategic operators, financial/PE/family-office, search funds/individuals, and any concept-specific fits */
 ],
 "sequence": [
   { "title":"Blind teaser", "desc":"a no-name one-page profile to the qualified target list — enough to attract, nothing that identifies the business" },
   { "title":"NDA execution", "desc":"interested parties sign RRG's NDA (via DocuSign) and prove financial capacity before anything else is released" },
   { "title":"CIM release", "desc":"qualified, NDA-bound buyers receive the full Confidential Information Memorandum" },
   { "title":"Management meetings & site visits", "desc":"vetted buyers meet ownership and tour discreetly; all Q&A routed through RRG" },
   { "title":"Call for offers → LOIs", "desc":"a defined deadline drives written offers in parallel, creating competitive tension" },
   { "title":"Best-and-final → selection", "desc":"shortlist to best-and-final; select on price, certainty, and fit; execute LOI, move to PSA and diligence" }
 ],
 "channels": [ "RRG proprietary buyer & investor database", "Direct confidential outreach to named strategic operators", "PE / family-office and search-fund network", "Existing RRG buyer relationships from active mandates" ],
 "confidentiality": { "narr":"how confidentiality is protected: blind teaser, NDA gating (DocuSign), controlled data room, no direct company/staff/vendor/landlord contact, and how every inquiry routes only through RRG" },
 "tension": {
   "anchor":"anchor / guidance number (top of the BOV posture)",
   "target":"target clearing number",
   "floor":"floor / walk-away number",
   "deadline":"offer deadline framing, e.g. 'Call for offers ~week 8–10'",
   "bidders":"minimum bidders sought, e.g. '3+ at LOI'",
   "criteria":"selection criteria, e.g. 'Price · certainty of close · fit'",
   "narr":"how we run the process to maximize tension: guided pricing (not posted), parallel LOIs, a firm deadline, a best-and-final round, and how we weigh price against certainty and cultural fit"
 },
 "timeline": [
   { "phase":"Prep & Launch", "window":"Weeks 1–2", "actions":"finalize teaser, CIM, and target list; open the data room; begin outreach" },
   { "phase":"Marketing", "window":"Weeks 2–6", "actions":"work the buyer universe; NDAs; CIM releases; manage buyer Q&A" },
   { "phase":"Meetings & Offers", "window":"Weeks 6–10", "actions":"management meetings and site visits; call for offers; collect LOIs" },
   { "phase":"Selection & Close", "window":"Weeks 10+", "actions":"best-and-final; select buyer; LOI, PSA, diligence to close" }
 ],
 "reporting": {
   "narr":"the reporting cadence (weekly buyer-activity update), what RRG commits to deliver, and the immediate next steps to launch the campaign",
   "commit":"the RRG commitment paragraph — RRG represents ownership exclusively, runs a confidential controlled process to the full qualified buyer universe, gates information behind NDAs, and drives parallel offers to a deadline so ownership negotiates from strength; best price and terms with the highest certainty of close"
 }
}

Rules:
- Ground every claim in the inputs (BOV, CIM, questionnaire, call). Numbers MUST match the BOV/CIM exactly; do not fabricate buyer names, counts, or figures. If you don't have it, leave the field "" (or a sensible 'TBD' for target counts).
- The BUYER STRATEGY is the heart of the plan — give 3–6 genuinely distinct, well-reasoned segments with a specific angle for each, tailored to this concept, size, and market. This is where you earn the mandate.
- Anchor pricing to the BOV: we anchor high (top of the range or just above), guide rather than post, and let the competitive process find the ceiling. Reflect that in guidance, tension.anchor/target/floor, and the bov block.
- Keep narratives tight (1 paragraph each). This is an internal strategy document for ownership — strategic and direct, not buyer-facing marketing fluff.
- RRG uses DocuSign for all agreements; reference DocuSign where the NDA/agreements are mentioned.
- Output the JSON object only.`;

function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function generateMap({ business, bovSummary, bovState, cimState, questionnaire, call, preparedBy, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const content = [];

  if (bovSummary || bovState) {
    content.push({ type: 'text', text:
      '=== RRG Broker\'s Opinion of Value (concluded — every number in the MAP MUST match this) ===\n' +
      JSON.stringify({ summary: bovSummary || null, bridge: (bovState && bovState.bridge) || null, fields: (bovState && bovState.fields) || null }).slice(0, 40000) });
  }
  if (cimState) {
    content.push({ type: 'text', text:
      '=== Confidential Information Memorandum (already written for buyers — reuse the story, positioning, highlights, and market for the MAP) ===\n' +
      JSON.stringify(cimState).slice(0, 60000) });
  }
  if (questionnaire && String(questionnaire).trim()) {
    content.push({ type: 'text', text: '=== Valuation Questionnaire (completed in the RRG system) ===\n' + String(questionnaire).slice(0, 60000) });
  }
  if (call && String(call).trim()) {
    content.push({ type: 'text', text: '=== Seller Qualification Call (the owner\'s motivation, story, expectations) ===\n' + String(call).slice(0, 40000) });
  }
  content.push({ type: 'text', text:
    'Business / platform name: ' + (business || '(infer from the inputs)') + '.\n' +
    'Prepared By (the RRG rep on this engagement): ' + (preparedBy || 'Restaurant Realty Group') + '.\n' +
    'Write the full Market Attack Plan JSON object now, with every number matching the BOV and CIM above.' });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, temperature: 0.3, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (/too long|prompt is too|maximum.*tokens|context.*length|exceed/i.test(t)) {
      throw new Error('The deal inputs are too large for the analyst to read in one pass. Try again.');
    }
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const state = extractJson(text);
  if (!state || !state.header) throw new Error('Could not parse a Market Attack Plan from the model response.');
  if (preparedBy && state.header && !state.header.preparedBy) state.header.preparedBy = preparedBy;
  return { state, business: (state.header && state.header.business) || business || 'Market Attack Plan', usage: data.usage || null };
}

// ===== TENANT side =====
// The Tenant Market Attack Plan is the site-acquisition campaign (find & secure space for a
// restaurant/bar tenant). Unlike the sell side there is no BOV/CIM — the inputs are the
// engagement's site-selection criteria. Output matches the tenant plan worksheet's own state
// shape exactly: { vals:{...}, checks:{c1..c8}, rows:{ sub[], tgt[], tl[] } }.
const SYSTEM_TENANT = `You are a deeply experienced restaurant & bar TENANT-REP broker at Restaurant Realty Group (RRG). You write the Tenant Market Attack Plan — the site-acquisition campaign RRG runs to find and secure the right space for a restaurant/bar tenant. It is the plan of attack: the submarkets to hunt, the kinds of sites to pull and the owners to approach, the tour-and-score process, the lease-leverage posture, and the week-by-week timeline. Write in RRG's voice: confident, precise, strategic, no fluff.

You are given this engagement's site-selection criteria and tenant profile from the RRG system. Build the plan from THOSE facts — the concept/use, the markets, the size, the budget/occupancy ceiling, the must-haves, the timeline. Do not contradict the criteria.

Output a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape (every value a string unless noted; use "" for anything you genuinely cannot support):
{
 "vals": {
   "client": "tenant / concept name",
   "mission": "the assignment in one line, e.g. 'Secure a San Antonio home — a 12,000 SF endcap on the 1604 or Loop 410 nightlife corridor'",
   "markets": "target markets & corridors, e.g. 'San Antonio · 1604 (US-281 / IH-35 / Bandera) · Alamo Ranch · Loop 410'",
   "preparedFor": "who it's prepared for — the tenant / contact",
   "date": "",
   "timeline": "search timeline, e.g. '90 days'",
   "exclusive": "recommended exclusive tenant-rep term, e.g. '12 months'",
   "format": "concept / use, e.g. 'Bar / dance hall · destination nightlife · full bar'",
   "size": "target size range in SF, e.g. '10,500–15,000 SF (ideal 12,000)'",
   "siteTypes": "site types to target, e.g. 'Endcap · freestanding · 2nd-gen preferred, shell OK'",
   "occCeil": "occupancy-cost ceiling anchored to the stated budget, e.g. '$30–40K/mo incl. NNN · 6–8% of sales'",
   "targetOpen": "target open date if derivable, else ''",
   "units": "unit / growth context if known, else ''",
   "musts": "the deal-maker must-haves from the criteria (patio, hood/bar, ceiling height, parking, power, etc.)",
   "assignNarr": "ONE tight paragraph: who the tenant is, what they need, and what a home-run site looks like",
   "canvassNarr": "ONE paragraph: how RRG attacks the market — on-market pulls + off-market owner outreach, driving the corridors, the RRG landlord/developer network, and cadence",
   "tourNarr": "ONE paragraph: how candidates are logged in Tour Tracker and scored in Site & Concept Fit, including the occupancy-cost test, and the deal-makers verified on each tour",
   "leverageNarr": "ONE paragraph: the LOI / negotiation posture — parallel LOIs to create competition, what to push (abatement, TI, term, use protection), and the walk-away discipline",
   "reportNarr": "ONE paragraph: reporting cadence and the immediate next step (countersign the exclusive)",
   "tBase": "target base-rent posture, e.g. '≤ $24–26/SF base · hold all-in ≤ $30K/mo'",
   "tTI": "tenant-improvement posture",
   "tFree": "free-rent / abatement posture",
   "tTerm": "term & options posture",
   "tExcl": "use / exclusive protection to secure",
   "tCoten": "co-tenancy / environment requirement (e.g. noise-tolerant, buffered from residential)"
 },
 "checks": { "c1": true, "c2": true, "c3": true, "c4": true, "c5": true, "c6": true, "c7": true, "c8": false },
 "rows": {
   "sub": [ { "name":"Submarket / corridor — REAL for the stated metro", "why":"demand drivers — daytime pop, rooftops, generators, gap in market", "roof":"rooftops / income shorthand, e.g. 'High income / strong daytime'", "pri":"P1" } ],
   "tgt": [ { "prop":"a TARGET SITE PROFILE to source — descriptive, NOT a specific real address", "type":"site type · size, e.g. 'Endcap · 13,500 SF'", "ask":"a realistic target asking-rent range for the market, or 'TBD'", "ll":"owner/landlord CHANNEL or type, e.g. 'Owner direct' / 'Listing broker' — never a fabricated real name", "mkt":"'On-market (pull)' or 'Off-market (source)'", "status":"'To source' / 'Owner outreach' / 'Pull list'" } ],
   "tl": [ { "phase":"Launch", "win":"Weeks 1–2", "act":"actions & deliverables" } ]
 }
}
Provide 4–6 submarkets (ranked P1/P2/P3), 4–6 target site profiles, and 4–6 timeline phases across the stated search timeline.

Rules:
- Ground everything in the criteria. The occupancy ceiling must reflect the stated budget; size must reflect the stated size; markets must be the stated markets.
- SUBMARKETS must be REAL corridors/areas for the stated metro(s) (legitimate market knowledge). The TARGET SITES are profiles to source — do NOT fabricate specific street addresses, real landlord names, or claim a specific space is currently available for lease; frame them as the kinds of sites to pull and the owners to approach.
- Keep each narrative to ONE tight paragraph. Strategic and direct.
- RRG uses Tour Tracker and Site & Concept Fit (name them), and DocuSign for agreements.
- Output the JSON object only.`;

async function generateTenantMap({ business, market, criteria, tenant, preparedBy, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM_TENANT;
  const content = [];
  content.push({ type: 'text', text:
    '=== Engagement — tenant site-selection criteria (from the RRG system) ===\n' +
    JSON.stringify({ tenant: tenant || business || '', business: business || '', markets: (criteria && (criteria.markets || criteria.market)) || market || '', criteria: criteria || {} }).slice(0, 40000) });
  content.push({ type: 'text', text:
    'Tenant / concept: ' + (tenant || business || '(infer from the criteria)') + '.\n' +
    'Prepared By (the RRG rep on this engagement): ' + (preparedBy || 'Restaurant Realty Group') + '.\n' +
    'Write the full Tenant Market Attack Plan JSON object now, grounded in the criteria above.' });
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, temperature: 0.35, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const state = extractJson(text);
  if (!state || !state.vals) throw new Error('Could not parse a Tenant Market Attack Plan from the model response.');
  state.vals = state.vals || {}; state.checks = state.checks || {}; state.rows = state.rows || {};
  ['sub', 'tgt', 'tl'].forEach(function (k) { if (!Array.isArray(state.rows[k])) state.rows[k] = []; });
  if (preparedBy && !state.vals.preparedBy) state.vals.preparedBy = preparedBy;
  return { state, business: state.vals.client || tenant || business || 'Tenant Market Attack Plan', usage: data.usage || null };
}

// Revise an EXISTING Tenant Market Attack Plan from a plain-English instruction (and any
// pasted data). The current plan is the base of truth; we change only what the broker asks,
// keep everything else intact, and stay grounded in the engagement criteria. Same JSON shape.
const SYSTEM_TENANT_REFINE = SYSTEM_TENANT + `

=== REVISION MODE (RETURN A PATCH, NOT THE WHOLE PLAN) ===
You are REVISING an existing Tenant Market Attack Plan. You are given the CURRENT plan (JSON, in the exact shape above), a broker's revision instruction, and any pasted data. Apply the instruction — but return ONLY the parts that change, as a small PATCH. Returning the whole plan is wrong and wasteful; return the minimum.

Apply the change completely and consistently: if the broker changes a budget, size, market, timeline or must-have, update EVERY field that depends on it (e.g. a new occupancy ceiling flows into vals.occCeil, vals.tBase and vals.leverageNarr) — but include ONLY those changed fields in the patch. Work pasted data in as fact where it fits. Stay inside the engagement criteria; never fabricate specific street addresses or real landlord names.

Output a SINGLE JSON object — no prose, no fences — with ONLY the keys that change, in this PATCH shape:
{
 "vals": { /* ONLY the vals keys whose value changes — e.g. {"exclusive":"18 months"} or {"occCeil":"…","tBase":"…","leverageNarr":"…"}. Omit this key entirely if no vals change. */ },
 "checks": { /* ONLY checkbox keys that flip — e.g. {"c8": true}. Omit if none change. */ },
 "rows": { /* Include a row group ONLY if it changes, and then give the COMPLETE new array for that one group (not a diff of individual rows). e.g. {"sub":[ …all submarkets… ]}. Omit groups that don't change, and omit "rows" entirely if no rows change. */ },
 "note": "one short sentence naming what you changed"
}
Rules: include a field only if its value actually changes; never restate unchanged values; for a changed row group give the full new array for that group; if truly nothing should change, return {}. Output the JSON object only.`;

function _isPlainObj(o){ return o && typeof o === 'object' && !Array.isArray(o); }

async function refineTenantMap({ state, instruction, extraData, business, market, criteria, tenant, preparedBy, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  if (!instruction || !String(instruction).trim()) throw new Error('Tell the assistant what to change.');
  const base = (state && typeof state === 'object') ? state : {};
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM_TENANT_REFINE;
  const content = [];
  content.push({ type: 'text', text:
    '=== Engagement — tenant site-selection criteria (the outer guardrail) ===\n' +
    JSON.stringify({ tenant: tenant || business || '', business: business || '', markets: (criteria && (criteria.markets || criteria.market)) || market || '', criteria: criteria || {} }).slice(0, 40000) });
  content.push({ type: 'text', text:
    '=== CURRENT Tenant Market Attack Plan (the base of truth — change only what the instruction requires) ===\n' +
    JSON.stringify(base).slice(0, 90000) });
  if (extraData && String(extraData).trim()) {
    content.push({ type: 'text', text: '=== Additional data the broker pasted in (treat as fact where it fits) ===\n' + String(extraData).slice(0, 40000) });
  }
  content.push({ type: 'text', text:
    "Broker's revision instruction:\n" + String(instruction).slice(0, 8000) + '\n\n' +
    'Return the PATCH JSON object now — ONLY the fields that change.' });
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, temperature: 0.3, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (/too long|prompt is too|maximum.*tokens|context.*length|exceed/i.test(t)) throw new Error('The plan plus your notes are too large to revise in one pass. Trim the pasted data and try again.');
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const patch = extractJson(text);
  if (!patch || typeof patch !== 'object') throw new Error('Could not parse the revision from the model response.');
  // Merge the patch onto the current plan. vals/checks shallow-merge; each rows group is
  // replaced wholesale only if the patch supplies it. Everything else is preserved as-is.
  const next = {
    vals: Object.assign({}, base.vals || {}),
    checks: Object.assign({}, base.checks || {}),
    rows: {
      sub: (base.rows && Array.isArray(base.rows.sub)) ? base.rows.sub.slice() : [],
      tgt: (base.rows && Array.isArray(base.rows.tgt)) ? base.rows.tgt.slice() : [],
      tl: (base.rows && Array.isArray(base.rows.tl)) ? base.rows.tl.slice() : []
    }
  };
  // Tolerate a model that returns a full plan instead of a patch: same merge rules apply.
  if (_isPlainObj(patch.vals)) Object.keys(patch.vals).forEach(function (k) { next.vals[k] = patch.vals[k]; });
  if (_isPlainObj(patch.checks)) Object.keys(patch.checks).forEach(function (k) { next.checks[k] = !!patch.checks[k]; });
  if (_isPlainObj(patch.rows)) ['sub', 'tgt', 'tl'].forEach(function (k) { if (Array.isArray(patch.rows[k])) next.rows[k] = patch.rows[k]; });
  // Never let a revision blank out the rep's preparedBy.
  if (!next.vals.preparedBy) next.vals.preparedBy = (base.vals && base.vals.preparedBy) || preparedBy || '';
  return { state: next, business: next.vals.client || (base.vals && base.vals.client) || tenant || business || 'Tenant Market Attack Plan', note: (patch && typeof patch.note === 'string') ? patch.note : '', usage: data.usage || null };
}

// ===== BROKER REQUIREMENT BLAST =====
// A broker-to-broker "requirement" email: RRG represents a tenant and is canvassing the
// brokerage community for space that fits. When blind, the tenant's NAME is withheld — we
// lead with the concept, the criteria, and RRG's credibility, and invite brokers to bring
// sites and owner relationships. Output is a subject line + an HTML email body (fragment —
// the mass-email pipeline wraps it with tracking + unsubscribe), grounded ONLY in the
// engagement's site-selection criteria. Requires ANTHROPIC_API_KEY.
const SYSTEM_BROKER_REQ = `You are a deeply experienced restaurant & bar TENANT-REP broker at Restaurant Realty Group (RRG). You are writing a REQUIREMENT email sent broker-to-broker — to the brokerage and landlord community — announcing that RRG represents a tenant actively seeking space, and asking brokers to bring matching sites, listings, and owner relationships. This is a canvassing / site-sourcing tool, NOT a consumer ad. Write in RRG's voice: confident, precise, professional, collegial, no fluff. Respect that the reader is another licensed broker — be specific about the criteria so they can instantly tell whether they have a fit, and make it easy and worthwhile for them to respond.

You are given this engagement's site-selection criteria from the RRG system: the concept/use, the target markets & corridors, the size, the budget / occupancy ceiling, the must-have features, the timeline, and the site types. Build the requirement from THOSE facts. Do not contradict them and do not invent criteria that are not supported.

CONFIDENTIALITY — this requirement is BLIND unless told otherwise: you MUST NOT state the tenant's name, brand, or any detail that would identify the specific business. Describe the tenant generically by concept, caliber, and track record (e.g. "an established, well-capitalized full-service restaurant operator" / "a proven high-volume bar & live-music concept"). Never imply the name. If the inputs contain the business name, treat it as confidential and withhold it.

Output a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape:
{
 "subject": "a tight, broker-to-broker subject line that signals the requirement — concept + market + the headline size/criteria, e.g. 'Site Needed — Full-Service Restaurant, 6–8K SF, San Antonio (1604 / Loop 410)'. No tenant name when blind.",
 "body": "the email body as clean HTML — a sequence of <p> paragraphs and ONE <ul> of criteria. See structure below. No <html>/<head>/<body> wrapper, no inline styles, no tracking pixels, no unsubscribe link (the system adds those). Plain semantic HTML only: <p>, <strong>, <ul>, <li>, <br>."
}

BODY structure (HTML fragment):
1. A one-line greeting to a fellow broker ("<p>Colleagues,</p>" or similar — generic, no merge tokens).
2. One short paragraph: RRG represents a tenant (described generically / blind) that is actively in the market for space, and you're reaching out to the brokerage community to source sites.
3. A <ul> of the hard criteria pulled from the engagement — each <li> a labeled line using <strong>: Concept / Use, Target Markets, Size, Site Types, Occupancy / Budget, Must-Haves, Timeline. Omit any line the criteria don't support rather than guessing.
4. One short paragraph: what RRG is looking for from them — on- or off-market space, listings, pads/endcaps, 2nd-gen restaurant space, and owner/landlord relationships in the target corridors; note the tenant is well-qualified and ready to move, and that RRG protects cooperating brokers (full cooperation / commission).
5. A closing paragraph: ask them to reply with anything that fits; RRG will move quickly and confidentially. Sign off from the RRG rep (use the preparedBy name if given, else "Restaurant Realty Group").

Rules:
- BLIND: never reveal or hint at the tenant's name or any identifying specific when blind.
- Ground every criterion in the inputs; omit what you don't have. Do not fabricate markets, sizes, or budgets.
- Keep it concise — a broker should read it in under 30 seconds and know instantly if they have a fit.
- Collegial and professional: this is broker-to-broker, cooperation offered. No hype, no emojis, no consumer-marketing tone.
- HTML body must be a clean fragment (<p>, <strong>, <ul>, <li>, <br> only) — no styles, no wrapper, no links.
- Output the JSON object only.`;

async function generateBrokerRequirement({ business, market, criteria, preparedBy, blind, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM_BROKER_REQ;
  const isBlind = (blind === undefined || blind === null) ? true : !!blind;
  const content = [];
  content.push({ type: 'text', text:
    '=== Engagement — tenant site-selection criteria (from the RRG system) ===\n' +
    JSON.stringify({
      business: business || '',
      markets: (criteria && (criteria.markets || criteria.market)) || market || '',
      criteria: criteria || {}
    }).slice(0, 40000) });
  content.push({ type: 'text', text:
    'Confidentiality: ' + (isBlind
      ? 'BLIND — the tenant is RRG\'s confidential client. Withhold the tenant name and any identifying specific; describe the tenant generically by concept and caliber.'
      : 'NOT blind — you may name the tenant/concept.') + '\n' +
    'Prepared By (the RRG rep sending this): ' + (preparedBy || 'Restaurant Realty Group') + '.\n' +
    'Write the broker-to-broker requirement email JSON object now, grounded in the criteria above.' });
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500, temperature: 0.4, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const out = extractJson(text);
  if (!out || !out.subject || !out.body) throw new Error('Could not parse a broker requirement email from the model response.');
  return { subject: String(out.subject).trim(), body: String(out.body).trim(), blind: isBlind, usage: data.usage || null };
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel, generateMap, generateTenantMap, refineTenantMap, generateBrokerRequirement, MODEL, DEFAULT_SYSTEM: SYSTEM, DEFAULT_SYSTEM_TENANT: SYSTEM_TENANT, DEFAULT_SYSTEM_BROKER_REQ: SYSTEM_BROKER_REQ };
