/* rrg_aiwork.js — the shared "AI is working" / "Working…" overlay.
   Extracted from rrg_shell.js so standalone editor pages that don't load the
   app shell (e.g. the questionnaire builder) show the SAME spinner dialog.
   Exposes window.rrgAiWork (AI style) and window.rrgWork (plain NetSuite style).
   Idempotent: if the shell already defined these, this leaves them in place. */
(function(){
  if (window.rrgAiWork && window.rrgWork) return;   // shell already provides it — don't double-define
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function assistant(){ return window.__rrgAssistant||'AI'; }
  function injectCss(){ if(document.getElementById('rrgaiwork-css')) return; var st=document.createElement('style'); st.id='rrgaiwork-css';
    st.textContent='.rrgaiwork{position:fixed;inset:0;background:rgba(16,22,40,.5);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:100000;padding:20px;}'
    +'.rrgaiwork[hidden]{display:none!important;}'
    +'.rrgaiwbox{background:#fff;border:1px solid #dbe0e9;border-radius:6px;padding:28px 32px 22px;max-width:430px;width:100%;text-align:center;box-shadow:0 18px 44px rgba(11,26,56,.22);position:relative;}'
    +'.rrgaiwbox.ai{border-top:2px solid #2c5c8f;}'
    +'@keyframes rrgaispin{to{transform:rotate(360deg);}}'
    +'.rrgaiworb{width:44px;height:44px;border-radius:50%;margin:0 auto 15px;box-sizing:border-box;border:3px solid #e6eaf1;border-top-color:#20334f;animation:rrgaispin .9s linear infinite;position:relative;}'
    +'.rrgaiwbox.ai .rrgaiworb{border-top-color:#2c5c8f;}'
    +'.rrgaiwbox.ai .rrgaiworb:after{content:"\\2726";color:#2c5c8f;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;}'
    +'.rrgaiwbox .rrgaiworb.done{animation:none;border:none;width:46px;height:46px;background:#eaf5ef;display:flex;align-items:center;justify-content:center;}'
    +'.rrgaiwbox .rrgaiworb.done:after{content:"\\2713";color:#2f7a55;font-weight:900;font-size:24px;}'
    +'.rrgaiwtitle{font-weight:700;color:#20334f;font-size:15.5px;}'
    +'.rrgaiwmsg{color:#5f6a7d;font-size:12.5px;margin-top:6px;line-height:1.5;min-height:16px;}'
    +'.rrgaiwtimer{font-variant-numeric:tabular-nums;font-weight:700;font-size:20px;color:#20334f;margin-top:11px;}'
    +'.rrgaiwbox.ai .rrgaiwtimer{color:#2c5c8f;}'
    +'.rrgaiwcancel{margin-top:16px;background:#fff;border:1px solid #c4ccda;border-radius:3px;padding:8px 18px;font:inherit;font-size:12.5px;font-weight:600;color:#5f6a7d;cursor:pointer;}'
    +'.rrgaiwbarwrap{margin-top:14px;}'
    +'.rrgaiwbar{height:8px;border-radius:4px;background:#eef1f6;border:1px solid #e0e5ee;overflow:hidden;}'
    +'.rrgaiwbarfill{height:100%;width:0;background:#20334f;border-radius:4px;transition:width .35s ease;}'
    +'.rrgaiwbox.ai .rrgaiwbarfill{background:linear-gradient(90deg,#20334f,#2c5c8f);}'
    +'.rrgaiwmeta{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#8a93a3;font-weight:700;margin-top:6px;font-variant-numeric:tabular-nums;}'
    +'.rrgaiwsum{color:#2b3648;font-size:13px;margin-top:8px;line-height:1.55;}'
    +'.rrgaiwok{margin-top:16px;background:#20334f;border:1px solid #20334f;border-radius:3px;padding:9px 24px;font:inherit;font-size:12.5px;font-weight:700;color:#fff;cursor:pointer;}';
    document.head.appendChild(st); }
  var AIW={onCancel:null,onClose:null,t0:0,timer:null,ai:false};
  function fmt(ms){ var s=Math.max(0,Math.floor(ms/1000)); var m=Math.floor(s/60); s=s%60; return m+':'+(s<10?'0':'')+s; }
  function g(id){ return document.getElementById(id); }
  function ensure(){ var o=document.getElementById('rrgaiwork'); if(o) return o; injectCss(); o=document.createElement('div'); o.className='rrgaiwork'; o.id='rrgaiwork'; o.hidden=true; o.innerHTML='<div class="rrgaiwbox" id="rrgaiwbox"><div class="rrgaiworb" id="rrgaiworb"></div><div class="rrgaiwtitle" id="rrgaiwtitle">Working…</div><div class="rrgaiwmsg" id="rrgaiwmsg"></div><div class="rrgaiwbarwrap" id="rrgaiwbarwrap" hidden><div class="rrgaiwbar"><div class="rrgaiwbarfill" id="rrgaiwbarfill"></div></div><div class="rrgaiwmeta"><span id="rrgaiwcnt"></span><span id="rrgaiweta"></span></div></div><div class="rrgaiwtimer" id="rrgaiwtimer">0:00</div><button type="button" class="rrgaiwcancel" id="rrgaiwcancel">Cancel</button><button type="button" class="rrgaiwok" id="rrgaiwok" hidden>OK</button></div>'; document.body.appendChild(o); o.querySelector('#rrgaiwcancel').addEventListener('click',function(){ var f=AIW.onCancel; hide(); if(typeof f==="function"){try{f();}catch(e){}} }); o.querySelector('#rrgaiwok').addEventListener('click',function(){ var f=AIW.onClose; hide(); if(typeof f==="function"){try{f();}catch(e){}} }); return o; }
  function _show(o){ o=o||{}; ensure(); var box=g('rrgaiwbox'); if(box) box.classList.toggle('ai',!!o.ai); AIW.ai=!!o.ai; var orb=g('rrgaiworb'); if(orb) orb.classList.remove('done'); g('rrgaiwtitle').textContent=o.title||'Working…'; g('rrgaiwmsg').textContent=o.msg||''; g('rrgaiwbarwrap').hidden=true; g('rrgaiwbarfill').style.width='0'; AIW.onCancel=o.onCancel||null; AIW.onClose=null; var cb=g('rrgaiwcancel'); if(cb){ var showCancel=!!o.cancel; cb.hidden=!showCancel; cb.style.display=showCancel?'':'none'; } var ok=g('rrgaiwok'); if(ok) ok.hidden=true; var tm=g('rrgaiwtimer'); if(tm){ tm.hidden=false; tm.style.fontSize=''; tm.style.color=''; tm.style.fontWeight=''; } AIW.t0=Date.now(); if(AIW.timer) clearInterval(AIW.timer); AIW.timer=setInterval(function(){ var t=g('rrgaiwtimer'); if(t) t.textContent=fmt(Date.now()-AIW.t0); },1000); g('rrgaiwtimer').textContent='0:00'; g('rrgaiwork').hidden=false; }
  function aishow(msg,onCancel){ _show({ai:true, title:'✦ '+assistant()+' is working…', msg:msg, onCancel:onCancel||null, cancel:true}); }
  function plainshow(msg,onCancel,opts){ opts=opts||{}; _show({ai:false, title:opts.title||'Working…', msg:msg, onCancel:onCancel||null, cancel:(typeof onCancel==='function')}); }
  function setMsg(msg){ var m=g('rrgaiwmsg'); if(m) m.textContent=msg||''; }
  function progress(done,total,opts){ ensure(); opts=opts||{}; done=+done||0; total=+total||0; var w=g('rrgaiwbarwrap'); if(w) w.hidden=false; var pct=total>0?Math.min(100,Math.round(done/total*100)):0; var fill=g('rrgaiwbarfill'); if(fill) fill.style.width=pct+'%'; var noun=opts.noun?(' '+opts.noun):''; var cnt=g('rrgaiwcnt'); if(cnt) cnt.textContent=opts.hideCount?'':(done.toLocaleString()+' of '+total.toLocaleString()+noun); var eta=g('rrgaiweta'); if(eta){ if(opts.hideCount){ eta.textContent=''; } else { var el=Date.now()-AIW.t0; if(done>0 && total>done && el>1500){ var rem=el*(total-done)/done; eta.textContent='~'+fmt(rem)+' left'; } else if(total>0 && done>=total){ eta.textContent='finishing…'; } else { eta.textContent=''; } } } if(opts.msg!=null) setMsg(opts.msg); }
  function done(opts){ ensure(); opts=opts||{}; if(AIW.timer){ clearInterval(AIW.timer); AIW.timer=null; } var el=Date.now()-AIW.t0; var orb=g('rrgaiworb'); if(orb) orb.classList.add('done'); g('rrgaiwtitle').textContent=opts.title||'Done'; var took=(opts.tookText!=null)?opts.tookText:('Took '+fmt(el)); g('rrgaiwmsg').textContent=opts.summary||''; var fill=g('rrgaiwbarfill'); if(fill && !g('rrgaiwbarwrap').hidden) fill.style.width='100%'; var eta=g('rrgaiweta'); if(eta) eta.textContent=''; var tm=g('rrgaiwtimer'); if(tm){ tm.hidden=false; tm.textContent=took; tm.style.fontSize='13px'; tm.style.color='#5f6a7d'; tm.style.fontWeight='700'; } var cb=g('rrgaiwcancel'); if(cb){ cb.style.display='none'; cb.hidden=true; } var ok=g('rrgaiwok'); if(ok){ ok.hidden=false; ok.textContent=opts.okText||'OK'; } AIW.onCancel=null; AIW.onClose=opts.onClose||null; g('rrgaiwork').hidden=false; }
  function hide(){ var o=g('rrgaiwork'); if(o) o.hidden=true; AIW.onCancel=null; AIW.onClose=null; if(AIW.timer){ clearInterval(AIW.timer); AIW.timer=null; } var tm=g('rrgaiwtimer'); if(tm){ tm.style.fontSize=''; tm.style.color=''; tm.style.fontWeight=''; } }
  window.rrgAiWork={show:aishow,setMsg:setMsg,progress:progress,done:done,hide:hide};
  window.rrgWork={show:plainshow,setMsg:setMsg,progress:progress,done:done,hide:hide};
})();
