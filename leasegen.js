// RRG — AI Lease Abstract generation. Reads an uploaded lease (PDF/image/text)
// and returns a structured lease-abstract "state" the abstract builder renders.
// Extraction-focused: temperature 0, never invents terms. Requires ANTHROPIC_API_KEY.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are a meticulous commercial real estate lease analyst at Restaurant Realty Group (RRG). You read a commercial lease (and any amendments) for a restaurant or bar and produce a precise LEASE ABSTRACT — a structured summary of the terms that matter to a buyer acquiring the business, with special attention to TRANSFERABILITY (assignment, remaining term, renewal options, and guaranty), because for a restaurant sale the lease can make or break the deal.

You are given the lease document(s), and optionally the business/trade name and notes from the deal. Extract ONLY what the documents actually say. Never invent, estimate, or infer terms that are not in the document. If a term is not stated in what you were given, use "Not specified in the provided documents" (or "" for list fields). Quote figures and dates exactly as written. If there are amendments, reflect the most current terms and note what changed.

Return the abstract as a single JSON object — no prose, no markdown fences — with EXACTLY this shape (all values are strings unless noted):
{
 "header": { "business": "trade name / DBA the lease covers", "propertyAddress": "full premises address", "leaseDate": "date of the original lease", "documentList": "what you read, e.g. 'Original Lease dated 3/1/2016; First Amendment dated 6/1/2019'" },
 "parties": { "landlord": "", "tenant": "", "guarantor": "guarantor name(s) or 'None'" },
 "premises": { "description": "", "squareFeet": "rentable SF as stated", "suite": "unit / suite", "commonAreas": "" },
 "term": { "commencement": "", "expiration": "", "originalTerm": "e.g. '10 years'", "remainingTerm": "compute from expiration if a current date is knowable, else state expiration", "rentCommencement": "" },
 "rent": { "current": "current base rent (monthly) as stated", "perSF": "rent per SF if stated or derivable from stated figures", "escalation": "how base rent increases (fixed %, CPI, steps)", "percentageRent": "percentage rent terms or 'None'", "schedule": [ {"period":"e.g. Years 1-5", "monthlyRent":"", "annualRent":""} ] },
 "options": { "renewalOptions": "e.g. 'Two 5-year options'", "renewalNotice": "notice window to exercise", "renewalRent": "how option rent is set (fixed, FMV, CPI)" },
 "charges": { "structure": "NNN / Gross / Modified Gross", "cam": "", "taxes": "", "insurance": "", "otherCharges": "" },
 "deposit": { "securityDeposit": "", "other": "" },
 "use": { "permittedUse": "", "exclusive": "exclusive-use clause or 'None'", "hours": "required/permitted operating hours or 'None'", "coTenancy": "co-tenancy clause or 'None'" },
 "assignment": { "assignmentSublet": "assignment & subletting terms", "consentStandard": "e.g. 'Landlord consent, not to be unreasonably withheld'", "transferFee": "assignment/transfer fee or 'None'", "changeOfControl": "whether a change of ownership triggers consent" },
 "guaranty": { "type": "personal / corporate / none", "personalGuaranty": "who guarantees and scope", "burnoff": "any burn-off / limitation or 'None'" },
 "keyProvisions": { "maintenance": "who maintains HVAC/roof/structure", "improvements": "TI allowance / alterations consent", "signage": "", "parking": "", "insurance": "required coverages", "holdover": "", "default": "default & cure periods", "estoppelSNDA": "estoppel / SNDA obligations" },
 "criticalDates": [ {"date":"", "event":"e.g. 'Renewal option notice deadline'"} ],
 "summary": "a plain-English 2-4 sentence executive summary of the lease and, most importantly, its transferability and remaining runway for a buyer",
 "flags": [ "the deal-relevant items a buyer and broker must know — e.g. 'Only 2 years remain with no renewal options', 'Personal guaranty burns off after year 3', 'Percentage rent above $2.4M', 'Assignment consent not to be unreasonably withheld', 'Landlord recapture right on assignment' ]
}

Rules:
- Extract faithfully. Exact figures and dates. Never fabricate. Missing terms → "Not specified in the provided documents".
- Prioritize accuracy on: remaining term, renewal options, assignment/consent, guaranty, base rent + escalations, and NNN structure — these drive a restaurant sale.
- 'flags' should surface anything that helps or hurts a sale; keep each flag one crisp line. If nothing notable, return an empty array.
- Output the JSON object only.`;

function fileBlocks(files) {
  const out = [];
  (files || []).forEach(f => {
    if (!f) return;
    if (f.dataB64 && f.type === 'application/pdf') out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
    else if (f.dataB64 && /^image\//.test(f.type || '')) out.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.dataB64 } });
    else if (f.text) out.push({ type: 'text', text: '=== ' + (f.name || 'document') + ' ===\n' + String(f.text).slice(0, 80000) });
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

async function generateLease({ business, files, questionnaire, asOf, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const content = fileBlocks(files);
  if (!content.length) throw new Error('Upload the lease document (PDF) before building the abstract.');
  if (questionnaire && String(questionnaire).trim()) {
    content.push({ type: 'text', text: '=== Deal context from the RRG Valuation Questionnaire (use only to confirm the business/premises; the LEASE DOCUMENT governs all terms) ===\n' + String(questionnaire).slice(0, 30000) });
  }
  content.push({ type: 'text', text:
    'Business / trade name: ' + (business || '(infer from the lease)') + '.\n' +
    "Today's date (for computing remaining term): " + (asOf || 'unknown; state the expiration date instead') + '.\n' +
    'Read the lease and any amendments and output the full lease-abstract JSON object now. Extract only what the documents state.' });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, temperature: 0, system: sys, messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (/too long|prompt is too|maximum.*tokens|context.*length|exceed/i.test(t)) {
      throw new Error('The lease document is too large to read in one pass. Upload just the lease and its amendments (not the full exhibit set) and build again.');
    }
    throw new Error('Claude API error ' + resp.status + ': ' + t.slice(0, 400));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const state = extractJson(text);
  if (!state || !state.parties) throw new Error('Could not parse a lease abstract from the model response.');
  const biz = (state.header && state.header.business) || business || 'Lease Abstract';
  return { state, business: biz, usage: data.usage || null };
}

module.exports = { generateLease, MODEL, DEFAULT_SYSTEM: SYSTEM };
