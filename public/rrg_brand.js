/* Rewrites the browser tab title to the admin-set app name (preserving each page's
   section label after the — ), and renames the AI assistant site-wide to the admin-set
   name (default "Claude"). Loaded on every page. */
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
    try { var _cp = JSON.parse(localStorage.getItem('rrg_pal') || 'null'); if (_cp) { var _de = document.documentElement; if (_cp.primary) _de.style.setProperty('--navy', _cp.primary); if (_cp.accent) _de.style.setProperty('--red', _cp.accent); } } catch (e) {}
    fetch('/api/appname', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var n = (j && j.name) || 'FullServe';
        document.title = suffix ? (n + ' — ' + suffix) : n;
        try { var de = document.documentElement, pal = (j && j.palette) || {}; if (pal.primary) de.style.setProperty('--navy', pal.primary); if (pal.accent) de.style.setProperty('--red', pal.accent); localStorage.setItem('rrg_pal', JSON.stringify(pal)); } catch (e) {}
        schedule((j && j.assistant) || 'Claude');
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
