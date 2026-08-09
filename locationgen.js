// RRG — location finder. Given a restaurant concept, its parent company, its website,
// and roughly how many units it operates, the assistant uses live web search to find each
// physical location's street address, city, and phone number, and returns them as structured
// records so onboarding can auto-create the location list for that concept. Requires
// ANTHROPIC_API_KEY. Uses the Anthropic web-search server tool.
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a diligence researcher for Restaurant Realty Group (RRG), a brokerage specializing in restaurants and bars. Your job is to find EVERY real, currently-open physical location of a restaurant concept so a broker can build the company's complete location list during onboarding. Completeness is the whole point of this task — a list that is missing half the units is a failure. Be exhaustive.

You are given the concept name, the parent company, the concept's website, and an approximate number of locations. For every location you are confident is real and currently operating, capture: a short location name (the neighborhood, city, or store label the brand uses, e.g. "Downtown", "The Domain", "Southpark"), the full street address, the city, the state, and the public phone number.

HOW TO SEARCH — do all of this, do not stop after one or two searches:
1. START at the brand's OWN website. Open its "Locations", "Hours & Locations", "Find us", "Visit", or store-locator page and read it directly (fetch the page). Many restaurant store-locators are JavaScript-rendered and a plain read may come back nearly empty — if the locator page gives you few or no addresses, DO NOT conclude the brand only has a few units. Treat that as a rendering gap and corroborate aggressively with the steps below.
2. Corroborate and FILL OUT the list using sources that enumerate every unit of a chain: the brand's own social pages, Yelp/Tripadvisor/Google roll-ups of the brand, franchise-disclosure or "our locations" listings, and local news about openings. These directory sources are usually static and often list units the JS locator hid from you.
3. Search METRO BY METRO and STATE BY STATE. Run separate searches like "<concept> <city>" and "<concept> locations <state>" for every market the brand operates in. A single "<concept> locations" search almost never returns them all — chains are spread across many result pages.
4. RECONCILE against the approximate count. If the brand is said to have ~20 units and you have only found 12, you are NOT done — keep searching different cities/states and directories until you have matched the expected count or genuinely exhausted reasonable queries. Only then stop.

Return a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape:
{
 "locations": [
   { "name": "short label for this unit", "address": "street address", "city": "city", "state": "ST", "phone": "public phone" }
 ],
 "note": "one short line on what you found and any gaps (e.g. 'Found 18 of ~20; two addresses unconfirmed')"
}

