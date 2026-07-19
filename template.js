// Renders submitted SSC data into the branded RRG PDF — matched to the Whiskey River deal-doc design.
const fs = require('fs');
const path = require('path');

function fontURI(file) {
  const b = fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64');
  return `data:font/ttf;base64,${b}`;
}
const ARCHIVO = fontURI('Archivo.ttf');
const INTER = fontURI('Inter.ttf');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/—/g, ', '); // no em-dashes in output
}

function findFirst(data, labelStarts) {
  const t = labelStarts.toLowerCase();
  for (const sec of data.sections || []) {
    for (const g of sec.groups || []) {
      if ((g.label || '').toLowerCase().startsWith(t)) {
        if (g.kind === 'field') return g.value || '';
        if (g.kind === 'options') return (g.selected && g.selected[0]) || '';
      }
    }
  }
  return '';
}

function pill(text, primary) {
  return `<span class="pill${primary ? ' red' : ''}">${esc(text)}</span>`;
}

function renderGroup(g) {
  if (g.kind === 'subhead') return `<div class="subhead">${esc(g.text)}</div>`;
  if (g.kind === 'field') {
    if (!g.value || !String(g.value).trim()) return '';
    return `<div class="field"><div class="k">${esc(g.label)}</div><div class="v">${esc(g.value)}</div></div>`;
  }
  if (g.kind === 'options') {
    if (!g.selected || !g.selected.length) return '';
    const pills = g.selected.map((s, i) => pill(s, i === 0 && g.selected.length === 1)).join('');
    const full = g.selected.length > 2 ? ' full' : '';
    return `<div class="tagfield${full}"><div class="k">${esc(g.label)}</div><div class="pillrow">${pills}</div></div>`;
  }
  if (g.kind === 'subgroups') {
    const rows = (g.rows || []).filter(r => r.selected && r.selected.length)
      .map(r => `<div class="subrow"><div class="srk">${esc(r.label)}</div><div class="pillrow">${r.selected.map(s => pill(s)).join('')}</div></div>`).join('');
    if (!rows) return '';
    return `<div class="tagfield full"><div class="k">${esc(g.label)}</div>${rows}</div>`;
  }
  return '';
}

function renderSection(sec) {
  const inner = (sec.groups || []).map(renderGroup).filter(Boolean).join('');
  if (!inner.trim()) return '';
  return `<div class="sec-block">
    <div class="sec"><div class="num">${esc(sec.n || '')}</div><h2>${esc(sec.title)}</h2><div class="flex"></div></div>
    <div class="cards">${inner}</div>
  </div>`;
}

