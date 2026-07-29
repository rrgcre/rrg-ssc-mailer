/* RRG app shell — persistent Copper-style left nav + top bar, injected on every page.
   Palette-driven (--navbg / --red), admin-aware, hides the old per-page navy headers.
   Opt a page out with <meta name="rrg-noshell">. */
(function () {
  if (window.__rrgShell) return;
  var path = (location.pathname || '').toLowerCase();
  var file = path.split('/').pop() || 'index.html';
  if (/\/login/.test(path) || file === 'login' ) return;
  if (document.querySelector('meta[name="rrg-noshell"]')) return;
  window.__rrgShell = true;
  // Global phone formatting — any phone field, 10 digits -> (xxx) xxx-xxxx
  try { document.addEventListener("input", function(e){ var t=e.target; if(!t||t.tagName!=="INPUT") return; var key=((t.id||"")+" "+(t.name||"")+" "+(t.className||"")).toLowerCase(); if(t.type==="tel" || /phone/.test(key)){ var d=String(t.value||"").replace(/\D/g,"").slice(0,10); var f = d.length<4 ? d : (d.length<7 ? "("+d.slice(0,3)+") "+d.slice(3) : "("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6)); if(f!==t.value){ t.value=f; } } }); } catch(e){}

  var NAV = [
    { color: '#8fa2c4', items: [
      { ic: '✦', label: 'RRG Brief', href: 'rrg_brief.html', ai: true },
      { ic: '◱', label: 'Activity Feed', href: 'rrg_feed.html' },
      { ic: '✔', label: 'My Tasks', href: 'rrg_tasks.html' }
    ] },
    { grp: 'Book of Business', color: '#7ea6d8', items: [
      { ic: '▦', label: 'Companies', href: 'rrg_companies.html' },
      { ic: '◑', label: 'Contacts', href: 'rrg_people.html' },
      { ic: '⚖︎', label: 'Agreements', href: 'rrg_agreements.html' },
      { ic: '◆', label: 'Listings', href: 'rrg_assignments.html' },
    ] },
    { grp: 'Business Sales', color: '#6bbf95', items: [
      { ic: '☎', label: 'Qualification Calls', href: 'rrg_screening_queue.html' },
      { ic: '▤', label: 'Valuations', href: 'rrg_bov_queue.html' },
      { ic: '▧', label: 'Marketing Packs', href: 'rrg_cim_queue.html' },
      { ic: '➤', label: 'Attack Plans', href: 'rrg_attack_queue.html' },
      { ic: '▥', label: 'Data Rooms', href: 'rrg_rooms_queue.html' },
      { ic: '◈', label: 'Deals', href: 'rrg_deals.html' }
    ] },
    { grp: 'Tenant Rep', color: '#dfa937', items: [
      { ic: '◎', label: 'Site Criteria', href: 'ssc_form.html' },
      { ic: '✚', label: 'Site & Concept Fit', href: 'rrg_site_fit.html' },
      { ic: '⊡', label: 'Space Tracker', href: 'rrg_space_tracker.html' },
      { ic: '⊚', label: 'Tour Tracker', href: 'rrg_tour_tracker.html' },
      { ic: '▭', label: 'Lease Abstracts', href: 'rrg_lease_queue.html' },
      { ic: '§', label: 'LOI Builder', href: 'rrg_loi_builder.html' },
      { ic: '⚙', label: 'LOI Settings', href: 'rrg_admin_loi.html', need: 'loi' }
    ] },
    { grp: 'Tools', color: '#a99be0', items: [
      { ic: '⚑', label: 'Feedback', href: 'rrg_feedback.html' },
      { ic: '✉', label: 'Requests', href: 'rrg_tickets.html' },
      { ic: '∑', label: 'Cap Rate', href: 'rrg_cap_rate_calculator.html' },
      { ic: '＄', label: 'Sale Commission', href: 'rrg_commission_calculator.html' },
      { ic: '＄', label: 'Lease Commission', href: 'rrg_lease_commission_calculator.html' }
    ] },
    { grp: 'Admin', admin: true, color: '#dd8a82', items: [
      { ic: '▤', label: 'Admin console', href: 'admin' },
      { ic: '◫', label: 'Departments', href: 'rrg_departments.html' },
      { ic: '☺', label: 'Users', href: 'rrg_roles.html' },
      { ic: '◔', label: 'Roles', href: 'rrg_roles.html' },
      { ic: '⚙', label: 'Settings', href: 'rrg_admin_settings.html' },
      { ic: '⑃', label: 'Pipelines', href: 'rrg_admin_pipelines.html' },
      { ic: '⟳', label: 'Automations', href: 'rrg_admin_automations.html' },
      { ic: '∿', label: 'AI Usage', href: 'rrg_admin_aiusage.html' }
    ] }
  ];

  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function sameFile(href){ var f=(href||'').split('/').pop().toLowerCase(); return f===file || (href==='admin' && (file==='admin'||path==='/admin')); }

  // ---------- styles ----------
  var css = ''
    + ':root{--navbg:var(--navbg,#0b1a38);}'
    + 'body.rrg-shelled{padding-left:238px !important;padding-top:56px !important;}'
    + 'body.rrg-shelled .top,body.rrg-shelled .rrg-back{display:none !important;}'
    + '#rrgnav{position:fixed;top:0;left:0;bottom:0;width:238px;background:var(--navbg,#0b1a38);color:#c7d0e4;display:flex;flex-direction:column;z-index:60;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '#rrgnav .nt{display:flex;align-items:center;gap:9px;padding:12px 14px 6px;}'
    + '#rrgnav .ws{display:flex;align-items:center;gap:9px;cursor:pointer;border-radius:9px;padding:5px 7px;flex:1;text-decoration:none;}'
    + '#rrgnav .ws:hover{background:rgba(255,255,255,.06);}'
    + '#rrgnav .disc{width:30px;height:30px;border-radius:8px;background:var(--red,#DA2B1F);color:#fff;font-family:"Arial Black",Arial;font-weight:900;font-size:12px;display:flex;align-items:center;justify-content:center;letter-spacing:-.04em;}'
    + '#rrgnav .wsn{font-weight:600;font-size:14.5px;color:#fff;}'
    + '#rrgnav .rrgbrand{display:block;width:100%;font-weight:700;font-size:18px;color:#fff;line-height:1.1;}'
    + '#rrgnav .rrgbrandimg{max-width:100%;max-height:48px;object-fit:contain;display:block;}'
    + '#rrgtop .create{display:inline-flex;align-items:center;gap:6px;background:#fff;color:var(--red,#DA2B1F);border:1px solid var(--red,#DA2B1F);border-radius:9px;padding:8px 15px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .12s,color .12s;}'
    + '#rrgtop .create:hover{background:var(--red,#DA2B1F);color:#fff;}'
    + '#rrgtop .create .cplus{font-size:15px;font-weight:800;line-height:1;}'
    + '#rrgnav .scroll{flex:1;overflow-y:auto;padding:10px 10px 14px;}'
    + '#rrgnav .scroll::-webkit-scrollbar{width:7px;}#rrgnav .scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:7px;}'
    + '#rrgnav .grp{margin-top:6px;}'
    + '#rrgnav .lbl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.34);font-weight:700;padding:2px 10px 2px;display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:7px;}'
    + '#rrgnav .lbl:hover{color:rgba(255,255,255,.6);background:rgba(255,255,255,.04);}'
    + '#rrgnav .lbl .gcv{margin-left:auto;font-size:9px;color:rgba(255,255,255,.4);transition:transform .15s;}'
    + '#rrgnav .grp.collapsed .gcv{transform:rotate(-90deg);}'
    + '#rrgnav .grp.collapsed a.it{display:none;}'
    + '#rrgnav a.it{display:flex;align-items:center;gap:10px;padding:4px 10px;border-radius:7px;color:#c3cce0;text-decoration:none;font-size:13.5px;font-weight:500;margin-bottom:0;}'
    + '#rrgnav a.it:hover{background:rgba(255,255,255,.07);color:#fff;}'
    + '#rrgnav a.it.on{background:rgba(255,255,255,.12);color:#fff;font-weight:600;}'
    + '#rrgnav a.it .i{width:17px;text-align:center;color:var(--gc,rgba(255,255,255,.5));font-size:13.5px;flex:none;}'
    + '#rrgnav a.it.on .i{color:#fff;}'
    + '#rrgnav a.it .navbadge{margin-left:auto;background:var(--red,#DA2B1F);color:#fff;font-size:10.5px;font-weight:800;min-width:19px;height:18px;line-height:18px;text-align:center;border-radius:9px;padding:0 5px;box-shadow:0 1px 3px rgba(0,0,0,.25);}'
    + '#rrgnav a.it .aitag{margin-left:5px;font-size:11px;line-height:1;opacity:.85;}'
    + '#rrgnav .foot{border-top:1px solid rgba(255,255,255,.09);padding:8px 10px;}'
    + '#rrgtop{position:fixed;top:0;left:238px;right:0;height:56px;background:#fff;border-bottom:1px solid #e9edf3;display:flex;align-items:center;gap:18px;padding:0 22px;z-index:59;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '#rrgtop .rrgtoplogo{display:flex;align-items:center;height:100%;text-decoration:none;flex:none;margin-right:8px;max-width:224px;overflow:hidden;}'
    + '#rrgtop .rrgtoplogo .rrgbrandimg{max-height:40px;max-width:212px;object-fit:contain;display:block;}'
    + '#rrgtop .rrgtoplogo .rrgbrand{font-weight:800;font-size:18px;color:var(--navy,#000E31);letter-spacing:-.01em;white-space:nowrap;}'
    + '#rrgtop .pt{font-size:16.5px;font-weight:600;color:#1d2739;min-width:90px;}'
    + '#rrgtop .rrgback{display:inline-flex;align-items:center;gap:6px;color:#1d2739;text-decoration:none;font-size:13.5px;font-weight:500;padding:7px 13px;border:1px solid #e9edf3;border-radius:9px;background:#fff;white-space:nowrap;transition:background .12s;}'
    + '#rrgtop .rrgback:hover{background:#f2f4f8;}'
    + '#rrgtop .srch{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46%;max-width:560px;}'
    + '#rrgtop .srch input{width:100%;border:1px solid #e9edf3;background:#f7f9fc;border-radius:10px;padding:9px 12px 9px 36px;font:inherit;font-size:13.5px;color:#1d2739;}'
    + '#rrgtop .srch .si{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#98a1b5;}'
    + '#rrgtop .acts{display:flex;align-items:center;gap:10px;margin-left:auto;}'
    + '#rrgtop .ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#6b7488;cursor:pointer;text-decoration:none;}'
    + '#rrgtop .ic:hover{background:#f2f4f8;color:#1d2739;}'
    + '#rrgtop .uav{width:32px;height:32px;border-radius:50%;background:var(--navbg,#233a68);color:#fff;font-weight:600;font-size:12.5px;display:flex;align-items:center;justify-content:center;}'
    + '@media(max-width:900px){body.rrg-shelled{padding-left:0 !important;}#rrgnav{transform:translateX(-100%);transition:transform .2s;}#rrgnav.open{transform:none;}#rrgtop{left:0;}}';
  var st = document.createElement('style'); st.id='rrgshellcss'; st.textContent=css; document.head.appendChild(st);

  // ---------- nav markup ----------
  var appName = 'RRG';
  var navHtml = '';
  navHtml += '<div class="nt"><a class="ws" href="index.html"><span class="rrgbrand" id="rrgbrand">RRG</span></a></div>';
  navHtml += '<div class="scroll">';
  NAV.forEach(function (g, gi) {
    var _sp = []; if (g.color) _sp.push('--gc:' + g.color); if (g.admin) _sp.push('display:none');
    var cls = (g.admin ? ' data-admingrp="1"' : '') + (_sp.length ? (' style="' + _sp.join(';') + '"') : '');
    navHtml += '<div class="grp"' + cls + '>';
    if (g.grp) navHtml += '<div class="lbl" data-grp="' + esc(g.grp) + '"><span>' + esc(g.grp) + '</span><span class="gcv">\u25be</span></div>';
    g.items.forEach(function (it) {
      var _na = it.need ? (' data-need="' + esc(it.need) + '" style="display:none"') : '';
      var _ai = it.ai ? ' data-ai=""' : '';
      navHtml += '<a class="it' + (sameFile(it.href) ? ' on' : '') + '"' + _na + _ai + ' href="' + esc(it.href) + '"><span class="i"' + (it.color ? (' style="color:' + it.color + '"') : '') + '>' + it.ic + '</span>' + esc(it.label) + '</a>';
    });
    navHtml += '</div>';
  });
  navHtml += '</div>';
  navHtml += '<div class="foot"><a class="it" href="rrg_account.html"><span class="i">◔</span><span id="rrgacct">Account</span></a><a class="it" href="index.html"><span class="i">?</span>Help</a></div>';

  var nav = document.createElement('aside'); nav.id='rrgnav'; nav.innerHTML=navHtml;

  // ---------- top bar ----------
  var activeLabel = '';
  NAV.forEach(function (g) { g.items.forEach(function (it) { if (sameFile(it.href)) activeLabel = it.label; }); });
  if (!activeLabel) { var t = (document.title || '').split('—')[0].split(' - ')[0].trim(); activeLabel = t || 'RRG'; }
  var top = document.createElement('div'); top.id='rrgtop';
  top.innerHTML = ''
    + '<div class="ic" id="rrgburger" style="display:none">≡</div>'
    + '<div class="srch"><span class="si">⌕</span><input placeholder="Search companies, contacts, listings…" id="rrgsearch"></div>'
    + '<div class="acts"><a class="create" href="rrg_companies.html"><span class="cplus">+</span> Create New</a><a class="ic" href="rrg_tickets.html" title="Requests">✉</a><a class="ic" href="rrg_tasks.html" title="My Tasks">✔</a><div class="uav" id="rrguav">·</div></div>';

  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();
  function mount(){
    if (document.getElementById('rrgnav')) return;
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(top, document.body.firstChild);
    document.body.classList.add('rrg-shelled');
    // Contextual back button in the header's left slot — pages opt in with
    // <meta name="rrg-back" content="rrg_companies.html|Companies">.
    try { var _mb=document.querySelector('meta[name="rrg-back"]'); if(_mb){ var _p=String(_mb.getAttribute('content')||'').split('|'); var _href=(_p[0]||'').trim(), _lbl=(_p[1]||'Back').trim(); if(_href){ var _bk=document.createElement('a'); _bk.className='rrgback'; _bk.href=_href; _bk.innerHTML='<span style="font-size:15px;line-height:1">←</span> '+esc(_lbl);
      // If we arrived here from another page inside the app, go back to THAT page
      // (e.g. the company you clicked from) rather than the list. Otherwise use the list.
      _bk.addEventListener('click',function(e){ try{ var rf=(document.referrer||'').split('#')[0], cur=location.href.split('#')[0]; if(rf && rf.indexOf(location.origin)===0 && rf!==cur && window.history.length>1){ e.preventDefault(); window.history.back(); } }catch(_e){} });
      var _lg=top.querySelector('.rrgtoplogo'); if(_lg&&_lg.nextSibling){ top.insertBefore(_bk,_lg.nextSibling); } else { top.insertBefore(_bk, top.firstChild); } } } } catch(e){}
    try { fetch('/api/counts',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){ var od=(j&&j.overdue)||{}; var NOUN={'rrg_tickets.html':'past-due request','rrg_tasks.html':'overdue task'}; Object.keys(od).forEach(function(href){ var c=od[href]||0; if(c<=0) return; var tl=nav.querySelector('a.it[href="'+href+'"]'); if(!tl||tl.querySelector('.navbadge')) return; var noun=NOUN[href]||'item'; tl.title=c+' '+noun+(c===1?'':'s'); var b=document.createElement('span'); b.className='navbadge'; b.textContent=c>99?'99+':String(c); tl.appendChild(b); }); }).catch(function(){}); } catch(e){}
    // mobile burger
    var burger=document.getElementById('rrgburger'); if(window.innerWidth<=900){ burger.style.display='flex'; }
    burger && burger.addEventListener('click', function(){ nav.classList.toggle('open'); });
    // collapsible nav groups (remembered)
    var _coll={}; try{ _coll=JSON.parse(localStorage.getItem('rrg_navcoll')||'{}')||{}; }catch(e){}
    nav.querySelectorAll('.lbl[data-grp]').forEach(function(l){ var g=l.getAttribute('data-grp'); if(_coll[g]){ var grp=l.closest('.grp'); if(grp) grp.classList.add('collapsed'); } l.addEventListener('click',function(){ var grp=l.closest('.grp'); if(!grp) return; var on=grp.classList.toggle('collapsed'); try{ var c=JSON.parse(localStorage.getItem('rrg_navcoll')||'{}')||{}; if(on) c[g]=1; else delete c[g]; localStorage.setItem('rrg_navcoll',JSON.stringify(c)); }catch(e){} }); });
    // search → companies search (simple v1)
    var si=document.getElementById('rrgsearch');
    si && si.addEventListener('input', function(){ if(typeof window.rrgLiveSearch==='function') window.rrgLiveSearch(si.value); });
    si && si.addEventListener('keydown', function(e){ if(e.key==='Enter'){ var q=si.value.trim(); if(typeof window.rrgLiveSearch==='function'){ window.rrgLiveSearch(q); return; } location.href='rrg_companies.html'+(q?('?q='+encodeURIComponent(q)):''); } });
    // hydrate app name, role, user
    try {
      fetch('/api/appname',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
        var brand=document.getElementById('rrgbrand'); if(brand){ if(j&&j.logoUrl){ brand.innerHTML='<img src="'+j.logoUrl+'" alt="" class="rrgbrandimg">'; } else if(j&&j.name){ brand.textContent=j.name; } }
      }).catch(function(){});
      fetch('/api/session',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(s){
        try{ window.__rrgSession=s; window.__rrgAssistant=(s&&s.assistant)||'the assistant'; document.dispatchEvent(new CustomEvent('rrg:session',{detail:s})); }catch(e){}
        if(s&&(s.role==='admin'||s.role==='creator')){ var g=nav.querySelector('[data-admingrp]'); if(g) g.style.display=''; }
        if(s&&s.canManageLoi){ nav.querySelectorAll('a.it[data-need="loi"]').forEach(function(el){ el.style.display=''; }); }
        if(s&&!s.canUseAi){ var aist=document.createElement('style'); aist.textContent='[data-ai]{display:none !important;}'; document.head.appendChild(aist); }
        var nm=(s&&(s.name||s.username))||''; var uav=document.getElementById('rrguav'); if(uav&&nm){ var parts=nm.trim().split(/\s+/); uav.textContent=((parts[0]||'')[0]||'')+((parts[1]||'')[0]||'')||nm[0].toUpperCase(); }
        var ac=document.getElementById('rrgacct'); if(ac&&nm) ac.textContent=nm.split(/\s+/)[0];
      }).catch(function(){});
    } catch(e){}
  }
})();

