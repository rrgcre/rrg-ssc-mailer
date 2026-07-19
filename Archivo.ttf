// Persistent submission log for RRG intake forms (SSC + Seller Screening).
// Every submission is appended to two files under DATA_DIR:
//   submissions.jsonl  — one full JSON record per line (complete payload)
//   submissions.csv    — one flat summary row per line (open in Excel)
// On a host with an ephemeral filesystem (Render, Railway, Fly), point DATA_DIR
// at a mounted persistent disk so the log survives restarts and deploys.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'submissions.jsonl');
const CSV = path.join(DATA_DIR, 'submissions.csv');

const CSV_COLS = ['timestamp', 'form', 'name', 'market', 'rep', 'rep_email', 'date_on_form', 'emailed', 'highlights'];

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function csvCell(v) { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

// Pull a signal field out of the section payload by label prefix.
function pick(sections, labelStarts) {
  labelStarts = labelStarts.toLowerCase();
  for (const s of (sections || [])) for (const g of (s.groups || [])) {
    const lb = (g.label || '').toLowerCase();
    if (lb.indexOf(labelStarts) === 0) {
      if (g.kind === 'field') return g.value || '';
      if (g.kind === 'options') return (g.selected || []).join(', ');
    }
  }
  return '';
}

function summarize(formType, data) {
  const s = data.sections || [];
  if (formType === 'seller') {
    const rev = pick(s, 'annual revenue');
    return [
      pick(s, 'concept type'),
      pick(s, 'primary motivation'),
      pick(s, 'timeline'),
      pick(s, 'profitability'),
      rev ? ('Rev $' + rev) : '',
    ].filter(Boolean).join(' · ');
  }
  // SSC
  return [
    pick(s, 'concept type'),
    pick(s, 'primary markets') || data.market,
    pick(s, 'ideal sq ft') ? (pick(s, 'ideal sq ft') + ' SF') : '',
    pick(s, 'lease or purchase'),
  ].filter(Boolean).join(' · ');
}

function appendSubmission(formType, data, meta) {
  ensureDir();
  meta = meta || {};
  const ts = meta.timestamp || new Date().toISOString();
  const entry = {
    timestamp: ts,
    form: formType,
    name: data.concept || '',
    market: data.market || '',
    rep: data.preparedBy || '',
    repEmail: data.repEmail || '',
    dateOnForm: data.date || '',
    emailed: !!meta.emailed,
    ip: meta.ip || '',
    highlights: summarize(formType, data),
    data,
  };
  // Full record
  fs.appendFileSync(JSONL, JSON.stringify(entry) + '\n');
  // Flat summary row
  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, CSV_COLS.join(',') + '\n');
  const row = [ts, formType, entry.name, entry.market, entry.rep, entry.repEmail, entry.dateOnForm, entry.emailed ? 'yes' : 'no', entry.highlights];
  fs.appendFileSync(CSV, row.map(csvCell).join(',') + '\n');
  return entry;
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(JSONL)) return [];
  return fs.readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(Boolean);
}

module.exports = { appendSubmission, readAll, DATA_DIR, JSONL, CSV, CSV_COLS };
