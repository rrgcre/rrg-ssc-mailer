/* Rewrites the browser tab title to the admin-set app name (preserving each page's
   section label after the — ), and renames the AI assistant site-wide to the admin-set
   name (default "Claude"). Loaded on every page. */
/* Enterprise theme layer — applied SYNCHRONOUSLY as an inline <style> in the head so it
   lands before first paint (no flash of the old look). This inline copy is authoritative;
   /public/rrg_theme.css mirrors it for reference — keep the two in sync. */
(function(){ try{ if(document.getElementById('rrg-theme')) return;
  var css='html{--navy:#20334f!important;--navbg:#000E31!important;--primary:#2c5c8f!important;--primary-d:#23496f!important;--red:#b23a2c!important;--accent:#b23a2c!important;--ink:#2b3648!important;--muted:#69748a!important;--soft:#96a1b2!important;--line:#dbe0e9!important;--wash:#f4f6f9!important;--inp:#c4ccda!important;--green:#2f7a55!important;}'
    +'body{background:#e9ebf0!important;}'
    +'.card,.kpi{border-radius:4px!important;box-shadow:none!important;}'
    +'.btn,.rbtn,.mbtn,.newbtn,.savebtn,.linkbtn,.pre,.fbclear,.mbtn.ghost{border-radius:3px!important;}'
    +'input[type=text],input[type=email],input[type=password],input[type=number],input[type=search],input[type=tel],input[type=url],input[type=date],select,textarea{border-radius:3px!important;}'
    +'#rrgnav a.it,#rrgnav .lbl,#rrgnav .ws{border-radius:3px!important;}'
    +'#rrgtop .create,#rrgtop .rrgback,#rrgtop .srch input{border-radius:3px!important;}'
    +'#rrgtop .srch input{background:#f4f6f9!important;}'
    +'#rrgtop .ic{border-radius:4px!important;}'
    +'.rrgcol{border-radius:3px!important;}'
    +'#rrgcfm-bx{border-radius:6px!important;}#rrgcfm-bx button{border-radius:4px!important;}'
    +'#rrgcfm-bx button.ok{background:var(--primary)!important;border-color:var(--primary)!important;}'
    +'#rrgcfm-bx button.ok.danger{background:var(--red)!important;}'
    +'.rrgtoast{border-radius:4px!important;background:#20334f!important;}.rrgtoast.err{background:#7a1f1a!important;}'
    /* Standardized list search box (Companies, Contacts, Documents, Data Rooms, etc.) */
    +'.searchwrap{position:relative!important;display:inline-flex!important;align-items:center!important;}'
    +'.searchic{position:absolute!important;left:12px!important;top:50%!important;transform:translateY(-50%)!important;width:15px!important;height:15px!important;color:#96a1b2!important;pointer-events:none!important;}'
    +'.searchwrap input{padding:8px 30px 8px 34px!important;min-width:280px!important;border:1px solid var(--inp)!important;border-radius:3px!important;font-size:13px!important;background:#fff!important;color:var(--ink)!important;margin:0!important;height:auto!important;}'
    +'.searchwrap input:focus{outline:none!important;border-color:var(--primary)!important;}'
    +'.searchx{position:absolute!important;right:6px!important;top:50%!important;transform:translateY(-50%)!important;border:none!important;background:none!important;color:#9aa3b2!important;cursor:pointer!important;font-size:16px!important;line-height:1!important;padding:0 4px!important;}'
    +'.searchx:hover{color:var(--red)!important;}'+'.delx{display:inline-flex!important;align-items:center;justify-content:center;width:26px!important;height:26px!important;min-width:0!important;padding:0!important;border:none!important;border-radius:0!important;background:transparent url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23aab2c0%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%223%206%205%206%2021%206%22%2F%3E%3Cpath%20d%3D%22M19%206l-1%2014a2%202%200%200%201-2%202H8a2%202%200%200%201-2-2L5%206%22%2F%3E%3Cline%20x1%3D%2210%22%20y1%3D%2211%22%20x2%3D%2210%22%20y2%3D%2217%22%2F%3E%3Cline%20x1%3D%2214%22%20y1%3D%2211%22%20x2%3D%2214%22%20y2%3D%2217%22%2F%3E%3Cpath%20d%3D%22M9%206V4a1%201%200%200%201%201-1h4a1%201%200%200%201%201%201v2%22%2F%3E%3C%2Fsvg%3E") center/16px 16px no-repeat!important;color:transparent!important;font-size:0!important;line-height:0!important;box-shadow:none!important;cursor:pointer;-webkit-appearance:none;}'+'.delx:hover{background:transparent url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23DA2B1F%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%223%206%205%206%2021%206%22%2F%3E%3Cpath%20d%3D%22M19%206l-1%2014a2%202%200%200%201-2%202H8a2%202%200%200%201-2-2L5%206%22%2F%3E%3Cline%20x1%3D%2210%22%20y1%3D%2211%22%20x2%3D%2210%22%20y2%3D%2217%22%2F%3E%3Cline%20x1%3D%2214%22%20y1%3D%2211%22%20x2%3D%2214%22%20y2%3D%2217%22%2F%3E%3Cpath%20d%3D%22M9%206V4a1%201%200%200%201%201-1h4a1%201%200%200%201%201%201v2%22%2F%3E%3C%2Fsvg%3E") center/16px 16px no-repeat!important;border:none!important;}';
  css+='::placeholder{color:#a6adbb!important;opacity:1!important;font-style:italic!important;}::-webkit-input-placeholder{color:#a6adbb!important;font-style:italic!important;}::-moz-placeholder{color:#a6adbb!important;opacity:1!important;font-style:italic!important;}';
  var st=document.createElement('style'); st.id='rrg-theme'; st.setAttribute('data-rrg-theme','1'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);
}catch(e){} })();
/* Pre-apply the shelled layout before first paint so navigating doesn't flash the un-shelled page. */
(function(){ try{
  if(/\/(login|sign)\b/.test(location.pathname)) return;
  if(document.querySelector('meta[name="rrg-noshell"]')) return;
  if((/[?&]embed=1/.test(location.search)||(function(){try{return window.top!==window.self;}catch(e){return true;}})())){ try{ var _e=document.createElement('style'); _e.id='rrg-embed'; _e.textContent='html{background:#fff!important;}body{padding-left:0!important;padding-top:0!important;background:#fff!important;}.top,.band,.rrg-back,.rrgback{display:none!important;}body::before,body::after{display:none!important;}.delx{display:inline-flex!important;align-items:center;justify-content:center;width:26px!important;height:26px!important;min-width:0!important;padding:0!important;border:none!important;border-radius:0!important;background:transparent url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23aab2c0%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%223%206%205%206%2021%206%22%2F%3E%3Cpath%20d%3D%22M19%206l-1%2014a2%202%200%200%201-2%202H8a2%202%200%200%201-2-2L5%206%22%2F%3E%3Cline%20x1%3D%2210%22%20y1%3D%2211%22%20x2%3D%2210%22%20y2%3D%2217%22%2F%3E%3Cline%20x1%3D%2214%22%20y1%3D%2211%22%20x2%3D%2214%22%20y2%3D%2217%22%2F%3E%3Cpath%20d%3D%22M9%206V4a1%201%200%200%201%201-1h4a1%201%200%200%201%201%201v2%22%2F%3E%3C%2Fsvg%3E") center/16px 16px no-repeat!important;color:transparent!important;font-size:0!important;line-height:0!important;box-shadow:none!important;cursor:pointer;-webkit-appearance:none;}.delx:hover{background:transparent url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23DA2B1F%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%223%206%205%206%2021%206%22%2F%3E%3Cpath%20d%3D%22M19%206l-1%2014a2%202%200%200%201-2%202H8a2%202%200%200%201-2-2L5%206%22%2F%3E%3Cline%20x1%3D%2210%22%20y1%3D%2211%22%20x2%3D%2210%22%20y2%3D%2217%22%2F%3E%3Cline%20x1%3D%2214%22%20y1%3D%2211%22%20x2%3D%2214%22%20y2%3D%2217%22%2F%3E%3Cpath%20d%3D%22M9%206V4a1%201%200%200%201%201-1h4a1%201%200%200%201%201%201v2%22%2F%3E%3C%2Fsvg%3E") center/16px 16px no-repeat!important;border:none!important;}::placeholder{color:#a6adbb!important;opacity:1!important;font-style:italic!important;}::-webkit-input-placeholder{color:#a6adbb!important;font-style:italic!important;}::-moz-placeholder{color:#a6adbb!important;opacity:1!important;font-style:italic!important;}'; (document.head||document.documentElement).appendChild(_e);}catch(e){} return; }
  var _c1=false; try{ _c1=localStorage.getItem('rrg_nav_collapsed')==='1'; }catch(e){} var _w1=_c1?60:238;
  var st=document.createElement('style'); st.id='rrg-preshell';
  st.textContent='body{padding-top:56px;}@media(min-width:901px){body{padding-left:'+_w1+'px;}}body .top,body .rrg-back{display:none !important;}';
  (document.head||document.documentElement).appendChild(st);
}catch(e){} })();

