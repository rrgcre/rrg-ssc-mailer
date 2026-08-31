// RRG — AI Lease Abstract generation. Reads an uploaded lease (PDF/image/text)
// and returns a structured lease-abstract "state" the abstract builder renders.
// Extraction-focused: temperature 0, never invents terms. Requires ANTHROPIC_API_KEY.
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
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
 "economics": { "baseRentAnnual": "current annual base rent (monthly base x 12) as a dollar figure if derivable, else ''", "nnnAnnual": "estimated annual NNN / CAM + taxes + insurance if the lease states these figures, else 'Not specified in the provided documents'", "totalOccupancyAnnual": "total annual occupancy cost (base + NNN) if derivable from stated figures, else ''", "keyMoney": "any key money, lease buyout, or assignment consideration stated in the lease, else 'None stated'", "financeable": "remaining term INCLUDING options, and whether it supports buyer financing/SBA (which generally wants roughly 10 years of remaining term) — e.g. '3 yrs remaining + two 5-yr options = financeable' or 'Only 2 yrs, no options — a financing risk'" },
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
- For 'economics', derive base/total annual occupancy from stated figures only. Do NOT compute occupancy cost as a percentage of sales — you do not have the sales figures; that is left to the broker. Never invent NNN amounts that are not stated.
- 'flags' should surface anything that helps or hurts a sale; keep each flag one crisp line. If nothing notable, return an empty array.
- Output the JSON object only.`;

// Read a PDF's page count and extractable text (best effort; pdf-parse is optional).
async function pdfInfo(dataB64) {
  try { const pdf = require('pdf-parse'); const buf = Buffer.from(dataB64, 'base64'); const r = await pdf(buf); return { pages: r.numpages || 0, text: (r.text || '') }; }
  catch (e) { return { pages: 0, text: '' }; }
}
// Prefer EXTRACTED TEXT over native PDF pages. Vision-reading a big lease page-by-page is what made
// builds take minutes (and trip the 5-minute no-headers timeout); the extracted text of a normal
// digital lease reads in seconds and is just as accurate for the terms we abstract. Native PDF is
// kept only as a fallback for scanned pages that have no extractable text, under a page cap well
// below Anthropic's 100-page limit.
async function fileBlocks(files) {
  const out = [];
  let nativeBudget = 50; // pages of scanned/native PDF we'll send as a fallback across the whole request
  for (const f of (files || [])) {
    if (!f) continue;
    const isPdf = f.dataB64 && (f.type === 'application/pdf' || /\.pdf$/i.test(String(f.name || '')));
    if (isPdf) {
      const info = await pdfInfo(f.dataB64);
      const txt = String(info.text || '').trim();
      if (txt.length > 300) {
        // Digital PDF — send its text. Fast path; handles leases of any length.
        out.push({ type: 'text', text: '=== ' + (f.name || 'lease') + (info.pages ? (' (' + info.pages + ' pages)') : '') + ' ===\n' + txt.slice(0, 300000) });
      } else if (info.pages === 0 || info.pages <= nativeBudget) {
        // Scanned / no extractable text — let the model read the pages as images.
        out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
        if (info.pages > 0) nativeBudget -= info.pages;
      } else {
        out.push({ type: 'text', text: '=== ' + (f.name || 'document') + ' — could not read (' + info.pages + ' pages, scanned, over the limit) ===\nThis PDF has no extractable text and is too long to read as images. Upload just the lease and its amendments as a text-based PDF and build again.' });
      }
    } else if (f.dataB64 && /^image\//.test(f.type || '')) {
      out.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.dataB64 } });
    } else if (f.text) {
      out.push({ type: 'text', text: '=== ' + (f.name || 'document') + ' ===\n' + String(f.text).slice(0, 120000) });
    }
  }
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
  const content = await fileBlocks(files);
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
    // Stream the response: headers come back immediately, so a long read can never trip the fetch
    // client's 5-minute no-headers timeout (which showed up as "fetch failed").
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, temperature: 0, stream: true, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (/too long|prompt is too|maximum.*tokens|context.*length|exceed/i.test(t)) {
      throw new Error('The lease document is too large to read in one pass. Upload just the lease and its amendments (not the full exhibit set) and build again.');
    }
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 400));
  }
  // Collect the streamed text deltas back into the full response.
  let text = '', stopReason = '', usage = null;
  try {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.indexOf('data:') !== 0) continue;
        const p = line.slice(5).trim();
        if (!p || p === '[DONE]') continue;
        let ev; try { ev = JSON.parse(p); } catch (e) { continue; }
        if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') text += ev.delta.text;
        else if (ev.type === 'message_delta') { if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason; if (ev.usage) usage = ev.usage; }
        else if (ev.type === 'error') throw new Error((ev.error && ev.error.message) || 'AI stream error');
      }
    }
  } catch (e) {
    throw new Error('The lease read was interrupted before it finished (' + String((e && e.message) || e) + '). Try again — if it keeps happening, upload just the lease and its amendments.');
  }
  const state = extractJson(text);
  if (!state || !state.parties) {
    if (stopReason === 'max_tokens') {
      throw new Error('The lease is long enough that the abstract got cut off before it finished. Upload just the lease and its amendments (skip the full exhibit set) and build again, or split a very large lease into fewer files.');
    }
    throw new Error('Could not parse a lease abstract from the model response. Confirm the upload is the actual lease (not a scan or a cover sheet) and build again.');
  }
  const biz = (state.header && state.header.business) || business || 'Lease Abstract';
  return { state, business: biz, usage: usage };
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  generateLease, MODEL, DEFAULT_SYSTEM: SYSTEM };
