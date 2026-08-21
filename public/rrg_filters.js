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
    +'.rlf-badge{background:#20334f;color:#fff;font-size:11px;font-weight:700;border-radius:3px;padding:1px 6px;}'
    +'.rlf-ov{position:fixed;inset:0;background:rgba(11,26,56,.5);display:flex;align-items:center;justify-content:center;z-index:400;padding:20px;}'
    +'.rlf-card{background:#fff;border:1px solid #dbe0e9;border-radius:6px;width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(11,26,56,.28);overflow:hidden;}'
    +'.rlf-h{padding:15px 22px;font-size:15px;font-weight:700;color:#20334f;border-bottom:1px solid #dbe0e9;}'
    +'.rlf-b{padding:16px 22px;overflow:auto;}'
    +'.rlf-f{display:flex;gap:9px;justify-content:flex-end;padding:13px 22px;border-top:1px solid #dbe0e9;flex-wrap:wrap;}'
    +'.rlf-grp{margin-bottom:15px;} .rlf-grp2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;}'
    +'.rlf-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#8a93a3;font-weight:700;margin-bottom:6px;}'
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
    +'.rlf-muted{color:#8a93a3;font-size:12px;}'
    +'.rlf-tfhost{position:relative;}'
    +'.rlf-tf{border:1px solid #c4ccda;border-radius:4px;background:#fff;padding:5px 6px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;position:relative;min-height:38px;cursor:text;}'
    +'.rlf-tf:focus-within{border-color:#2c5c8f;box-shadow:0 0 0 2px rgba(44,92,143,.12);}'
    +'.rlf-tf .tchip{display:inline-flex;align-items:center;gap:6px;background:#eef2f8;color:#23496f;border:1px solid #d3ddf3;border-radius:3px;padding:3px 4px 3px 8px;font-size:12px;font-weight:700;line-height:1.3;}'
    +'.rlf-tf .tchip button{background:none;border:none;color:#7a869c;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;}'
    +'.rlf-tf .tchip button:hover{color:#b23a2c;}'
    +'.rlf-tf input{flex:1;min-width:120px;border:none;outline:none;font:inherit;font-size:13px;padding:4px 2px;background:transparent;color:#2b3648;}'
    +'.rlf-tfmenu{position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #dbe0e9;border-radius:5px;box-shadow:0 12px 30px rgba(11,26,56,.16);z-index:60;max-height:240px;overflow:auto;}'
    +'.rlf-tfmenu[hidden]{display:none;}'
    +'.rlf-tfmenu div{padding:8px 11px;font-size:13px;color:#2b3648;cursor:pointer;}'
    +'.rlf-tfmenu div.sel{background:#eef4fa;}';
    document.head.appendChild(st); }
  function _tfFuzzy(hay,q){ hay=String(hay).toLowerCase(); q=String(q).toLowerCase(); if(!q) return true; var i=0; for(var j=0;j<hay.length&&i<q.length;j++){ if(hay.charAt(j)===q.charAt(i)) i++; } return i===q.length; }
  function _tfScore(hay,q){ hay=String(hay).toLowerCase(); q=String(q).toLowerCase(); if(!q) return 0; var idx=hay.indexOf(q); if(idx===0) return 0; if(idx>0) return 1; return 2; }
  // Chip + fuzzy-autocomplete multi-select (the tags-style widget), self-contained.
  function chip(host, initial, suggestions, onChange, placeholder){
    if(!host) return null;
    var tags=(initial||[]).slice(), LIST=[], sel=-1;
    function fire(){ if(typeof onChange==='function'){ try{ onChange(tags.slice()); }catch(e){} } }
    var wrap=document.createElement('div'); wrap.className='rlf-tf';
    var inp=document.createElement('input'); inp.type='text'; inp.autocomplete='off'; inp.placeholder=placeholder||'Type to search…';
    var menu=document.createElement('div'); menu.className='rlf-tfmenu'; menu.hidden=true;
    host.className='rlf-tfhost'; host.innerHTML=''; host.appendChild(wrap); wrap.appendChild(inp); wrap.appendChild(menu);
    function chips(){ Array.prototype.slice.call(wrap.querySelectorAll('.tchip')).forEach(function(x){ x.parentNode.removeChild(x); }); tags.forEach(function(t){ var c=document.createElement('span'); c.className='tchip'; c.appendChild(document.createTextNode(t)); var b=document.createElement('button'); b.type='button'; b.textContent='×'; b.title='Remove'; b.addEventListener('click',function(){ tags=tags.filter(function(x){return x!==t;}); chips(); fire(); inp.focus(); }); c.appendChild(b); wrap.insertBefore(c,inp); }); }
    function add(v){ v=(v||'').replace(/,+$/,'').trim(); if(v && tags.map(function(x){return x.toLowerCase();}).indexOf(v.toLowerCase())<0){ tags.push(v); chips(); fire(); } inp.value=''; closeM(); }
    function openM(){ var q=inp.value.trim(); var have={}; tags.forEach(function(t){ have[t.toLowerCase()]=1; }); LIST=(suggestions||[]).filter(function(s){ return !have[String(s).toLowerCase()] && _tfFuzzy(s,q); }); LIST.sort(function(a,b){ return _tfScore(a,q)-_tfScore(b,q) || String(a).toLowerCase().localeCompare(String(b).toLowerCase()); }); LIST=LIST.slice(0,50); var exact=(suggestions||[]).some(function(s){ return String(s).toLowerCase()===q.toLowerCase(); }) || tags.map(function(x){return x.toLowerCase();}).indexOf(q.toLowerCase())>=0; var html=LIST.map(function(s,i){ return '<div data-i="'+i+'">'+esc(s)+'</div>'; }).join(''); if(q && !exact){ html+='<div data-new="1">Add “'+esc(q)+'”</div>'; } if(!html){ closeM(); return; } sel=-1; menu.innerHTML=html; menu.hidden=false; Array.prototype.slice.call(menu.children).forEach(function(row){ row.addEventListener('mousedown',function(e){ e.preventDefault(); if(row.getAttribute('data-new')) add(inp.value); else add(LIST[+row.getAttribute('data-i')]); inp.focus(); }); }); }
    function closeM(){ menu.hidden=true; sel=-1; }
    function paint(){ Array.prototype.slice.call(menu.children).forEach(function(r,i){ r.classList.toggle('sel',i===sel); }); }
    inp.addEventListener('input',openM); inp.addEventListener('focus',openM);
    inp.addEventListener('blur',function(){ setTimeout(closeM,150); });
    inp.addEventListener('keydown',function(e){ var rows=menu.hidden?[]:Array.prototype.slice.call(menu.children); if(e.key==='ArrowDown'&&rows.length){ e.preventDefault(); sel=Math.min(rows.length-1,sel+1); paint(); } else if(e.key==='ArrowUp'&&rows.length){ e.preventDefault(); sel=Math.max(0,sel-1); paint(); } else if(e.key==='Enter'||e.key===','){ e.preventDefault(); if(sel>=0&&rows[sel]){ if(rows[sel].getAttribute('data-new')) add(inp.value); else add(LIST[+rows[sel].getAttribute('data-i')]); } else add(inp.value); } else if(e.key==='Backspace'&&!inp.value&&tags.length){ tags.pop(); chips(); fire(); } else if(e.key==='Escape'){ closeM(); } });
    wrap.addEventListener('mousedown',function(e){ if(e.target===wrap) inp.focus(); });
    chips();
    return { get:function(){ return tags.slice(); } };
  }

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
        if(f.type==='multi'||f.type==='multiany'){ body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+'</div><div class="rlf-tfhost" data-tf="'+esc(f.key)+'"></div></div>'; }
        else if(f.type==='daterange'){ var v=FILTERS[f.key]||{}; body+='<div class="rlf-grp2"><div><div class="rlf-lbl">'+esc(f.label)+' from</div><input type="date" class="rlf-in" data-fk="'+esc(f.key)+'" data-part="from" value="'+esc(v.from||'')+'"></div><div><div class="rlf-lbl">'+esc(f.label)+' to</div><input type="date" class="rlf-in" data-fk="'+esc(f.key)+'" data-part="to" value="'+esc(v.to||'')+'"></div></div>'; }
        else if(f.type==='bool'){ body+='<div class="rlf-grp"><label class="rlf-chk"><input type="checkbox" data-fk="'+esc(f.key)+'"'+(FILTERS[f.key]?' checked':'')+'> '+esc(f.label)+'</label></div>'; }
        else if(f.type==='bools'){ var bsel=FILTERS[f.key]||[]; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+'</div><div class="rlf-wrap">'+(f.items||[]).map(function(it2){ return '<label class="rlf-chk"><input type="checkbox" data-fk="'+esc(f.key)+'" data-sub="'+esc(it2.key)+'"'+(bsel.indexOf(it2.key)>=0?' checked':'')+'> '+esc(it2.label)+'</label>'; }).join('')+'</div></div>'; }
        else if(f.type==='tags'){ var tl=(f.options?f.options():[])||[]; var dlid='rlf_dl_'+f.key; body+='<div class="rlf-grp"><div class="rlf-lbl">'+esc(f.label)+' (comma-separated, matches all)</div><input class="rlf-in" data-fk="'+esc(f.key)+'" data-tags="1" list="'+dlid+'" value="'+esc((FILTERS[f.key]||[]).join(', '))+'"><datalist id="'+dlid+'">'+tl.map(function(t){return '<option value="'+esc(t)+'">';}).join('')+'</datalist></div>'; }
      });
      ov.innerHTML='<div class="rlf-card"><div class="rlf-h">Filter '+esc(cfg.title||cfg.list||'list')+'</div><div class="rlf-b"><div class="rlf-grp" data-saved="1"></div>'+body+'</div>'
        +'<div class="rlf-f"><button class="rlf-btn2 ghost" data-act="clear">Clear all</button><button class="rlf-btn2 ghost" data-act="save">Save search…</button><button class="rlf-btn2 ghost" data-act="close">Close</button><button class="rlf-btn2" data-act="apply">Apply</button></div></div>';
      document.body.appendChild(ov);
      // Chip + fuzzy-search fields for every multi-select (Type, Market, Owner, Lead source…).
      var CHIP={};
      fields.forEach(function(f){ if(f.type!=='multi'&&f.type!=='multiany') return; var hostEl=ov.querySelector('.rlf-tfhost[data-tf="'+f.key+'"]'); if(!hostEl) return; var items=(f.options?f.options():[])||[]; var seen={}, disp=[]; items.forEach(function(x){ if(x==null||x==='') return; var k=String(x).toLowerCase(); if(!seen[k]){ seen[k]=1; disp.push(x); } }); disp.sort(function(a,b){ return String(a).toLowerCase().localeCompare(String(b).toLowerCase()); }); CHIP[f.key]=chip(hostEl,(FILTERS[f.key]||[]).slice(),disp,null,'Type to search '+String(f.label).toLowerCase()+'…'); });
      function close(){ ov.remove(); }
      ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
      function collect(){ fields.forEach(function(f){
        if(f.type==='multi'||f.type==='multiany'){ FILTERS[f.key]=(CHIP[f.key]?CHIP[f.key].get():(FILTERS[f.key]||[])); }
        else if(f.type==='bools'){ var barr=[]; ov.querySelectorAll('input[data-fk="'+f.key+'"][data-sub]:checked').forEach(function(c){ barr.push(c.getAttribute('data-sub')); }); FILTERS[f.key]=barr; }
        else if(f.type==='daterange'){ var fr=ov.querySelector('[data-fk="'+f.key+'"][data-part="from"]'), to=ov.querySelector('[data-fk="'+f.key+'"][data-part="to"]'); FILTERS[f.key]={from:fr?fr.value:'',to:to?to.value:''}; }
        else if(f.type==='bool'){ var cb=ov.querySelector('input[data-fk="'+f.key+'"]'); FILTERS[f.key]=!!(cb&&cb.checked); }
        else if(f.type==='tags'){ var ti=ov.querySelector('input[data-fk="'+f.key+'"][data-tags]'); FILTERS[f.key]=(ti?ti.value:'').split(',').map(function(x){return x.trim();}).filter(Boolean); }
      }); }
      ov.querySelector('[data-act="close"]').addEventListener('click',close);
      ov.querySelector('[data-act="clear"]').addEventListener('click',function(){ FILTERS=empty(); close(); if(cfg.onChange) cfg.onChange(); });
      ov.querySelector('[data-act="apply"]').addEventListener('click',function(){ collect(); close(); if(cfg.onChange) cfg.onChange(); });
      ov.querySelector('[data-act="save"]').addEventListener('click',async function(){ collect(); var name=await rrgPrompt('Name this saved search:'); if(name===null) return; name=name.trim(); if(!name) return; var shared=await rrgConfirm('Share this saved search with the whole team?\n\nOK = shared with team · Cancel = just me'); fetch('/api/saved-searches',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({list:cfg.list,name:name,shared:shared,payload:FILTERS})}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ renderSaved(ov); } else alert((j&&j.error)||'Could not save.'); }); });
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
  window.RRGFilters={ create:create, chip:chip, injectCss:injectCss };
})();