(function () {
  function applyName(n) {
    if (!n) return;
    try {
      var re1 = /the RRG analyst/gi, re2 = /the analyst/gi, re3 = /RRG analyst/gi;
      function walk(node) {
        for (var c = node.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) {
            var t = c.nodeValue;
            if (t && t.toLowerCase().indexOf('analyst') > -1) {
              var nt = t.replace(re1, n).replace(re2, n).replace(re3, n);
              if (nt !== t) c.nodeValue = nt;
            }
          } else if (c.nodeType === 1) {
            var tag = c.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || tag === 'CODE' || tag === 'PRE') continue;
            walk(c);
          }
        }
      }
      if (document.body) walk(document.body);
    } catch (e) {}
  }
  function applyOrg(org){ if(!org||!org.name) return; try{
    var legal=org.legalName||org.name, name=org.name;
    function walk(node){ for(var c=node.firstChild;c;c=c.nextSibling){ if(c.nodeType===3){ var t=c.nodeValue; if(t && t.indexOf('Restaurant Realty Group')>-1){ var nt=t.replace(/Restaurant Realty Group,\s*LLC/g, legal).replace(/Restaurant Realty Group/g, name); if(nt!==t) c.nodeValue=nt; } } else if(c.nodeType===1){ var tag=c.tagName; if(tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||tag==='INPUT'||tag==='SELECT'||tag==='CODE'||tag==='PRE') continue; walk(c); } } }
    if(document.body) walk(document.body);
  }catch(e){} }
  function scheduleOrg(org){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ applyOrg(org); }); else applyOrg(org); setTimeout(function(){ applyOrg(org); },1500); }
  function schedule(n) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { applyName(n); });
    else applyName(n);
    setTimeout(function () { applyName(n); }, 1500);
  }
  try {
    var cur = document.title || '';
    var suffix = '';
    var dash = cur.indexOf('—');
    if (dash < 0) dash = cur.indexOf(' - ');
    if (dash >= 0) suffix = cur.slice(dash + 1).replace(/^[\s—-]+/, '').trim();
    else if (cur && !/^rrg\b/i.test(cur)) suffix = cur.trim();
    try { var _cp = JSON.parse(localStorage.getItem('rrg_pal') || 'null'); if (_cp) { var _de = document.documentElement; if (_cp.primary) _de.style.setProperty('--navy', _cp.primary); if (_cp.accent) _de.style.setProperty('--red', _cp.accent); if (_cp.sidebar) _de.style.setProperty('--navbg', _cp.sidebar); if (_cp.positive) _de.style.setProperty('--green', _cp.positive); } } catch (e) {}
    fetch('/api/appname', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var n = (j && j.name) || 'FullServe';
        document.title = suffix ? (n + ' — ' + suffix) : n;
        try { localStorage.setItem('rrg_appname', n); } catch (e) {}
        try { window.__rrgAiConfirm = (j && j.aiConfirm !== false); } catch (e) {}
        try { var de = document.documentElement, pal = (j && j.palette) || {}; if (pal.primary) de.style.setProperty('--navy', pal.primary); if (pal.accent) de.style.setProperty('--red', pal.accent); if (pal.sidebar) de.style.setProperty('--navbg', pal.sidebar); if (pal.positive) de.style.setProperty('--green', pal.positive); localStorage.setItem('rrg_pal', JSON.stringify(pal)); } catch (e) {}
        schedule((j && j.assistant) || 'Claude');
        try { if (j && j.org) { window.__rrgOrg = j.org; window.__rrgBrokerage = j.org.legalName || j.org.name || ''; } } catch (e) {}
        try { if (j && j.org && j.org.name) scheduleOrg(j.org); } catch (e) {}
      })
      .catch(function () {});
  } catch (e) {}
})();