Rules:
- Aim to return the FULL set of open units, not a sample. Reconcile to the expected count before you stop.
- Only include locations you actually found evidence for. NEVER invent an address or phone number. Leave a field as "" if you genuinely could not confirm it — an accurate partial record beats a fabricated one.
- The count you're given is an approximation — if you find MORE real units than that, include them all; if you find fewer, keep looking before concluding.
- De-duplicate: the same physical unit found on two sources is one location, not two.
- Do not include closed or "coming soon" locations. Restaurants only (this brand's own units), not the franchisor HQ or unrelated businesses.
- Output the JSON object only.`;

function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function findLocations({ company, concept, website, count, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const ask =
    'Find EVERY physical location for this restaurant concept and return the JSON. Be exhaustive — read the brand\'s own locations page, corroborate with directories, search market by market, and reconcile to the expected count before you stop.\n' +
    JSON.stringify({ concept: concept || '', company: company || '', website: website || '', approxLocations: count || '' });

  // Give the researcher room to actually read the brand's locations page (web_fetch) and to
  // search many markets (web_search). web_fetch is a newer tool; if this deployment's API
  // doesn't support it we transparently retry with search only so the finder never hard-fails.
  const baseBody = {
    model: MODEL, max_tokens: 8000, temperature: 0.1,
    system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: ask }],
  };
  const searchTool = { type: 'web_search_20250305', name: 'web_search', max_uses: 14 };
  const fetchTool = { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 8 };

  async function call(withFetch) {
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    if (withFetch) headers['anthropic-beta'] = 'web-fetch-2025-09-10';
    const body = Object.assign({}, baseBody, { tools: withFetch ? [searchTool, fetchTool] : [searchTool] });
    return fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  let resp = await call(true);
  if (!resp.ok) {
    // web_fetch is a newer tool + beta header; if anything about the enhanced request is
    // rejected, transparently retry with search only so the finder never hard-fails on it.
    await resp.text().catch(() => '');
    resp = await call(false);
    if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400)); }
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const a = extractJson(text);
  if (!a || !Array.isArray(a.locations)) throw new Error('Could not parse a location list from the research result.');
  // Clean & cap.
  const locations = a.locations.slice(0, 100).map(l => ({
    name: String(l.name || '').slice(0, 160).trim(),
    address: String(l.address || '').slice(0, 200).trim(),
    city: String(l.city || '').slice(0, 120).trim(),
    state: String(l.state || '').slice(0, 20).trim(),
    phone: String(l.phone || '').slice(0, 60).trim(),
  })).filter(l => l.name || l.address || l.city);
  return { locations, note: String(a.note || '').slice(0, 300) };
}

// Given just a concept name, use web search to identify the brand and return a concise
// profile (official website, concept type, cuisine, price point) that seeds onboarding.
const RESOLVE_SYSTEM = `You are a diligence researcher for Restaurant Realty Group (RRG), a brokerage specializing in restaurants and bars. Given a restaurant/bar concept name (and optionally a market/city), use web search to identify the concept and return a concise profile a broker can use to onboard it.

Return a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape:
{
 "website": "the brand's own official homepage URL starting with http, or \\"\\" if you cannot confirm it",
 "conceptType": "one value copied verbatim from the ALLOWED CONCEPT TYPES list, or \\"\\"",
 "cuisine": "one value copied verbatim from the ALLOWED CUISINES list, or \\"\\"",
 "pricePoint": "one of \\"$\\", \\"$$\\", \\"$$$\\", \\"$$$$\\" (typical per-person price), or \\"\\"",
 "note": "one short line on what you found"
}

Rules:
- Find the brand's OWN official website (its homepage), NOT a directory or aggregator (never Yelp, DoorDash, Grubhub, TripAdvisor; use a Facebook/Instagram page only if there is no other official site).
- conceptType MUST be exactly one of the ALLOWED CONCEPT TYPES or "". cuisine MUST be exactly one of the ALLOWED CUISINES or "".
- NEVER invent a website. If you cannot confirm the official site, return "".
- Output the JSON object only.`;

async function resolveConcept({ name, market, conceptTypes, cuisines }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = RESOLVE_SYSTEM
    + '\n\nALLOWED CONCEPT TYPES: ' + (((conceptTypes || []).join(', ')) || '(none)')
    + '\nALLOWED CUISINES: ' + (((cuisines || []).join(', ')) || '(none)');
  const ask = 'Identify this restaurant/bar concept and return the JSON.\n' +
    JSON.stringify({ concept: name || '', market: market || '' });
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200, temperature: 0.1,
      system: [{ type: 'text', text: sys }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: ask }],
    }),
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400)); }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const a = extractJson(text) || {};
  return {
    website: String(a.website || '').slice(0, 300).trim(),
    conceptType: String(a.conceptType || '').slice(0, 60).trim(),
    cuisine: String(a.cuisine || '').slice(0, 60).trim(),
    pricePoint: String(a.pricePoint || '').slice(0, 8).trim(),
    note: String(a.note || '').slice(0, 300),
  };
}

const GROUP_SYSTEM = `You are a diligence researcher for Restaurant Realty Group (RRG), a brokerage specializing in restaurants and bars. Given the name of a restaurant GROUP, hospitality company, or operator (and optionally its website and market), use web search to identify EVERY distinct restaurant/bar CONCEPT (brand) the group owns or operates.

Start with the group's OWN official website — look for an \"Our Restaurants\", \"Our Concepts\", \"Brands\", \"Concepts\", or \"Portfolio\" page — and corroborate with press and directories.

Return a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape:
{\"groupWebsite\":\"the GROUP's own official website (homepage URL) or empty\",\"concepts\":[{\"name\":\"the brand's consumer-facing name\",\"website\":\"the brand's official site or empty\",\"cuisine\":\"short cuisine label or empty\",\"note\":\"one short line\"}]}

Rules:
- List EVERY distinct brand you can confirm the group operates — a group usually has several.
- Do NOT include the parent/holding-company name itself unless it is also a restaurant people dine at.
- Use each brand's real consumer-facing name, once. Never invent brands or websites. If you cannot confirm any, return {\"concepts\":[]}.
- Output the JSON object only.`;

async function findGroupConcepts({ name, website, market }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const ask = 'Find every restaurant/bar concept this group operates and return the JSON.\n' + JSON.stringify({ group: name || '', website: website || '', market: market || '' });
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, temperature: 0.1, system: [{ type: 'text', text: GROUP_SYSTEM }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }], messages: [{ role: 'user', content: ask }] }),
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400)); }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const a = extractJson(text) || {};
  const arr = Array.isArray(a.concepts) ? a.concepts : [];
  const concepts = arr.map(c => ({ name: String((c && c.name) || '').slice(0, 120).trim(), website: String((c && c.website) || '').slice(0, 300).trim(), cuisine: String((c && c.cuisine) || '').slice(0, 60).trim(), note: String((c && c.note) || '').slice(0, 200) })).filter(c => c.name);
  return { website: String((a && a.groupWebsite) || '').slice(0, 300).trim(), concepts: concepts };
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  findLocations, resolveConcept, findGroupConcepts, MODEL, DEFAULT_SYSTEM: SYSTEM };
