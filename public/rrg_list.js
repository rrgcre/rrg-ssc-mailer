/* RRG shared list controller — pagination, per-column sort, select, resize,
   choose/reorder columns, CSV export, print. Filtering stays the page's job. */
(function(){
  function $(sel, root){ return (root||document).querySelector(sel); }
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function cmpVal(a,b){ if(a==null&&b==null)return 0; if(a==null)return -1; if(b==null)return 1;
    if(typeof a==='number'&&typeof b==='number') return a-b;
    return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'}); }
  function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  // Shared fuzzy matcher: each whitespace-separated term must appear in the haystack
  // either as a substring OR as an in-order subsequence (so "brq" matches "Barrio Cantina").
  function rrgFuzzy(hay,q){ hay=String(hay==null?'':hay).toLowerCase(); q=String(q==null?'':q).toLowerCase().trim(); if(!q) return true; return q.split(/\s+/).every(function(t){ if(!t) return true; if(hay.indexOf(t)>=0) return true; var i=0; for(var j=0;j<hay.length&&i<t.length;j++){ if(hay.charAt(j)===t.charAt(i)) i++; } return i===t.length; }); }
  try{ if(typeof window!=='undefined') window.rrgFuzzy=rrgFuzzy; }catch(e){}

  var STYLE_ID='rrglist-style';
  function injectStyle(){ if(document.getElementById(STYLE_ID)) return;
    var css=''
      +'.rl-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin:2px 0 9px;font:inherit}'
      +'.rl-bar .rl-count{font-size:12.5px;color:#5b6472;font-weight:600}'
      +'.rl-bar .rl-per{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#5b6472}'
      +'.rl-bar .rl-per select{font:inherit;font-size:12.5px;padding:5px 9px;border:1px solid #dbe1ea;border-radius:3px;background:#fff;cursor:pointer}'
      +'.rl-bar .rl-sp{flex:1}'
      +'.rl-btn{font:inherit;font-size:12.5px;font-weight:600;color:#26324a;background:#fff;border:1px solid #dbe1ea;border-radius:3px;padding:6px 11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .12s,border-color .12s}'
      +'.rl-btn:hover{background:#f4f7fb;border-color:#c7d0de}'
      +'.rl-btn .rlic{font-size:13px;line-height:1;color:#7a8699}'
      +'.rl-pager{display:inline-flex;align-items:center;gap:4px}'
      +'.rl-pager button{font:inherit;font-size:12.5px;font-weight:700;min-width:30px;padding:6px 9px;border:1px solid #dbe1ea;border-radius:3px;background:#fff;color:#26324a;cursor:pointer}'
      +'.rl-pager button.on{background:var(--navy,#000E31);color:#fff;border-color:var(--navy,#000E31)}'
      +'.rl-pager button:disabled{opacity:.4;cursor:default}'
      +'.rl-colwrap{position:relative;display:inline-block}'
      +'.rl-colmenu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;background:#fff;border:1px solid #e3e8f0;border-radius:6px;box-shadow:0 14px 40px rgba(12,22,54,.18);padding:7px;min-width:210px;max-height:340px;overflow:auto}'
      +'.rl-colmenu .rl-colhd{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#98a1b5;padding:6px 9px 4px}'
      +'.rl-colopt{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:3px;font-size:13px;color:#26324a;cursor:pointer}'
      +'.rl-colopt:hover{background:#f4f7fb}'
      +'.rl-colopt input{width:15px;height:15px;cursor:pointer;accent-color:var(--primary,#2c5c8f)}'
      +'.rl-colhint{font-size:11px;color:#98a1b5;padding:7px 9px 3px;border-top:1px solid #eef1f6;margin-top:5px}'
      +'.rl-bulk{display:flex;align-items:center;gap:10px;background:#fff5f4;border:1px solid #f0cfca;border-radius:4px;padding:7px 12px;margin:0 0 12px;font-size:12.5px}'
      +'.rl-bulk b{color:var(--navy,#000E31)}'
      +'.rl-bulk button{font:inherit;font-size:12px;font-weight:800;padding:6px 12px;border-radius:3px;border:1px solid #cfd6e2;background:#fff;color:#0b1a3a;cursor:pointer}'
      +'.rl-bulk button.danger{background:var(--red,#DA2B1F);border-color:var(--red,#DA2B1F);color:#fff}'
      +'.rl-bulk a{color:#5b6472;cursor:pointer;text-decoration:underline;font-weight:600}'
      +'.rl-selallwrap{display:inline-flex;align-items:center;gap:7px;margin-left:2px}'
      +'.rl-selallnote{color:#5b6472;font-weight:600}'
      +'.rl-bulk a.rl-selall{color:var(--primary,#2c5c8f);font-weight:800;text-decoration:underline}'
      +'.rl-morewrap{position:relative;display:inline-block}'
      +'.rl-moremenu{position:absolute;top:calc(100% + 6px);left:0;z-index:60;background:#fff;border:1px solid #e3e8f0;border-radius:6px;box-shadow:0 14px 40px rgba(12,22,54,.18);padding:6px;min-width:186px}'
      +'.rl-moremenu .rl-bulkitem{display:block;width:100%;text-align:left;font:inherit;font-size:13px;font-weight:600;color:#26324a;background:#fff;border:none;border-radius:3px;padding:8px 10px;cursor:pointer}'
      +'.rl-moremenu .rl-bulkitem:hover{background:#f4f7fb}'
      +'.rl-moremenu .rl-bulkitem.danger{color:var(--red,#DA2B1F);background:#fff}'
      +'.rl-moremenu .rl-bulkitem.danger:hover{background:#fff5f4}'
      +'.rl-moremenu .rl-bulkitem[disabled]{color:#b3bccb;cursor:not-allowed}'
      +'.rl-moremenu .rl-bulkitem .rl-need{color:#aab2c0;font-weight:600;font-size:11px}'
      +'.rl-wrap{overflow-x:auto}'
      +'.rl-wrap table{width:100%;table-layout:auto;border-collapse:collapse}'
      +'th.rl-th{position:relative;cursor:pointer;user-select:none;white-space:nowrap;font-size:10.5px;letter-spacing:.02em;text-transform:uppercase;color:#8a94a6;font-weight:700;text-align:left;padding:7px 11px;border-bottom:1px solid #e9edf3;background:#fbfcfe}'
      +'th.rl-th.rl-noselect{cursor:default}'
      +'th.rl-th .rl-arrow{color:#c2c9d6;font-size:10px;margin-left:5px}'
      +'th.rl-th.rl-asc .rl-arrow,th.rl-th.rl-desc .rl-arrow{color:var(--primary,#2c5c8f)}'
      +'th.rl-th.rl-over{box-shadow:inset 3px 0 0 var(--red,#DA2B1F)}'
      +'th.rl-th.rl-drag{opacity:.45}'
      +'td.rl-ck,th.rl-ck{width:38px;text-align:center;padding-left:8px;padding-right:8px}'
      +'.rl-ck input{width:16px;height:16px;cursor:pointer;vertical-align:middle;accent-color:var(--primary,#2c5c8f)}'
      +'.rl-wrap tbody td{padding:7px 11px;border-bottom:1px solid #eef1f6;font-size:13px;color:#1f2a3d;vertical-align:middle}'
      +'.rl-wrap tbody td span,.rl-wrap tbody td a,.rl-wrap tbody td div,.rl-wrap tbody td b,.rl-wrap tbody td small,.rl-wrap tbody td label{font-size:inherit !important}'
      +'.rl-wrap tbody td,.rl-wrap tbody td span,.rl-wrap tbody td a,.rl-wrap tbody td div,.rl-wrap tbody td b,.rl-wrap tbody td strong,.rl-wrap tbody td label{font-weight:400 !important}'
      +'.rl-bar .rl-dens{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#5b6472;cursor:pointer;font-weight:600}'
      +'.rl-bar .rl-dens input{width:15px;height:15px;cursor:pointer;accent-color:var(--primary,#2c5c8f)}'
      +'.rl-compact .rl-wrap td{padding-top:4px !important;padding-bottom:4px !important;font-size:12.5px}'
      +'.rl-compact .rl-wrap th{padding-top:7px !important;padding-bottom:7px !important}'
      +'.rl-compact .av{width:26px !important;height:26px !important;font-size:10px !important;line-height:26px !important}'
      +'.rl-compact .tags2{display:none !important}'
      +'.rl-compact .who .meta{display:none !important}'
      +'.rl-resize{position:absolute;right:0;top:0;bottom:0;width:8px;cursor:col-resize;z-index:2}'
      +'.rl-resize:hover{background:rgba(0,0,0,.10)}'
      +'tbody tr.rl-tr:hover td{background:#f7faff}'
      +'tbody tr.rl-sel td{background:#eef4ff !important}'
      +'td.rl-ed{cursor:text}'
      +'td.rl-ed:hover{box-shadow:inset 0 0 0 1px #c3d0e6}'
      +'.rl-edinput{width:100%;box-sizing:border-box;border:1px solid var(--primary,#2c5c8f);border-radius:5px;padding:4px 6px;font:inherit;font-size:13px;background:#fff;color:#1f2a3d}'
      +'.rl-btn.on{background:var(--navy,#000E31);color:#fff;border-color:var(--navy,#000E31)}'
      +'.rl-btn .rlfcount{background:var(--red,#DA2B1F);color:#fff;border-radius:4px;font-size:10px;font-weight:800;padding:0 5px;margin-left:1px}'
      +'.rl-filterpanel{display:flex;flex-wrap:wrap;align-items:flex-end;gap:9px 11px;padding:11px 12px;margin:0 0 11px;background:#f7f9fc;border:1px solid #e6ebf3;border-radius:6px}'
      +'.rl-filterfield{display:flex;flex-direction:column;gap:3px}'
      +'.rl-filterfield label{font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#8a94a6;font-weight:700}'
      +'.rl-filterfield input{border:1px solid #cfd6e2;border-radius:3px;padding:5px 8px;font:inherit;font-size:12.5px;min-width:132px}'
      +'.rl-filterfield input:focus{outline:none;border-color:var(--primary,#2c5c8f)}'
      +'.rl-fdate{display:flex;align-items:center;gap:6px}.rl-fdate input{min-width:118px}.rl-fto{font-size:11px;color:#8a94a6;font-weight:600}'
      +'.rl-fnum{display:flex;align-items:center;gap:6px}.rl-fnum select{border:1px solid #cfd6e2;border-radius:3px;padding:5px 6px;font:inherit;font-size:13px;font-weight:700;color:#26324a;background:#fff;cursor:pointer}.rl-fnum input{min-width:96px}'
      +'.rl-filterclear{font-size:11.5px;color:#5b6472;text-decoration:underline;cursor:pointer;background:none;border:none;padding:6px 4px}'
      +'.rl-savedmenu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;background:#fff;border:1px solid #e3e8f0;border-radius:6px;box-shadow:0 14px 40px rgba(12,22,54,.18);padding:7px;min-width:236px;max-height:340px;overflow:auto}'
      +'.rl-savedrow{display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:3px;font-size:13px;color:#26324a}'
      +'.rl-savedrow:hover{background:#f4f7fb}'
      +'.rl-savedname{flex:1;cursor:pointer}'
      +'.rl-saveddel{border:none;background:none;color:#c7cedb;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}'
      +'.rl-saveddel:hover{color:var(--red,#DA2B1F)}'
      +'.rl-savenew{display:flex;gap:6px;padding:8px 9px 4px;border-top:1px solid #eef1f6;margin-top:5px}'
      +'.rl-savename{flex:1;min-width:0;border:1px solid #cfd6e2;border-radius:3px;padding:5px 8px;font:inherit;font-size:12.5px}'
      +'.rl-savebtn2{border:1px solid var(--navy,#000E31);background:var(--navy,#000E31);color:#fff;border-radius:3px;padding:5px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}'
      +'.rl-savedempty{font-size:12px;color:#98a1b5;padding:6px 9px}';
    var s=document.createElement('style'); s.id=STYLE_ID; s.textContent=css; document.head.appendChild(s);
  }

  var PER_OPTS=[10,20,50,100,100000]; // 100000 = "All"

  function create(opts){
    injectStyle();
    var mount = typeof opts.mount==='string' ? $(opts.mount) : opts.mount;
    if(!mount) return { refresh:function(){}, };
    var countEl = opts.countEl ? (typeof opts.countEl==='string'?$(opts.countEl):opts.countEl) : null;
    var cols = opts.columns||[];
    var rowId = opts.rowId || function(it,i){ return String(i); };
    var lsKey = 'rrglist_'+(opts.key||'list');
    var listName = opts.exportName || opts.key || 'list';
    var saved = {}; try{ saved=JSON.parse(localStorage.getItem(lsKey)||'{}')||{}; }catch(e){}

    // stable key per column
    cols.forEach(function(c,i){ c.__key = c.key || slug(c.label) || ('col'+i); });
    function metaAll(){ return cols.map(function(c,i){ return {c:c,i:i,key:c.__key}; }); }

    var state = {
      data: opts.data||[],
      per: PER_OPTS.indexOf(saved.per)>=0 ? saved.per : (opts.per||20),
      sort: (saved.sort!=null ? saved.sort : (opts.defaultSort!=null?opts.defaultSort:firstSortable())),
      dir: (saved.dir!=null ? saved.dir : (opts.defaultDir||1)),
      compact: !!saved.compact,
      widths: (saved.widths&&typeof saved.widths==='object')?saved.widths:{},
      order: Array.isArray(saved.order)?saved.order.slice():null,
      hidden: (saved.hidden&&typeof saved.hidden==='object')?saved.hidden:(function(){ var h={}; cols.forEach(function(c){ if(c.defaultHidden) h[c.__key]=true; }); return h; })(),
      filters: (saved.filters&&typeof saved.filters==='object')?saved.filters:{},
      _filterOpen: false, _focusFilter: null,
      page: 0,
      sel: {}
    };
    var keepMenu=false;
    function canExport(){ if(opts.canExport===false) return false; if(opts.canExport===true) return true; var ss=window.__rrgSession; return ss?!!ss.canExport:false; }
    (function(){ if(window.__rrgSession) return; if(!window.__rrgSessionFetch){ window.__rrgSessionFetch=fetch('/api/session',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(ss){ window.__rrgSession=ss; try{document.dispatchEvent(new CustomEvent('rrg:session',{detail:ss}));}catch(e){} return ss; }).catch(function(){}); } document.addEventListener('rrg:session',function(){ try{ var ce=canExport(); mount.querySelectorAll('.rl-export,.rl-print').forEach(function(b){ b.hidden=!ce; }); }catch(e){} }); })();
    function firstSortable(){ for(var i=0;i<cols.length;i++){ if(cols[i].sortable!==false && cols[i].sort) return i; } return -1; }
    function persist(){ try{ localStorage.setItem(lsKey, JSON.stringify({per:state.per, sort:state.sort, dir:state.dir, compact:state.compact, widths:state.widths, order:orderedMeta().map(function(m){return m.key;}), hidden:state.hidden, filters:state.filters})); }catch(e){} }

    function orderedMeta(){
      var meta=metaAll(), byKey={}; meta.forEach(function(m){ byKey[m.key]=m; });
      var out=[]; (state.order||[]).forEach(function(k){ if(byKey[k]){ out.push(byKey[k]); byKey[k]=null; } });
      meta.forEach(function(m){ if(byKey[m.key]) out.push(m); });
      return out;
    }
    function visibleMeta(){ return orderedMeta().filter(function(m){ return !state.hidden[m.key]; }); }

    function _ftype(m){ return (m&&m.c&&m.c.filterType)||'text'; }
    function _fParseDate(x){ if(x==null||x==='') return null; var t=Date.parse(x); return isNaN(t)?null:t; }
    function _fActive(f,type){ if(f==null) return false; if(type==='date') return !!(f&&(f.from||f.to)); if(type==='number') return !!(f&&f.op&&f.val!==''&&f.val!=null); return String(f||'').trim()!==''; }
    function _fMatch(m,it,f){
      var type=_ftype(m);
      if(type==='date'){ var d=_fParseDate(m.c.filterVal?m.c.filterVal(it):cellText(m.c,it)); if(d==null) return false; if(f.from){ var fr=_fParseDate(f.from); if(fr!=null&&d<fr) return false; } if(f.to){ var to=_fParseDate(f.to); if(to!=null&&d>to+86399999) return false; } return true; }
      if(type==='number'){ var raw=m.c.filterVal?m.c.filterVal(it):cellText(m.c,it); var nv=Number(String(raw).replace(/[^0-9.\-]/g,'')); if(isNaN(nv)) return false; var tgt=Number(f.val); if(isNaN(tgt)) return true; if(f.op==='lt') return nv<tgt; if(f.op==='gt') return nv>tgt; return nv===tgt; }
      var v=String(f||'').toLowerCase(); var txt=(m.c.filterVal?String(m.c.filterVal(it)||''):cellText(m.c,it)).toLowerCase(); return rrgFuzzy(txt,v);
    }
    function activeFilterKeys(){ var mm={}; metaAll().forEach(function(m){ mm[m.key]=m; }); return Object.keys(state.filters||{}).filter(function(k){ var m=mm[k]; return m && _fActive(state.filters[k], _ftype(m)); }); }
    function filteredData(){
      var mm={}; metaAll().forEach(function(m){ mm[m.key]=m; });
      var keys=activeFilterKeys();
      if(!keys.length) return state.data.slice();
      return state.data.filter(function(it){ return keys.every(function(k){ var m=mm[k]; if(!m) return true; return _fMatch(m,it,state.filters[k]); }); });
    }
    function sortedData(){
      var d = filteredData();
      var c = cols[state.sort];
      if(c && c.sort){ d.sort(function(a,b){ return c.sort(a,b)*state.dir; }); }
      return d;
    }
    function pageCount(total){ return Math.max(1, Math.ceil(total/state.per)); }
    function selectedIds(){ return Object.keys(state.sel).filter(function(k){ return state.sel[k]; }); }
    function allIds(){ return sortedData().map(function(it,i){ return rowId(it,i); }); }
    function cellText(c,it){ var d=document.createElement('div'); d.innerHTML=c.cell(it); return (d.textContent||'').replace(/\s+/g,' ').trim(); }

    function render(){
      var all = sortedData();
      // Persist the full filtered+sorted id order so detail pages can offer prev/next through this list.
      try{ sessionStorage.setItem('rrgorder_'+(opts.key||'list'), JSON.stringify(all.map(function(it,i){ return String(rowId(it,i)); }))); }catch(e){}
      var total = all.length;
      var pc = pageCount(total);
      if(state.page>=pc) state.page=pc-1; if(state.page<0) state.page=0;
      var start = state.page*state.per;
      var slice = all.slice(start, start+state.per);
      var showFrom = total? (start+1):0, showTo = Math.min(start+state.per, total);
      if(countEl) countEl.textContent = total ? (total+' total') : '';

      var vis = visibleMeta();
      var selIds = selectedIds();
      var perSel = '<span class="rl-per">Rows <select class="rl-perSel">'
        + PER_OPTS.map(function(n){ return '<option value="'+n+'"'+(n===state.per?' selected':'')+'>'+(n>=100000?'All':n)+'</option>'; }).join('')
        + '</select></span>';
      var count = '<span class="rl-count">'+(total?('Showing '+showFrom+'–'+showTo+' of '+total):'No records')+'</span>';
      var pager = '<span class="rl-pager">'
        + '<button class="rl-prev"'+(state.page===0?' disabled':'')+'>‹</button>'
        + pageButtons(pc)
        + '<button class="rl-next"'+(state.page>=pc-1?' disabled':'')+'>›</button></span>';
      var densTog = '<label class="rl-dens" title="Compact rows"><input type="checkbox" class="rl-densCk"'+(state.compact?' checked':'')+'> Compact</label>';
      var fcount = activeFilterKeys().length;
      var filtBtn = '<button class="rl-btn rl-filtbtn'+(state._filterOpen?' on':'')+'" title="Filter rows"><span class="rlic">\u2261</span>Filter'+(fcount?('<span class="rlfcount">'+fcount+'</span>'):'')+'</button>';
      var savedBtn = '<div class="rl-colwrap"><button class="rl-btn rl-savedbtn" title="Saved searches"><span class="rlic">\u2606</span>Saved</button><div class="rl-savedmenu" hidden></div></div>';
      var colsBtn = '<div class="rl-colwrap"><button class="rl-btn rl-colbtn" title="Choose columns"><span class="rlic">▦</span>Columns</button><div class="rl-colmenu" hidden></div></div>';
      var expBtn = '<button class="rl-btn rl-export" title="Export to CSV"><span class="rlic">⬇</span>Export</button>';
      var prnBtn = '<button class="rl-btn rl-print" title="Print this list"><span class="rlic">⎙</span>Print</button>';
      if(!canExport()){ expBtn=expBtn.replace('<button ','<button hidden '); prnBtn=prnBtn.replace('<button ','<button hidden '); }
      var bar = '<div class="rl-bar"><span class="rl-sp"></span>'+count+densTog+perSel+filtBtn+savedBtn+colsBtn+expBtn+prnBtn+pager+'</div>';
      var filterPanel='';
      if(state._filterOpen){ var ffs=orderedMeta().filter(function(m){ return m.c.label && m.c.filterable!==false && _ftype(m)!=='none'; }).map(function(m){
          var type=_ftype(m), f=state.filters[m.key], ctl;
          if(type==='date'){ var _fr=(f&&f.from)||'', _to=(f&&f.to)||''; ctl='<div class="rl-fdate"><input type="date" data-fdate="from" data-filterkey="'+esc(m.key)+'" value="'+esc(_fr)+'"><span class="rl-fto">to</span><input type="date" data-fdate="to" data-filterkey="'+esc(m.key)+'" value="'+esc(_to)+'"></div>'; }
          else if(type==='number'){ var _op=(f&&f.op)||'eq', _val=(f&&f.val!=null)?f.val:''; ctl='<div class="rl-fnum"><select data-fnumop data-filterkey="'+esc(m.key)+'"><option value="eq"'+(_op==='eq'?' selected':'')+'>=</option><option value="lt"'+(_op==='lt'?' selected':'')+'>&lt;</option><option value="gt"'+(_op==='gt'?' selected':'')+'>&gt;</option></select><input type="number" data-fnumval data-filterkey="'+esc(m.key)+'" value="'+esc(String(_val))+'" placeholder="value"></div>'; }
          else { ctl='<input type="text" data-filterkey="'+esc(m.key)+'" value="'+esc(String(f||''))+'" placeholder="contains\u2026">'; }
          return '<div class="rl-filterfield"><label>'+esc(m.c.label)+'</label>'+ctl+'</div>';
        }).join(''); filterPanel='<div class="rl-filterpanel">'+ffs+'<button class="rl-filterclear">Clear all</button></div>'; }

      var visibleIds = slice.map(function(it,i){ return rowId(it, start+i); });
      var allChecked = visibleIds.length && visibleIds.every(function(id){ return state.sel[id]; });

      var bulk='';
      if(opts.bulk && opts.bulk.length && selIds.length){
        var _bitems = opts.bulk.map(function(b,i){ var need=b.min||1; var dis=selIds.length<need; return '<button class="rl-bulkitem'+(b.danger?' danger':'')+'" data-i="'+i+'"'+(dis?' disabled':'')+'>'+esc(b.label)+(dis&&need>1?' <span class="rl-need">('+need+'+ needed)</span>':'')+'</button>'; }).join('');
        // Gmail-style "select everything that matches", not just this page. Offer it once the whole
        // page is checked and more matching records exist beyond what's currently selected.
        var _selAll='';
        if(total>slice.length){
          if(allChecked && selIds.length<total){ _selAll='<span class="rl-selallnote">All '+slice.length+' on this page selected.</span> <a class="rl-selall">Select all '+total+' matching</a>'; }
          else if(selIds.length>=total){ _selAll='<span class="rl-selallnote">All '+total+' matching records selected.</span>'; }
        }
        bulk = '<div class="rl-bulk"><b>'+selIds.length+' selected</b>'
          + '<div class="rl-morewrap"><button class="rl-morebtn" title="Bulk actions">Actions <span class="rlic">\u22ef</span></button><div class="rl-moremenu" hidden>'+_bitems+'</div></div>'
          + (_selAll?('<span class="rl-selallwrap">'+_selAll+'</span>'):'')
          + '<a class="rl-clear">Clear</a></div>';
      }

      var head = '<th class="rl-ck"><input type="checkbox" class="rl-all"'+(allChecked?' checked':'')+' title="Select all on this page"></th>';
      head += vis.map(function(m){
        var c=m.c, ci=m.i;
        var sortable = c.sortable!==false && c.sort;
        var cls='rl-th'+(sortable?'':' rl-noselect')+(state.sort===ci?(state.dir>0?' rl-asc':' rl-desc'):'');
        var arrow = sortable ? '<span class="rl-arrow">'+(state.sort===ci?(state.dir>0?'▲':'▼'):'↕')+'</span>' : '';
        var w = (state.widths[m.key]!=null) ? state.widths[m.key] : (c.width||null);
        var style = (c.align?('text-align:'+c.align+';'):'')+(w?('width:'+w+'px;'):'');
        return '<th class="'+cls+(c.cls?(' '+c.cls):'')+'" data-ci="'+ci+'" data-key="'+esc(m.key)+'" draggable="true"'+(style?(' style="'+style+'"'):'')+'>'+esc(c.label)+arrow+'<span class="rl-resize"></span></th>';
      }).join('');

      var body = slice.map(function(it,i){
        var id = visibleIds[i];
        var ck = '<td class="rl-ck"><input type="checkbox" class="rl-row" data-id="'+esc(id)+'"'+(state.sel[id]?' checked':'')+'></td>';
        var tds = vis.map(function(m){ var c=m.c; var align=c.align?(' style="text-align:'+c.align+'"'):''; var cls=((c.cls||'')+(c.edit?' rl-ed':'')).trim(); var clsAttr=cls?(' class="'+cls+'"'):''; var edAttr=c.edit?(' data-edkey="'+esc(m.key)+'"'):''; return '<td'+clsAttr+edAttr+align+'>'+c.cell(it)+'</td>'; }).join('');
        return '<tr class="rl-tr'+(state.sel[id]?' rl-sel':'')+'" data-rowid="'+esc(id)+'">'+ck+tds+'</tr>';
      }).join('');

      var _fixed = vis.length && vis.every(function(m){ return state.widths[m.key]!=null; });
      var table = total ? ('<div class="rl-wrap"><table'+(_fixed?' style="table-layout:fixed"':'')+'><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>')
                        : (opts.empty || '<div class="empty">Nothing here yet.</div>');
      mount.innerHTML = bar + filterPanel + bulk + table;
      mount.classList.toggle('rl-compact', !!state.compact);
      wire();
      if(keepMenu){ keepMenu=false; openColMenu(); }
      if(state._focusFilter){ var _sel='[data-filterkey="'+state._focusFilter+'"]'; var _ff=mount.querySelector('input[type="text"]'+_sel)||mount.querySelector('[data-fnumval]'+_sel)||mount.querySelector(_sel); state._focusFilter=null; if(_ff){ try{ _ff.focus(); var _l=String(_ff.value).length; _ff.setSelectionRange(_l,_l); }catch(e){} } }
      if(opts.onFilterChange){ try{ opts.onFilterChange(activeFilterKeys().length, !!state._filterOpen); }catch(e){} }
    }

    function pageButtons(pc){
      var btns=[], cur=state.page;
      var win=[]; for(var p=0;p<pc;p++){ if(p===0||p===pc-1||Math.abs(p-cur)<=1) win.push(p); }
      var last=-1;
      win.forEach(function(p){ if(p-last>1) btns.push('<button disabled>…</button>'); btns.push('<button class="rl-pg'+(p===cur?' on':'')+'" data-p="'+p+'">'+(p+1)+'</button>'); last=p; });
      return btns.join('');
    }

    function buildColMenu(){
      var oc=orderedMeta();
      return '<div class="rl-colhd">Show columns</div>'
        + oc.map(function(m){ var checked=!state.hidden[m.key]; var lbl=m.c.label||'(actions)'; return '<label class="rl-colopt"><input type="checkbox" class="rl-coltog" data-key="'+esc(m.key)+'"'+(checked?' checked':'')+'> '+esc(lbl)+'</label>'; }).join('')
        + '<div class="rl-colhint">Drag column headers to reorder</div>';
    }
    function _placeMenu(btn,menu,alignRight){ if(!btn||!menu) return; menu.style.position='fixed'; menu.style.right='auto'; menu.style.bottom='auto'; var r=btn.getBoundingClientRect(); var top=r.bottom+6; menu.style.top=top+'px'; var mw=menu.offsetWidth||210; var vw=window.innerWidth||1200; var left=alignRight?(r.right-mw):r.left; if(left+mw>vw-8) left=vw-8-mw; if(left<8) left=8; menu.style.left=left+'px'; var vh=window.innerHeight||800; var mh=vh-top-12; menu.style.maxHeight=(mh<140?140:mh)+'px'; menu.style.overflow='auto'; }
    function openColMenu(){ var menu=$('.rl-colmenu',mount); if(!menu) return; menu.innerHTML=buildColMenu(); menu.hidden=false; _placeMenu($('.rl-colbtn',mount),menu,true); menu.querySelectorAll('.rl-coltog').forEach(function(cb){ cb.onchange=function(){ var k=cb.getAttribute('data-key'); if(!cb.checked && visibleMeta().length<=1){ cb.checked=true; return; } if(cb.checked) delete state.hidden[k]; else state.hidden[k]=true; keepMenu=true; persist(); render(); }; }); }

    function _exportToast(msg){ if(window.rrgToast){ window.rrgToast(msg); } else { var eb=$('.rl-export',mount); if(eb){ var o=eb.innerHTML; eb.innerHTML='<span class="rlic">✓</span>Exported'; setTimeout(function(){ eb.innerHTML=o; },2000); } } }
    async function exportCsv(){
      var vc=visibleMeta();
      var all=sortedData();
      var sel=state.sel||{};
      var selected=all.filter(function(it,i){ return sel[rowId(it,i)]; });
      var data=selected.length?selected:all;
      var rows=[ vc.map(function(m){ return m.c.label||''; }) ];
      data.forEach(function(it){ rows.push(vc.map(function(m){ return cellText(m.c,it); })); });
      var csv=rows.map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v; }).join(','); }).join('\r\n');
      var n=data.length, noun=(n===1?'row':'rows');
      var msg=(selected.length?('Exported '+n+' selected '+noun):('Exported all '+n+' '+noun));
      var fname=listName+'.csv';
      var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
      // Let the user choose where to save it, when the browser supports the file picker.
      if(window.showSaveFilePicker){
        try{
          var handle=await window.showSaveFilePicker({ suggestedName:fname, types:[{description:'CSV file', accept:{'text/csv':['.csv']}}] });
          var ws=await handle.createWritable(); await ws.write(blob); await ws.close();
          _exportToast(msg+' — saved to '+(handle.name||fname));
          return;
        }catch(err){ if(err&&err.name==='AbortError') return; /* not supported / denied → fall back to a normal download */ }
      }
      var u=URL.createObjectURL(blob);
      var a=document.createElement('a'); a.href=u; a.download=fname; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); },120);
      _exportToast(msg+' to your Downloads folder');
    }
    function printList(){
      var vc=visibleMeta(); var data=sortedData(); var title=(document.title||'List').split(/[—|]/)[0].trim();
      var thead='<tr>'+vc.map(function(m){ return '<th>'+esc(m.c.label||'')+'</th>'; }).join('')+'</tr>';
      var tbody=data.map(function(it){ return '<tr>'+vc.map(function(m){ return '<td>'+esc(cellText(m.c,it))+'</td>'; }).join('')+'</tr>'; }).join('');
      var w=window.open('','_blank'); if(!w){ alert('Allow pop-ups to print.'); return; }
      w.document.write('<html><head><title>'+esc(title)+'</title><style>body{font-family:-apple-system,Arial,sans-serif;padding:26px;color:#111}h1{font-size:16px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #d5d5d5;padding:6px 8px;text-align:left}th{background:#f2f4f7;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#444}tr:nth-child(even) td{background:#fafbfc}@media print{@page{margin:14mm}}</style></head><body><h1>'+esc(title)+'</h1><div class="sub">'+data.length+' record'+(data.length===1?'':'s')+' · '+new Date().toLocaleDateString()+'</div><table><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table></body></html>');
      w.document.close(); w.focus(); setTimeout(function(){ try{ w.print(); }catch(e){} },300);
    }

    function reorderTo(fromKey, toKey){
      if(fromKey===toKey) return;
      var keys=orderedMeta().map(function(m){ return m.key; });
      var fi=keys.indexOf(fromKey), ti=keys.indexOf(toKey);
      if(fi<0||ti<0) return;
      keys.splice(ti,0,keys.splice(fi,1)[0]);
      state.order=keys; persist(); render();
    }

    function wire(){
      var all=$('.rl-all',mount); if(all) all.onclick=function(){ var ids=currentSlice().ids; var on=all.checked; ids.forEach(function(id){ state.sel[id]=on; }); render(); };
      mount.querySelectorAll('.rl-row').forEach(function(cb){ cb.onclick=function(){ state.sel[cb.getAttribute('data-id')]=cb.checked; render(); }; });
      mount.querySelectorAll('tbody tr.rl-tr').forEach(function(tr){ tr.addEventListener('click',function(e){ if(e.target.closest('a,button,input,select,label,.rl-resize,.rl-ed')) return; var id=tr.getAttribute('data-rowid'); state.sel[id]=!state.sel[id]; render(); }); });
      mount.querySelectorAll('td.rl-ed').forEach(function(td){ td.addEventListener('click',function(e){ e.stopPropagation(); startEdit(td); }); });
      mount.querySelectorAll('.rl-resize').forEach(function(h){ h.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); var th=h.parentNode; var key=th.getAttribute('data-key'); th.setAttribute('draggable','false'); var tbl=th.closest('table'); mount.querySelectorAll('th.rl-th').forEach(function(t){ var k=t.getAttribute('data-key'); var cw=t.offsetWidth; t.style.width=cw+'px'; state.widths[k]=cw; }); if(tbl) tbl.style.tableLayout='fixed'; var comp=null, ns=th.nextElementSibling; if(ns&&ns.classList.contains('rl-th')) comp=ns; else { var ps=th.previousElementSibling; if(ps&&ps.classList.contains('rl-th')) comp=ps; } var compKey=comp?comp.getAttribute('data-key'):null, compStartW=comp?comp.offsetWidth:0; var startX=e.clientX, startW=th.offsetWidth; function mm(ev){ var w=Math.max(52, startW+(ev.clientX-startX)); var used=w-startW; th.style.width=w+'px'; state.widths[key]=w; if(comp){ var cw2=Math.max(52, compStartW-used); comp.style.width=cw2+'px'; state.widths[compKey]=cw2; } } function mu(){ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); th.setAttribute('draggable','true'); persist(); } document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); }); h.addEventListener('click',function(e){ e.stopPropagation(); }); });
      // sort
      mount.querySelectorAll('th.rl-th').forEach(function(th){
        if(!th.classList.contains('rl-noselect')){ th.addEventListener('click',function(e){ if(th.__dragged){ th.__dragged=false; return; } var ci=+th.getAttribute('data-ci'); if(state.sort===ci){ state.dir=-state.dir; } else { state.sort=ci; state.dir=1; } persist(); render(); }); }
        // drag reorder
        th.addEventListener('dragstart',function(e){ th.classList.add('rl-drag'); e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setData('text/plain', th.getAttribute('data-key')); }catch(_){}
          mount.__dragKey=th.getAttribute('data-key'); });
        th.addEventListener('dragend',function(){ th.classList.remove('rl-drag'); mount.querySelectorAll('th.rl-over').forEach(function(x){x.classList.remove('rl-over');}); setTimeout(function(){ th.__dragged=false; },0); });
        th.addEventListener('dragover',function(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; th.classList.add('rl-over'); });
        th.addEventListener('dragleave',function(){ th.classList.remove('rl-over'); });
        th.addEventListener('drop',function(e){ e.preventDefault(); th.classList.remove('rl-over'); var from=mount.__dragKey||(e.dataTransfer&&e.dataTransfer.getData('text/plain')); var to=th.getAttribute('data-key'); if(from){ th.__dragged=true; reorderTo(from,to); } });
      });
      var densCk=$('.rl-densCk',mount); if(densCk) densCk.onchange=function(){ state.compact=densCk.checked; persist(); render(); };
      var perSel=$('.rl-perSel',mount); if(perSel) perSel.onchange=function(){ state.per=+perSel.value; state.page=0; persist(); render(); };
      var prev=$('.rl-prev',mount); if(prev) prev.onclick=function(){ if(state.page>0){ state.page--; render(); } };
      var next=$('.rl-next',mount); if(next) next.onclick=function(){ state.page++; render(); };
      mount.querySelectorAll('.rl-pg').forEach(function(b){ b.onclick=function(){ state.page=+b.getAttribute('data-p'); render(); }; });
      var clr=$('.rl-clear',mount); if(clr) clr.onclick=function(){ state.sel={}; render(); };
      var selAll=$('.rl-selall',mount); if(selAll) selAll.onclick=function(){ allIds().forEach(function(id){ state.sel[id]=true; }); render(); };
      var morebtn=$('.rl-morebtn',mount); if(morebtn) morebtn.onclick=function(e){ e.stopPropagation(); var menu=$('.rl-moremenu',mount); if(menu){ menu.hidden=!menu.hidden; if(!menu.hidden) _placeMenu(morebtn,menu,false); } };
      mount.querySelectorAll('.rl-bulkitem').forEach(function(b){ b.onclick=function(){ if(b.disabled) return; var i=+b.getAttribute('data-i'); var act=opts.bulk[i]; var ids=selectedIds(); if(!ids.length||!act) return; var mm=$('.rl-moremenu',mount); if(mm) mm.hidden=true; act.fn(ids, function(){ ids.forEach(function(id){ delete state.sel[id]; }); render(); }); }; });
      var colbtn=$('.rl-colbtn',mount); if(colbtn) colbtn.onclick=function(e){ e.stopPropagation(); var menu=$('.rl-colmenu',mount); if(menu.hidden) openColMenu(); else menu.hidden=true; };
      var exp=$('.rl-export',mount); if(exp) exp.onclick=exportCsv;
      var prn=$('.rl-print',mount); if(prn) prn.onclick=printList;
      var fbt=$('.rl-filtbtn',mount); if(fbt) fbt.onclick=function(){ state._filterOpen=!state._filterOpen; render(); };
      var svb=$('.rl-savedbtn',mount); if(svb) svb.onclick=function(e){ e.stopPropagation(); var menu=$('.rl-savedmenu',mount); if(menu.hidden) openSavedMenu(); else menu.hidden=true; };
      var fcl=$('.rl-filterclear',mount); if(fcl) fcl.onclick=function(){ state.filters={}; state.page=0; persist(); render(); };
      function _fobj(k){ var c=state.filters[k]; return (c&&typeof c==='object')?c:{}; }
      mount.querySelectorAll('.rl-filterfield input[type="text"][data-filterkey]').forEach(function(fi){ fi.oninput=function(){ var k=fi.getAttribute('data-filterkey'); var v=fi.value; if(fi._t) clearTimeout(fi._t); fi._t=setTimeout(function(){ state.filters[k]=v; state._focusFilter=k; state.page=0; persist(); render(); },180); }; });
      mount.querySelectorAll('.rl-filterfield input[type="date"][data-filterkey]').forEach(function(fi){ fi.onchange=function(){ var k=fi.getAttribute('data-filterkey'); var cur=_fobj(k); cur[fi.getAttribute('data-fdate')]=fi.value; state.filters[k]=cur; state.page=0; persist(); render(); }; });
      mount.querySelectorAll('.rl-filterfield [data-fnumop]').forEach(function(sel){ sel.onchange=function(){ var k=sel.getAttribute('data-filterkey'); var cur=_fobj(k); cur.op=sel.value; if(cur.val==null) cur.val=''; state.filters[k]=cur; state.page=0; persist(); render(); }; });
      mount.querySelectorAll('.rl-filterfield [data-fnumval]').forEach(function(fi){ fi.oninput=function(){ var k=fi.getAttribute('data-filterkey'); if(fi._t) clearTimeout(fi._t); fi._t=setTimeout(function(){ var cur=_fobj(k); cur.val=fi.value; if(!cur.op) cur.op='eq'; state.filters[k]=cur; state._focusFilter=k; state.page=0; persist(); render(); },200); }; });
    }

    function loadSaved(){ try{ return JSON.parse(localStorage.getItem('rrgsaved_'+(opts.key||'list'))||'[]')||[]; }catch(e){ return []; } }
    function storeSaved(a){ try{ localStorage.setItem('rrgsaved_'+(opts.key||'list'), JSON.stringify(a)); }catch(e){} }
    function captureState(){ return { filters:JSON.parse(JSON.stringify(state.filters||{})), hidden:JSON.parse(JSON.stringify(state.hidden||{})), order:orderedMeta().map(function(m){return m.key;}), sort:state.sort, dir:state.dir, per:state.per, compact:state.compact }; }
    function applyState(st){ if(!st) return; state.filters=st.filters?JSON.parse(JSON.stringify(st.filters)):{}; state.hidden=st.hidden?JSON.parse(JSON.stringify(st.hidden)):{}; if(Array.isArray(st.order)) state.order=st.order.slice(); if(st.sort!=null) state.sort=st.sort; if(st.dir!=null) state.dir=st.dir; if(st.per!=null) state.per=st.per; state.compact=!!st.compact; state.page=0; if(state.filters&&Object.keys(state.filters).length) state._filterOpen=true; persist(); render(); }
    function buildSavedMenu(){ var arr=loadSaved(); var rows=arr.length?arr.map(function(sv,i){ return '<div class="rl-savedrow"><span class="rl-savedname" data-si="'+i+'">'+esc(sv.name)+'</span><button class="rl-saveddel" data-sdi="'+i+'" title="Delete">\u00d7</button></div>'; }).join(''):'<div class="rl-savedempty">No saved searches yet.</div>'; return '<div class="rl-colmenu" style="position:static;box-shadow:none;border:none;padding:0;max-height:none"><div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#98a1b5;padding:2px 9px 4px">Saved searches</div>'+rows+'<div class="rl-savenew"><input class="rl-savename" placeholder="Name this search"><button class="rl-savebtn2">Save current</button></div></div>'; }
    function openSavedMenu(){ var menu=$('.rl-savedmenu',mount); if(!menu) return; var cm=$('.rl-colmenu',mount); if(cm) cm.hidden=true; menu.innerHTML=buildSavedMenu(); menu.hidden=false; _placeMenu($('.rl-savedbtn',mount),menu,true);
      menu.querySelectorAll('.rl-savedname').forEach(function(x){ x.onclick=function(){ var arr=loadSaved(); var sv=arr[+x.getAttribute('data-si')]; if(sv) applyState(sv.state); }; });
      menu.querySelectorAll('.rl-saveddel').forEach(function(x){ x.onclick=function(e){ e.stopPropagation(); var arr=loadSaved(); arr.splice(+x.getAttribute('data-sdi'),1); storeSaved(arr); openSavedMenu(); }; });
      var sb=$('.rl-savebtn2',menu), si=$('.rl-savename',menu);
      if(sb&&si){ sb.onclick=function(){ var nm=(si.value||'').trim(); if(!nm){ si.focus(); return; } var arr=loadSaved(); arr.push({ name:nm.slice(0,60), state:captureState() }); storeSaved(arr); openSavedMenu(); }; si.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); sb.onclick(); } }; }
    }
    function startEdit(td){
      if(td.querySelector('.rl-edinput')) return;
      var tr=td.parentNode; var id=tr.getAttribute('data-rowid'); var key=td.getAttribute('data-edkey');
      var meta=null; metaAll().forEach(function(x){ if(x.key===key) meta=x; });
      if(!meta||!meta.c.edit) return; var ed=meta.c.edit;
      var item=null; state.data.forEach(function(x,i){ if(item==null && String(rowId(x,i))===String(id)) item=x; });
      if(!item) return;
      var cur=ed.get?ed.get(item):'';
      var input;
      if(ed.type==='select'){ input=document.createElement('select'); var opts=(typeof ed.options==='function'?ed.options():ed.options)||[]; if(ed.allowBlank){ var ob=document.createElement('option'); ob.value=''; ob.textContent='—'; input.appendChild(ob);} opts.forEach(function(o){ var v=(o&&typeof o==='object')?o.value:o; var l=(o&&typeof o==='object')?o.label:o; var op=document.createElement('option'); op.value=v; op.textContent=l; if(String(v)===String(cur)) op.selected=true; input.appendChild(op); }); }
      else { input=document.createElement('input'); input.type=(ed.type==='date')?'date':'text'; input.value=(cur==null?'':cur); }
      input.className='rl-edinput'; td.innerHTML=''; td.appendChild(input); try{ input.focus(); if(input.select) input.select(); }catch(e){}
      var settled=false;
      function commit(){ if(settled) return; settled=true; var val=input.value; if(String(val)===String(cur==null?'':cur)){ render(); return; } input.disabled=true; Promise.resolve(ed.save(item,val)).then(function(){ render(); }).catch(function(err){ try{ alert((err&&err.message)||'Could not save.'); }catch(e){} render(); }); }
      input.addEventListener('blur',commit);
      input.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); input.blur(); } else if(e.key==='Escape'){ e.preventDefault(); settled=true; render(); } });
      if(ed.type==='select'){ input.addEventListener('change',function(){ input.blur(); }); }
    }
    function currentSlice(){ var all=sortedData(); var start=state.page*state.per; var slice=all.slice(start,start+state.per); return { items:slice, ids:slice.map(function(it,i){ return rowId(it,start+i); }) }; }

    if(!mount.__rlClose){ mount.__rlClose=true; document.addEventListener('click',function(e){ if(!e.target.closest('.rl-colwrap')){ var cm=$('.rl-colmenu',mount); if(cm) cm.hidden=true; var sm=$('.rl-savedmenu',mount); if(sm) sm.hidden=true; } if(!e.target.closest('.rl-morewrap')){ var mo=$('.rl-moremenu',mount); if(mo) mo.hidden=true; } }); }

    render();
    return { refresh:function(newData){ state.data=newData||[]; state.sel={}; render(); }, getSelected:selectedIds, clearSelection:function(){ state.sel={}; render(); },
      openFilter:function(){ state._filterOpen=true; render(); }, toggleFilter:function(){ state._filterOpen=!state._filterOpen; render(); }, closeFilter:function(){ state._filterOpen=false; render(); },
      filterOpen:function(){ return !!state._filterOpen; }, activeFilterCount:function(){ return activeFilterKeys().length; } };
  }

  window.RRGList = { create:create, cmp:cmpVal };
})();