/* Task reminder pop-ups (fire while the app is open in a browser). Email is the reliable backstop. */
(function () {
  if (/\/(login|sign)\b/.test(location.pathname)) return;
  var SEEN = 'rrg_rem_seen';
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch (e) { return []; } }
  function mark(ids) { try { var s = seen(); ids.forEach(function (i) { if (s.indexOf(i) < 0) s.push(i); }); localStorage.setItem(SEEN, JSON.stringify(s.slice(-300))); } catch (e) {} }
  function notify(t) { try { new Notification('Reminder: ' + t.title, { body: (t.due ? ('Due ' + t.due) : '') + (t.linkLabel ? (' · ' + t.linkLabel) : ''), tag: t.id }); } catch (e) {} }
  function poll() {
    if (!(window.Notification && Notification.permission === 'granted')) return;
    fetch('/api/reminders/due', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.ok || !j.reminders) return;
      var s = seen(); var fresh = j.reminders.filter(function (t) { return s.indexOf(t.id) < 0; });
      if (fresh.length) { fresh.forEach(notify); mark(fresh.map(function (t) { return t.id; })); }
    }).catch(function () {});
  }
  function start() { poll(); setInterval(poll, 60000); }
  try {
    if (window.Notification) {
      if (Notification.permission === 'granted') start();
      else if (Notification.permission !== 'denied') { setTimeout(function () { Notification.requestPermission().then(function (p) { if (p === 'granted') start(); }); }, 3000); }
    }
  } catch (e) {}
})();
/* pre-paint shell skeleton: reserve the nav + top-bar space and paint matching
   placeholder strips BEFORE first paint, so moving between pages no longer flashes
   an un-shelled full-width layout that then jumps when the real shell mounts.
   Mirrors rrg_shell.js opt-outs (login pages, <meta name=rrg-noshell>). */
