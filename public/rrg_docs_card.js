/* rrg_docs_card.js — the Documents rail card shared by the contact and company records.
   The record page owns its agreements (they come down with the record payload and render
   with the richer expiry/signature chips). This module owns everything else in the
   document library — LOIs, valuations, marketing packs, site criteria, seller screenings
   and uploaded files — scoped to the record via /api/documents?personId= / ?companyId=.
   Same icons, same open behaviour as the Documents page on the toolbar. */
(function(){
  if(window.RRGDocs) return;
  var DOCS=[], SCOPE=null, ONCHANGE=null, READY=false;
  function _ksvg(inner){ return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>'; }
  var KICON={
   agreement:_ksvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8.5 14.5l1.6 1.6 3.4-3.6"/>'),
   loi:_ksvg('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>'),
   valuation:_ksvg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
   marketingpack:_ksvg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
   ssc:_ksvg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
   seller:_ksvg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
   lease:_ksvg('<circle cx="8" cy="15" r="4"/><line x1="10.85" y1="12.15" x2="19.5" y2="3.5"/><line x1="18" y1="5" x2="20.5" y2="7.5"/><line x1="15" y1="8" x2="17.5" y2="10.5"/>'),
   file:_ksvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="15" y1="13" x2="9" y2="13"/><line x1="15" y1="17" x2="9" y2="17"/>')
  };
  var KCOL={agreement:'#2647b0',valuation:'#1f8a5b',marketingpack:'#b9761a',lease:'#3f7cac',file:'#5a3d9e',ssc:'#0b7285',loi:'#b5364f',seller:'#4b6b2f'};
  // Per-file-type glyphs for uploaded files — muted, professional differentiation (PDF, Word, Excel, PowerPoint, image, archive, text).
  var EXTICON={
   pdf:_ksvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/>'),
   doc:_ksvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>'),
   sheet:_ksvg('<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>'),
   slide:_ksvg('<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="12" y1="16" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>'),
   img:_ksvg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
   zip:_ksvg('<path d="M20 8v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8"/><rect x="2" y="3" width="20" height="5" rx="1"/><line x1="10.5" y1="12" x2="13.5" y2="12"/><line x1="10.5" y1="15.5" x2="13.5" y2="15.5"/>'),
   txt:_ksvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="9" x2="11" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>')
  };
  function extCat(ext){ ext=String(ext||'').toLowerCase(); if(ext==='pdf') return 'pdf'; if(['doc','docx','rtf','odt'].indexOf(ext)>=0) return 'doc'; if(['xls','xlsx','csv','tsv','ods'].indexOf(ext)>=0) return 'sheet'; if(['ppt','pptx','odp'].indexOf(ext)>=0) return 'slide'; if(['png','jpg','jpeg','gif','webp','bmp','svg','heic','tif','tiff'].indexOf(ext)>=0) return 'img'; if(['zip','rar','7z','gz','tar'].indexOf(ext)>=0) return 'zip'; if(['txt','md','log'].indexOf(ext)>=0) return 'txt'; return ''; }
  var DOCTYPES=['General','Agreement / Contract','Lease','Financials','Tax / W-9','Insurance / COI','Inspection','Exhibit / Addendum','Offer / LOI','Invoice / Receipt','Marketing','Legal / Entity','ID / License','Photo','Other'];

  function esc(s){ var d=document.createElement('div'); d.textContent=(s==null?'':String(s)); return d.innerHTML; }
  function fmt(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d.getTime())) return ''; return (d.getMonth()+1)+'/'+d.getDate()+'/'+String(d.getFullYear()).slice(2); }
  function fmtSize(n){ if(!n) return ''; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(0)+' KB'; return (n/1048576).toFixed(1)+' MB'; }

  function styles(){
    if(document.getElementById('rrgDocsCss')) return;
    var st=document.createElement('style'); st.id='rrgDocsCss';
    st.textContent='.docrow{cursor:pointer;}'
      +'.dico{width:26px;height:26px;flex:none;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;line-height:1;box-shadow:0 1px 2px rgba(16,24,40,.15), inset 0 1px 0 rgba(255,255,255,.18);}'+'.dico svg{width:14px;height:14px;display:block;}'+'.dico.k-agreement{background:linear-gradient(160deg,#3a5cc8,#1f3ea0);}.dico.k-valuation{background:linear-gradient(160deg,#25a06b,#167a4c);}.dico.k-marketingpack{background:linear-gradient(160deg,#d08a2a,#a5661a);}.dico.k-lease{background:linear-gradient(160deg,#4a86b6,#356594);}.dico.k-file{background:linear-gradient(160deg,#7d5bd6,#553aa0);}.dico.k-ssc{background:linear-gradient(160deg,#12a6bd,#0b7285);}.dico.k-loi{background:linear-gradient(160deg,#d24a63,#a5334a);}.dico.k-seller{background:linear-gradient(160deg,#6d954a,#4b6b2f);}'
      +'.dico.x-pdf{background:linear-gradient(160deg,#c15a51,#9a4038);}.dico.x-doc{background:linear-gradient(160deg,#4a6aa8,#33507e);}.dico.x-sheet{background:linear-gradient(160deg,#3f9068,#2c6647);}.dico.x-slide{background:linear-gradient(160deg,#c07f3c,#95602a);}.dico.x-img{background:linear-gradient(160deg,#5d8593,#456a78);}.dico.x-zip{background:linear-gradient(160deg,#8c8069,#6a6050);}.dico.x-txt{background:linear-gradient(160deg,#727b8e,#565e70);}'
      +'.docttl{font-size:13px;font-weight:400;color:#1d2739;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      +'.docmeta{font-size:11px;color:#8a93a8;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      +'.docmenu{position:absolute;z-index:60;background:#fff;border:1px solid #e0e5ee;border-radius:10px;box-shadow:0 12px 30px rgba(16,32,70,.16);padding:5px;min-width:172px;}'
      +'.docmenu button{display:block;width:100%;text-align:left;background:none;border:none;font:inherit;font-size:13px;color:#1a2236;padding:8px 11px;border-radius:7px;cursor:pointer;}'
      +'.docmenu button:hover{background:#f2f5fa;}'
      +'.dmask{position:fixed;inset:0;background:rgba(6,14,32,.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;}'
      +'.dbox{background:#fff;border-radius:16px;width:100%;max-width:440px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;max-height:calc(100vh - 40px);display:flex;flex-direction:column;}'
      +'.dbox h4{margin:0;padding:17px 21px;font-size:16px;font-weight:700;color:#000E31;border-bottom:1px solid #e6e9f0;}'
      +'.dbody{padding:17px 21px;overflow-y:auto;}'
      +'.dbody label{display:block;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:#8a93a8;font-weight:700;margin:13px 0 6px;}'
      +'.dbody label:first-child{margin-top:0;}'
      +'.dbody input,.dbody select,.dbody textarea{width:100%;border:1px solid #cfd6e2;border-radius:9px;padding:10px 12px;font:inherit;font-size:13.5px;background:#fff;}'
      +'.dbody textarea{min-height:64px;resize:vertical;}'
      +'.ddrop{border:2px dashed #cfd6e2;border-radius:11px;padding:18px;text-align:center;color:#6b7488;font-size:12.5px;cursor:pointer;background:#f5f7fb;}'
      +'.ddrop.has{border-color:#1f8a5b;color:#1f8a5b;background:#f2faf5;font-weight:700;}'
      +'.docroom{flex:none;background:none;border:none;color:#9aa4b6;cursor:pointer;font-size:13px;line-height:1;padding:0 3px;}.docroom:hover{color:#23496f;}'
      +'.docroom.in{color:#1f8a5b;}.docroom.in:hover{color:#166b45;}'
      +'.docinroom{flex:none;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#1f8a5b;background:#e7f5ee;border:1px solid #bfe3ce;border-radius:999px;padding:1px 6px;white-space:nowrap;margin-left:2px;}'
      +'.dfoot{display:flex;gap:9px;justify-content:flex-end;align-items:center;padding:13px 21px;border-top:1px solid #e6e9f0;}'
      +'.dbtn{background:#000E31;color:#fff;border:1px solid #000E31;border-radius:9px;padding:9px 16px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;}'
      +'.dbtn[disabled]{opacity:.85;cursor:default;}'
      +'.dspin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;vertical-align:-2px;margin-right:7px;animation:dspin .7s linear infinite;}@keyframes dspin{to{transform:rotate(360deg);}}'
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
    if(d.kind==='seller'){ top=d.typeLabel||'Seller Screening'; var _cpt=d.concept||(d.title && d.title!==top?d.title:''); var _loc=d.location||d.market||''; sub=[_cpt,_loc].filter(Boolean).join(' \u00b7 '); }
    // Valuation (BOV): lead with the document type \u2014 in a contact's doc list what it IS matters more
    // than the business name (which is the same across all their docs). Business drops to the subtitle.
    if(d.kind==='valuation'){ top=(d.typeLabel && /opinion/i.test(d.typeLabel)) ? d.typeLabel : 'Opinion of Value'; sub=[(d.title||d.companyName||''),(d.market||'')].filter(Boolean).join(' \u00b7 '); }
    if(d.kind==='lease' && d.variant==='pdf'){ top='Lease Abstract (PDF)'; sub=[(d.title||''),(d.market||'')].filter(Boolean).join(' \u00b7 '); }
    else if(d.kind==='lease'){ top='Lease Abstract'; sub=[(d.title||''),(d.market||''),(d.status||'')].filter(Boolean).join(' \u00b7 '); }
    if(d.kind==='marketingpack'){ sub=[(d.title||d.companyName||''),(d.market||'')].filter(Boolean).join(' \u00b7 '); }
    // Uploaded files: lead the meta line with the file type (PDF, DOCX, …), then the filed-under document type.
    if(d.kind==='file'){ var _ext=String(d.ext||'').toUpperCase(); var _dt=String(d.docType||''); sub=[_ext, (_dt && _dt.toUpperCase()!==_ext ? _dt : '')].filter(Boolean).join(' · '); }
    if(d.kind==='file' && d.size) sub+=(sub?' · ':'')+fmtSize(d.size);
    if(d.createdAt) sub+=(sub?' · ':'')+fmt(d.createdAt);
    var del=d.deleteUrl?('<button type="button" class="docdel" data-docdel="'+esc(d.id)+'" title="Delete">\u2715</button>'):'';
    var _inrooms=(d.kind==='file' && d.rooms && d.rooms.length)?d.rooms:null;
    var _rnames=_inrooms?_inrooms.map(function(r){return (r&&r.name)||'Data room';}).join(', '):'';
    var roombadge=_inrooms?('<span class="docinroom" title="In data room: '+esc(_rnames)+'">\u2713 room</span>'):'';
    var toroom=(d.kind==='file')?('<button type="button" class="docroom'+(_inrooms?' in':'')+'" data-doctoroom="'+esc(d.id)+'" title="'+(_inrooms?('In: '+esc(_rnames)+' \u2014 send to another data room'):'Send to a data room')+'">\u25a5</button>'):'';
    var _icoCls='k-'+d.kind, _icoGlyph=(KICON[d.kind]||KICON.file);
    if(d.kind==='file'){ var _cat=extCat(d.ext); if(_cat){ _icoCls='x-'+_cat; _icoGlyph=EXTICON[_cat]; } }
    return '<div class="rrow docrow" data-docurl="'+esc(d.openUrl||'')+'" data-dockind="'+esc(d.kind)+'" title="Open '+esc(d.title||'document')+'">'
      +'<span class="dico '+esc(_icoCls)+'">'+_icoGlyph+'</span>'
      +'<div class="rrmain" style="min-width:0"><div class="docttl">'+esc(top)+'</div><div class="docmeta">'+esc(sub)+'</div></div>'
      +roombadge+toroom+del
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
    var rm=e.target.closest('[data-doctoroom]');
    if(rm){ e.preventDefault(); e.stopPropagation(); openRoomPicker(rm, rm.getAttribute('data-doctoroom')); return; }
    var db=e.target.closest('[data-docdel]');
    if(db){ e.preventDefault(); e.stopPropagation(); delDoc(db.getAttribute('data-docdel')); return; }
    var r=e.target.closest('.docrow[data-docurl]');
    if(r){ e.preventDefault(); open(r.getAttribute('data-docurl')); }
  });

  function openRoomPicker(anchor, fileId){
    fetch('/api/rooms',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
      var rooms=(j&&j.rooms)||[];
      if(!rooms.length){ alert('No data rooms yet. Create one from a listing first.'); return; }
      menu(anchor, rooms.slice(0,40).map(function(rm){ return [ (rm.business||rm.name||rm.title||'Data room'), function(){ sendToRoom(fileId, rm.id); } ]; }));
    }).catch(function(){ alert('Could not load data rooms.'); });
  }
  function sendToRoom(fileId, roomId){
    fetch('/api/files/'+encodeURIComponent(fileId)+'/to-room',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:roomId})}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ if(window.rrgToast) rrgToast('Sent to '+((j.roomName)||'the data room')+' \u2713'); else alert('Sent to the data room.'); load(); } else alert((j&&j.error)||'Could not send to the room.'); }).catch(function(){ alert('Could not reach the server.'); });
  }
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

  function upload(initialFiles){
    styles();
    var pickedFiles=[];
    var mask=document.createElement('div'); mask.className='dmask';
    mask.innerHTML='<div class="dbox" role="dialog" aria-modal="true">'
      +'<h4>Upload documents</h4>'
      +'<div class="dbody">'
      +'<div class="ddrop" id="_dDrop">Click to choose one or more files — PDF, Word, Excel, PowerPoint, image, TXT, CSV or ZIP (max 25 MB each)</div>'
      +'<input type="file" id="_dFile" multiple style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.zip">'
      +'<div id="_dList" style="display:none;max-height:150px;overflow:auto;margin:2px 0 4px"></div>'
      +'<label id="_dNameLbl">Document name <span style="font-weight:400;color:#8a93a8;font-size:11px">(single file only)</span></label><input type="text" id="_dName" placeholder="Defaults to the file name" maxlength="160">'
      +'<label id="_dTypeLbl">Document type</label><select id="_dType">'+DOCTYPES.map(function(t){ return '<option>'+esc(t)+'</option>'; }).join('')+'</select>'
      +'<label>Filed under</label><div><span class="dchip">'+esc(SCOPE.name||'this record')+'</span></div>'
      +'<label>Notes <span style="font-weight:400;color:#8a93a8;font-size:11px">(applies to all)</span></label><textarea id="_dNote" maxlength="400" placeholder="Anything worth remembering about these documents…"></textarea>'
      +'</div>'
      +'<div class="dfoot"><span id="_dMsg" style="font-size:12px;color:#6b7488;margin-right:auto"></span><button type="button" class="dbtn ghost" id="_dCancel">Cancel</button><button type="button" class="dbtn" id="_dSave">Upload</button></div>'
      +'</div>';
    document.body.appendChild(mask);
    var fi=mask.querySelector('#_dFile'), dp=mask.querySelector('#_dDrop'), msg=mask.querySelector('#_dMsg'), save=mask.querySelector('#_dSave'), listEl=mask.querySelector('#_dList'), nameInp=mask.querySelector('#_dName'), nameLbl=mask.querySelector('#_dNameLbl'), typeLbl=mask.querySelector('#_dTypeLbl'), typeSel=mask.querySelector('#_dType');
    function close(){ mask.remove(); }
    var _typeOpts=DOCTYPES.map(function(t){ return '<option>'+esc(t)+'</option>'; }).join('');
    function showSharedType(show){ typeLbl.style.display=show?'':'none'; typeSel.style.display=show?'':'none'; }
    function renderPicked(){
      if(!pickedFiles.length){ dp.className='ddrop'; dp.textContent='Click to choose one or more files — PDF, Word, Excel, PowerPoint, image, TXT, CSV or ZIP (max 25 MB each)'; listEl.style.display='none'; listEl.innerHTML=''; nameInp.disabled=false; nameLbl.style.opacity=''; showSharedType(true); return; }
      if(pickedFiles.length===1){ dp.className='ddrop has'; dp.textContent='✓ '+pickedFiles[0].name+' ('+fmtSize(pickedFiles[0].size)+') — click to change'; listEl.style.display='none'; listEl.innerHTML=''; nameInp.disabled=false; nameLbl.style.opacity=''; showSharedType(true); return; }
      // Multiple files — each gets its own type (AI pre-fills), so the single shared type field is hidden.
      dp.className='ddrop has'; dp.textContent='✓ '+pickedFiles.length+' files selected — click to change';
      showSharedType(false); nameInp.disabled=true; nameInp.value=''; nameLbl.style.opacity='.5';
      listEl.style.display='block';
      listEl.innerHTML='<div style="font-size:11px;font-weight:700;color:#8a93a8;letter-spacing:.03em;text-transform:uppercase;padding:2px 2px 6px">Documents — pick a type for each <span id="_dAi" style="font-weight:600;text-transform:none;letter-spacing:0;color:#23496f"></span></div>'+pickedFiles.map(function(f,idx){ var big=f.size>25*1024*1024; return '<div style="display:flex;align-items:center;gap:8px;padding:4px 2px;border-bottom:1px solid #f0f3f8">'
        +'<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:'+(big?'#b23a2c':'#5b6472')+'" title="'+esc(f.name)+'">'+esc(f.name)+(big?' · too big':'')+'</span>'
        +'<select class="_dRowType" data-i="'+idx+'" style="flex:none;font:inherit;font-size:12px;padding:5px 7px;border:1px solid #cfd6e2;border-radius:7px;max-width:158px;background:#fff">'+_typeOpts+'</select>'
        +'</div>'; }).join('');
      classify();
    }
    function classify(){
      if(pickedFiles.length<2) return;
      var aiEl=mask.querySelector('#_dAi'); if(aiEl) aiEl.textContent='✨ tagging…';
      fetch('/api/classify-docs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ files:pickedFiles.map(function(f){ return {name:f.name}; }), types:DOCTYPES })})
        .then(function(r){ return r.json(); }).then(function(j){
          if(!aiEl) aiEl=mask.querySelector('#_dAi');
          if(j&&j.ok&&j.results&&j.results.length){ var byName={}; j.results.forEach(function(x){ if(x&&x.name) byName[x.name]=x.type; });
            listEl.querySelectorAll('._dRowType').forEach(function(sel){ var i=+sel.getAttribute('data-i'); var f=pickedFiles[i]; var t=f&&byName[f.name]; if(t){ sel.value=t; } });
            if(aiEl) aiEl.textContent='✨ types suggested — adjust any if needed';
          } else { if(aiEl) aiEl.textContent=''; }
        }).catch(function(){ var a=mask.querySelector('#_dAi'); if(a) a.textContent=''; });
    }
    dp.addEventListener('click',function(){ fi.click(); });
    fi.addEventListener('change',function(){ pickedFiles=Array.prototype.slice.call(fi.files||[]); msg.textContent=''; renderPicked(); });
    if(initialFiles && initialFiles.length){ pickedFiles=Array.prototype.slice.call(initialFiles); msg.textContent=''; renderPicked(); }
    mask.querySelector('#_dCancel').addEventListener('click',close);
    mask.addEventListener('click',function(e){ if(e.target===mask) close(); });
    function readFile(f){ return new Promise(function(res,rej){ var rd=new FileReader(); rd.onload=function(){ var s=String(rd.result||''), i=s.indexOf(','); res(i>=0?s.slice(i+1):s); }; rd.onerror=function(){ rej(new Error('read')); }; rd.readAsDataURL(f); }); }
    function uploadOne(f, useName, typeVal){ return readFile(f).then(function(b64){ return fetch('/api/files',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      filename:f.name, dataB64:b64,
      title:(useName?nameInp.value.trim():''),
      docType:(typeVal!=null?typeVal:typeSel.value),
      note:mask.querySelector('#_dNote').value.trim(),
      relatesToType:(SCOPE.param==='companyId'?'company':'contact'), relatesToId:SCOPE.id, relatesToName:(SCOPE.name||'')
    })}).then(function(r){ return r.json(); }); }); }
    function rowType(i){ var sel=listEl.querySelector('._dRowType[data-i="'+i+'"]'); return sel?sel.value:''; }
    save.addEventListener('click',function(){
      if(!pickedFiles.length){ msg.textContent='Choose at least one file first.'; return; }
      var tooBig=pickedFiles.filter(function(f){ return f.size>25*1024*1024; });
      if(tooBig.length){ msg.textContent=(tooBig.length===1?('“'+tooBig[0].name+'” is'):(tooBig.length+' files are'))+' over 25 MB — remove '+(tooBig.length===1?'it':'them')+' and try again.'; return; }
      save.disabled=true;
      var single=(pickedFiles.length===1), total=pickedFiles.length, done=0, failed=0;
      function working(n){ save.innerHTML='<span class="dspin"></span>'+(total>1?('Uploading '+n+' of '+total+'…'):'Uploading…'); }
      working(1); msg.style.color='#6b7488'; msg.textContent=(total>1?('Uploading '+total+' files — please keep this window open…'):'Uploading…');
      (function next(i){
        if(i>=total){ if(failed){ save.disabled=false; save.textContent='Upload'; msg.style.color='#DA2B1F'; msg.textContent=done+' uploaded, '+failed+' failed.'; if(done) load(); } else { save.innerHTML='✓ Done'; msg.textContent=''; setTimeout(function(){ close(); load(); },250); } return; }
        working(i+1);
        uploadOne(pickedFiles[i], single, single?null:rowType(i)).then(function(j){ if(j&&j.ok) done++; else failed++; }).catch(function(){ failed++; }).then(function(){ next(i+1); });
      })(0);
    });
    setTimeout(function(){ try{ dp.focus(); }catch(e){} },40);
  }

  window.RRGDocs={ init:init, reload:load, count:count, filesCount:filesCount, ready:ready, rowsHtml:rowsHtml, filesRowsHtml:filesRowsHtml, upload:upload, menu:menu, open:open, icon:function(k){ return KICON[k]||KICON.file; } };
})();
