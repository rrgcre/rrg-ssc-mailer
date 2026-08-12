/* RRGFilters — reusable advanced-filter window + saved searches for any list.
   Usage:
     var F = RRGFilters.create({
       list:'companies',                 // key for saved searches
       button: document.getElementById('filterBtn'),
       isAdmin: function(){ return IS_ADMIN; },
       fields: [
         { key:'types', label:'Type', type:'multi', options:function(){return CTYPES;}, get:function(c){return c.type||'';} },
         { key:'owners', label:'Owner', type:'multi', options:distinctOwners, get:function(c){return c.owner||'';} },
         { key:'created', label:'Created', type:'daterange', get:function(c){return c.createdAt||'';} },
         { key:'vip', label:'VIP only', type:'bool', get:function(c){return c.vip;} },
         { key:'tags', label:'Tags', type:'tags', options:allTags, get:function(c){return c.tags||[];} }
       ],
       onChange: applyFilter
     });
     // then in applyFilter: var list = F.filter(ALL); ...search... ; F.updateBtn();
*/
(function(){
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function injectCss(){ if(document.getElementById('rlf-css')) return; var st=document.createElement('style'); st.id='rlf-css';
    st.textContent='.rlf-btn{margin-left:8px;background:#fff;border:1px solid #c4ccda;border-radius:4px;padding:8px 12px;font:inherit;font-size:12.5px;font-weight:700;color:#20334f;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}'
    +'.rlf-btn.on{border-color:#20334f;background:#eef2f7;}'
    +'.rlf-badge{background:#20334f;color:#fff;font-size:11px;font-weight:800;border-radius:3px;padding:1px 6px;}'
    +'.rlf-ov{position:fixed;inset:0;background:rgba(11,26,56,.5);display:flex;align-items:center;justify-content:center;z-index:400;padding:20px;}'
    +'.rlf-card{background:#fff;border:1px solid #dbe0e9;border-radius:6px;width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(11,26,56,.28);overflow:hidden;}'
    +'.rlf-h{padding:15px 22px;font-size:15px;font-weight:700;color:#20334f;border-bottom:1px solid #dbe0e9;}'
    +'.rlf-b{padding:16px 22px;overflow:auto;}'
    +'.rlf-f{display:flex;gap:9px;justify-content:flex-end;padding:13px 22px;border-top:1px solid #dbe0e9;flex-wrap:wrap;}'
    +'.rlf-grp{margin-bottom:15px;} .rlf-grp2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;}'
    +'.rlf-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#8a93a3;font-weight:800;margin-bottom:6px;}'
    +'.rlf-wrap{display:flex;flex-wrap:wrap;gap:6px 14px;}'
    +'.rlf-wrap.rlf-scroll{max-height:184px;overflow:auto;border:1px solid #dbe0e9;border-radius:4px;padding:10px 12px;gap:8px 14px;align-content:flex-start;background:#fbfcfe;}'
    +'.rlf-chk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#2b3648;cursor:pointer;white-space:nowrap;}'
    +'.rlf-in{width:100%;box-sizing:border-box;border:1px solid #c4ccda;border-radius:4px;padding:8px 10px;font:inherit;font-size:13px;}'
    +'.rlf-search{margin-bottom:8px;}'
    +'.rlf-selnote{font-size:11.5px;color:#5f6a7d;font-weight:600;margin-top:6px;}'
    +'.rlf-btn2{background:#20334f;color:#fff;border:1px solid #20334f;border-radius:3px;padding:9px 16px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;} .rlf-btn2.ghost{background:#fff;color:#5f6a7d;border-color:#c4ccda;}'
    +'.rlf-srow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #eef1f6;font-size:13px;}'
    +'.rlf-snm{flex:1;cursor:pointer;color:#2c5c8f;font-weight:600;} .rlf-snm:hover{text-decoration:underline;}'
    +'.rlf-sx{border:none;background:none;color:#c7cedb;cursor:pointer;font-size:14px;} .rlf-sx:hover{color:#b23a2c;}'
    +'.rlf-muted{color:#8a93a3;font-size:12px;}';
    document.head.appendChild(st); }

  function create(cfg){
    injectCss();
    var fields=cfg.fields||[]; var SAVED=[];
    function blank(k){ var f=byKey(k); return f.type==='daterange'?{from:'',to:''}:(f.type==='bool'?false:[]); }
    function byKey(k){ for(var i=0;i<fields.length;i++){ if(fields[i].key===k) return fields[i]; } return {}; }
    function empty(){ var o={}; fields.forEach(function(f){ o[f.key]= f.type==='daterange'?{from:'',to:''}:(f.type==='bool'?false:[]); }); return o; }
    var FILTERS=empty();
    function activeCount(){ var n=0; fields.forEach(function(f){ var v=FILTERS[f.key]; if(f.type==='daterange'){ if(v&&(v.from||v.to)) n++; } else if(f.type==='bool'){ if(v) n++; } else { if(v&&v.length) n++; } }); return n; }
    function matchItem(it){ return fields.every(function(f){ var v=FILTERS[f.key];
      if(f.type==='daterange'){ var d=String(f.get(it)||'').slice(0,10); if(v.from&&(!d||d<v.from)) return false; if(v.to&&d&&d>v.to) return false; return true; }
      if(f.type==='bool'){ return !v || !!f.get(it); }
      if(f.type==='tags'){ if(!v.length) return true; var tg=(f.get(it)||[]).map(function(x){return String(x).toLowerCase();}); return v.every(function(t){return tg.indexOf(String(t).toLowerCase())>=0;}); }
      if(f.type==='multiany'){ if(!v.length) return true; var vals=(f.get?f.get(it):it[f.key]||[])||[]; vals=(Array.isArray(vals)?vals:[vals]).map(function(x){return String(x).toLowerCase();}); return v.some(function(x){return vals.indexOf(String(x).toLowerCase())>=0;}); }
      if(f.type==='bools'){ if(!v.length) return true; return v.every(function(sk){ var sub=(f.items||[]).filter(function(x){return x.key===sk;})[0]; return sub?!!sub.get(it):true; }); }
      if(!v.length) return true; var val=f.get?f.get(it):it[f.key]; return v.indexOf(val)>=0;
    }); }
    function filter(data){ return (data||[]).filter(matchItem); }
    function updateBtn(){ var b=cfg.button; if(!b) return; var n=activeCount(); b.innerHTML='⚙ Filters'+(n?(' <span class="rlf-badge">'+n+'</span>'):''); b.classList.toggle('on',!!n); }
    function opts(arr,sel){ var sl=(sel||[]).map(function(s){return String(s).toLowerCase();}); return arr.length?arr.map(function(x){ return '<label class="rlf-chk"><input type="checkbox" value="'+esc(x)+'"'+(sl.indexOf(String(x).toLowerCase())>=0?' checked':'')+'> '+esc(x)+'</label>'; }).join(''):'<span class="rlf-muted">None on record</span>'; }
    function open(){
      var ov=document.createElement('div'); ov.className='rlf-ov';
      var body='';
      fields.forEach(function(f){
        if(f.type==='multi'||f.type==='multiany'){ var items=(f.options?f.options():[])||[]; var seen={}, disp=[]; items.forEach(function(x){ if(x==null||x==='') return; var k=String(x).toLowerCase(); if(!seen[k]){ seen[k]=1; disp.push(x); } }); disp.sort(function(a,b){ return String(a).toLowerCase().localeCompare(String(b).toLowerCase()); }); var searchable=disp.length>10; var selN=(FILTERS[f.key]||[]).length; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+'</div>'+(searchable?('<input type="text" class="rlf-in rlf-search" data-search-for="'+esc(f.key)+'" placeholder="Search '+esc(String(f.label).toLowerCase())+'…" autocomplete="off">'):'')+'<div class="rlf-wrap'+(searchable?' rlf-scroll':'')+'" data-fk="'+esc(f.key)+'">'+opts(disp,FILTERS[f.key])+'</div>'+(searchable?('<div class="rlf-selnote" data-selnote="'+esc(f.key)+'">'+selN+' selected</div>'):'')+'</div>'; }
        else if(f.type==='daterange'){ var v=FILTERS[f.key]||{}; body+='<div class="rlf-grp2"><div><div class="rlf-lbl">'+esc(f.label)+' from</div><input type="date" class="rlf-in" data-fk="'+esc(f.key)+'" data-part="from" value="'+esc(v.from||'')+'"></div><div><div class="rlf-lbl">'+esc(f.label)+' to</div><input type="date" class="rlf-in" data-fk="'+esc(f.key)+'" data-part="to" value="'+esc(v.to||'')+'"></div></div>'; }
        else if(f.type==='bool'){ body+='<div class="rlf-grp"><label class="rlf-chk"><input type="checkbox" data-fk="'+esc(f.key)+'"'+(FILTERS[f.key]?' checked':'')+'> '+esc(f.label)+'</label></div>'; }
        else if(f.type==='bools'){ var bsel=FILTERS[f.key]||[]; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+'</div><div class="rlf-wrap">'+(f.items||[]).map(function(it2){ return '<label class="rlf-chk"><input type="checkbox" data-fk="'+esc(f.key)+'" data-sub="'+esc(it2.key)+'"'+(bsel.indexOf(it2.key)>=0?' checked':'')+'> '+esc(it2.label)+'</label>'; }).join('')+'</div></div>'; }
        else if(f.type==='tags'){ var tl=(f.options?f.options():[])||[]; var dlid='rlf_dl_'+f.key; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+' (comma-separated, matches all)</div><input class="rlf-in" data-fk="'+esc(f.key)+'" data-tags="1" list="'+dlid+'" value="'+esc((FILTERS[f.key]||[]).join(', '))+'"><datalist id="'+dlid+'">'+tl.map(function(t){return '<option value="'+esc(t)+'">';}).join('')+'</datalist></div>'; }
      });
      ov.innerHTML='<div class="rlf-card"><div class="rlf-h">Filter '+esc(cfg.title||cfg.list||'list')+'</div><div class="rlf-b"><div class="rlf-grp" data-saved="1"></div>'+body+'</div>'
        +'<div class="rlf-f"><button class="rlf-btn2 ghost" data-act="clear">Clear all</button><button class="rlf-btn2 ghost" data-act="save">Save search…</button><button class="rlf-btn2 ghost" data-act="close">Close</button><button class="rlf-btn2" data-act="apply">Apply</button></div></div>';
      document.body.appendChild(ov);
      // Live search inside big option lists + running selected count.
      ov.querySelectorAll('.rlf-search').forEach(function(si){ si.addEventListener('input',function(){ var q=si.value.trim().toLowerCase(); var wrap=ov.querySelector('.rlf-wrap[data-fk="'+si.getAttribute('data-search-for')+'"]'); if(!wrap) return; wrap.querySelectorAll('.rlf-chk').forEach(function(lb){ var t=(lb.textContent||'').toLowerCase(); lb.style.display=(!q||t.indexOf(q)>=0)?'':'none'; }); }); });
      ov.querySelectorAll('.rlf-wrap[data-fk]').forEach(function(wrap){ var note=ov.querySelector('.rlf-selnote[data-selnote="'+wrap.getAttribute('data-fk')+'"]'); if(!note) return; wrap.addEventListener('change',function(){ note.textContent=wrap.querySelectorAll('input:checked').length+' selected'; }); });
      function close(){ ov.remove(); }
      ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
      function collect(){ fields.forEach(function(f){
        if(f.type==='multi'||f.type==='multiany'){ var arr=[]; ov.querySelectorAll('.rlf-wrap[data-fk="'+f.key+'"] input:checked').forEach(function(c){ arr.push(c.value); }); FILTERS[f.key]=arr; }
        else if(f.type==='bools'){ var barr=[]; ov.querySelectorAll('input[data-fk="'+f.key+'"][data-sub]:checked').forEach(function(c){ barr.push(c.getAttribute('data-sub')); }); FILTERS[f.key]=barr; }
        else if(f.type==='daterange'){ var fr=ov.querySelector('[data-fk="'+f.key+'"][data-part="from"]'), to=ov.querySelector('[data-fk="'+f.key+'"][data-part="to"]'); FILTERS[f.key]={from:fr?fr.value:'',to:to?to.value:''}; }
        else if(f.type==='bool'){ var cb=ov.querySelector('input[data-fk="'+f.key+'"]'); FILTERS[f.key]=!!(cb&&cb.checked); }
        else if(f.type==='tags'){ var ti=ov.querySelector('input[data-fk="'+f.key+'"][data-tags]'); FILTERS[f.key]=(ti?ti.value:'').split(',').map(function(x){return x.trim();}).filter(Boolean); }
      }); }
      ov.querySelector('[data-act="close"]').addEventListener('click',close);
      ov.querySelector('[data-act="clear"]').addEventListener('click',function(){ FILTERS=empty(); close(); if(cfg.onChange) cfg.onChange(); });
      ov.querySelector('[data-act="apply"]').addEventListener('click',function(){ collect(); close(); if(cfg.onChange) cfg.onChange(); });
      ov.querySelector('[data-act="save"]').addEventListener('click',async function(){ collect(); var name=prompt('Name this saved search:'); if(name===null) return; name=name.trim(); if(!name) return; var shared=await rrgConfirm('Share this saved search with the whole team?\n\nOK = shared with team · Cancel = just me'); fetch('/api/saved-searches',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({list:cfg.list,name:name,shared:shared,payload:FILTERS})}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ renderSaved(ov); } else alert((j&&j.error)||'Could not save.'); }); });
      renderSaved(ov);
    }
    function renderSaved(ov){ var w=ov.querySelector('[data-saved]'); if(!w) return; var admin=cfg.isAdmin?cfg.isAdmin():false;
      w.innerHTML='<div class="rlf-lbl">Saved searches</div><div class="rlf-muted">Loading…</div>';
      fetch('/api/saved-searches?list='+encodeURIComponent(cfg.list),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){ SAVED=(j&&j.searches)||[];
        if(!SAVED.length){ w.innerHTML='<div class="rlf-lbl">Saved searches</div><div class="rlf-muted">None yet — set filters, then Save search.</div>'; return; }
        w.innerHTML='<div class="rlf-lbl">Saved searches</div>'+SAVED.map(function(sc,i){ var tag=sc.shared?('shared'+(sc.mine?'':(' by '+esc(sc.ownerName)))):'personal'; return '<div class="rlf-srow"><span class="rlf-snm" data-load="'+i+'">'+esc(sc.name)+' <span class="rlf-muted">· '+tag+'</span></span>'+((sc.mine||admin)?'<button class="rlf-sx" data-del="'+esc(sc.id)+'" title="Delete">✕</button>':'')+'</div>'; }).join('');
        w.querySelectorAll('.rlf-snm[data-load]').forEach(function(el){ el.addEventListener('click',function(){ var sc=SAVED[+el.getAttribute('data-load')]; if(!sc) return; FILTERS=Object.assign(empty(), sc.payload||{}); ov.remove(); if(cfg.onChange) cfg.onChange(); }); });
        w.querySelectorAll('.rlf-sx[data-del]').forEach(function(b){ b.addEventListener('click',async function(){ if(!await rrgConfirm('Delete this saved search?')) return; fetch('/api/saved-searches/'+encodeURIComponent(b.getAttribute('data-del')),{method:'DELETE',credentials:'same-origin'}).then(function(r){return r.json();}).then(function(){ renderSaved(ov); }); }); });
      }).catch(function(){ w.innerHTML='<div class="rlf-lbl">Saved searches</div><div class="rlf-muted">Could not load.</div>'; });
    }
    if(cfg.button){ cfg.button.addEventListener('click',open); }
    return { filter:filter, open:open, updateBtn:updateBtn, activeCount:activeCount, getFilters:function(){return FILTERS;}, clear:function(){ FILTERS=empty(); } };
  }
  window.RRGFilters={ create:create };
})();