(function(){ try{
  var path=(location.pathname||'').toLowerCase();
  var file=path.split('/').pop()||'index.html';
  if(/\/login/.test(path)||file==='login') return;
  if(document.querySelector('meta[name="rrg-noshell"]')) return;
  if(document.getElementById('rrgshell-preload')) return;
  var _cw=false; try{ _cw=localStorage.getItem('rrg_nav_collapsed')==='1'; }catch(e){} var _W=_cw?60:238;
  var st=document.createElement('style'); st.id='rrgshell-preload';
  st.textContent=''
    +'body{padding-left:'+_W+'px;padding-top:56px;}'
    +'body::before{content:"";position:fixed;top:0;left:0;bottom:0;width:'+_W+'px;background:var(--navbg,#0b1a38);z-index:1;pointer-events:none;}'
    +'body::after{content:"";position:fixed;top:0;left:'+_W+'px;right:0;height:56px;background:#fff;border-bottom:1px solid #e9edf3;z-index:1;pointer-events:none;}'
    +'.top,.rrg-back{display:none !important;}'
    +'body.rrg-shelled::before,body.rrg-shelled::after{display:none !important;}'
    +'#rrgnav-skel{position:fixed;top:0;left:0;bottom:0;width:238px;background:var(--navbg,#0b1a38);z-index:2;overflow:hidden;pointer-events:none;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    +'#rrgnav-skel .nt{display:flex;align-items:center;gap:9px;padding:12px 14px 6px;}'
    +'#rrgnav-skel .ws{display:flex;align-items:center;gap:9px;padding:5px 7px;flex:1;text-decoration:none;}'
    +'#rrgnav-skel .rrgbrand{display:block;width:100%;font-weight:700;font-size:18px;color:#fff;line-height:1.1;}'
    +'#rrgnav-skel .rrgbrandimg{max-width:100%;max-height:48px;object-fit:contain;display:block;}'
    +'#rrgnav-skel .rrgcol{display:none;}'
    +'#rrgnav-skel .scroll{flex:1;overflow:hidden;padding:10px 10px 14px;}'
    +'#rrgnav-skel .grp{margin-top:6px;}'
    +'#rrgnav-skel .lbl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.34);font-weight:700;padding:2px 10px;display:flex;align-items:center;gap:6px;}'
    +'#rrgnav-skel .lbl .gcv{margin-left:auto;font-size:9px;color:rgba(255,255,255,.4);}'
    +'#rrgnav-skel a.it{display:flex;align-items:center;gap:10px;padding:4px 10px;border-radius:7px;color:#c3cce0;text-decoration:none;font-size:13.5px;font-weight:500;}'
    +'#rrgnav-skel .grp.collapsed a.it{display:none;}'
    +'#rrgnav-skel .grp.collapsed .gcv{transform:rotate(-90deg);}'
    +'#rrgnav-skel a.it .i{width:17px;text-align:center;color:rgba(255,255,255,.5);font-size:13.5px;flex:none;}'
    +'#rrgnav-skel .itlbl{white-space:nowrap;}'
    +'#rrgnav-skel a.it.on{background:rgba(255,255,255,.12);color:#fff;font-weight:600;}#rrgnav-skel a.it.on .i{color:#fff;}'
    +'#rrgnav-skel .foot{border-top:1px solid rgba(255,255,255,.09);padding:8px;display:flex;align-items:center;gap:4px;}'
    +'#rrgnav-skel .navbadge{display:none;}'
    +'body.rrg-shelled #rrgnav-skel{display:none !important;}'
    +'@media(max-width:900px){body{padding-left:0;}body::before,#rrgnav-skel{display:none;}body::after{left:0;}}';
  (document.head||document.documentElement).appendChild(st);
  if(!_cw){ try{ var _ch=localStorage.getItem('rrg_nav_html_v1'); if(_ch && !document.getElementById('rrgnav-skel')){ var _sk=document.createElement('div'); _sk.id='rrgnav-skel'; _sk.innerHTML=_ch; (document.body||document.documentElement).appendChild(_sk);
    try{ var _cf=(location.pathname||'').split('/').pop()||'index.html'; var _ls=_sk.querySelectorAll('a.it[href]'); for(var _i=0;_i<_ls.length;_i++){ var _hf=(_ls[_i].getAttribute('href')||'').split('/').pop().split('?')[0].split('#')[0]; if(_hf===_cf){ _ls[_i].className='it on'; break; } } }catch(_e){}
  } }catch(e){} }
}catch(e){} })();
/* load the app shell (persistent nav + top bar) on every page */
(function(){ try{ if(!document.querySelector('script[src="/rrg_shell.js"]')){ var sc=document.createElement('script'); sc.src='/rrg_shell.js'; sc.defer=true; (document.head||document.documentElement).appendChild(sc); } }catch(e){} })(); /* load shell everywhere — it self-guards the nav in embed mode, but still needs to define the shared AI-working box (rrgAiWork) for tool pages opened inside the Settings iframe */
