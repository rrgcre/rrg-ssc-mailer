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
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
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
- VALUE DRIVERS: return an array of the drivers the answers support. You MUST copy each string CHARACTER-FOR-CHARACTER from this exact list (same words, spaces, slashes, and capitalization) — do not paraphrase, shorten, or invent new labels: ${JSON.stringify(drivers)}. Include every one the answers reasonably support (usually 3-8); an empty array is only correct if the business is genuinely weak on all of them.
- VALUE DETRACTORS: same rule — return an array copied CHARACTER-FOR-CHARACTER from this exact list, only the ones the answers support: ${JSON.stringify(detractors)}.
- driverNotes / riskNotes: 1-3 sentences each, specific to this business.

Do NOT produce any valuation multiple, indicated value, confidence, or price opinion — that is done later in the BOV with the financials. Only the qualitative factors above.

Return ONLY a single JSON object (no prose, no markdown fences) with EXACTLY this shape:
{
 "offBook": "string",
 "drivers": ["strings copied verbatim from the drivers list"],
 "driverNotes": "string",
 "detractors": ["strings copied verbatim from the detractors list"],
 "riskNotes": "string"
}`;

  const user = `Business / concept: ${business || '(not given)'}\nMetro: ${market || '(not given)'}\n\n=== VALUATION QUESTIONNAIRE ANSWERS ===\n${String(answers || '').slice(0, 100000)}\n\nComplete the Valuation Factors JSON now.`;

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 300));
  }
  const dj = await resp.json();
  const text = (dj.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const result = extractJson(text);
  if (!result) throw new Error('Could not parse the valuation factors from the model response.');
  // normalize shape
  result.drivers = Array.isArray(result.drivers) ? result.drivers : [];
  result.detractors = Array.isArray(result.detractors) ? result.detractors : [];
  ['offBook', 'driverNotes', 'riskNotes']
    .forEach(k => { if (result[k] == null) result[k] = ''; else result[k] = String(result[k]); });
  return { result, usage: dj.usage || {} };
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  generateFactors, MODEL };
