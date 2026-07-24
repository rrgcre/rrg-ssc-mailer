// RRG — AI offer analysis for IOIs & LOIs received on an assignment. Given the deal's
// concluded value (from the BOV), the offer's price and terms, and any competing offers,
// the RRG analyst returns a structured broker's assessment: how the price stacks up, the
// strengths and risks in the terms, a recommended action (accept / counter / reject), and
// a suggested counter. Requires ANTHROPIC_API_KEY.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a deeply experienced restaurant & bar business-sale broker at Restaurant Realty Group (RRG), advising the SELLER. An offer — an IOI (Indication of Interest) or an LOI (Letter of Intent) — has come in on a listing you represent. Your job is to give ownership a sharp, honest, no-BS assessment so they negotiate from strength. You always play to win for your client: maximize price and certainty of close, protect confidentiality, and use competitive tension.

You are given: the deal (business, market, and the concluded RRG Broker's Opinion of Value — the target and range you took to market and the earnings basis), the offer itself (type, buyer, price, date, status, and the key terms as written), and any other offers currently on the table. Analyze the offer against the BOV and against the competing offers. Be concrete about dollars and terms. Judge not just price but certainty of close: financing/contingencies, earnest money, exclusivity/no-shop, diligence period, close timeline, asset vs. equity, seller obligations (training, non-compete, holdbacks/escrow, seller note), and lease assignment risk (critical for restaurants).

Return a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape (strings unless noted; use "" or [] when you genuinely lack the input, never invent facts):
{
 "score": 0,
 "verdict": "one of: Strong | Solid | Light | Below market | Incomplete — your headline read on the offer",
 "headline": "one tight sentence summarizing the offer and where it stands",
 "vsValue": "how the price compares to the BOV target and range in real dollars (e.g. '$2.10M is 93% of the $2.25M target, inside the $2.0–2.4M range'); if value unknown, say what's needed",
 "priceGap": "the gap to the target as a short string, e.g. '-$150K vs target' or 'at target' or '+$50K over target' — '' if unknown",
 "strengths": [ "specific strengths — price, all-cash, short diligence, strong buyer, few contingencies, etc." ],
 "concerns": [ "specific risks — financing contingency, long diligence, seller note, lease-assignment risk, weak earnest money, retrade risk, etc." ],
 "recommendation": "a direct paragraph: what you advise ownership to do and why, weighing price against certainty and the competitive field",
 "action": "one of: Accept | Counter | Reject — your recommended next move",
 "suggestedCounter": "if countering, the specific number and the 2–3 terms to push (e.g. 'Counter $2.30M, cut diligence to 30 days, raise earnest to $75K, firm no seller note'); '' if not countering"
}

The "score" is a single 0–100 number rating the offer's overall quality FOR THE SELLER, so ownership can compare offers at a glance. Weigh price against the BOV target (~60%) and certainty of close (~40%: financing, contingencies, earnest money, diligence length, buyer strength, lease/license transfer risk). Guide: 90–100 exceptional (at/above target, clean and certain), 75–89 strong, 60–74 solid but with real gaps, 40–59 light (well under target or shaky terms), below 40 weak. Be consistent so two offers can be ranked by score.

Rules:
- Anchor everything to the BOV. RRG guides high and lets the process find the ceiling — if the offer is under target, lean toward a counter unless certainty is exceptional or the field is thin.
- Weigh certainty of close as heavily as price. A slightly lower all-cash, low-contingency offer can beat a higher, financing-dependent one — say so when true.
- For restaurants, always flag lease assignment / landlord consent and license transfer risk if the terms are silent on them.
- Reference competing offers when they exist to inform the tension strategy.
- RRG uses DocuSign for all agreements.
- Be direct and specific with dollars. Output the JSON object only.`;

function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function analyzeOffer({ business, market, dealTarget, dealRange, dealBasis, offer, otherOffers, preparedBy, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const content = [];
  content.push({ type: 'text', text:
    '=== The deal (RRG concluded valuation — anchor the analysis to this) ===\n' +
    JSON.stringify({ business: business || '', market: market || '', bovTarget: dealTarget || '', bovRange: dealRange || '', earningsBasis: dealBasis || '' }) });
  content.push({ type: 'text', text:
    '=== The offer to analyze ===\n' +
    JSON.stringify({ type: offer.type || 'IOI', buyer: offer.buyer || '', amount: offer.amount || '', received: offer.received || '', status: offer.status || 'Received', terms: offer.terms || '' }).slice(0, 12000) });
  if (Array.isArray(otherOffers) && otherOffers.length) {
    content.push({ type: 'text', text:
      '=== Other offers currently on this deal (competitive field) ===\n' +
      JSON.stringify(otherOffers.map(o => ({ type: o.type, buyer: o.buyer, amount: o.amount, status: o.status, terms: (o.terms || '').slice(0, 300) }))).slice(0, 12000) });
  }
  content.push({ type: 'text', text:
    'RRG rep on this engagement: ' + (preparedBy || 'Restaurant Realty Group') + '.\n' +
    'Analyze this offer for ownership now and return the JSON assessment.' });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, temperature: 0.2, system: sys, messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('Claude API error ' + resp.status + ': ' + t.slice(0, 300));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const a = extractJson(text);
  if (!a || (!a.verdict && !a.headline && !a.recommendation)) throw new Error('Could not parse an offer analysis from the model response.');
  return a;
}

module.exports = { analyzeOffer, MODEL, DEFAULT_SYSTEM: SYSTEM };