/* ---- Shared AI UX: one canonical working box (rrgAiWork) + pre-flight confirm (rrgAiConfirm) ---- */
(function(){
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function assistant(){ return window.__rrgAssistant||'AI'; }
  function injectCss(){ if(document.getElementById('rrgaiwork-css')) return; var st=document.createElement('style'); st.id='rrgaiwork-css';
    st.textContent='.rrgaiwork{position:fixed;inset:0;background:rgba(10,10,30,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;}'
    +'.rrgaiwork[hidden]{display:none!important;}'
    +'.rrgaiwbox{background:#fff;border-radius:18px;padding:32px 34px 26px;max-width:460px;width:100%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.42);position:relative;overflow:hidden;}'
    +'.rrgaiwbox:before{content:"";position:absolute;top:-45%;left:-45%;width:190%;height:190%;background:conic-gradient(from 0deg,#5b46b8,#8b5cf6,#ec4899,#f59e0b,#22c55e,#3b82f6,#5b46b8);opacity:.13;animation:rrgaispin 7s linear infinite;}'
    +'@keyframes rrgaispin{to{transform:rotate(360deg);}}'
    +'.rrgaiworb{width:64px;height:64px;border-radius:50%;margin:0 auto 16px;background:conic-gradient(from 0deg,#5b46b8,#8b5cf6,#ec4899,#f59e0b,#22c55e,#3b82f6,#5b46b8);animation:rrgaispin 1.6s linear infinite;position:relative;z-index:1;}'
    +'.rrgaiworb:after{content:"\\2728";position:absolute;inset:7px;display:flex;align-items:center;justify-content:center;font-size:23px;background:#fff;border-radius:50%;}'
    +'.rrgaiwtitle{font-weight:800;color:#0b1a38;font-size:16px;position:relative;z-index:1;}'
    +'.rrgaiwmsg{color:#5a6478;font-size:13px;margin-top:7px;line-height:1.5;min-height:18px;position:relative;z-index:1;}'
    +'.rrgaiwtimer{font-variant-numeric:tabular-nums;font-weight:800;font-size:22px;color:#5b46b8;margin-top:12px;position:relative;z-index:1;}'
    +'.rrgaiwcancel{margin-top:18px;background:#fff;border:1px solid #d5dbe6;border-radius:9px;padding:8px 18px;font:inherit;font-size:13px;font-weight:600;color:#5a6478;cursor:pointer;position:relative;z-index:1;}'
    +'.rrgaicfhd{font-weight:800;color:#0b1a38;font-size:17px;position:relative;z-index:1;}'
    +'.rrgaicfbody{color:#5a6478;font-size:13.5px;margin-top:8px;line-height:1.55;position:relative;z-index:1;}'
    +'.rrgaicfask{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#5a6478;margin-top:14px;position:relative;z-index:1;cursor:pointer;}'
    +'.rrgaicfbtns{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;position:relative;z-index:1;}'
    +'.rrgaicfcancel{background:#fff;border:1px solid #d5dbe6;border-radius:9px;padding:9px 16px;font:inherit;font-size:13px;font-weight:700;color:#5a6478;cursor:pointer;}'
    +'.rrgaicfgo{background:#5b46b8;border:1px solid #5b46b8;border-radius:9px;padding:9px 18px;font:inherit;font-size:13px;font-weight:700;color:#fff;cursor:pointer;}';
    document.head.appendChild(st); }
  var AIW={onCancel:null,t0:0,timer:null};
  function fmt(ms){ var s=Math.max(0,Math.floor(ms/1000)); var m=Math.floor(s/60); s=s%60; return m+':'+(s<10?'0':'')+s; }
  function ensure(){ var o=document.getElementById('rrgaiwork'); if(o) return o; injectCss(); o=document.createElement('div'); o.className='rrgaiwork'; o.id='rrgaiwork'; o.hidden=true; o.innerHTML='<div class="rrgaiwbox"><div class="rrgaiworb"></div><div class="rrgaiwtitle" id="rrgaiwtitle">Working…</div><div class="rrgaiwmsg" id="rrgaiwmsg"></div><div class="rrgaiwtimer" id="rrgaiwtimer">0:00</div><button type="button" class="rrgaiwcancel" id="rrgaiwcancel">Cancel</button></div>'; document.body.appendChild(o); o.querySelector('#rrgaiwcancel').addEventListener('click',function(){ var f=AIW.onCancel; hide(); if(typeof f==="function"){try{f();}catch(e){}} }); return o; }
  function show(msg,onCancel){ ensure(); document.getElementById('rrgaiwtitle').textContent='✨ '+assistant()+' is working…'; document.getElementById('rrgaiwmsg').textContent=msg||''; AIW.onCancel=onCancel||null; var cb=document.getElementById('rrgaiwcancel'); if(cb) cb.style.display=onCancel?'':'none'; AIW.t0=Date.now(); if(AIW.timer) clearInterval(AIW.timer); AIW.timer=setInterval(function(){ var t=document.getElementById('rrgaiwtimer'); if(t) t.textContent=fmt(Date.now()-AIW.t0); },1000); document.getElementById('rrgaiwtimer').textContent='0:00'; document.getElementById('rrgaiwork').hidden=false; }
  function setMsg(msg){ var m=document.getElementById('rrgaiwmsg'); if(m) m.textContent=msg||''; }
  function hide(){ var o=document.getElementById('rrgaiwork'); if(o) o.hidden=true; AIW.onCancel=null; if(AIW.timer){ clearInterval(AIW.timer); AIW.timer=null; } }
  window.rrgAiWork={show:show,setMsg:setMsg,hide:hide};
  window.rrgAiConfirm=function(opts){ opts=opts||{}; if(window.__rrgAiConfirm===false){ if(opts.onProceed) opts.onProceed(); return; } var key='rrgai_skip_'+(opts.actionKey||'ai'); try{ if(localStorage.getItem(key)==='1'){ if(opts.onProceed) opts.onProceed(); return; } }catch(e){}
    injectCss(); var ov=document.createElement('div'); ov.className='rrgaiwork'; ov.style.zIndex='1001';
    ov.innerHTML='<div class="rrgaiwbox" style="text-align:left"><div class="rrgaicfhd">✨ '+esc(opts.title||('Run '+assistant()))+'</div><div class="rrgaicfbody">'+esc(opts.body||'This uses AI.')+'</div><label class="rrgaicfask"><input type="checkbox" id="rrgaidontask"> Don’t ask again for this</label><div class="rrgaicfbtns"><button type="button" class="rrgaicfcancel" id="rrgaicfcancel">Cancel</button><button type="button" class="rrgaicfgo" id="rrgaicfgo">Continue</button></div></div>';
    document.body.appendChild(ov); function close(){ ov.remove(); } ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    ov.querySelector('#rrgaicfcancel').addEventListener('click',close);
    ov.querySelector('#rrgaicfgo').addEventListener('click',function(){ if(document.getElementById('rrgaidontask').checked){ try{localStorage.setItem(key,'1');}catch(e){} } close(); if(opts.onProceed) opts.onProceed(); }); };
})();
