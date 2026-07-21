// RRG — AI Valuation Factors. Reads a completed Valuation Questionnaire (the
// seller's answers, text only — no financial statements) and drafts the
// advisor "Valuation Factors" section: off-book value items, value drivers,
// detractors, and a PRELIMINARY value opinion for the RRG advisor to review.
//
// This is intentionally an indicative pass from the questionnaire alone. The
// definitive number comes from the BOV, which is built with the actual
// financial statements + lease.
//
// Requires env: ANTHROPIC_API_KEY.  Optional: ANTHROPIC_MODEL (default Sonnet).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const s = t.indexOf('{'), en = t.lastIndexOf('}');
  if (s >= 0 && en > s) { try { return JSON.parse(t.slice(s, en + 1)); } catch (e) {} }
  return null;
}

async function generateFactors({ business, market, answers, driverOptions, detractorOptions }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');

  const drivers = (driverOptions && driverOptions.length ? driverOptions : [
    'Transferable systems / SOPs', 'Trained management staying', 'Owner absentee / semi-absentee',
    'Growing revenue', 'Improving margins', 'Below-market lease', 'Long lease term / options',
    'Diversified revenue channels', 'Exclusive / defensible contracts', 'Strong brand / reputation',
    'Clean, verifiable books', 'Prime location', 'Low deferred capex']);
  const detractors = (detractorOptions && detractorOptions.length ? detractorOptions : [
    'Owner-dependent operations', 'Customer / channel concentration', 'Underperforming unit(s)',
    'Short lease / assignment risk', 'Existing debt / liens', 'Deferred capital expenditures',
    'Aging equipment', 'Sector / market headwinds', 'Key-person risk', 'Below-market wages',
    'Unverifiable books', 'Pending litigation', 'Landlord unaware of sale']);

  const SYSTEM = `You are a deeply experienced restaurant & bar commercial real-estate and business-sale broker at Restaurant Realty Group (RRG). No fluff, best practice, defensible. You are completing the internal "Valuation Factors" section of a Valuation Questionnaire that a seller filled out. You have ONLY the questionnaire answers — you do NOT have financial statements or the lease, so any indicated value is PRELIMINARY and confidence should reflect that.

Do the analysis from the answers provided:
- OFF-BOOK ITEMS THAT AFFECT VALUE: items that move value but are not reflected in the reported books — unrecorded cash sales, owner/family perks run through the business, below-market family labor, related-party rent, deferred maintenance, transferable contracts/relationships, brand goodwill. This is NOT an add-back / earnings-normalization bridge — do not compute adjusted EBITDA here. Write 2-4 tight sentences on what is off the books and which way it moves value.
- VALUE DRIVERS: choose from this EXACT list (return the strings verbatim), only the ones the answers support: ${JSON.stringify(drivers)}.
- VALUE DETRACTORS: choose from this EXACT list (return the strings verbatim), only the ones the answers support: ${JSON.stringify(detractors)}.
- driverNotes / riskNotes: 1-3 sentences each, specific to this business.
- Advisor value opinion: pick a defensible BASIS (one of: SDE, EBITDA, Revenue Multiple, Blended) and a MULTIPLE range for this concept and size (single-unit owner-operated ~1.5-3.0x SDE; profitable independents ~3.0-5.0x; multi-unit/manager-run ~4.0-7.0x adj. EBITDA). If — and only if — the answers contain enough of a revenue or earnings figure to support it, give an indicated value LOW and HIGH (plain numbers, no $ or commas); otherwise leave indicatedLow and indicatedHigh empty strings and say why in the rationale.
- CONFIDENCE: one of High, Medium, Low. With no financial statements, Low or Medium is usually honest.
- rationale: 2-4 sentences — what supports the high end, what anchors the floor, and a clear note that the definitive value comes from the BOV once financials and the lease are in hand.

Return ONLY a single JSON object (no prose, no markdown fences) with EXACTLY this shape:
{
 "offBook": "string",
 "drivers": ["exact strings from the drivers list"],
 "driverNotes": "string",
 "detractors": ["exact strings from the detractors list"],
 "riskNotes": "string",
 "basis": "SDE | EBITDA | Revenue Multiple | Blended",
 "multiple": "e.g. 3.0x to 4.0x",
 "indicatedLow": "plain number or empty string",
 "indicatedHigh": "plain number or empty string",
 "confidence": "High | Medium | Low",
 "rationale": "string"
}`;

  const user = `Business / concept: ${business || '(not given)'}\nMetro: ${market || '(not given)'}\n\n=== VALUATION QUESTIONNAIRE ANSWERS ===\n${String(answers || '').slice(0, 100000)}\n\nComplete the Valuation Factors JSON now.`;

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('Claude API error ' + resp.status + ': ' + t.slice(0, 300));
  }
  const dj = await resp.json();
  const text = (dj.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const result = extractJson(text);
  if (!result) throw new Error('Could not parse the valuation factors from the model response.');
  // normalize shape
  result.drivers = Array.isArray(result.drivers) ? result.drivers : [];
  result.detractors = Array.isArray(result.detractors) ? result.detractors : [];
  ['offBook', 'driverNotes', 'riskNotes', 'basis', 'multiple', 'indicatedLow', 'indicatedHigh', 'confidence', 'rationale']
    .forEach(k => { if (result[k] == null) result[k] = ''; else result[k] = String(result[k]); });
  return { result, usage: dj.usage || {} };
}

module.exports = { generateFactors, MODEL };
