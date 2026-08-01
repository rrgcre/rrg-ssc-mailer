/* Rewrites the browser tab title to the admin-set app name (preserving each page's
   section label after the — ), and renames the AI assistant site-wide to the admin-set
   name (default "Claude"). Loaded on every page. */
/* Pre-apply the shelled layout before first paint so navigating doesn't flash the un-shelled page. */
(function(){ try{
  if(/\/(login|sign)\b/.test(location.pathname)) return;
  if(document.querySelector('meta[name="rrg-noshell"]')) return;
  if((/[?&]embed=1/.test(location.search)||(function(){try{return window.top!==window.self;}catch(e){return true;}})())){ try{ var _e=document.createElement('style'); _e.id='rrg-embed'; _e.textContent='body{padding-left:0!important;padding-top:0!important;background:#fff!important;}.top,.band,.rrg-back,.rrgback{display:none!important;}body::before,body::after{display:none!important;}'; (document.head||document.documentElement).appendChild(_e);}catch(e){} return; }
  var st=document.createElement('style'); st.id='rrg-preshell';
  st.textContent='body{padding-top:56px;}@media(min-width:901px){body{padding-left:238px;}}body .top,body .rrg-back{display:none !important;}';
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
  var st=document.createElement('style'); st.id='rrgshell-preload';
  st.textContent=''
    +'body{padding-left:238px;padding-top:56px;}'
    +'body::before{content:"";position:fixed;top:0;left:0;bottom:0;width:238px;background:var(--navbg,#0b1a38);z-index:1;pointer-events:none;}'
    +'body::after{content:"";position:fixed;top:0;left:238px;right:0;height:56px;background:#fff;border-bottom:1px solid #e9edf3;z-index:1;pointer-events:none;}'
    +'.top,.rrg-back{display:none !important;}'
    +'body.rrg-shelled::before,body.rrg-shelled::after{display:none !important;}'
    +'@media(max-width:900px){body{padding-left:0;}body::before{display:none;}body::after{left:0;}}';
  (document.head||document.documentElement).appendChild(st);
}catch(e){} })();
/* load the app shell (persistent nav + top bar) on every page */
(function(){ try{ if(!document.querySelector('script[src="/rrg_shell.js"]')){ if((/[?&]embed=1/.test(location.search)||(function(){try{return window.top!==window.self;}catch(e){return true;}})())) return; var sc=document.createElement('script'); sc.src='/rrg_shell.js'; sc.defer=true; (document.head||document.documentElement).appendChild(sc); } }catch(e){} })();
