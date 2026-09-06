/* rrg_recordnav.js — Prev / Next record navigation for detail pages.
 *
 * The list component (rrg_list.js) already persists the FULL filtered + sorted id
 * order for each list to sessionStorage under 'rrgorder_<key>' on every render.
 * A detail page calls RRGRecordNav.mount({...}) to render ← Prev · N of M · Next →
 * that walks that exact order — so paging follows whatever sort/filter the user was
 * looking at. If the current record isn't in the saved list (arrived via a direct
 * link, search, or another page), nothing renders. Left/Right arrow keys also move,
 * except while typing in a field.
 */
(function () {
  if (window.RRGRecordNav) return;
  function injectCss() {
    if (document.getElementById('rrgnav-css')) return;
    var s = document.createElement('style'); s.id = 'rrgnav-css';
    s.textContent =
      '.rrgnav{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;}' +
      '.rrgnav-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border:1px solid #d6dbe6;border-radius:8px;background:#fff;color:#23496f;text-decoration:none;cursor:pointer;white-space:nowrap;line-height:1;}' +
      '.rrgnav-btn:hover{border-color:#23496f;background:#eef2f7;}' +
      '.rrgnav-btn.dis{color:#b7becb;border-color:#e6e9f0;background:#f7f8fb;cursor:default;pointer-events:none;}' +
      '.rrgnav-pos{color:#8a93a3;font-weight:700;font-size:11.5px;padding:0 3px;white-space:nowrap;}';
    document.head.appendChild(s);
  }
  function readOrder(key) {
    var raw = null; try { raw = sessionStorage.getItem('rrgorder_' + key); } catch (e) {}
    if (!raw) return null;
    try { var a = JSON.parse(raw); return Array.isArray(a) ? a.map(String) : null; } catch (e) { return null; }
  }
  var RRGRecordNav = {
    // opts: { key, currentId, urlFor(id)->href, into: selector|element }
    mount: function (opts) {
      if (!opts || !opts.key || !opts.currentId || typeof opts.urlFor !== 'function') return false;
      var ids = readOrder(opts.key); if (!ids || !ids.length) return false;
      var cur = String(opts.currentId); var idx = ids.indexOf(cur);
      if (idx < 0) return false;   // this record isn't part of the list they came from — no nav
      var prev = idx > 0 ? ids[idx - 1] : null;
      var next = idx < ids.length - 1 ? ids[idx + 1] : null;
      var host = (typeof opts.into === 'string') ? document.querySelector(opts.into) : opts.into;
      if (!host) return false;
      injectCss();
      function esc(u) { return String(u == null ? '' : u).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function btn(label, id) { return id ? ('<a class="rrgnav-btn" href="' + esc(opts.urlFor(id)) + '">' + label + '</a>') : ('<span class="rrgnav-btn dis">' + label + '</span>'); }
      var wrap = document.createElement('span');
      wrap.className = 'rrgnav';
      wrap.title = 'Move through the list you came from (or use ← / → arrow keys)';
      wrap.innerHTML = btn('← Prev', prev) + '<span class="rrgnav-pos">' + (idx + 1) + ' of ' + ids.length + '</span>' + btn('Next →', next);
      host.appendChild(wrap);
      document.addEventListener('keydown', function (e) {
        var t = e.target;
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); location.href = opts.urlFor(prev); }
        else if (e.key === 'ArrowRight' && next) { e.preventDefault(); location.href = opts.urlFor(next); }
      });
      return true;
    }
  };
  window.RRGRecordNav = RRGRecordNav;
})();
