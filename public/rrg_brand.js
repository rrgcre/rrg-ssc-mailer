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
    fetch('/api/appname', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var n = (j && j.name) || 'FullServe';
        document.title = suffix ? (n + ' — ' + suffix) : n;
        schedule((j && j.assistant) || 'Claude');
      })
      .catch(function () {});
  } catch (e) {}
})();
