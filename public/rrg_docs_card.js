/* rrg_docs_card.js — the Documents rail card shared by the contact and company records.
   The record page owns its agreements (they come down with the record payload and render
   with the richer expiry/signature chips). This module owns everything else in the
   document library — LOIs, valuations, marketing packs, site criteria, seller screenings
   and uploaded files — scoped to the record via /api/documents?personId= / ?companyId=.
   Same icons, same open behaviour as the Documents page on the toolbar. */
(function(){
  if(window.RRGDocs) return;
  var DOCS=[], SCOPE=null, ONCHANGE=null, READY=false;
  var KICON={agreement:'§',loi:'✎',valuation:'▤',marketingpack:'❏',ssc:'◎',seller:'⊚',file:'▦'};
  var KCOL={agreement:'#2647b0',valuation:'#1f8a5b',marketingpack:'#b9761a',file:'#5a3d9e',ssc:'#0b7285',loi:'#b5364f',seller:'#4b6b2f'};
  var DOCTYPES=['General','Agreement / Contract','Lease','Financials','Tax / W-9','Insurance / COI','Inspection','Exhibit / Addendum','Offer / LOI','Invoice / Receipt','Marketing','Legal / Entity','ID / License','Photo','Other'];

  function esc(s){ var d=document.createElement('div'); d.textContent=(s==null?'':String(s)); return d.innerHTML; }
  function fmt(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d.getTime())) return ''; return (d.getMonth()+1)+'/'+d.getDate()+'/'+String(d.getFullYear()).slice(2); }
  function fmtSize(n){ if(!n) return ''; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(0)+' KB'; return (n/1048576).toFixed(1)+' MB'; }

  function styles(){
    if(document.getElementById('rrgDocsCss')) return;
    var st=document.createElement('style'); st.id='rrgDocsCss';
    st.textContent='.docrow{cursor:pointer;}'
      +'.dico{width:24px;height:24px;flex:none;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;line-height:1;}'
      +'.docttl{font-size:13px;font-weight:400;color:#1d2739;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      +'.docmeta{font-size:11px;color:#8a93a8;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      +'.docmenu{position:absolute;z-index:60;background:#fff;border:1px solid #e0e5ee;border-radius:10px;box-shadow:0 12px 30px rgba(16,32,70,.16);padding:5px;min-width:172px;}'
      +'.docmenu button{display:block;width:100%;text-align:left;background:none;border:none;font:inherit;font-size:13px;color:#1a2236;padding:8px 11px;border-radius:7px;cursor:pointer;}'
      +'.docmenu button:hover{background:#f2f5fa;}'
      +'.dmask{position:fixed;inset:0;background:rgba(6,14,32,.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;}'
      +'.dbox{background:#fff;border-radius:16px;width:100%;max-width:440px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;max-height:calc(100vh - 40px);display:flex;flex-direction:column;}'
      +'.dbox h4{margin:0;padding:17px 21px;font-size:16px;font-weight:800;color:#000E31;border-bottom:1px solid #e6e9f0;}'
      +'.dbody{padding:17px 21px;overflow-y:auto;}'
      +'.dbody label{display:block;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:#8a93a8;font-weight:700;margin:13px 0 6px;}'
      +'.dbody label:first-child{margin-top:0;}'
      +'.dbody input,.dbody select,.dbody textarea{width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:13.5px;background:#fff;}'
      +'.dbody textarea{min-height:64px;resize:vertical;}'
      +'.ddrop{border:2px dashed #cfd6e2;border-radius:11px;padding:18px;text-align:center;color:#6b7488;font-size:12.5px;cursor:pointer;background:#f5f7fb;}'
      +'.ddrop.has{border-color:#1f8a5b;color:#1f8a5b;background:#f2faf5;font-weight:700;}'
      +'.dfoot{display:flex;gap:9px;justify-content:flex-end;align-items:center;padding:13px 21px;border-top:1px solid #e6e9f0;}'
      +'.dbtn{background:#000E31;color:#fff;border:1px solid #000E31;border-radius:9px;padding:9px 16px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;}'
      +'.dbtn.ghost{background:#fff;color:#6b7488;border-color:#e6e9f0;}'
      +'.dchip{display:inline-flex;align-items:center;gap:7px;background:#eef2fb;border:1px solid #d3ddf3;color:#2647b0;border-radius:100px;padding:5px 12px;font-size:12.5px;font-weight:700;}'
      +'.docdel{margin-left:auto;flex:none;background:none;border:none;color:#c2c9d6;font-size:13px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:6px;opacity:0;transition:opacity .12s,background .12s,color .12s;}'
      +'.docrow:hover .docdel{opacity:1;}'
      +'.docdel:hover{background:#fdeceb;color:#DA2B1F;}';
    document.head.appendChild(st);
  }

  function init(opts){
    SCOPE=opts||{}; ONCHANGE=SCOPE.onChange||function(){}; styles(); load();
  }
  function load(){
    if(!SCOPE||!SCOPE.id) return;
    fetch('/api/documents?'+encodeURIComponent(SCOPE.param)+'='+encodeURIComponent(SCOPE.id),{credentials:'same-origin',cache:'no-store'})
      .then(function(r){ return r.json(); })
      .then(function(j){
        // Agreements stay with the page -- it already has the full record with signature state.
        DOCS=((j&&j.documents)||[]).filter(function(d){ return d.kind!=='agreement'; });
        DOCS.sort(function(a,b){ return String(b.createdAt||'').localeCompare(String(a.createdAt||'')); });
        READY=true; ONCHANGE();
      }).catch(function(){ READY=true; ONCHANGE(); });
  }
  function count(){ return DOCS.filter(function(d){ return d.kind!=='file'; }).length; }
  function filesCount(){ return DOCS.filter(function(d){ return d.kind==='file'; }).length; }
  function ready(){ return READY; }

  function rowHtml(d){
    var top=d.title||'Document';
    var sub=d.typeLabel||'';
    // Seller screening reads better with the call type on top and the concept + date beneath it.
    if(d.kind==='seller'){ top=d.typeLabel||'Seller Screening'; sub=(d.title && d.title!==top)?d.title:''; }
    if(d.kind==='file' && d.size) sub+=(sub?' · ':'')+fmtSize(d.size);
    if(d.createdAt) sub+=(sub?' · ':'')+fmt(d.createdAt);
    var del=d.deleteUrl?('<button type="button" class="docdel" data-docdel="'+esc(d.id)+'" title="Delete">\u2715</button>'):'';
    return '<div class="rrow docrow" data-docurl="'+esc(d.openUrl||'')+'" data-dockind="'+esc(d.kind)+'" title="Open '+esc(d.title||'document')+'">'
      +'<span class="dico" style="background:'+(KCOL[d.kind]||'#6b7488')+'">'+(KICON[d.kind]||'▦')+'</span>'
      +'<div class="rrmain" style="min-width:0"><div class="docttl">'+esc(top)+'</div><div class="docmeta">'+esc(sub)+'</div></div>'
      +del
      +'</div>';
  }
  function rowsHtml(){ return DOCS.filter(function(d){ return d.kind!=='file'; }).map(rowHtml).join(''); }
  function filesRowsHtml(){ return DOCS.filter(function(d){ return d.kind==='file'; }).map(rowHtml).join(''); }

  function open(url){ if(!url) return; if(/^https?:|^\/api\//.test(url)) window.open(url,'_blank','noopener'); else location.href='./'+url; }

  function delDoc(id){
    var d=DOCS.find(function(x){ return x.id===id; }); if(!d||!d.deleteUrl) return;
    var isCall=(d.kind==='seller');
    var msg=isCall?('Delete the call "'+(d.title||'this call')+'"? This permanently removes the seller screening and its answers. This cannot be undone.'):('Remove "'+(d.title||'this file')+'"? This deletes the uploaded file for everyone.');
    if(!confirm(msg)) return;
    fetch(d.deleteUrl,{method:'DELETE',credentials:'same-origin'}).then(function(r){ return r.json(); }).then(function(j){ if(j&&j.ok){ load(); } else alert((j&&j.error)||'Could not delete.'); }).catch(function(){ alert('Could not reach the server.'); });
  }
  // One delegated listener for the whole page -- survives every re-render of the card.
  document.addEventListener('click', function(e){
    if(!e.target||!e.target.closest) return;
    var db=e.target.closest('[data-docdel]');
    if(db){ e.preventDefault(); e.stopPropagation(); delDoc(db.getAttribute('data-docdel')); return; }
    var r=e.target.closest('.docrow[data-docurl]');
    if(r){ e.preventDefault(); open(r.getAttribute('data-docurl')); }
  });

  function menu(anchor, items){
    var old=document.querySelector('.docmenu'); if(old) old.remove();
    var m=document.createElement('div'); m.className='docmenu';
    items.forEach(function(it){ var b=document.createElement('button'); b.type='button'; b.textContent=it[0]; b.addEventListener('click',function(){ m.remove(); it[1](); }); m.appendChild(b); });
    document.body.appendChild(m);
    var r=anchor.getBoundingClientRect();
    m.style.top=(r.bottom+window.scrollY+6)+'px';
    m.style.left=Math.max(8,Math.min(r.right+window.scrollX-m.offsetWidth, window.innerWidth-m.offsetWidth-10))+'px';
    setTimeout(function(){ document.addEventListener('click', function h(ev){ if(!m.contains(ev.target)){ m.remove(); document.removeEventListener('click',h); } }); },0);
  }

  function upload(){
    styles();
    var picked=null;
    var mask=document.createElement('div'); mask.className='dmask';
    mask.innerHTML='<div class="dbox" role="dialog" aria-modal="true">'
      +'<h4>Upload a document</h4>'
      +'<div class="dbody">'
      +'<div class="ddrop" id="_dDrop">Click to choose a file — PDF, Word, Excel, PowerPoint, image, TXT, CSV or ZIP (max 25 MB)</div>'
      +'<input type="file" id="_dFile" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.zip">'
      +'<label>Document name</label><input type="text" id="_dName" placeholder="Defaults to the file name" maxlength="160">'
      +'<label>Document type</label><select id="_dType">'+DOCTYPES.map(function(t){ return '<option>'+esc(t)+'</option>'; }).join('')+'</select>'
      +'<label>Filed under</label><div><span class="dchip">'+esc(SCOPE.name||'this record')+'</span></div>'
      +'<label>Notes</label><textarea id="_dNote" maxlength="400" placeholder="Anything worth remembering about this document…"></textarea>'
      +'</div>'
      +'<div class="dfoot"><span id="_dMsg" style="font-size:12px;color:#6b7488;margin-right:auto"></span><button type="button" class="dbtn ghost" id="_dCancel">Cancel</button><button type="button" class="dbtn" id="_dSave">Upload</button></div>'
      +'</div>';
    document.body.appendChild(mask);
    var fi=mask.querySelector('#_dFile'), dp=mask.querySelector('#_dDrop'), msg=mask.querySelector('#_dMsg'), save=mask.querySelector('#_dSave');
    function close(){ mask.remove(); }
    dp.addEventListener('click',function(){ fi.click(); });
    fi.addEventListener('change',function(){ var f=fi.files&&fi.files[0]; if(!f) return; picked=f; dp.className='ddrop has'; dp.textContent='✓ '+f.name+' ('+fmtSize(f.size)+')'; });
    mask.querySelector('#_dCancel').addEventListener('click',close);
    mask.addEventListener('click',function(e){ if(e.target===mask) close(); });
    save.addEventListener('click',function(){
      if(!picked){ msg.textContent='Choose a file first.'; return; }
      if(picked.size>25*1024*1024){ msg.textContent='File too large (max 25 MB).'; return; }
      save.disabled=true; msg.textContent='Uploading…';
      var rd=new FileReader();
      rd.onload=function(){ var s=String(rd.result||''), i=s.indexOf(','), b64=(i>=0?s.slice(i+1):s);
        fetch('/api/files',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          filename:picked.name, dataB64:b64,
          title:mask.querySelector('#_dName').value.trim(),
          docType:mask.querySelector('#_dType').value,
          note:mask.querySelector('#_dNote').value.trim(),
          relatesToType:(SCOPE.param==='companyId'?'company':'contact'), relatesToId:SCOPE.id, relatesToName:(SCOPE.name||'')
        })}).then(function(r){ return r.json(); }).then(function(j){
          save.disabled=false;
          if(j&&j.ok){ close(); load(); } else { msg.textContent=(j&&j.error)||'Upload failed.'; }
        }).catch(function(){ save.disabled=false; msg.textContent='Upload failed — try again.'; });
      };
      rd.onerror=function(){ save.disabled=false; msg.textContent='Could not read that file.'; };
      rd.readAsDataURL(picked);
    });
    setTimeout(function(){ try{ mask.querySelector('#_dName').focus(); }catch(e){} },40);
  }

  window.RRGDocs={ init:init, reload:load, count:count, filesCount:filesCount, ready:ready, rowsHtml:rowsHtml, filesRowsHtml:filesRowsHtml, upload:upload, menu:menu, open:open };
})();
