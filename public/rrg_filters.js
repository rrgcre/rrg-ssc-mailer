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
    st.textContent='.rlf-btn{margin-left:8px;background:#fff;border:1px solid #cfd6e2;border-radius:9px;padding:9px 13px;font:inherit;font-size:12.5px;font-weight:700;color:#000E31;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}'
    +'.rlf-btn.on{border-color:#000E31;background:#eef2f9;}'
    +'.rlf-badge{background:#DA2B1F;color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:1px 7px;}'
    +'.rlf-ov{position:fixed;inset:0;background:rgba(6,14,32,.55);display:flex;align-items:center;justify-content:center;z-index:400;padding:20px;}'
    +'.rlf-card{background:#fff;border-radius:16px;width:100%;max-width:660px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;}'
    +'.rlf-h{padding:16px 22px;font-size:16px;font-weight:800;color:#000E31;border-bottom:1px solid #e6e9f0;}'
    +'.rlf-b{padding:16px 22px;overflow:auto;}'
    +'.rlf-f{display:flex;gap:9px;justify-content:flex-end;padding:14px 22px;border-top:1px solid #e6e9f0;flex-wrap:wrap;}'
    +'.rlf-grp{margin-bottom:14px;} .rlf-grp2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}'
    +'.rlf-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#8a93a8;font-weight:700;margin-bottom:6px;}'
    +'.rlf-wrap{display:flex;flex-wrap:wrap;gap:6px 14px;}'
    +'.rlf-chk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#26324a;cursor:pointer;}'
    +'.rlf-in{width:100%;box-sizing:border-box;border:1px solid #cfd6e2;border-radius:9px;padding:8px 10px;font:inherit;font-size:13px;}'
    +'.rlf-btn2{background:#000E31;color:#fff;border:1px solid #000E31;border-radius:9px;padding:10px 17px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;} .rlf-btn2.ghost{background:#fff;color:#6b7488;border-color:#e6e9f0;}'
    +'.rlf-srow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #eef1f6;font-size:13px;}'
    +'.rlf-snm{flex:1;cursor:pointer;color:#2647b0;font-weight:600;} .rlf-snm:hover{text-decoration:underline;}'
    +'.rlf-sx{border:none;background:none;color:#c7cedb;cursor:pointer;font-size:14px;} .rlf-sx:hover{color:#DA2B1F;}'
    +'.rlf-muted{color:#98a1b5;font-size:12px;}';
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
      if(f.type==='multiany'){ if(!v.length) return true; var vals=(f.get?f.get(it):it[f.key]||[])||[]; vals=(Array.isArray(vals)?vals:[vals]).map(String); return v.some(function(x){return vals.indexOf(String(x))>=0;}); }
      if(!v.length) return true; var val=f.get?f.get(it):it[f.key]; return v.indexOf(val)>=0;
    }); }
    function filter(data){ return (data||[]).filter(matchItem); }
    function updateBtn(){ var b=cfg.button; if(!b) return; var n=activeCount(); b.innerHTML='⚙ Filters'+(n?(' <span class="rlf-badge">'+n+'</span>'):''); b.classList.toggle('on',!!n); }
    function opts(arr,sel){ return arr.length?arr.map(function(x){ return '<label class="rlf-chk"><input type="checkbox" value="'+esc(x)+'"'+(sel.indexOf(x)>=0?' checked':'')+'> '+esc(x)+'</label>'; }).join(''):'<span class="rlf-muted">None on record</span>'; }
    function open(){
      var ov=document.createElement('div'); ov.className='rlf-ov';
      var body='';
      fields.forEach(function(f){
        if(f.type==='multi'||f.type==='multiany'){ var items=(f.options?f.options():[])||[]; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+'</div><div class="rlf-wrap" data-fk="'+esc(f.key)+'">'+opts(items,FILTERS[f.key])+'</div></div>'; }
        else if(f.type==='daterange'){ var v=FILTERS[f.key]||{}; body+='<div class="rlf-grp2"><div><div class="rlf-lbl">'+esc(f.label)+' from</div><input type="date" class="rlf-in" data-fk="'+esc(f.key)+'" data-part="from" value="'+esc(v.from||'')+'"></div><div><div class="rlf-lbl">'+esc(f.label)+' to</div><input type="date" class="rlf-in" data-fk="'+esc(f.key)+'" data-part="to" value="'+esc(v.to||'')+'"></div></div>'; }
        else if(f.type==='bool'){ body+='<div class="rlf-grp"><label class="rlf-chk"><input type="checkbox" data-fk="'+esc(f.key)+'"'+(FILTERS[f.key]?' checked':'')+'> '+esc(f.label)+'</label></div>'; }
        else if(f.type==='tags'){ var tl=(f.options?f.options():[])||[]; var dlid='rlf_dl_'+f.key; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+' (comma-separated, matches all)</div><input class="rlf-in" data-fk="'+esc(f.key)+'" data-tags="1" list="'+dlid+'" value="'+esc((FILTERS[f.key]||[]).join(', '))+'"><datalist id="'+dlid+'">'+tl.map(function(t){return '<option value="'+esc(t)+'">';}).join('')+'</datalist></div>'; }
      });
      ov.innerHTML='<div class="rlf-card"><div class="rlf-h">Filter '+esc(cfg.title||cfg.list||'list')+'</div><div class="rlf-b">'+body+'<div class="rlf-grp" data-saved="1"></div></div>'
        +'<div class="rlf-f"><button class="rlf-btn2 ghost" data-act="clear">Clear all</button><button class="rlf-btn2 ghost" data-act="save">Save search…</button><button class="rlf-btn2 ghost" data-act="close">Close</button><button class="rlf-btn2" data-act="apply">Apply</button></div></div>';
      document.body.appendChild(ov);
      function close(){ ov.remove(); }
      ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
      function collect(){ fields.forEach(function(f){
        if(f.type==='multi'||f.type==='multiany'){ var arr=[]; ov.querySelectorAll('[data-fk="'+f.key+'"] input:checked').forEach(function(c){ arr.push(c.value); }); FILTERS[f.key]=arr; }
        else if(f.type==='daterange'){ var fr=ov.querySelector('[data-fk="'+f.key+'"][data-part="from"]'), to=ov.querySelector('[data-fk="'+f.key+'"][data-part="to"]'); FILTERS[f.key]={from:fr?fr.value:'',to:to?to.value:''}; }
        else if(f.type==='bool'){ var cb=ov.querySelector('input[data-fk="'+f.key+'"]'); FILTERS[f.key]=!!(cb&&cb.checked); }
        else if(f.type==='tags'){ var ti=ov.querySelector('input[data-fk="'+f.key+'"][data-tags]'); FILTERS[f.key]=(ti?ti.value:'').split(',').map(function(x){return x.trim();}).filter(Boolean); }
      }); }
      ov.querySelector('[data-act="close"]').addEventListener('click',close);
      ov.querySelector('[data-act="clear"]').addEventListener('click',function(){ FILTERS=empty(); close(); if(cfg.onChange) cfg.onChange(); });
      ov.querySelector('[data-act="apply"]').addEventListener('click',function(){ collect(); close(); if(cfg.onChange) cfg.onChange(); });
      ov.querySelector('[data-act="save"]').addEventListener('click',function(){ collect(); var name=prompt('Name this saved search:'); if(name===null) return; name=name.trim(); if(!name) return; var shared=confirm('Share this saved search with the whole team?\n\nOK = shared with team · Cancel = just me'); fetch('/api/saved-searches',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({list:cfg.list,name:name,shared:shared,payload:FILTERS})}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ renderSaved(ov); } else alert((j&&j.error)||'Could not save.'); }); });
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
