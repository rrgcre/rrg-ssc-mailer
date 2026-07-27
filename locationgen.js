// RRG — location finder. Given a restaurant concept, its parent company, its website,
// and roughly how many units it operates, the assistant uses live web search to find each
// physical location's street address, city, and phone number, and returns them as structured
// records so onboarding can auto-create the location list for that concept. Requires
// ANTHROPIC_API_KEY. Uses the Anthropic web-search server tool.
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a diligence researcher for Restaurant Realty Group (RRG), a brokerage specializing in restaurants and bars. Your job is to find the real, current physical locations of a restaurant concept so a broker can build the company's location list during onboarding.

You are given the concept name, the parent company, the concept's website, and an approximate number of locations. Use web search — start with the concept's own website (look for a "Locations", "Find us", or "Visit" page), and corroborate with map listings and directories — to identify each open location. For every location you are confident is real and currently operating, capture: a short location name (the neighborhood, city, or store label the brand uses, e.g. "Downtown", "The Domain", "Southpark"), the full street address, the city, the state, and the public phone number.

Return a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape:
{
 "locations": [
   { "name": "short label for this unit", "address": "street address", "city": "city", "state": "ST", "phone": "public phone" }
 ],
 "note": "one short line on what you found and any gaps (e.g. 'Found 6 of ~8; two addresses unconfirmed')"
}

Rules:
- Only include locations you actually found evidence for. NEVER invent an address or phone number. Leave a field as "" if you genuinely could not confirm it — an accurate partial record beats a fabricated one.
- Prefer the brand's own website as the source of truth; use directories only to fill gaps.
- The location count you're given is an approximation — return the real ones you find, whether that's more or fewer.
- Do not include closed or "coming soon" locations. Restaurants only (this brand's own units), not fran'chisor HQ or unrelated businesses.
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
    'Find the physical locations for this restaurant concept and return the JSON.\n' +
    JSON.stringify({ concept: concept || '', company: company || '', website: website || '', approxLocations: count || '' });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4000, temperature: 0.1,
      system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
      messages: [{ role: 'user', content: ask }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
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

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  findLocations, resolveConcept, MODEL, DEFAULT_SYSTEM: SYSTEM };
