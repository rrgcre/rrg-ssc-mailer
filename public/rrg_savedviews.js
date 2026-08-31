/* RRGViews — drop-in saved-segments (★ Saved) control for any list with a custom filter system.
   Usage:
     RRGViews.attach({
       list:'subscribers',                       // saved-searches key (must match the rail)
       button: document.getElementById('savedBtn'),
       getState: function(){ return { ...current filter state... }; },   // serialized to the saved payload
       applyState: function(payload){ ...set filters from payload, then re-render... },
       isAdmin: function(){ return IS_ADMIN; },   // optional
       hasFilters: function(){ return true/false; } // optional — gates "Save current"
     });
   Also applies ?view=<id> on load when the saved view's list matches. */
(function(){
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function css(){ if(document.getElementById('rvw-css')) return; var st=document.createElement('style'); st.id='rvw-css';
    st.textContent='.rvw-fly{position:fixed;z-index:410;background:#fff;border:1px solid #dbe0e9;border-radius:6px;box-shadow:0 14px 40px rgba(11,26,56,.20);width:292px;max-height:62vh;overflow:auto;padding:5px 0 0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
      +'.rvw-fly[hidden]{display:none;}'
      +'.rvw-hd{padding:10px 14px 7px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8a93a3;}'
      +'.rvw-row{display:flex;align-items:center;gap:7px;padding:8px 12px 8px 14px;cursor:pointer;}'
      +'.rvw-row:hover{background:#f4f7fb;}'
      +'.rvw-nm{flex:1;font-size:13px;color:#20334f;font-weight:600;line-height:1.25;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      +'.rvw-nm small{color:#98a2b6;font-weight:600;font-size:11px;margin-left:6px;text-transform:uppercase;letter-spacing:.04em;}'
      +'.rvw-x{border:none;background:none;color:#c7cedb;cursor:pointer;font-size:14px;flex:none;padding:2px 5px;line-height:1;} .rvw-x:hover{color:#b23a2c;}'
      +'.rvw-empty{padding:11px 15px 14px;font-size:12.5px;color:#8a93a3;line-height:1.5;}'
      +'.rvw-ft{border-top:1px solid #eef1f6;margin-top:5px;padding:9px 10px 11px;background:#fbfcfe;}'
      +'.rvw-save{width:100%;background:#20334f;color:#fff;border:1px solid #20334f;border-radius:4px;padding:8px 10px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;} .rvw-save:hover{background:#17263c;}';
    document.head.appendChild(st); }

  function attach(cfg){
    if(!cfg || !cfg.button) return null;
    css();
    var list=cfg.list, btn=cfg.button, FLY=null, OPEN=false, SAVED=[];
    function admin(){ return cfg.isAdmin ? !!cfg.isAdmin() : false; }
    function canSave(){ return cfg.hasFilters ? !!cfg.hasFilters() : true; }
    function ensureFly(){ if(FLY) return FLY; FLY=document.createElement('div'); FLY.className='rvw-fly'; FLY.hidden=true; document.body.appendChild(FLY);
      document.addEventListener('click',function(e){ if(FLY.hidden) return; if(FLY.contains(e.target)||btn.contains(e.target)) return; close(); });
      document.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });
      window.addEventListener('resize',function(){ if(!FLY.hidden) pos(); });
      window.addEventListener('scroll',function(){ if(!FLY.hidden) close(); },true);
      return FLY; }
    function pos(){ var r=btn.getBoundingClientRect(); var w=292; var left=Math.min(r.left, window.innerWidth-w-12); if(left<8) left=8; FLY.style.left=left+'px'; FLY.style.top=(r.bottom+6)+'px'; }
    function close(){ OPEN=false; if(FLY) FLY.hidden=true; btn.classList.remove('on'); }
    async function persist(after){
      var name=await rrgPrompt('Name this saved segment:'); if(name===null) return; name=String(name).trim(); if(!name) return;
      var shared=await rrgConfirm('Share this segment with the whole team?\n\nOK = shared with team · Cancel = just me');
      var payload={}; try{ payload=cfg.getState?cfg.getState():{}; }catch(e){}
      try{ var r=await fetch('/api/saved-searches',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({list:list,name:name,shared:!!shared,payload:payload})}); var j=await r.json(); if(j&&j.ok){ if(after) after(); } else alert((j&&j.error)||'Could not save.'); }catch(e){ alert('Could not save.'); }
    }
    function render(){ ensureFly(); FLY.innerHTML='<div class="rvw-hd">Saved segments</div><div class="rvw-empty">Loading…</div>'; pos();
      fetch('/api/saved-searches?list='+encodeURIComponent(list),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
        SAVED=(j&&j.searches)||[]; var head='<div class="rvw-hd">Saved segments</div>'; var rows;
        if(!SAVED.length){ rows='<div class="rvw-empty">No saved segments yet. Set filters, then save the current view here.</div>'; }
        else { rows=SAVED.map(function(sc,i){ var tag=sc.shared?('Shared'+(sc.mine?'':(' · '+esc(sc.ownerName||'team')))):'Just me'; return '<div class="rvw-row" data-load="'+i+'"><span class="rvw-nm">'+esc(sc.name)+'<small>'+tag+'</small></span>'+((sc.mine||admin())?'<button class="rvw-x" data-del="'+esc(sc.id)+'" title="Delete">✕</button>':'')+'</div>'; }).join(''); }
        var ft='<div class="rvw-ft"><button class="rvw-save"'+(canSave()?'':' disabled style="opacity:.45;cursor:default"')+' data-save="1">＋ Save current filters…</button></div>';
        FLY.innerHTML=head+rows+ft;
        FLY.querySelectorAll('[data-load]').forEach(function(el){ el.addEventListener('click',function(e){ if(e.target.closest('[data-del]')) return; var sc=SAVED[+el.getAttribute('data-load')]; if(!sc) return; try{ cfg.applyState(sc.payload||{}); }catch(_){} close(); }); });
        FLY.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click',async function(e){ e.stopPropagation(); if(!await rrgConfirm('Delete this saved segment?')) return; try{ await fetch('/api/saved-searches/'+encodeURIComponent(b.getAttribute('data-del')),{method:'DELETE',credentials:'same-origin'}); }catch(_){} render(); }); });
        var sv=FLY.querySelector('[data-save]'); if(sv&&canSave()) sv.addEventListener('click',function(){ persist(function(){ render(); }); });
        pos();
      }).catch(function(){ FLY.innerHTML='<div class="rvw-hd">Saved segments</div><div class="rvw-empty">Could not load.</div>'; pos(); });
    }
    function open(){ OPEN=true; ensureFly(); FLY.hidden=false; btn.classList.add('on'); render(); }
    function toggle(){ ensureFly(); if(FLY.hidden) open(); else close(); }
    btn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); toggle(); });
    // Apply ?view=<id> on load when its list matches.
    (function(){ try{ var vid=new URLSearchParams(location.search).get('view'); if(!vid) return; fetch('/api/saved-searches/'+encodeURIComponent(vid),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok&&j.search&&j.search.list===list){ try{ cfg.applyState(j.search.payload||{}); }catch(_){} } }).catch(function(){}); }catch(e){} })();
    return { open:open, close:close, refresh:render };
  }
  window.RRGViews={ attach:attach };
})();
