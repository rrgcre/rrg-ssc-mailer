/* Shared rich-text email editor — toolbar + contenteditable.
   Tools: bold, italic, underline, ordered/unordered lists, link, inline image,
   merge fields, AI rewrite, and (opt-in) attach + template picker.
   API: RRGRte.html(id, opts) -> markup ; RRGRte.wire(id, opts) ; RRGRte.get(id)/getText(id)/set(id,html) */
(function(){
  var MERGE=[['Contact',[['{{first_name}}','First name'],['{{last_name}}','Last name'],['{{name}}','Full name'],['{{company}}','Company'],['{{title}}','Title'],['{{email}}','Email'],['{{phone}}','Phone']]],['You (sender)',[['{{my_name}}','My name'],['{{my_title}}','My title'],['{{my_phone}}','My phone'],['{{my_email}}','My email']]],['Listing',[['{{listing_name}}','Listing name'],['{{listing_number}}','Listing #'],['{{code_name}}','Code name'],['{{asking_price}}','Asking price']]],['Deal links',[['{{data_room_link}}','Data room link'],['{{booking_link}}','My booking link']]],['Other',[['{{today}}','Today’s date']]]];
  function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
  function aiName(){ return window.__rrgAssistant||'AI'; }
  function toPlainHtml(v){ v=String(v==null?'':v); return v.indexOf('<')<0 ? esc(v).split('\n').join('<br>') : v; }
  function injectCss(){ if(document.getElementById('rrgrte-css'))return; var st=document.createElement('style'); st.id='rrgrte-css'; st.textContent=
     '.rrgrt{border:1px solid #cfd6e2;border-radius:9px;overflow:visible;background:#fff;}'
    +'.rrgrt-bar{display:flex;gap:2px;align-items:center;flex-wrap:wrap;padding:5px 7px;border-bottom:1px solid #e6e9f0;background:#f7f9fc;position:relative;}'
    +'.rrgrt-bar button{background:none;border:1px solid transparent;border-radius:6px;min-width:28px;height:26px;padding:0 7px;cursor:pointer;font-size:13px;color:#3a4560;line-height:1;font-family:inherit;white-space:nowrap;}'
    +'.rrgrt-bar button:hover{background:#eef3fb;border-color:#dbe3f0;}'
    +'.rrgrt-ai{margin-left:auto;color:#5b46b8!important;font-weight:700;}'
    +'.rrgrt-sep{width:1px;height:16px;background:#dbe1ea;margin:0 4px;}'
    +'.rrgrt-dd{position:relative;display:inline-block;}'
    +'.rrgrt-menu{position:absolute;top:30px;left:0;z-index:60;background:#fff;border:1px solid #e3e8f0;border-radius:10px;box-shadow:0 12px 34px rgba(12,22,54,.16);padding:8px;min-width:210px;max-height:300px;overflow:auto;}'
    +'.rrgrt-menu[hidden]{display:none;}'
    +'.rrgrt-mgrp{margin-bottom:6px;} .rrgrt-ml{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#98a1b5;padding:2px 4px;}'
    +'.rrgrt-mi{display:block;width:100%;text-align:left;background:none;border:none;border-radius:7px;padding:6px 8px;font:inherit;font-size:12.5px;color:#26324a;cursor:pointer;}'
    +'.rrgrt-mi:hover{background:#f2f6fc;}'
    +'.rrgrt-ed{min-height:120px;max-height:340px;overflow:auto;padding:10px 12px;font:inherit;font-size:13.5px;line-height:1.55;color:#1d2739;outline:none;}'
    +'.rrgrt-ed:empty:before{content:attr(data-ph);color:#9aa4b6;}'
    +'.rrgrt-ed img{max-width:100%;height:auto;border-radius:6px;}'
    +'.rrgrt-ed a{color:#2647b0;}';
    document.head.appendChild(st); }
  function mergeMenu(){ return MERGE.map(function(g){ return '<div class="rrgrt-mgrp"><div class="rrgrt-ml">'+esc(g[0])+'</div>'+g[1].map(function(f){ return '<button type="button" class="rrgrt-mi" data-tok="'+esc(f[0])+'">'+esc(f[1])+'</button>'; }).join('')+'</div>'; }).join(''); }
  function tplMenu(tpls){ if(!tpls||!tpls.length) return '<div style="padding:6px 8px;color:#98a1b5;font-size:12px">No templates yet.</div>'; return tpls.map(function(t){ return '<button type="button" class="rrgrt-mi" data-tpl="'+esc(t.id)+'">'+esc(t.name||'Template')+(t.scope==='shared'?' <span style="color:#98a1b5">(shared)</span>':'')+'</button>'; }).join(''); }
  function html(id,opts){ opts=opts||{}; injectCss();
    var b='<button type="button" data-cmd="bold" title="Bold"><b>B</b></button>'
      +'<button type="button" data-cmd="italic" title="Italic"><i>I</i></button>'
      +'<button type="button" data-cmd="underline" title="Underline"><u>U</u></button>'
      +'<span class="rrgrt-sep"></span>'
      +'<button type="button" data-cmd="insertUnorderedList" title="Bulleted list">•</button>'
      +'<button type="button" data-cmd="insertOrderedList" title="Numbered list">1.</button>'
      +'<span class="rrgrt-sep"></span>'
      +'<button type="button" data-act="link" title="Insert / edit link">🔗</button>'
      +'<button type="button" data-act="image" title="Insert an inline image">🖼</button>'
      +'<span class="rrgrt-dd"><button type="button" data-act="merge" title="Insert a merge field">{ } ▾</button><div class="rrgrt-menu" data-menu="merge" hidden>'+mergeMenu()+'</div></span>';
    if(opts.templates){ b+='<span class="rrgrt-dd"><button type="button" data-act="tpl" title="Start from a template">Template ▾</button><div class="rrgrt-menu" data-menu="tpl" hidden>'+tplMenu(opts.templates)+'</div></span>'; }
    if(opts.attach){ b+='<button type="button" data-act="attach" title="Attach a file">📎</button>'; }
    b+='<button type="button" data-act="rewrite" class="rrgrt-ai" title="Rewrite with '+esc(aiName())+'">✨ Rewrite</button>';
    return '<div class="rrgrt" data-rte="'+esc(id)+'"><div class="rrgrt-bar">'+b+'</div>'
      +'<div class="rrgrt-ed" id="'+esc(id)+'" contenteditable="true" data-ph="'+esc(opts.placeholder||'')+'">'+toPlainHtml(opts.value||'')+'</div>'
      +'<input type="file" class="rrgrt-attach" hidden><input type="file" class="rrgrt-img" accept="image/*" hidden></div>';
  }
  function closeMenus(rt){ rt.querySelectorAll('.rrgrt-menu').forEach(function(m){ m.hidden=true; }); }
  function insertHtml(ed,h){ ed.focus(); try{ document.execCommand('insertHTML',false,h); }catch(e){ ed.innerHTML+=h; } }
  function wire(id,opts){ opts=opts||{}; var rt=document.querySelector('.rrgrt[data-rte="'+id+'"]'); if(!rt||rt._w) return; rt._w=1; var ed=rt.querySelector('.rrgrt-ed');
    var saved=null;
    function save(){ var s=window.getSelection&&window.getSelection(); if(s&&s.rangeCount&&ed.contains(s.anchorNode)) saved=s.getRangeAt(0).cloneRange(); }
    function restore(){ ed.focus(); if(saved){ try{ var s=window.getSelection(); s.removeAllRanges(); s.addRange(saved); }catch(e){} } }
    function rewrite(btn){ var txt=(ed.innerText||ed.textContent||'').trim(); if(!txt){ if(window.rrgToast) rrgToast('Write something first.'); return; } var old=btn.innerHTML; btn.disabled=true; btn.innerHTML='✨ …'; fetch('/api/ai/rewrite-email',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({text:ed.innerHTML})}).then(function(r){return r.json();}).then(function(j){ btn.disabled=false; btn.innerHTML=old; if(j&&j.ok&&j.html){ ed.innerHTML=j.html; save(); } else { var m=(j&&j.error)||'Rewrite failed.'; if(window.rrgToast) rrgToast(m,{danger:true}); else alert(m); } }).catch(function(){ btn.disabled=false; btn.innerHTML=old; }); }
    ed.addEventListener('keyup',save); ed.addEventListener('mouseup',save); ed.addEventListener('blur',save);
    rt.querySelectorAll('.rrgrt-bar button[data-cmd]').forEach(function(btn){ btn.addEventListener('mousedown',function(e){e.preventDefault();}); btn.addEventListener('click',function(e){ e.preventDefault(); ed.focus(); try{ document.execCommand(btn.getAttribute('data-cmd'),false,null); }catch(err){} save(); }); });
    rt.querySelectorAll('.rrgrt-bar button[data-act]').forEach(function(btn){ btn.addEventListener('mousedown',function(e){e.preventDefault();}); btn.addEventListener('click',function(e){ e.preventDefault(); var act=btn.getAttribute('data-act');
      if(act==='link'){ var url=window.prompt('Link URL:','https://'); if(url&&url.trim()){ restore(); document.execCommand('createLink',false,url.trim()); save(); } }
      else if(act==='image'){ var u=window.prompt('Image URL (leave blank to upload a file):',''); if(u===null){} else if(u.trim()){ restore(); insertHtml(ed,'<img src="'+esc(u.trim())+'" alt="">'); save(); } else { var im=rt.querySelector('.rrgrt-img'); if(im){ im.value=''; im.click(); } } }
      else if(act==='merge'||act==='tpl'){ var menu=rt.querySelector('.rrgrt-menu[data-menu="'+act+'"]'); var wasOpen=menu&&!menu.hidden; closeMenus(rt); if(menu&&!wasOpen) menu.hidden=false; }
      else if(act==='attach'){ var fa=rt.querySelector('.rrgrt-attach'); if(fa){ fa.value=''; fa.click(); } }
      else if(act==='rewrite'){ rewrite(btn); }
    }); });
    rt.querySelectorAll('.rrgrt-mi[data-tok]').forEach(function(mi){ mi.addEventListener('mousedown',function(e){e.preventDefault();}); mi.addEventListener('click',function(e){ e.preventDefault(); restore(); insertHtml(ed, esc(mi.getAttribute('data-tok'))+' '); closeMenus(rt); save(); }); });
    rt.querySelectorAll('.rrgrt-mi[data-tpl]').forEach(function(mi){ mi.addEventListener('click',function(e){ e.preventDefault(); closeMenus(rt); if(opts.onTemplate) opts.onTemplate(mi.getAttribute('data-tpl')); }); });
    var img=rt.querySelector('.rrgrt-img'); if(img){ img.addEventListener('change',function(){ var f=img.files&&img.files[0]; if(!f)return; if(f.size>4*1024*1024){ alert('Image is over 4 MB — link it by URL instead.'); return; } var rd=new FileReader(); rd.onload=function(){ restore(); insertHtml(ed,'<img src="'+rd.result+'" alt="">'); save(); }; rd.readAsDataURL(f); }); }
    var att=rt.querySelector('.rrgrt-attach'); if(att && opts.onAttach){ att.addEventListener('change',function(){ if(att.files&&att.files.length) opts.onAttach(att.files); }); }
    document.addEventListener('click',function(e){ if(!rt.contains(e.target)) closeMenus(rt); });
  }
  window.RRGRte={ html:html, wire:wire, toHtml:toPlainHtml,
    get:function(id){ var el=document.getElementById(id); return el?el.innerHTML.trim():''; },
    getText:function(id){ var el=document.getElementById(id); return el?(el.innerText||el.textContent||'').trim():''; },
    set:function(id,h){ var el=document.getElementById(id); if(el) el.innerHTML=toPlainHtml(h); } };
})();
