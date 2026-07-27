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

module.exports = { parseSpaceListing, parseLoiText, matchSpaces };
