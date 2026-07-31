/* RRG — lightweight PDF field placer for the Sign & Return flow.
   Renders the uploaded PDF (pdf.js) and lets the rep click to drop a
   Signature / Name / Title / Date marker exactly on the agreement's
   signature block. Returns fractional coords {page,x,y,w,h} (y from top)
   — the same model the template field designer and server burner use. */
(function () {
  if (window.rrgPlaceFields) return;
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  function ensurePdfjs(cb) {
    if (window.pdfjsLib) { try { pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; } catch (e) {} return cb(); }
    var sc = document.createElement('script'); sc.src = PDFJS;
    sc.onload = function () { try { pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; } catch (e) {} cb(); };
    sc.onerror = function () { cb('Could not load the PDF renderer.'); };
    document.head.appendChild(sc);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // opts: { file:File, fields:[{key,label,defW,defH}], existing:{key:{page,x,y,w,h}}, onDone(placements), onCancel }
  window.rrgPlaceFields = function (opts) {
    opts = opts || {}; var fields = opts.fields || []; var placements = {};
    try { placements = JSON.parse(JSON.stringify(opts.existing || {})); } catch (e) { placements = {}; }
    var TOOL = null, PAGES = [];

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(6,16,41,.75);z-index:600;display:flex;flex-direction:column';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:11px 16px;background:#0b1a38;color:#fff;flex:none';
    var title = document.createElement('div');
    title.textContent = 'Pick a field, then click on the page where it goes'; title.style.cssText = 'font-weight:700;font-size:14px;margin-right:8px';
    bar.appendChild(title);
    function toolCss(on, placed) { return 'background:' + (on ? '#DA2B1F' : 'rgba(255,255,255,.12)') + ';color:#fff;border:1px solid ' + (on ? '#DA2B1F' : 'rgba(255,255,255,.28)') + ';border-radius:8px;padding:7px 13px;font-weight:600;font-size:13px;cursor:pointer' + (placed ? ';box-shadow:0 0 0 2px #7bd88f' : ''); }
    var btns = {};
    fields.forEach(function (fl) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = fl.label;
      b.onclick = function () { TOOL = (TOOL === fl.key) ? null : fl.key; refreshBtns(); };
      bar.appendChild(b); btns[fl.key] = b;
    });
    function refreshBtns() { fields.forEach(function (fl) { btns[fl.key].style.cssText = toolCss(TOOL === fl.key, !!placements[fl.key]); }); }
    var sp = document.createElement('div'); sp.style.flex = '1'; bar.appendChild(sp);
    var doneB = document.createElement('button'); doneB.type = 'button'; doneB.textContent = 'Done';
    doneB.style.cssText = 'background:#DA2B1F;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-weight:700;cursor:pointer';
    var cancelB = document.createElement('button'); cancelB.type = 'button'; cancelB.textContent = 'Cancel';
    cancelB.style.cssText = 'background:none;color:#c7d0e4;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:8px 14px;cursor:pointer;margin-left:8px';
    bar.appendChild(doneB); bar.appendChild(cancelB);
    ov.appendChild(bar);
    var stage = document.createElement('div');
    stage.style.cssText = 'flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;align-items:center;gap:14px';
    ov.appendChild(stage);
    document.body.appendChild(ov);

    function fieldDef(k) { for (var i = 0; i < fields.length; i++) if (fields[i].key === k) return fields[i]; return {}; }
    function drawMarkers() {
      PAGES.forEach(function (pg) { if (pg) Array.prototype.forEach.call(pg.ovEl.querySelectorAll('.rspf'), function (n) { n.remove(); }); });
      fields.forEach(function (fl) {
        var p = placements[fl.key]; if (!p) return; var pg = PAGES[p.page]; if (!pg) return;
        var W = pg.ovEl.clientWidth, H = pg.ovEl.clientHeight;
        var el = document.createElement('div'); el.className = 'rspf';
        el.style.cssText = 'position:absolute;left:' + (p.x * W) + 'px;top:' + (p.y * H) + 'px;width:' + (p.w * W) + 'px;height:' + (p.h * H) + 'px;background:rgba(218,43,31,.12);border:1.5px solid #DA2B1F;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#DA2B1F;cursor:move;overflow:hidden;user-select:none';
        el.textContent = fl.label;
        var x = document.createElement('div'); x.textContent = '×';
        x.style.cssText = 'position:absolute;top:-9px;right:-9px;width:18px;height:18px;border-radius:50%;background:#DA2B1F;color:#fff;font-size:12px;line-height:18px;text-align:center;cursor:pointer';
        x.onclick = function (e) { e.stopPropagation(); delete placements[fl.key]; drawMarkers(); refreshBtns(); };
        el.appendChild(x);
        el.addEventListener('mousedown', function (e) {
          if (e.target === x) return; e.preventDefault(); e.stopPropagation();
          var sx = e.clientX, sy = e.clientY, ox = p.x, oy = p.y;
          function mv(ev) { var dx = (ev.clientX - sx) / W, dy = (ev.clientY - sy) / H; p.x = Math.max(0, Math.min(1 - p.w, ox + dx)); p.y = Math.max(0, Math.min(1 - p.h, oy + dy)); el.style.left = (p.x * W) + 'px'; el.style.top = (p.y * H) + 'px'; }
          function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
          document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
        });
        pg.ovEl.appendChild(el);
      });
    }
    function placeAt(pageIdx, xf, yf) {
      if (!TOOL) return; var fd = fieldDef(TOOL); var pg = PAGES[pageIdx]; if (!pg) return;
      var w = (fd.defW || 160) / pg.pw, h = (fd.defH || 18) / pg.ph;
      var x = Math.max(0, Math.min(1 - w, xf - w / 2)), y = Math.max(0, Math.min(1 - h, yf - h / 2));
      placements[TOOL] = { page: pageIdx, x: x, y: y, w: w, h: h }; TOOL = null; refreshBtns(); drawMarkers();
    }
    function render(buf) {
      pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
        var n = pdf.numPages, chain = Promise.resolve();
        for (var i = 1; i <= n; i++) (function (pn) {
          chain = chain.then(function () {
            return pdf.getPage(pn).then(function (page) {
              var vp1 = page.getViewport({ scale: 1 });
              var targetW = Math.min(820, stage.clientWidth - 40); var scale = targetW / vp1.width;
              var vp = page.getViewport({ scale: scale });
              var wrap = document.createElement('div'); wrap.style.cssText = 'position:relative;box-shadow:0 6px 24px rgba(0,0,0,.4);background:#fff';
              var cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; cv.style.cssText = 'display:block;max-width:100%'; wrap.appendChild(cv);
              var ovEl = document.createElement('div'); ovEl.style.cssText = 'position:absolute;inset:0;cursor:crosshair'; wrap.appendChild(ovEl);
              ovEl.addEventListener('click', function (e) { if (e.target !== ovEl) return; var r = ovEl.getBoundingClientRect(); placeAt(pn - 1, (e.clientX - r.left) / ovEl.clientWidth, (e.clientY - r.top) / ovEl.clientHeight); });
              stage.appendChild(wrap);
              PAGES[pn - 1] = { ovEl: ovEl, pw: vp1.width, ph: vp1.height };
              return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
            });
          });
        })(i);
        chain.then(function () { drawMarkers(); refreshBtns(); }).catch(function () { title.textContent = 'Could not render the PDF.'; });
      }).catch(function () { title.textContent = 'Could not open the PDF.'; });
    }

    doneB.onclick = function () { ov.remove(); if (opts.onDone) opts.onDone(placements); };
    cancelB.onclick = function () { ov.remove(); if (opts.onCancel) opts.onCancel(); };
    refreshBtns();
    ensurePdfjs(function (err) {
      if (err) { title.textContent = err; return; }
      var rd = new FileReader();
      rd.onload = function () { render(rd.result); };
      rd.onerror = function () { title.textContent = 'Could not read the file.'; };
      rd.readAsArrayBuffer(opts.file);
    });
  };
})();
