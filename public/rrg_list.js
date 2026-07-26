/* RRG shared list controller — pagination, per-column sort, select, resize,
   choose/reorder columns, CSV export, print. Filtering stays the page's job. */
(function(){
  function $(sel, root){ return (root||document).querySelector(sel); }
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function cmpVal(a,b){ if(a==null&&b==null)return 0; if(a==null)return -1; if(b==null)return 1;
    if(typeof a==='number'&&typeof b==='number') return a-b;
    return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'}); }
  function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

  var STYLE_ID='rrglist-style';
  function injectStyle(){ if(document.getElementById(STYLE_ID)) return;
    var css=''
      +'.rl-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin:2px 0 9px;font:inherit}'
      +'.rl-bar .rl-count{font-size:12.5px;color:#5b6472;font-weight:600}'
      +'.rl-bar .rl-per{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#5b6472}'
      +'.rl-bar .rl-per select{font:inherit;font-size:12.5px;padding:5px 9px;border:1px solid #dbe1ea;border-radius:8px;background:#fff;cursor:pointer}'
      +'.rl-bar .rl-sp{flex:1}'
      +'.rl-btn{font:inherit;font-size:12.5px;font-weight:600;color:#26324a;background:#fff;border:1px solid #dbe1ea;border-radius:8px;padding:6px 11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .12s,border-color .12s}'
      +'.rl-btn:hover{background:#f4f7fb;border-color:#c7d0de}'
      +'.rl-btn .rlic{font-size:13px;line-height:1;color:#7a8699}'
      +'.rl-pager{display:inline-flex;align-items:center;gap:4px}'
      +'.rl-pager button{font:inherit;font-size:12.5px;font-weight:700;min-width:30px;padding:6px 9px;border:1px solid #dbe1ea;border-radius:8px;background:#fff;color:#26324a;cursor:pointer}'
      +'.rl-pager button.on{background:var(--navy,#000E31);color:#fff;border-color:var(--navy,#000E31)}'
      +'.rl-pager button:disabled{opacity:.4;cursor:default}'
      +'.rl-colwrap{position:relative;display:inline-block}'
      +'.rl-colmenu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;background:#fff;border:1px solid #e3e8f0;border-radius:11px;box-shadow:0 14px 40px rgba(12,22,54,.18);padding:7px;min-width:210px;max-height:340px;overflow:auto}'
      +'.rl-colmenu .rl-colhd{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#98a1b5;padding:6px 9px 4px}'
      +'.rl-colopt{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;font-size:13px;color:#26324a;cursor:pointer}'
      +'.rl-colopt:hover{background:#f4f7fb}'
      +'.rl-colopt input{width:15px;height:15px;cursor:pointer;accent-color:var(--red,#DA2B1F)}'
      +'.rl-colhint{font-size:11px;color:#98a1b5;padding:7px 9px 3px;border-top:1px solid #eef1f6;margin-top:5px}'
      +'.rl-bulk{display:flex;align-items:center;gap:10px;background:#fff5f4;border:1px solid #f0cfca;border-radius:9px;padding:7px 12px;margin:0 0 12px;font-size:12.5px}'
      +'.rl-bulk b{color:var(--navy,#000E31)}'
      +'.rl-bulk button{font:inherit;font-size:12px;font-weight:800;padding:6px 12px;border-radius:7px;border:1px solid #cfd6e2;background:#fff;color:#0b1a3a;cursor:pointer}'
      +'.rl-bulk button.danger{background:var(--red,#DA2B1F);border-color:var(--red,#DA2B1F);color:#fff}'
      +'.rl-bulk a{color:#5b6472;cursor:pointer;text-decoration:underline;font-weight:600}'
      +'.rl-wrap{overflow-x:auto}'
      +'.rl-wrap table{width:100%;table-layout:auto;border-collapse:collapse}'
      +'th.rl-th{position:relative;cursor:pointer;user-select:none;white-space:nowrap;font-size:10.5px;letter-spacing:.02em;text-transform:uppercase;color:#8a94a6;font-weight:700;text-align:left;padding:7px 11px;border-bottom:1px solid #e9edf3;background:#fbfcfe}'
      +'th.rl-th.rl-noselect{cursor:default}'
      +'th.rl-th .rl-arrow{color:#c2c9d6;font-size:10px;margin-left:5px}'
      +'th.rl-th.rl-asc .rl-arrow,th.rl-th.rl-desc .rl-arrow{color:var(--red,#DA2B1F)}'
      +'th.rl-th.rl-over{box-shadow:inset 3px 0 0 var(--red,#DA2B1F)}'
      +'th.rl-th.rl-drag{opacity:.45}'
      +'td.rl-ck,th.rl-ck{width:38px;text-align:center;padding-left:8px;padding-right:8px}'
      +'.rl-ck input{width:16px;height:16px;cursor:pointer;vertical-align:middle;accent-color:var(--red,#DA2B1F)}'
      +'.rl-wrap tbody td{padding:7px 11px;border-bottom:1px solid #eef1f6;font-size:13px;color:#1f2a3d;vertical-align:middle}'
      +'.rl-bar .rl-dens{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#5b6472;cursor:pointer;font-weight:600}'
      +'.rl-bar .rl-dens input{width:15px;height:15px;cursor:pointer;accent-color:var(--red,#DA2B1F)}'
      +'.rl-compact .rl-wrap td{padding-top:4px !important;padding-bottom:4px !important;font-size:12.5px}'
      +'.rl-compact .rl-wrap th{padding-top:7px !important;padding-bottom:7px !important}'
      +'.rl-compact .av{width:26px !important;height:26px !important;font-size:10px !important;line-height:26px !important}'
      +'.rl-compact .tags2{display:none !important}'
      +'.rl-compact .who .meta{display:none !important}'
      +'.rl-resize{position:absolute;right:0;top:0;bottom:0;width:8px;cursor:col-resize;z-index:2}'
      +'.rl-resize:hover{background:rgba(0,0,0,.10)}'
      +'tbody tr.rl-tr:hover td{background:#f7faff}'
      +'tbody tr.rl-sel td{background:#eef4ff !important}';
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
      hidden: (saved.hidden&&typeof saved.hidden==='object')?saved.hidden:{},
      page: 0,
      sel: {}
    };
    var keepMenu=false;
    function firstSortable(){ for(var i=0;i<cols.length;i++){ if(cols[i].sortable!==false && cols[i].sort) return i; } return -1; }
    function persist(){ try{ localStorage.setItem(lsKey, JSON.stringify({per:state.per, sort:state.sort, dir:state.dir, compact:state.compact, widths:state.widths, order:orderedMeta().map(function(m){return m.key;}), hidden:state.hidden})); }catch(e){} }

    function orderedMeta(){
      var meta=metaAll(), byKey={}; meta.forEach(function(m){ byKey[m.key]=m; });
      var out=[]; (state.order||[]).forEach(function(k){ if(byKey[k]){ out.push(byKey[k]); byKey[k]=null; } });
      meta.forEach(function(m){ if(byKey[m.key]) out.push(m); });
      return out;
    }
    function visibleMeta(){ return orderedMeta().filter(function(m){ return !state.hidden[m.key]; }); }

    function sortedData(){
      var d = state.data.slice();
      var c = cols[state.sort];
      if(c && c.sort){ d.sort(function(a,b){ return c.sort(a,b)*state.dir; }); }
      return d;
    }
    function pageCount(total){ return Math.max(1, Math.ceil(total/state.per)); }
    function selectedIds(){ return Object.keys(state.sel).filter(function(k){ return state.sel[k]; }); }
    function cellText(c,it){ var d=document.createElement('div'); d.innerHTML=c.cell(it); return (d.textContent||'').replace(/\s+/g,' ').trim(); }

    function render(){
      var all = sortedData();
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
      var colsBtn = '<div class="rl-colwrap"><button class="rl-btn rl-colbtn" title="Choose columns"><span class="rlic">▦</span>Columns</button><div class="rl-colmenu" hidden></div></div>';
      var expBtn = '<button class="rl-btn rl-export" title="Export to CSV"><span class="rlic">⬇</span>Export</button>';
      var prnBtn = '<button class="rl-btn rl-print" title="Print this list"><span class="rlic">⎙</span>Print</button>';
      var bar = '<div class="rl-bar"><span class="rl-sp"></span>'+count+densTog+perSel+colsBtn+expBtn+prnBtn+pager+'</div>';

      var bulk='';
      if(opts.bulk && opts.bulk.length && selIds.length){
        bulk = '<div class="rl-bulk"><b>'+selIds.length+' selected</b>'
          + opts.bulk.map(function(b,i){ return '<button class="rl-bulkBtn'+(b.danger?' danger':'')+'" data-i="'+i+'">'+esc(b.label)+'</button>'; }).join('')
          + '<a class="rl-clear">Clear</a></div>';
      }

      var visibleIds = slice.map(function(it,i){ return rowId(it, start+i); });
      var allChecked = visibleIds.length && visibleIds.every(function(id){ return state.sel[id]; });
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
        var tds = vis.map(function(m){ var c=m.c; var align=c.align?(' style="text-align:'+c.align+'"'):''; return '<td'+(c.cls?(' class="'+c.cls+'"'):'')+align+'>'+c.cell(it)+'</td>'; }).join('');
        return '<tr class="rl-tr'+(state.sel[id]?' rl-sel':'')+'" data-rowid="'+esc(id)+'">'+ck+tds+'</tr>';
      }).join('');

      var table = total ? ('<div class="rl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>')
                        : (opts.empty || '<div class="empty">Nothing here yet.</div>');
      mount.innerHTML = bar + bulk + table;
      mount.classList.toggle('rl-compact', !!state.compact);
      wire();
      if(keepMenu){ keepMenu=false; openColMenu(); }
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
    function openColMenu(){ var menu=$('.rl-colmenu',mount); if(!menu) return; menu.innerHTML=buildColMenu(); menu.hidden=false; menu.querySelectorAll('.rl-coltog').forEach(function(cb){ cb.onchange=function(){ var k=cb.getAttribute('data-key'); if(!cb.checked && visibleMeta().length<=1){ cb.checked=true; return; } if(cb.checked) delete state.hidden[k]; else state.hidden[k]=true; keepMenu=true; persist(); render(); }; }); }

    function exportCsv(){
      var vc=visibleMeta();
      var rows=[ vc.map(function(m){ return m.c.label||''; }) ];
      sortedData().forEach(function(it){ rows.push(vc.map(function(m){ return cellText(m.c,it); })); });
      var csv=rows.map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v; }).join(','); }).join('\r\n');
      var b=new Blob([csv],{type:'text/csv;charset=utf-8'}); var u=URL.createObjectURL(b);
      var a=document.createElement('a'); a.href=u; a.download=listName+'.csv'; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); },120);
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
      mount.querySelectorAll('tbody tr.rl-tr').forEach(function(tr){ tr.addEventListener('click',function(e){ if(e.target.closest('a,button,input,label,.rl-resize')) return; var id=tr.getAttribute('data-rowid'); state.sel[id]=!state.sel[id]; render(); }); });
      mount.querySelectorAll('.rl-resize').forEach(function(h){ h.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); var th=h.parentNode; var key=th.getAttribute('data-key'); th.setAttribute('draggable','false'); var startX=e.clientX, startW=th.offsetWidth; function mm(ev){ var w=Math.max(52, startW+(ev.clientX-startX)); th.style.width=w+'px'; state.widths[key]=w; } function mu(){ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); th.setAttribute('draggable','true'); persist(); } document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); }); h.addEventListener('click',function(e){ e.stopPropagation(); }); });
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
      mount.querySelectorAll('.rl-bulkBtn').forEach(function(b){ b.onclick=function(){ var i=+b.getAttribute('data-i'); var act=opts.bulk[i]; var ids=selectedIds(); if(!ids.length||!act) return; act.fn(ids, function(){ ids.forEach(function(id){ delete state.sel[id]; }); }); }; });
      var colbtn=$('.rl-colbtn',mount); if(colbtn) colbtn.onclick=function(e){ e.stopPropagation(); var menu=$('.rl-colmenu',mount); if(menu.hidden) openColMenu(); else menu.hidden=true; };
      var exp=$('.rl-export',mount); if(exp) exp.onclick=exportCsv;
      var prn=$('.rl-print',mount); if(prn) prn.onclick=printList;
    }

    function currentSlice(){ var all=sortedData(); var start=state.page*state.per; var slice=all.slice(start,start+state.per); return { items:slice, ids:slice.map(function(it,i){ return rowId(it,start+i); }) }; }

    if(!mount.__rlClose){ mount.__rlClose=true; document.addEventListener('click',function(e){ var menu=$('.rl-colmenu',mount); if(menu && !menu.hidden && !e.target.closest('.rl-colwrap')) menu.hidden=true; }); }

    render();
    return { refresh:function(newData){ state.data=newData||[]; state.sel={}; render(); }, getSelected:selectedIds, clearSelection:function(){ state.sel={}; render(); } };
  }

  window.RRGList = { create:create, cmp:cmpVal };
})();