function buildHtml(data) {
  const concept = esc(data.concept || 'Concept');
  const preparedBy = esc(data.preparedBy || '');
  const date = esc(data.date || '');
  const contact = esc(data.contact || '');
  const market = findFirst(data, 'primary market');

  const snap = [
    ['Concept Type', findFirst(data, 'concept type')],
    ['Target Market', market],
    ['Ideal Footprint', findFirst(data, 'ideal sq ft')],
    ['Structure', findFirst(data, 'lease or purchase')],
  ].filter(x => x[1]);
  const snapHtml = snap.map(x =>
    `<div class="cell"><div class="lbl">${esc(x[0])}</div><div class="val">${esc(x[1])}</div></div>`).join('');

  const sectionsHtml = (data.sections || []).map(renderSection).filter(Boolean).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
  @font-face{font-family:'Archivo';src:url('${ARCHIVO}') format('truetype');font-weight:100 900;}
  @font-face{font-family:'Inter';src:url('${INTER}') format('truetype');font-weight:100 900;}
  :root{--navy:#000E31;--red:#DA2B1F;--ink:#1c2436;--muted:#6a7488;--line:#e4e7ee;--wash:#f5f6f9;}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  html,body{margin:0;padding:0;}
  body{font-family:'Inter',sans-serif;color:var(--ink);font-size:10.2px;line-height:1.5;}
  @page{size:Letter;margin:0;}
  .page{width:8.5in;min-height:11in;padding:0.62in 0.66in 0.7in;position:relative;display:flex;flex-direction:column;}
  .cover{padding:0;}
  .cpage{page-break-after:always;}

  .band{background:radial-gradient(96% 130% at 27% 12%, #1c2e5c 0%, #112044 42%, #0b1636 70%, #071029 100%);color:#fff;padding:0.9in 0.66in 0.75in;position:relative;overflow:hidden;}
  .band>*{position:relative;z-index:2;}
  .band::after{content:"";position:absolute;z-index:0;width:1150px;height:1150px;right:-330px;top:110px;border-radius:50%;background:radial-gradient(circle at 34% 30%, #0b1430 0%, #08112a 48%, #050c22 82%);border:1px solid rgba(120,150,220,.10);pointer-events:none;}
  .tgt{display:none;}
  .rrg{display:inline-flex;align-items:center;position:relative;z-index:2;}
  .rrg .disc{background:var(--red);color:#fff;border-radius:50%;width:48px;height:48px;font-family:'Archivo';font-weight:800;font-size:15.5px;display:flex;align-items:center;justify-content:center;letter-spacing:-.02em;}
  .rrg .bar{background:#fff;width:3px;height:36px;margin:0 12px;}
  .rrg .wm{font-family:'Archivo';font-weight:800;color:#fff;font-size:15.5px;text-transform:uppercase;line-height:.94;}
  .kicker{font-family:'Archivo';font-weight:700;letter-spacing:.34em;font-size:11px;text-transform:uppercase;color:var(--red);margin:44px 0 6px;position:relative;z-index:2;}
  .band h1{font-family:'Archivo';font-weight:800;font-size:40px;line-height:1.02;margin:0 0 4px;color:#fff;letter-spacing:-.01em;position:relative;z-index:2;}
  .accent{width:64px;height:5px;background:var(--red);border-radius:3px;margin:18px 0 0;position:relative;z-index:2;}
  .subttl{font-size:12px;color:#aeb8cf;margin-top:10px;position:relative;z-index:2;}

  .cbody{padding:0.5in 0.66in 0;}
  .lead{font-size:11px;color:var(--ink);line-height:1.62;max-width:6.1in;}
  .lead strong{color:var(--navy);}
  .metastrip{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:26px 0 0;}
  .metastrip .cell{padding:14px;border-right:1px solid var(--line);background:var(--wash);}
  .metastrip .cell:last-child{border-right:none;}
  .metastrip .lbl{font-size:7.6px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;}
  .metastrip .val{font-family:'Archivo';font-weight:700;font-size:15px;color:var(--navy);margin-top:4px;line-height:1.12;}
  .callout{margin-top:26px;border-left:4px solid var(--red);background:var(--wash);border-radius:0 10px 10px 0;padding:16px 20px;}
  .callout .ct{font-family:'Archivo';font-weight:700;letter-spacing:.18em;font-size:8.4px;text-transform:uppercase;color:var(--red);margin-bottom:6px;}
  .callout p{margin:0;font-size:10px;color:var(--ink);line-height:1.55;}
  .callout p b{color:var(--navy);}
  .prep{display:flex;gap:30px;margin-top:26px;}
  .prep .k{font-size:7.6px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;}
  .prep .v{font-size:11px;color:var(--navy);font-weight:600;margin-top:3px;}

  .rhead{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid var(--navy);padding-bottom:8px;margin-bottom:16px;}
  .rhead .doc{font-family:'Archivo';font-weight:700;letter-spacing:.14em;font-size:8.4px;color:var(--muted);text-transform:uppercase;}

  .sec-block{break-inside:avoid;margin-top:20px;}
  .sec-block:first-of-type{margin-top:0;}
  .sec{display:flex;align-items:center;gap:12px;margin:0 0 12px;}
  .sec .num{font-family:'Archivo';font-weight:800;font-size:13px;color:#fff;background:var(--red);width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:none;}
  .sec h2{font-family:'Archivo';font-weight:800;font-size:15px;color:var(--navy);margin:0;text-transform:uppercase;letter-spacing:.02em;}
  .sec .flex{flex:1;height:1px;background:var(--line);}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
  .subhead{grid-column:1/-1;font-family:'Archivo';font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:8.6px;color:var(--red);margin:8px 0 1px;display:flex;align-items:center;gap:8px;}
  .subhead::after{content:"";flex:1;height:1px;background:var(--line);}
  .field,.tagfield{border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:#fff;break-inside:avoid;}
  .field .k,.tagfield .k{font-size:7.6px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;}
  .field .v{font-size:11px;color:var(--navy);font-weight:600;margin-top:3px;}
  .tagfield.full{grid-column:1/-1;}
  .pillrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;}
  .pill{background:#fff;color:var(--navy);font-weight:600;font-size:9.6px;padding:4px 11px;border-radius:6px;border:1px solid #cfd6e2;}
  .pill.red{box-shadow:inset 3px 0 0 var(--red);padding-left:12px;}
  .subrow{margin-top:6px;}
  .subrow .srk{font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;}
  .foot{margin-top:auto;border-top:1px solid var(--line);padding-top:9px;display:flex;justify-content:space-between;font-size:7.6px;color:var(--muted);}
  .foot b{color:var(--navy);}
  </style></head><body>

  <div class="page cover cpage">
    <div class="band">
      <svg class="tgt" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="140" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.5"/><circle cx="150" cy="150" r="100" fill="none" stroke="rgba(255,255,255,.11)" stroke-width="1.5"/><circle cx="150" cy="150" r="60" fill="none" stroke="rgba(218,43,31,.60)" stroke-width="1.5"/><line x1="150" y1="6" x2="150" y2="294" stroke="rgba(255,255,255,.09)" stroke-width="1"/><line x1="6" y1="150" x2="294" y2="150" stroke="rgba(255,255,255,.09)" stroke-width="1"/><circle cx="150" cy="150" r="8" fill="#DA2B1F"/></svg>
      <span class="rrg"><span class="disc">RRG</span><span class="bar"></span><span class="wm">Restaurant<br>Realty<br>Group</span></span>
      <div class="kicker">Site Selection Criteria</div>
      <h1>${concept}</h1>
      <div class="accent"></div>
      <div class="subttl">Confidential Tenant-Representation Blueprint${market ? ' &nbsp;&middot;&nbsp; ' + esc(market) : ''}</div>
    </div>
    <div class="cbody">
      <p class="lead">This Site Selection Criteria (SSC) is the official blueprint for the site search, completed by an
      RRG advisor in collaboration with the client. It captures the <strong>strategic, operational, physical, and
      economic requirements</strong> that guide all market outreach, broker engagement, and touring.</p>
      ${snapHtml ? `<div class="metastrip" style="grid-template-columns:repeat(${snap.length},1fr)">${snapHtml}</div>` : ''}
      <div class="callout"><div class="ct">The RRG Standard</div>
        <p><b>No market search begins without a completed SSC. No exceptions.</b> Searching without one is like
        building a restaurant or bar without drawings: expensive, slow, and guaranteed to go sideways.</p></div>
      <div class="prep">
        ${preparedBy ? `<div><div class="k">Prepared By</div><div class="v">${preparedBy}</div></div>` : ''}
        ${contact ? `<div><div class="k">Operator</div><div class="v">${contact}</div></div>` : ''}
        ${date ? `<div><div class="k">Date</div><div class="v">${date}</div></div>` : ''}
      </div>
    </div>
    <div class="foot"><span>Restaurant Realty Group, LLC &nbsp;&middot;&nbsp; <b>Restaurant Transactions. Done Right.</b></span><span>Confidential</span></div>
  </div>

  <div class="page">
    <div class="rhead"><span class="doc">Site Selection Criteria &middot; ${concept}</span></div>
    ${sectionsHtml}
    <div class="foot"><span>Restaurant Realty Group, LLC &nbsp;&middot;&nbsp; <b>Restaurant Transactions. Done Right.</b></span><span>Confidential</span></div>
  </div>

  </body></html>`;
}

module.exports = { buildHtml };
