/* RRG Email Composer — block-based visual email builder.
   Exposes window.RRGComposer with: defaultBlocks, export, parse, mount.
   Export produces email-safe table HTML (matches the approved RRG template)
   with an embedded block model comment so campaigns can be re-edited visually. */
(function () {
  'use strict';
  function esc(s){ s=(s==null?'':String(s)); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function b64e(str){ try { return btoa(unescape(encodeURIComponent(str))); } catch(e){ return Buffer.from(str,'utf8').toString('base64'); } }
  function b64d(str){ try { return decodeURIComponent(escape(atob(str))); } catch(e){ return Buffer.from(str,'base64').toString('utf8'); } }
  function colors(brand){ brand=brand||{}; return { P: brand.primary||'#16233f', A: brand.accent||'#DA2B1F' }; }

  var TYPES = {
    header:   { label:'Header',      once:true },
    hero:     { label:'Hero image' },
    title:    { label:'Title block' },
    stats:    { label:'Stat grid' },
    text:     { label:'Text' },
    highlights:{ label:'Highlights' },
    button:   { label:'Button' },
    image:    { label:'Image' },
    divider:  { label:'Divider' },
    spacer:   { label:'Spacer' },
    signature:{ label:'Signature' },
    footer:   { label:'Footer',      once:true }
  };

  // Three brokerage-selectable visual styles. Same block model, different look.
  function styleTokens(brand){
    var c=colors(brand), P=c.P, A=c.A;
    var st=(brand&&brand.style)||'modern';
    var base={ st:'modern', P:P, A:A, bodyFont:"Arial,Helvetica,sans-serif",
      pageBg:"#eef1f6", cardBg:"#ffffff", cardRadius:"14px", cardShadow:"0 6px 22px rgba(20,30,55,.10)",
      headerPad:"24px 34px", ruleColor:A, ruleH:"3px",
      eyebrowColor:A, eyebrowLS:"2px",
      titleColor:P, titleSize:"27px", titleWeight:"700", titleLS:"-.3px", titleAlign:"left",
      subColor:"#5c667d", bodyColor:"#3d4453", bodySize:"15px",
      metaBg:"#f8fafc", metaBorder:"#e6e9f0", statLabel:"#8a93a8", statVal:P, metaRadius:"10px",
      secMode:"underline", secColor:P, secRule:P, checkColor:A,
      btnBg:P, btnColor:"#ffffff", btnRadius:"8px", btnPad:"15px 34px",
      sigLine:"#5c667d", lineColor:"#e6e9f0",
      footBg:"#f5f7fb", footTop:"#e6e9f0", footCity:"#8a93a8", footText:"#9aa3b5", footLink:"#5c667d" };
    if(st==='bold') return Object.assign({},base,{ st:'bold',
      headerPad:"32px 34px", cardRadius:"8px", ruleH:"5px",
      titleSize:"34px", titleWeight:"800", titleLS:"-.6px",
      statVal:A, secMode:"chip",
      btnBg:A, btnRadius:"999px", btnPad:"16px 42px",
      footBg:P, footTop:"rgba(255,255,255,.14)", footCity:"rgba(255,255,255,.72)", footText:"rgba(255,255,255,.6)", footLink:"#ffffff" });
    if(st==='warm') return Object.assign({},base,{ st:'warm',
      pageBg:"#f4efe7", cardBg:"#fffdfa", cardRadius:"20px", cardShadow:"0 8px 26px rgba(90,70,40,.12)",
      headerPad:"26px 36px", ruleH:"2px",
      titleSize:"26px", titleLS:"-.2px",
      metaBg:"#faf6ef", metaBorder:"#ece3d5", statLabel:"#a08a6a", metaRadius:"14px",
      secMode:"softcaps", secRule:"#e6ddcd",
      btnRadius:"14px", btnPad:"14px 32px", sigLine:"#7a6a52", lineColor:"#ece3d5",
      footBg:"#faf6ef", footTop:"#ece3d5", footCity:"#a08a6a", footText:"#9a8b76", footLink:"#7a6a52" });
    return base;
  }

  function logoMarkup(brand){
    var c=colors(brand);
    var org=(brand&&brand.orgName)||'Restaurant Realty Group';
    if(brand && brand.logo){
      return '<img src="'+esc(brand.logo)+'" alt="'+esc(org)+'" height="40" style="display:block;height:40px;width:auto;border:0;">';
    }
    var abbr=(org.match(/\b[A-Za-z]/g)||['R','R','G']).slice(0,3).join('').toUpperCase();
    return '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
      +'<td style="vertical-align:middle;padding-right:12px;"><div style="width:44px;height:44px;background:'+c.A+';border-radius:50%;text-align:center;line-height:44px;color:#fff;font:700 15px/44px Arial,Helvetica,sans-serif;letter-spacing:.5px;">'+esc(abbr)+'</div></td>'
      +'<td style="vertical-align:middle;border-left:2px solid rgba(255,255,255,.25);padding-left:12px;"><div style="color:#fff;font:700 16px/1.15 Arial,Helvetica,sans-serif;letter-spacing:.4px;text-transform:uppercase;">'+esc(org)+'</div><div style="color:rgba(255,255,255,.62);font:600 10.5px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.4px;text-transform:uppercase;margin-top:3px;">Restaurant Transactions. Done Right.</div></td>'
      +'</tr></table>';
  }

  function inlineText(s, P){
    return esc(s).replace(/\*\*(.+?)\*\*/g,'<b style="color:'+P+';">$1</b>').replace(/\n/g,'<br>');
  }

  // Each block -> one or more <tr> rows within the 600px card table.
  function blockRows(b, brand){
    var T=styleTokens(brand), P=T.P, A=T.A, F=T.bodyFont, p=b.props||{};
    switch(b.type){
      case 'header':
        return '<tr><td style="background:'+P+';padding:'+T.headerPad+';">'+logoMarkup(brand)+'</td></tr>\n'
             + '<tr><td style="height:'+T.ruleH+';background:'+T.ruleColor+';line-height:'+T.ruleH+';font-size:0;">&nbsp;</td></tr>';
      case 'hero': {
        var img = p.url
          ? '<img src="'+esc(p.url)+'" width="600" alt="'+esc(p.alt||'')+'" style="display:block;width:100%;max-width:600px;height:auto;border:0;">'
          : '<div style="background:#dfe4ec;height:240px;text-align:center;color:#9aa3b5;font:600 12px/240px '+F+';">Your listing photo &mdash; add an image URL</div>';
        var cap = p.caption ? '<tr><td style="padding:9px 34px 0;"><div style="color:#9aa3b5;font:italic 400 11px/1.5 '+F+';">'+esc(p.caption)+'</div></td></tr>' : '';
        return '<tr><td style="padding:0;">'+img+'</td></tr>'+(cap?('\n'+cap):'');
      }
      case 'title':
        return '<tr><td style="padding:22px 34px 0;text-align:'+T.titleAlign+';">'
          +(p.eyebrow?'<div style="color:'+T.eyebrowColor+';font:700 11px/1.4 '+F+';letter-spacing:'+T.eyebrowLS+';text-transform:uppercase;">'+esc(p.eyebrow)+'</div>':'')
          +'<h1 style="margin:8px 0 6px;color:'+T.titleColor+';font:'+T.titleWeight+' '+T.titleSize+'/1.2 '+F+';letter-spacing:'+T.titleLS+';">'+esc(p.headline||'')+'</h1>'
          +(p.subtitle?'<div style="color:'+T.subColor+';font:600 14px/1.5 '+F+';">'+esc(p.subtitle)+'</div>':'')
          +'</td></tr>';
      case 'stats': {
        var items=(p.items||[]).filter(function(it){ return it && (it.label||it.value); });
        if(!items.length) return '';
        var cells='';
        for(var i=0;i<items.length;i+=2){
          var lastRow=(i+2>=items.length);
          var left=items[i], right=items[i+1];
          function cell(it,isLeft){ return '<td width="50%" style="padding:16px 18px;'+(isLeft?'border-right:1px solid '+T.metaBorder+';':'')+(lastRow?'':'border-bottom:1px solid '+T.metaBorder+';')+'"><div style="color:'+T.statLabel+';font:700 10px/1.4 '+F+';letter-spacing:1.2px;text-transform:uppercase;">'+esc(it.label||'')+'</div><div style="color:'+T.statVal+';font:700 21px/1.25 '+F+';margin-top:3px;">'+esc(it.value||'')+'</div></td>'; }
          cells+='<tr>'+cell(left,true)+(right?cell(right,false):'<td width="50%" style="padding:16px 18px;'+(lastRow?'':'border-bottom:1px solid '+T.metaBorder+';')+'"></td>')+'</tr>';
        }
        return '<tr><td style="padding:20px 34px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid '+T.metaBorder+';border-radius:'+T.metaRadius+';background:'+T.metaBg+';">'+cells+'</table></td></tr>';
      }
      case 'text': {
        var parts=String(p.text||'').split(/\n\s*\n/);
        var html=parts.map(function(seg,idx){ var last=(idx===parts.length-1); return '<p style="margin:0'+(last?'':' 0 15px')+';color:'+T.bodyColor+';font:400 '+T.bodySize+'/1.65 '+F+';">'+inlineText(seg,P)+'</p>'; }).join('');
        return '<tr><td style="padding:20px 34px 0;">'+html+'</td></tr>';
      }
      case 'highlights': {
        var its=(p.items||[]).filter(function(t){ return t; });
        var rows=its.map(function(t){ return '<tr><td style="padding:6px 0;vertical-align:top;width:22px;color:'+T.checkColor+';font:700 15px/1.5 '+F+';">&#10003;</td><td style="padding:6px 0;color:'+T.bodyColor+';font:400 14.5px/1.55 '+F+';">'+esc(t)+'</td></tr>'; }).join('');
        var ti=esc(p.title||'Highlights'), head;
        if(T.secMode==='chip') head='<div style="display:inline-block;background:'+P+';color:#fff;font:700 11px/1.4 '+F+';letter-spacing:1.4px;text-transform:uppercase;padding:6px 14px;border-radius:5px;">'+ti+'</div>';
        else if(T.secMode==='softcaps') head='<div style="color:'+T.secColor+';font:700 12px/1.4 '+F+';letter-spacing:1.6px;text-transform:uppercase;padding-bottom:9px;border-bottom:1px solid '+T.secRule+';">'+ti+'</div>';
        else head='<div style="color:'+T.secColor+';font:700 12px/1.4 '+F+';letter-spacing:1.6px;text-transform:uppercase;padding-bottom:10px;border-bottom:2px solid '+T.secRule+';">'+ti+'</div>';
        return '<tr><td style="padding:24px 34px 0;">'+head+'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">'+rows+'</table></td></tr>';
      }
      case 'button':
        return '<tr><td style="padding:28px 34px 6px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:'+T.btnRadius+';background:'+T.btnBg+';"><a href="'+esc(p.url||'#')+'" style="display:inline-block;padding:'+T.btnPad+';color:'+T.btnColor+';font:700 15px/1 '+F+';letter-spacing:.3px;text-decoration:none;border-radius:'+T.btnRadius+';">'+esc(p.text||'Learn more')+'</a></td></tr></table>'+(p.subtext?'<div style="margin-top:12px;color:'+T.statLabel+';font:400 12.5px/1.5 '+F+';">'+esc(p.subtext)+'</div>':'')+'</td></tr>';
      case 'image': {
        var im='<img src="'+esc(p.url||'')+'" width="532" alt="'+esc(p.alt||'')+'" style="display:block;width:100%;max-width:532px;height:auto;border:0;border-radius:8px;">';
        if(p.link) im='<a href="'+esc(p.link)+'">'+im+'</a>';
        return '<tr><td style="padding:18px 34px 0;">'+im+'</td></tr>';
      }
      case 'divider':
        return '<tr><td style="padding:20px 34px 0;"><div style="border-top:1px solid '+T.lineColor+';font-size:0;line-height:0;">&nbsp;</div></td></tr>';
      case 'spacer': {
        var h=Math.max(4,Math.min(120,parseInt(p.height,10)||24));
        return '<tr><td style="height:'+h+'px;line-height:'+h+'px;font-size:0;">&nbsp;</td></tr>';
      }
      case 'signature':
        return '<tr><td style="padding:22px 34px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid '+T.lineColor+';"><tr><td style="padding-top:18px;"><div style="color:'+P+';font:700 15px/1.3 '+F+';">'+esc(p.name||'Your RRG Advisor')+'</div><div style="color:'+T.sigLine+';font:400 13px/1.6 '+F+';margin-top:2px;">'+esc(p.line||'')+'</div></td></tr></table></td></tr>';
      case 'footer':
        return '<tr><td style="padding:22px 34px 26px;background:'+T.footBg+';border-top:1px solid '+T.footTop+';"><div style="color:'+T.footCity+';font:600 10px/1.6 '+F+';letter-spacing:1.2px;text-transform:uppercase;text-align:center;">'+esc(p.cities||'')+'</div><div style="color:'+T.footText+';font:400 11.5px/1.7 '+F+';text-align:center;margin-top:10px;">'+esc(p.optin||'')+'<br><a href="{{unsubscribe_url}}" style="color:'+T.footLink+';text-decoration:underline;">Unsubscribe</a></div></td></tr>';
      default: return '';
    }
  }

  function exportHtml(blocks, brand){
    blocks=blocks||[];
    var T=styleTokens(brand);
    var rows=blocks.map(function(b){ return blockRows(b, brand); }).join('\n');
    var html=''
      +'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:'+T.pageBg+';font-family:'+T.bodyFont+';"><tr><td align="center" style="padding:28px 14px;">\n'
      +'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:'+T.cardBg+';border-radius:'+T.cardRadius+';overflow:hidden;box-shadow:'+T.cardShadow+';">\n'
      +rows+'\n'
      +'</table>\n</td></tr></table>';
    var model='<!--RRGB:'+b64e(JSON.stringify({ v:1, blocks:blocks, style:(brand&&brand.style)||'modern' }))+'-->';
    return html+'\n'+model;
  }

  function parseHtml(html){
    if(!html) return null;
    var m=/<!--RRGB:([A-Za-z0-9+/=]+)-->/.exec(html);
    if(!m) return null;
    try { var o=JSON.parse(b64d(m[1])); return (o && Array.isArray(o.blocks)) ? o.blocks : null; } catch(e){ return null; }
  }

  function defaultBlocks(){
    return [
      { type:'header', props:{} },
      { type:'hero', props:{ url:'', alt:'', caption:'Representative image — does not depict the business offered.' } },
      { type:'title', props:{ eyebrow:'New Opportunity', headline:'Headline goes here', subtitle:'Concept · Years in operation · What is included' } },
      { type:'stats', props:{ items:[ {label:'Annual Sales',value:'$0.0M'}, {label:'Real Estate',value:'Included'}, {label:'Operating History',value:'00+ Years'}, {label:'Location',value:'City, ST'} ] } },
      { type:'text', props:{ text:'Hi {{first_name}}, open with the single most compelling line about this opportunity. Keep it tight and let the offer do the talking.\n\nAdd a second short paragraph with the key thesis, e.g. **ongoing cash flow** and **underlying real estate value**.' } },
      { type:'highlights', props:{ title:'Highlights', items:['First key highlight','Second key highlight','Third key highlight'] } },
      { type:'button', props:{ text:'Request the Offering Memorandum →', url:'https://rrgcre.com', subtext:'NDA required · Financials available to qualified buyers' } },
      { type:'signature', props:{ name:'Your RRG Advisor', line:'Restaurant Realty Group · (210) 555-0100 · deals@rrgcre.com' } },
      { type:'footer', props:{ cities:'Austin · Dallas · Houston · San Antonio', optin:'You are receiving this because you opted in to RRG listing alerts.' } }
    ];
  }

  function newBlock(type){
    var d={
      hero:{ url:'', alt:'', caption:'' },
      title:{ eyebrow:'', headline:'New headline', subtitle:'' },
      stats:{ items:[ {label:'Label',value:'Value'}, {label:'Label',value:'Value'} ] },
      text:{ text:'Write your message here.' },
      highlights:{ title:'Highlights', items:['New highlight'] },
      button:{ text:'Learn more', url:'https://rrgcre.com', subtext:'' },
      image:{ url:'', alt:'', link:'' },
      divider:{},
      spacer:{ height:24 },
      signature:{ name:'Your RRG Advisor', line:'Restaurant Realty Group · (210) 555-0100 · deals@rrgcre.com' },
      header:{},
      footer:{ cities:'Austin · Dallas · Houston · San Antonio', optin:'You are receiving this because you opted in to RRG listing alerts.' }
    };
    return { type:type, props: JSON.parse(JSON.stringify(d[type]||{})) };
  }

  /* ---------------- editor UI ---------------- */
  function mount(container, opts){
    opts=opts||{};
    var blocks = Array.isArray(opts.blocks) ? opts.blocks : defaultBlocks();
    var brand = opts.brand||{};
    var onChange = opts.onChange||function(){};
    var sel = -1, dragFrom = -1;

    var root=document.createElement('div'); root.className='rc-root';
    container.innerHTML=''; container.appendChild(root);
    injectStyles();

    var bar=el('div','rc-bar'); root.appendChild(bar);
    var addWrap=el('div','rc-add');
    var addBtn=el('button','rc-addbtn'); addBtn.type='button'; addBtn.innerHTML='+ Add block';
    var menu=el('div','rc-menu'); menu.style.display='none';
    Object.keys(TYPES).forEach(function(t){ if(TYPES[t].once) return; var mi=el('button','rc-mi'); mi.type='button'; mi.textContent=TYPES[t].label; mi.onclick=function(){ addBlock(t); menu.style.display='none'; }; menu.appendChild(mi); });
    addBtn.onclick=function(e){ e.stopPropagation(); menu.style.display=(menu.style.display==='none'?'block':'none'); };
    document.addEventListener('click',function(){ menu.style.display='none'; });
    addWrap.appendChild(addBtn); addWrap.appendChild(menu); bar.appendChild(addWrap);
    var hint=el('div','rc-hint'); hint.textContent='Click a block to edit · drag the handle to reorder'; bar.appendChild(hint);

    var body=el('div','rc-body'); root.appendChild(body);
    var canvasWrap=el('div','rc-canvaswrap'); var canvas=el('div','rc-canvas'); canvasWrap.appendChild(canvas); body.appendChild(canvasWrap);
    var insp=el('div','rc-insp'); body.appendChild(insp);

    function el(tag,cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }
    function fire(){ onChange(blocks, exportHtml(blocks, brand)); }
    function addBlock(t){ var nb=newBlock(t); var at=(sel>=0?sel+1:blocks.length); if(blocks[at] && blocks[at].type==='footer'){} blocks.splice(at,0,nb); sel=at; renderCanvas(); renderInsp(); fire(); }

    function renderCanvas(){
      canvas.innerHTML='';
      blocks.forEach(function(b,i){
        var w=el('div','rc-blk'+(i===sel?' sel':'')); w.setAttribute('draggable','true'); w.dataset.i=i;
        var handle=el('div','rc-handle'); handle.innerHTML='&#8942;&#8942;'; handle.title='Drag to reorder'; w.appendChild(handle);
        var tag=el('div','rc-tag'); tag.textContent=(TYPES[b.type]&&TYPES[b.type].label)||b.type; w.appendChild(tag);
        var ctr=el('div','rc-ctr');
        ctr.appendChild(iconBtn('&#9650;','Move up',function(e){ e.stopPropagation(); move(i,-1); }));
        ctr.appendChild(iconBtn('&#9660;','Move down',function(e){ e.stopPropagation(); move(i,1); }));
        if(!(TYPES[b.type]&&TYPES[b.type].once)){
          ctr.appendChild(iconBtn('&#10697;','Duplicate',function(e){ e.stopPropagation(); dup(i); }));
          ctr.appendChild(iconBtn('&#10005;','Delete',function(e){ e.stopPropagation(); del(i); }));
        }
        w.appendChild(ctr);
        var prev=el('div','rc-prev');
        prev.innerHTML='<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:collapse;">'+blockRows(b,brand)+'</table>';
        w.appendChild(prev);
        w.onclick=function(){ sel=i; renderCanvas(); renderInsp(); };
        w.addEventListener('dragstart',function(ev){ dragFrom=i; w.classList.add('drag'); try{ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text',''+i);}catch(e){} });
        w.addEventListener('dragend',function(){ dragFrom=-1; w.classList.remove('drag'); clearOver(); });
        w.addEventListener('dragover',function(ev){ ev.preventDefault(); w.classList.add('over'); });
        w.addEventListener('dragleave',function(){ w.classList.remove('over'); });
        w.addEventListener('drop',function(ev){ ev.preventDefault(); w.classList.remove('over'); if(dragFrom>=0 && dragFrom!==i){ var it=blocks.splice(dragFrom,1)[0]; blocks.splice(i,0,it); sel=i; renderCanvas(); renderInsp(); fire(); } });
        canvas.appendChild(w);
      });
    }
    function clearOver(){ var n=canvas.querySelectorAll('.over'); for(var k=0;k<n.length;k++) n[k].classList.remove('over'); }
    function iconBtn(html,title,fn){ var b=el('button','rc-ic'); b.type='button'; b.innerHTML=html; b.title=title; b.onclick=fn; return b; }
    function move(i,d){ var j=i+d; if(j<0||j>=blocks.length) return; var t=blocks[i]; blocks[i]=blocks[j]; blocks[j]=t; sel=j; renderCanvas(); renderInsp(); fire(); }
    function dup(i){ blocks.splice(i+1,0,JSON.parse(JSON.stringify(blocks[i]))); sel=i+1; renderCanvas(); renderInsp(); fire(); }
    function del(i){ blocks.splice(i,1); if(sel>=blocks.length) sel=blocks.length-1; renderCanvas(); renderInsp(); fire(); }

    function renderInsp(){
      insp.innerHTML='';
      if(sel<0||!blocks[sel]){ insp.innerHTML='<div class="rc-empty">Select a block to edit its content.</div>'; return; }
      var b=blocks[sel], p=b.props;
      var h=el('div'); var head=el('div','rc-ih'); head.textContent=(TYPES[b.type]&&TYPES[b.type].label)||b.type; h.appendChild(head);
      function field(label,val,key,area){
        var f=el('div','rc-f'); var l=el('label','rc-l'); l.textContent=label; f.appendChild(l);
        var inp=area?el('textarea','rc-in'):el('input','rc-in'); inp.value=val==null?'':val; if(area) inp.rows=area;
        inp.oninput=function(){ p[key]=inp.value; renderCanvas(); fire(); };
        f.appendChild(inp); h.appendChild(f); return inp;
      }
      if(b.type==='header'){ h.appendChild(note('Uses your live brand color and logo automatically. Upload a logo in Admin to replace the RRG text lockup.')); }
      else if(b.type==='hero'){ field('Image URL',p.url,'url'); field('Alt text',p.alt,'alt'); field('Caption (optional)',p.caption,'caption'); h.appendChild(note('Paste a hosted image URL. Leave blank to show a placeholder.')); }
      else if(b.type==='title'){ field('Eyebrow',p.eyebrow,'eyebrow'); field('Headline',p.headline,'headline'); field('Subtitle',p.subtitle,'subtitle'); }
      else if(b.type==='text'){ field('Text',p.text,'text',7); h.appendChild(note('Blank line = new paragraph. Wrap **text** in double asterisks for bold. Use {{first_name}} to personalize.')); }
      else if(b.type==='button'){ field('Button label',p.text,'text'); field('Link URL',p.url,'url'); field('Sub-text (optional)',p.subtext,'subtext'); }
      else if(b.type==='image'){ field('Image URL',p.url,'url'); field('Alt text',p.alt,'alt'); field('Link (optional)',p.link,'link'); }
      else if(b.type==='spacer'){ field('Height (px)',p.height,'height'); }
      else if(b.type==='signature'){ field('Name / title',p.name,'name'); field('Contact line',p.line,'line'); }
      else if(b.type==='divider'){ h.appendChild(note('A thin horizontal rule. No settings.')); }
      else if(b.type==='footer'){ field('Cities line',p.cities,'cities'); field('Opt-in reminder',p.optin,'optin',2); h.appendChild(note('The unsubscribe link is added automatically and is required for compliance.')); }
      else if(b.type==='stats'){ h.appendChild(listEditor('Stats (label + value)', p.items, ['label','value'])); }
      else if(b.type==='highlights'){ field('Section title',p.title,'title'); h.appendChild(listEditor('Highlight lines', p.items, null)); }
      insp.appendChild(h);
    }
    function note(t){ var n=document.createElement('div'); n.className='rc-note'; n.textContent=t; return n; }
    function listEditor(label, arr, keys){
      var wrap=document.createElement('div'); var l=document.createElement('div'); l.className='rc-l'; l.textContent=label; wrap.appendChild(l);
      function redraw(){
        wrap.querySelectorAll('.rc-li').forEach(function(n){ n.remove(); });
        arr.forEach(function(item,idx){
          var row=document.createElement('div'); row.className='rc-li';
          if(keys){ keys.forEach(function(k){ var inp=document.createElement('input'); inp.className='rc-in'; inp.placeholder=k; inp.value=item[k]==null?'':item[k]; inp.oninput=function(){ item[k]=inp.value; renderCanvas(); fire(); }; row.appendChild(inp); }); }
          else { var inp=document.createElement('input'); inp.className='rc-in'; inp.value=item==null?'':item; inp.oninput=function(){ arr[idx]=inp.value; renderCanvas(); fire(); }; row.appendChild(inp); }
          var rm=document.createElement('button'); rm.type='button'; rm.className='rc-ic'; rm.innerHTML='&#10005;'; rm.title='Remove'; rm.onclick=function(){ arr.splice(idx,1); renderCanvas(); renderInsp(); fire(); }; row.appendChild(rm);
          addBtnRef.parentNode.insertBefore(row, addBtnRef);
        });
      }
      var addBtnRef=document.createElement('button'); addBtnRef.type='button'; addBtnRef.className='rc-additem'; addBtnRef.textContent='+ Add';
      addBtnRef.onclick=function(){ if(keys){ var o={}; keys.forEach(function(k){o[k]='';}); arr.push(o); } else { arr.push(''); } renderCanvas(); renderInsp(); fire(); };
      wrap.appendChild(addBtnRef); redraw();
      return wrap;
    }

    renderCanvas(); renderInsp(); fire();
    return { getBlocks:function(){ return blocks; }, getHtml:function(){ return exportHtml(blocks, brand); } };
  }

  function injectStyles(){
    if(document.getElementById('rc-css')) return;
    var s=document.createElement('style'); s.id='rc-css';
    s.textContent=[
      '.rc-root{border:1px solid #e6e9f0;border-radius:10px;overflow:hidden;background:#fff;}',
      '.rc-bar{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid #e6e9f0;background:#f8fafc;}',
      '.rc-add{position:relative;}',
      '.rc-addbtn{background:#16233f;color:#fff;border:none;border-radius:6px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;}',
      '.rc-menu{position:absolute;top:38px;left:0;z-index:20;background:#fff;border:1px solid #dbe0e9;border-radius:8px;box-shadow:0 8px 24px rgba(20,30,55,.14);padding:5px;min-width:170px;}',
      '.rc-mi{display:block;width:100%;text-align:left;background:none;border:none;padding:8px 12px;font:inherit;font-size:13px;color:#20334f;border-radius:5px;cursor:pointer;}',
      '.rc-mi:hover{background:#eef2f7;}',
      '.rc-hint{color:#8a93a8;font-size:12px;}',
      '.rc-body{display:grid;grid-template-columns:1fr 300px;min-height:460px;}',
      '.rc-canvaswrap{background:#eef1f6;padding:20px;overflow:auto;max-height:640px;}',
      '.rc-canvas{width:600px;max-width:100%;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 22px rgba(20,30,55,.10);}',
      '.rc-blk{position:relative;outline:2px solid transparent;transition:outline-color .1s;cursor:pointer;}',
      '.rc-blk:hover{outline-color:#c9d3e6;}',
      '.rc-blk.sel{outline-color:#2c5c8f;}',
      '.rc-blk.over{outline-color:#1f8a5b;outline-style:dashed;}',
      '.rc-blk.drag{opacity:.5;}',
      '.rc-prev{pointer-events:none;overflow:hidden;}',
      '.rc-prev table{width:600px !important;max-width:600px !important;}',
      '.rc-handle{position:absolute;top:6px;left:6px;z-index:5;background:rgba(255,255,255,.92);border:1px solid #dbe0e9;border-radius:5px;padding:1px 6px;color:#69748a;font-size:11px;letter-spacing:-2px;cursor:grab;opacity:0;transition:opacity .1s;}',
      '.rc-tag{position:absolute;top:6px;left:44px;z-index:5;background:rgba(32,51,79,.9);color:#fff;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;opacity:0;transition:opacity .1s;}',
      '.rc-ctr{position:absolute;top:6px;right:6px;z-index:5;display:flex;gap:4px;opacity:0;transition:opacity .1s;}',
      '.rc-blk:hover .rc-handle,.rc-blk:hover .rc-tag,.rc-blk:hover .rc-ctr,.rc-blk.sel .rc-handle,.rc-blk.sel .rc-tag,.rc-blk.sel .rc-ctr{opacity:1;}',
      '.rc-ic{background:rgba(255,255,255,.95);border:1px solid #dbe0e9;border-radius:5px;width:24px;height:24px;color:#20334f;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;}',
      '.rc-ic:hover{background:#eef2f7;}',
      '.rc-insp{padding:14px 16px;border-left:1px solid #e6e9f0;overflow:auto;max-height:640px;background:#fff;}',
      '.rc-ih{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#20334f;margin-bottom:12px;}',
      '.rc-empty{color:#8a93a8;font-size:13px;padding-top:20px;}',
      '.rc-f{margin-bottom:11px;}',
      '.rc-l{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8a93a8;margin-bottom:5px;}',
      '.rc-in{width:100%;font:inherit;font-size:13px;padding:8px 10px;border:1px solid #c4ccda;border-radius:4px;color:#1a2236;box-sizing:border-box;}',
      'textarea.rc-in{resize:vertical;line-height:1.5;}',
      '.rc-note{color:#8a93a8;font-size:11.5px;line-height:1.5;margin:4px 0 12px;}',
      '.rc-li{display:flex;gap:6px;margin-bottom:6px;align-items:center;}',
      '.rc-additem{background:#fff;border:1px dashed #c4ccda;border-radius:5px;padding:6px 10px;font:inherit;font-size:12px;font-weight:600;color:#2c5c8f;cursor:pointer;width:100%;}',
      '@media(max-width:820px){.rc-body{grid-template-columns:1fr;}.rc-insp{border-left:none;border-top:1px solid #e6e9f0;}.rc-canvas{width:100%;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  window.RRGComposer = { defaultBlocks: defaultBlocks, export: exportHtml, parse: parseHtml, mount: mount, blockRows: blockRows };
  if (typeof module!=='undefined' && module.exports) module.exports = window.RRGComposer;
})();
