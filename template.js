// Renders a Site Selection Criteria (SSC) as a Letter-size (8.5x11) client document — the Di Campli's
// SSC design (navy cover band, red section numbers, grey card panels) set up to coordinate with
// Lavano's agreements: the same running header ("RESTAURANT REALTY GROUP / …") and
// "CONFIDENTIAL • page" footer on every page. Used for the emailed PDF and the in-app "View SSC".
const fs = require('fs');
const path = require('path');

function fontURI(file) {
  try { return `data:font/ttf;base64,${fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64')}`; } catch (e) { return ''; }
}
const ARCHIVO = fontURI('Archivo.ttf');
const INTER = fontURI('Inter.ttf');

const ABBR = { 'Req.': 'Required', 'Pref.': 'Preferred', 'Nice': 'Nice to have', 'No': 'Not needed' };
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function findFirst(data, labelStarts, all) {
  const t = labelStarts.toLowerCase();
  for (const sec of data.sections || []) for (const g of sec.groups || []) {
    if ((g.label || '').toLowerCase().startsWith(t)) {
      if (g.kind === 'field') return String(g.value || '').trim();
      if (g.kind === 'options') return all ? (g.selected || []).join(' · ') : ((g.selected && g.selected[0]) || '');
    }
  }
  return '';
}
// One "cell" per answered item: { k: label, v: value, wide: needs the full row }.
function cellsOf(sec) {
  const out = [];
  (sec.groups || []).forEach(g => {
    if (g.kind === 'subhead') { if (!/\bmark\b/i.test(g.text || '')) out.push({ head: g.text }); return; }
    if (sec.title === 'Other Information' && /^(tenant rep|operator contact|tenant rep email)/i.test(g.label || '')) return;   // already on page 1
    if (g.kind === 'subgroups') {
      const rows = (g.rows || []).filter(r => r.selected && r.selected.length);
      if (!rows.length) return;
      rows.forEach(r => out.push({ k: r.label, v: r.selected.map(x => ABBR[x] || x).join(' · ') }));
      return;
    }
    let v = g.kind === 'field' ? String(g.value || '').trim() : (g.kind === 'options' ? (g.selected || []).map(x => ABBR[x] || x).join(' · ') : '');
    if (!v) return;
    out.push({ k: g.label, v, wide: v.length > 46 || /\n/.test(v), long: v.length > 46 || /\n/.test(v) });
  });
  return out;
}
// Pack cells into grey panels like the Di Campli's SSC: short answers three to a panel, long ones on their own row.
function panels(cells) {
  const html = []; let row = [];
  const flush = () => { if (!row.length) return; html.push(`<div class="panel c${row.length}">${row.map(c => `<div class="cell"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div></div>`).join('')}</div>`); row = []; };
  cells.forEach(c => {
    if (c.head) { flush(); html.push(`<div class="subhead">${esc(c.head)}</div>`); return; }
    if (c.wide) { flush(); html.push(`<div class="panel c1"><div class="cell"><div class="k">${esc(c.k)}</div><div class="v long">${esc(c.v).replace(/\n/g, '<br>')}</div></div></div>`); return; }
    row.push(c); if (row.length === 3) flush();
  });
  flush();
  // Never leave a sub-heading stranded at the bottom of a page: glue it to the panel that follows.
  const out = []; for (let i = 0; i < html.length; i++) { if (/^<div class="subhead"/.test(html[i]) && html[i + 1]) { out.push('<div class="keep">' + html[i] + html[i + 1] + '</div>'); i++; } else out.push(html[i]); }
  return out;
}

