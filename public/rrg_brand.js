/* Rewrites the browser tab title to the admin-set app name, preserving each page's
   section label (the part after the — in the original <title>). Loaded on every page. */
(function () {
  try {
    var cur = document.title || '';
    var suffix = '';
    var dash = cur.indexOf('—'); // em dash
    if (dash < 0) dash = cur.indexOf(' - ');
    if (dash >= 0) suffix = cur.slice(dash + 1).replace(/^[\s—-]+/, '').trim();
    else if (cur && !/^rrg\b/i.test(cur)) suffix = cur.trim();
    fetch('/api/appname', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var n = (j && j.name) || 'FullServe';
        document.title = suffix ? (n + ' — ' + suffix) : n;
      })
      .catch(function () {});
  } catch (e) {}
})();
