/* RRG shared list controller — pagination, per-column sorting, select-all, count.
   Usage:
     var ctl = RRGList.create({
       mount: '#body', data: list, key: 'cims', countEl: '#cnt',
       rowId: function(it){ return it.id; },
       columns: [
         { label:'Business', sort:function(a,b){return cmp(a.business,b.business);}, cell:function(it){return '...';} },
         { label:'Status', sort:function(a,b){...}, cell:function(it){return '...';} },
         { label:'Actions', align:'right', sortable:false, cell:function(it){return '...';} }
       ],
       defaultSort: 0, defaultDir: 1,   // column index + 1 asc / -1 desc
       empty: '<div class="empty">Nothing here yet.</div>',
       bulk: [ { label:'Delete selected', danger:true, fn:function(ids, done){ ... done(); } } ]
     });
     ctl.refresh(newList);   // re-render with new data (keeps sort/page, clears selection)
   Notes: filtering stays the page's job — pass the already-filtered array as `data`.
*/
(function(){
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(html){ var d=document.createElement('div'); d.innerHTML=html; return d.firstChild; }
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function cmpVal(a,b){ if(a==null&&b==null)return 0; if(a==null)return -1; if(b==null)return 1;
    if(typeof a==='number'&&typeof b==='number') return a-b;
    return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'}); }

  var STYLE_ID='rrglist-style';
  function injectStyle(){ if(document.getElementById(STYLE_ID)) return;
    var css=''
      +'.rl-bar{display:flex;align-items:center;flex-wrap:wrap;gap:12px 18px;margin:2px 0 12px;font:inherit}'
      +'.rl-bar .rl-count{font-size:12.5px;color:#5b6472;font-weight:600}'
      +'.rl-bar .rl-per{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#5b6472}'
      +'.rl-bar .rl-per select{font:inherit;font-size:12.5px;padding:4px 8px;border:1px solid #cfd6e2;border-radius:7px;background:#fff;cursor:pointer}'
      +'.rl-bar .rl-sp{flex:1}'
      +'.rl-pager{display:inline-flex;align-items:center;gap:4px}'
      +'.rl-pager button{font:inherit;font-size:12.5px;font-weight:700;min-width:30px;padding:5px 9px;border:1px solid #cfd6e2;border-radius:7px;background:#fff;color:#0b1a3a;cursor:pointer}'
      +'.rl-pager button.on{background:#000E31;color:#fff;border-color:#000E31}'
      +'.rl-pager button:disabled{opacity:.4;cursor:default}'
      +'.rl-bulk{display:flex;align-items:center;gap:10px;background:#fff5f4;border:1px solid #f0cfca;border-radius:9px;padding:7px 12px;margin:0 0 12px;font-size:12.5px}'
      +'.rl-bulk b{color:#000E31}'
      +'.rl-bulk button{font:inherit;font-size:12px;font-weight:800;padding:6px 12px;border-radius:7px;border:1px solid #cfd6e2;background:#fff;color:#0b1a3a;cursor:pointer}'
      +'.rl-bulk button.danger{background:#DA2B1F;border-color:#DA2B1F;color:#fff}'
      +'.rl-bulk a{color:#5b6472;cursor:pointer;text-decoration:underline;font-weight:600}'
      +'th.rl-th{cursor:pointer;user-select:none;white-space:nowrap}'
      +'th.rl-th.rl-noselect{cursor:default}'
      +'th.rl-th .rl-arrow{color:#b0b8c6;font-size:11px;margin-left:5px}'
      +'th.rl-th.rl-asc .rl-arrow,th.rl-th.rl-desc .rl-arrow{color:#DA2B1F}'
      +'td.rl-ck,th.rl-ck{width:34px;text-align:center;padding-left:6px;padding-right:6px}'
      +'.rl-ck input{width:16px;height:16px;cursor:pointer;vertical-align:middle}'
      +'.rl-bar .rl-dens{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#5b6472;cursor:pointer;font-weight:600}'
      +'.rl-bar .rl-dens input{width:15px;height:15px;cursor:pointer;accent-color:#DA2B1F}'
      +'.rl-compact table td{padding-top:5px !important;padding-bottom:5px !important;font-size:12.5px}'
      +'.rl-compact table th{padding-top:6px !important;padding-bottom:6px !important}'
      +'.rl-compact .av{width:26px !important;height:26px !important;font-size:10px !important;line-height:26px !important}'
      +'.rl-compact .tags2{display:none !important}'
      +'.rl-compact .who .meta{display:none !important}'
      +'th.rl-th{position:relative}'
      +'.rl-resize{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:col-resize;z-index:2}'
      +'.rl-resize:hover{background:rgba(0,0,0,.10)}'
      +'tbody tr.rl-tr:hover td{background:#fbfcfe}'
      +'tbody tr.rl-sel td{background:#eef4ff !important}'
      +'table{table-layout:auto}';
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
    var saved = {}; try{ saved=JSON.parse(localStorage.getItem(lsKey)||'{}')||{}; }catch(e){}

    var state = {
      data: opts.data||[],
      per: PER_OPTS.indexOf(saved.per)>=0 ? saved.per : (opts.per||20),
      sort: (saved.sort!=null ? saved.sort : (opts.defaultSort!=null?opts.defaultSort:firstSortable())),
      dir: (saved.dir!=null ? saved.dir : (opts.defaultDir||1)),
      compact: !!saved.compact,
      widths: (saved.widths&&typeof saved.widths==='object')?saved.widths:{},
      page: 0,
      sel: {}
    };
    function firstSortable(){ for(var i=0;i<cols.length;i++){ if(cols[i].sortable!==false && cols[i].sort) return i; } return -1; }
    function persist(){ try{ localStorage.setItem(lsKey, JSON.stringify({per:state.per, sort:state.sort, dir:state.dir, compact:state.compact, widths:state.widths})); }catch(e){} }

    function sortedData(){
      var d = state.data.slice();
      var c = cols[state.sort];
      if(c && c.sort){ d.sort(function(a,b){ return c.sort(a,b)*state.dir; }); }
      return d;
    }
    function pageCount(total){ return Math.max(1, Math.ceil(total/state.per)); }
    function selectedIds(){ return Object.keys(state.sel).filter(function(k){ return state.sel[k]; }); }

    function render(){
      var all = sortedData();
      var total = all.length;
      var pc = pageCount(total);
      if(state.page>=pc) state.page=pc-1; if(state.page<0) state.page=0;
      var start = state.page*state.per;
      var slice = all.slice(start, start+state.per);
      var showFrom = total? (start+1):0, showTo = Math.min(start+state.per, total);

      if(countEl) countEl.textContent = total ? (total+' total') : '';

      if(!total){ mount.innerHTML = opts.empty || '<div class="empty">Nothing here yet.</div>'; return; }

      var selIds = selectedIds();
      // controls bar
      var perSel = '<span class="rl-per">Rows <select class="rl-perSel">'
        + PER_OPTS.map(function(n){ return '<option value="'+n+'"'+(n===state.per?' selected':'')+'>'+(n>=100000?'All':n)+'</option>'; }).join('')
        + '</select></span>';
      var count = '<span class="rl-count">Showing '+showFrom+'–'+showTo+' of '+total+'</span>';
      var pager = '<span class="rl-pager">'
        + '<button class="rl-prev"'+(state.page===0?' disabled':'')+'>‹</button>'
        + pageButtons(pc)
        + '<button class="rl-next"'+(state.page>=pc-1?' disabled':'')+'>›</button></span>';
      var densTog = '<label class="rl-dens" title="Compact rows"><input type="checkbox" class="rl-densCk"'+(state.compact?' checked':'')+'> Compact</label>';
      var bar = '<div class="rl-bar">'+'<span class="rl-sp"></span>'+count+densTog+perSel+pager+'</div>';

      // bulk bar
      var bulk='';
      if(opts.bulk && opts.bulk.length && selIds.length){
        bulk = '<div class="rl-bulk"><b>'+selIds.length+' selected</b>'
          + opts.bulk.map(function(b,i){ return '<button class="rl-bulkBtn'+(b.danger?' danger':'')+'" data-i="'+i+'">'+esc(b.label)+'</button>'; }).join('')
          + '<a class="rl-clear">Clear</a></div>';
      }

      // header
      var visibleIds = slice.map(function(it,i){ return rowId(it, start+i); });
      var allChecked = visibleIds.length && visibleIds.every(function(id){ return state.sel[id]; });
      var head = '<th class="rl-ck"><input type="checkbox" class="rl-all"'+(allChecked?' checked':'')+' title="Select all on this page"></th>';
      head += cols.map(function(c,ci){
        var sortable = c.sortable!==false && c.sort;
        var cls='rl-th'+(sortable?'':' rl-noselect')+(state.sort===ci?(state.dir>0?' rl-asc':' rl-desc'):'');
        var arrow = sortable ? '<span class="rl-arrow">'+(state.sort===ci?(state.dir>0?'▲':'▼'):'↕')+'</span>' : '';
        var w = (state.widths[ci]!=null) ? state.widths[ci] : (c.width||null);
        var style = (c.align?('text-align:'+c.align+';'):'')+(w?('width:'+w+'px;'):'');
        return '<th class="'+cls+(c.cls?(' '+c.cls):'')+'" data-ci="'+ci+'"'+(style?(' style="'+style+'"'):'')+'>'+esc(c.label)+arrow+'<span class="rl-resize" data-ci="'+ci+'"></span></th>';
      }).join('');

      // rows
      var body = slice.map(function(it,i){
        var id = visibleIds[i];
        var ck = '<td class="rl-ck"><input type="checkbox" class="rl-row" data-id="'+esc(id)+'"'+(state.sel[id]?' checked':'')+'></td>';
        var tds = cols.map(function(c){ var align=c.align?(' style="text-align:'+c.align+'"'):''; return '<td'+(c.cls?(' class="'+c.cls+'"'):'')+align+'>'+c.cell(it)+'</td>'; }).join('');
        return '<tr class="rl-tr'+(state.sel[id]?' rl-sel':'')+'" data-rowid="'+esc(id)+'">'+ck+tds+'</tr>';
      }).join('');

      mount.innerHTML = bar + bulk + '<table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table>';
      mount.classList.toggle('rl-compact', !!state.compact);
      wire();
    }

    function pageButtons(pc){
      // compact window of page numbers around current
      var btns=[], cur=state.page;
      var win=[]; for(var p=0;p<pc;p++){ if(p===0||p===pc-1||Math.abs(p-cur)<=1) win.push(p); }
      var last=-1;
      win.forEach(function(p){ if(p-last>1) btns.push('<button disabled>…</button>'); btns.push('<button class="rl-pg'+(p===cur?' on':'')+'" data-p="'+p+'">'+(p+1)+'</button>'); last=p; });
      return btns.join('');
    }

    function wire(){
      var all=$('.rl-all',mount); if(all) all.onclick=function(){
        var slice = currentSlice();
        var ids = slice.ids;
        var on = all.checked; ids.forEach(function(id){ state.sel[id]=on; }); render();
      };
      mount.querySelectorAll('.rl-row').forEach(function(cb){ cb.onclick=function(){ state.sel[cb.getAttribute('data-id')]=cb.checked; render(); }; });
      mount.querySelectorAll('tbody tr.rl-tr').forEach(function(tr){ tr.addEventListener('click',function(e){ if(e.target.closest('a,button,input,label,.rl-resize')) return; var id=tr.getAttribute('data-rowid'); state.sel[id]=!state.sel[id]; render(); }); });
      mount.querySelectorAll('.rl-resize').forEach(function(h){ h.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); var ci=+h.getAttribute('data-ci'); var th=h.parentNode; var startX=e.clientX, startW=th.offsetWidth; function mm(ev){ var w=Math.max(48, startW+(ev.clientX-startX)); th.style.width=w+'px'; state.widths[ci]=w; } function mu(){ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); persist(); } document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); }); h.addEventListener('click',function(e){ e.stopPropagation(); }); });
      mount.querySelectorAll('th.rl-th').forEach(function(th){ if(th.classList.contains('rl-noselect')) return; th.onclick=function(){
        var ci=+th.getAttribute('data-ci'); if(state.sort===ci){ state.dir=-state.dir; } else { state.sort=ci; state.dir=1; } persist(); render();
      }; });
      var densCk=$('.rl-densCk',mount); if(densCk) densCk.onchange=function(){ state.compact=densCk.checked; persist(); render(); };
      var perSel=$('.rl-perSel',mount); if(perSel) perSel.onchange=function(){ state.per=+perSel.value; state.page=0; persist(); render(); };
      var prev=$('.rl-prev',mount); if(prev) prev.onclick=function(){ if(state.page>0){ state.page--; render(); } };
      var next=$('.rl-next',mount); if(next) next.onclick=function(){ state.page++; render(); };
      mount.querySelectorAll('.rl-pg').forEach(function(b){ b.onclick=function(){ state.page=+b.getAttribute('data-p'); render(); }; });
      var clr=$('.rl-clear',mount); if(clr) clr.onclick=function(){ state.sel={}; render(); };
      mount.querySelectorAll('.rl-bulkBtn').forEach(function(b){ b.onclick=function(){
        var i=+b.getAttribute('data-i'); var act=opts.bulk[i]; var ids=selectedIds(); if(!ids.length||!act) return;
        act.fn(ids, function(){ ids.forEach(function(id){ delete state.sel[id]; }); });
      }; });
    }

    function currentSlice(){
      var all=sortedData(); var start=state.page*state.per; var slice=all.slice(start,start+state.per);
      return { items:slice, ids:slice.map(function(it,i){ return rowId(it,start+i); }) };
    }

    render();
    return {
      refresh:function(newData){ state.data=newData||[]; state.sel={}; render(); },
      getSelected:selectedIds,
      clearSelection:function(){ state.sel={}; render(); }
    };
  }

  window.RRGList = { create:create, cmp:cmpVal };
})();
