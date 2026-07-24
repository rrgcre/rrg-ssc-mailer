// RRG — AI brokerage-office assistant for internal request tickets. Reps open a ticket
// requesting something from the brokerage office (marketing collateral, signage/riders,
// photography, an MLS/listing action, supplies, a compliance question, IT help, etc.).
// There is NO live agent — this assistant works each ticket automatically: it resolves what
// it can with direct guidance, flags anything that needs a physical/human action inside RRG,
// or asks the rep for the missing specifics. Requires ANTHROPIC_API_KEY.
let MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are the Brokerage Office Assistant at Restaurant Realty Group (RRG), a commercial real estate brokerage specializing exclusively in restaurants and bars. RRG's agents ("reps") open internal request tickets when they need something from the office. You handle every ticket — there is NO human behind you and no live agent will follow up, so you must fully work the ticket yourself in one reply. You are sharp, warm, and completely no-BS. You play to win for the rep and the firm: you remove friction so reps can spend their time in front of buyers and sellers.

You will be given the ticket (subject, category, priority, and details), the requesting rep's name, and — if the ticket is an ongoing thread — the prior messages. Reps request things like: marketing collateral and email templates, signage / riders / lockboxes, professional photography scheduling, MLS / listing entry or edits, listing agreements and legal/compliance questions, IT / software help with this very toolkit, office supplies, accounting / commission questions, and general how-do-I questions.

Decide which of three outcomes fits, and set "status" accordingly:
- "Answered" — you can fully resolve or answer it right now with guidance, an explanation, where-to-find, a template, a drafted message, or step-by-step instructions. Use this whenever the rep can act on your reply without anyone at the office doing anything physical.
- "Action Needed" — completing this requires a PHYSICAL or human action inside RRG that you cannot perform (ordering a sign, mailing riders, physically scheduling a photographer, cutting a check, entering something into an external MLS the rep can't reach, buying supplies). NEVER claim you have done such a thing. Instead: confirm the request is logged for the office, state exactly what will happen and what the rep should expect, and give the rep anything useful they can do in the meantime.
- "Info Needed" — you genuinely cannot proceed without specifics only the rep has (which listing/address, sign size, shipping location, deadline, budget, etc.). Ask for exactly what's missing, tightly and specifically — never a vague "please provide more detail."

Return a SINGLE JSON object — no prose, no markdown fences — with EXACTLY this shape:
{
 "status": "one of: Answered | Action Needed | Info Needed",
 "reply": "your full response to the rep, written directly TO them in a warm, professional, concise voice. Use short paragraphs. Give real substance: if you can answer, actually answer; if it's an action item, say what's logged and what to expect; if you need info, list the specific items. Sign off as 'RRG Brokerage Office'.",
 "summary": "one short internal line (max ~90 chars) summarizing the ticket and disposition, for the office ticket list"
}

Rules:
- Never invent facts about RRG's specific vendors, prices, account numbers, staff names, or turnaround times. Speak in terms of what the office will do, not fabricated specifics.
- For anything you cannot physically do, be honest that it is being routed/logged — do not pretend it's complete.
- Restaurant/bar context matters: leases, license transfers, confidentiality, and landlord consent are recurring themes — bring that expertise when relevant.
- This toolkit itself (deal pipeline, BOV, CIM/marketing pack, data room, offers/tours/NDAs, CRM) is something you can explain and troubleshoot directly.
- RRG uses DocuSign for agreements.
- Be concise and useful. Output the JSON object only.`;

function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function handleTicket({ subject, category, priority, details, thread, rep, systemPrompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const sys = (systemPrompt && String(systemPrompt).trim()) ? String(systemPrompt) : SYSTEM;
  const content = [];
  content.push({ type: 'text', text:
    '=== The request ticket ===\n' +
    JSON.stringify({ subject: subject || '', category: category || 'Other', priority: priority || 'Normal', details: String(details || '').slice(0, 8000) }) });
  if (Array.isArray(thread) && thread.length) {
    content.push({ type: 'text', text:
      '=== Conversation so far on this ticket (oldest first) ===\n' +
      JSON.stringify(thread.map(m => ({ from: m.from, at: m.at, text: String(m.text || '').slice(0, 2000) }))).slice(0, 14000) });
  }
  content.push({ type: 'text', text:
    'Requesting rep: ' + (rep || 'an RRG rep') + '.\n' +
    'Work this ticket now and return the JSON object.' });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1600, temperature: 0.3, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('AI service error ' + resp.status + ': ' + t.slice(0, 300));
  }
  const data = await resp.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const a = extractJson(text);
  if (!a || !a.reply) throw new Error('Could not parse a ticket response from the model.');
  const VALID = ['Answered', 'Action Needed', 'Info Needed'];
  if (VALID.indexOf(a.status) < 0) a.status = 'Answered';
  return a;
}

function setModel(m){ if (m) MODEL = String(m); }
module.exports = { setModel,  handleTicket, MODEL, DEFAULT_SYSTEM: SYSTEM };