// Puppeteer header/footer (repeat on every PDF page). Inline styles only — they render outside the page CSS.
function headerTemplate(data) {
  return `<div style="width:100%;padding:0 0.75in;font-family:Arial,Helvetica,sans-serif;font-size:6.6pt;letter-spacing:.05em;color:#7a8597"><div style="border-bottom:0.6pt solid #d4dae4;padding-bottom:5px"><b style="color:#0b1636">RESTAURANT REALTY GROUP</b>&nbsp; /&nbsp; SITE SELECTION CRITERIA${data && data.concept ? ' &nbsp;·&nbsp; ' + esc(String(data.concept).toUpperCase()) : ''}</div></div>`;
}
function footerTemplate() {
  return `<div style="width:100%;padding:0 0.75in;font-family:Arial,Helvetica,sans-serif;font-size:6.6pt;letter-spacing:.05em;color:#7a8597;display:flex;justify-content:space-between"><span>Restaurant Realty Group, LLC &nbsp;·&nbsp; <b style="color:#0b1636">Restaurant Transactions. Done Right.</b></span><span>CONFIDENTIAL &nbsp;•&nbsp; <span class="pageNumber"></span></span></div>`;
}

function buildHtml(data, opts) {
  opts = opts || {};
  const screen = !!opts.screen;
  const concept = esc(data.concept || 'Concept');
  const market = findFirst(data, 'primary market', true);
  const size = (function () { const v = findFirst(data, 'ideal sq ft'); return v ? (/sf|sq/i.test(v) ? v : Number(String(v).replace(/[^0-9.]/g, '')) ? Number(String(v).replace(/[^0-9.]/g, '')).toLocaleString('en-US') + ' SF' : v) : ''; })();
  const snap = [
    ['Concept type', findFirst(data, 'concept type')],
    ['Target market', market],
    ['Ideal footprint', size],
    ['Top priority', findFirst(data, 'most important')],
  ].filter(x => x[1]);
  const SIGN = `<div class="sign"><div class="note">Reviewed and confirmed as the basis for the site search.</div>
    <div class="row"><div class="ln">Client signature</div><div class="ln">Date</div></div>
    <div class="row"><div class="ln">Restaurant Realty Group, LLC</div><div class="ln">Date</div></div></div>`;
  let n = 0;
  const secParts = (data.sections || []).map(sec => { const cells = cellsOf(sec); return cells.some(c => !c.head) ? { title: sec.title, ps: panels(cells) } : null; }).filter(Boolean);
  // The sign-off rides with the last panel, so it never lands alone on a final page.
  if (secParts.length) { const L = secParts[secParts.length - 1]; if (L.ps.length > 1) { L.ps[L.ps.length - 1] = `<div class="keep">${L.ps[L.ps.length - 1]}${SIGN}</div>`; } else { L.signInFirst = true; } }
  const sections = secParts.map(sp => {
    n++;
    // A section heading always travels with its first panel, so no heading ever sits alone at the foot of a page.
    return `<section><div class="keep"><h2><span class="n">${n}</span>${esc(sp.title)}</h2>${sp.ps[0] || ''}${sp.signInFirst ? SIGN : ''}</div>${sp.ps.slice(1).join('')}</section>`;
  }).join('');
  const prepared = data.preparedBy || findFirst(data, 'tenant rep');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site Selection Criteria — ${concept}</title><style>
  ${ARCHIVO ? `@font-face{font-family:'Archivo';src:url('${ARCHIVO}') format('truetype');font-weight:100 900;}` : ''}
  ${INTER ? `@font-face{font-family:'Inter';src:url('${INTER}') format('truetype');font-weight:100 900;}` : ''}
  :root{--navy:#0b1636;--red:#DA2B1F;--ink:#1c2436;--muted:#6f7a8d;--line:#dfe4ec;--wash:#f1f3f7;}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  html,body{margin:0;padding:0;}
  body{font-family:'Inter',Arial,sans-serif;color:var(--ink);font-size:9.2pt;line-height:1.45;}
  @page{size:Letter;margin:0.75in 0.75in 0.7in;}
  .band{border-top:4px solid var(--navy);border-bottom:1px solid var(--line);padding:18px 0 16px;position:relative;}
  .lock{display:flex;align-items:center;gap:10px;}
  .lock .disc{width:30px;height:30px;border-radius:50%;background:var(--red);color:#fff;font:800 9.5pt 'Archivo',Arial;display:flex;align-items:center;justify-content:center;letter-spacing:-.02em;}
  .lock .bar{width:1.5px;height:24px;background:var(--navy);opacity:.6;}
  .lock .wm{font:800 7.2pt/1 'Archivo',Arial;text-transform:uppercase;letter-spacing:.02em;color:var(--navy);}
  .kick{font:700 7.4pt 'Archivo',Arial;letter-spacing:.24em;text-transform:uppercase;color:var(--red);margin:20px 0 5px;}
  .band h1{font:800 24pt/1.06 'Archivo',Arial;margin:0;letter-spacing:-.01em;color:var(--navy);}
  .who{font:700 14pt/1.2 'Archivo',Arial;color:var(--ink);margin-top:6px;}
  .accent{width:44px;height:4px;border-radius:2px;background:var(--red);margin:12px 0 0;}
  .bsub{font-size:8.8pt;color:var(--muted);margin-top:9px;}
  .lead{margin:20px 0 14px;font-size:9.6pt;line-height:1.6;}
  .lead b{color:var(--navy);}
  .snap{display:grid;border:1px solid var(--line);border-radius:5px;background:var(--wash);margin:0 0 14px;}
  .snap .cell{padding:10px 13px;border-right:1px solid var(--line);}
  .snap .cell:last-child{border-right:0;}
  .k{font-size:6.4pt;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);}
  .snap .v{font:800 11pt/1.2 'Archivo',Arial;color:var(--navy);margin-top:3px;}
  .std{border-left:3px solid var(--red);background:var(--wash);border-radius:0 5px 5px 0;padding:11px 15px;margin:0 0 14px;font-size:9pt;}
  .std .t{font:700 7pt 'Archivo',Arial;letter-spacing:.16em;text-transform:uppercase;color:var(--red);margin-bottom:3px;}
  .std b{color:var(--navy);}
  .prep{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:5px;margin:0 0 22px;}
  .prep .cell{padding:10px 13px;border-right:1px solid var(--line);}
  .prep .cell:last-child{border-right:0;}
  .prep .v{font:700 10pt 'Archivo',Arial;color:var(--navy);margin-top:3px;}
  .prep .s{font-size:7.6pt;color:var(--muted);margin-top:1px;}
  section{margin:0 0 18px;}
  h2{display:flex;align-items:center;gap:10px;font:800 11.5pt 'Archivo',Arial;color:var(--navy);text-transform:uppercase;letter-spacing:.02em;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid var(--line);break-after:avoid;page-break-after:avoid;}
  h2 .n{width:20px;height:20px;border-radius:3px;background:var(--red);color:#fff;font-size:9.5pt;display:inline-flex;align-items:center;justify-content:center;flex:none;}
  .panel{display:grid;background:var(--wash);border:1px solid var(--line);border-radius:4px;margin:0 0 7px;break-inside:avoid;page-break-inside:avoid;}
  .panel.c1{grid-template-columns:1fr;}.panel.c2{grid-template-columns:1fr 1fr;}.panel.c3{grid-template-columns:1fr 1fr 1fr;}
  .panel .cell{padding:9px 13px 10px;border-right:1px solid var(--line);min-width:0;}
  .panel .cell:last-child{border-right:0;}
  .panel .v{font:700 10pt/1.3 'Archivo',Arial;color:var(--navy);margin-top:3px;}
  .panel .v.long{font:500 9.2pt/1.5 'Inter',Arial;color:var(--ink);}
  .keep{break-inside:avoid;page-break-inside:avoid;}
  .panel .v{overflow-wrap:anywhere;}
  .subhead{font:700 7pt 'Archivo',Arial;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin:10px 0 5px;}
  .sign{margin-top:24px;break-inside:avoid;page-break-inside:avoid;}
  .sign .note{font-size:8.4pt;color:var(--muted);}
  .sign .row{display:flex;gap:30px;margin-top:26px;}
  .sign .ln{flex:1;border-top:0.8pt solid #9aa3b2;padding-top:4px;font-size:6.6pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
  ${screen ? `.shdr,.prt{display:none}
  @media screen{html{background:#e7ebf1}body{max-width:8.5in;margin:24px auto 60px;background:#fff;padding:0.75in;box-shadow:0 6px 30px rgba(20,30,60,.15)}.shdr{display:block;font:6.6pt Arial,Helvetica,sans-serif;letter-spacing:.05em;color:#7a8597;border-bottom:0.6pt solid #d4dae4;padding-bottom:5px;margin:-0.35in 0 20px}.shdr b{color:var(--navy)}.prt{display:block;position:fixed;top:14px;right:18px}.prt button{background:var(--navy);color:#fff;border:0;border-radius:6px;padding:9px 16px;font:600 13px Arial,sans-serif;cursor:pointer}}
  @media screen and (max-width:900px){body{margin:0;padding:22px 16px;box-shadow:none}.shdr{margin:0 0 16px}.snap,.prep,.panel.c3,.panel.c2{grid-template-columns:1fr!important}.snap .cell,.prep .cell,.panel .cell{border-right:0;border-bottom:1px solid var(--line)}}
  @media print{.prt,.shdr{display:none!important}}` : ''}
  </style></head><body>
  ${screen ? `<div class="prt">${opts.shareKey ? `<button id="shr" style="background:#fff;color:#0b1636;border:1px solid #c4ccda;margin-right:6px" onclick="(function(b){fetch('/api/ssc/${encodeURIComponent(opts.shareKey)}/share',{method:'POST',credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){ if(!j||!j.ok){ b.textContent='Could not create link'; return; } var done=function(){ b.textContent='Link copied ✓'; setTimeout(function(){ b.textContent='Copy share link'; },2500); }; if(navigator.clipboard){ navigator.clipboard.writeText(j.url).then(done,function(){ prompt('Share link (anyone with it can view):', j.url); }); } else prompt('Share link (anyone with it can view):', j.url); });})(this)" title="A link anyone can open to view and print this SSC — no sign-in">Copy share link</button>` : ''}<button onclick="window.print()">Print / Save PDF</button></div><div class="shdr"><b>RESTAURANT REALTY GROUP</b>&nbsp; /&nbsp; SITE SELECTION CRITERIA &nbsp;·&nbsp; ${esc(String(data.concept || '').toUpperCase())}</div>` : ''}
  <div class="band">
    <div class="lock"><span class="disc">RRG</span><span class="bar"></span><span class="wm">Restaurant<br>Realty<br>Group</span></div>
    <div class="kick">Tenant Representation</div>
    <h1>Site Selection Criteria</h1>
    <div class="who">${concept}</div>
    <div class="accent"></div>
    <div class="bsub">Confidential Tenant-Representation Blueprint${market ? ' &nbsp;·&nbsp; ' + esc(market) : ''}</div>
  </div>
  <p class="lead">This Site Selection Criteria defines what an acceptable site is for <b>${concept}</b>: the strategic, operational, physical, and economic requirements behind every market survey, broker outreach, and tour.</p>
  ${snap.length ? `<div class="snap" style="grid-template-columns:repeat(${snap.length},1fr)">${snap.map(x => `<div class="cell"><div class="k">${esc(x[0])}</div><div class="v">${esc(x[1])}</div></div>`).join('')}</div>` : ''}
  <div class="std"><div class="t">The RRG Standard</div><b>No market search begins without a completed SSC. No exceptions.</b> Searching without one is like building a restaurant or bar without drawings: expensive, slow, and guaranteed to go sideways.</div>
  <div class="prep">
    <div class="cell"><div class="k">Prepared by</div><div class="v">${esc(prepared || 'Restaurant Realty Group')}</div><div class="s">${esc(data.repEmail || 'Restaurant Realty Group, LLC')}</div></div>
    <div class="cell"><div class="k">Operator contact</div><div class="v">${esc(data.contact || '—')}</div><div class="s">${concept}</div></div>
    <div class="cell"><div class="k">Date</div><div class="v">${esc(data.date || '')}</div><div class="s">${data.source === 'client' ? 'Completed by the client' : 'Site Selection Criteria'}</div></div>
  </div>
  ${sections}
  ${secParts.length ? '' : SIGN}</div>
  </body></html>`;
}

module.exports = { buildHtml, headerTemplate, footerTemplate };
