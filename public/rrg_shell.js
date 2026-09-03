/* RRG app shell — persistent Copper-style left nav + top bar, injected on every page.
   Palette-driven (--navbg / --red), admin-aware, hides the old per-page navy headers.
   Opt a page out with <meta name="rrg-noshell">. */
(function () {
  if (window.__rrgShell) return;
  var path = (location.pathname || '').toLowerCase();
  var file = path.split('/').pop() || 'index.html';
  if (/\/login/.test(path) || file === 'login' ) return;
  if ((/[?&]embed=1/.test(location.search)||(function(){try{return window.top!==window.self;}catch(e){return true;}})())) return;
  if (document.querySelector('meta[name="rrg-noshell"]')) return;
  window.__rrgShell = true;
  // Branded in-app notifications — replaces the native alert() popup (which leaked the backend domain) app-wide.
  try {
    var _rrgToastWrap = null;
    function _rrgToastCss() {
      if (document.getElementById('rrgtoast-css')) return;
      var st = document.createElement('style'); st.id = 'rrgtoast-css';
      st.textContent =
        '#rrgtoastwrap{position:fixed;top:14px;right:14px;z-index:2000;display:flex;flex-direction:column;gap:10px;max-width:380px;pointer-events:none;}'
        + '.rrgtoast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;background:#0f1b3d;color:#fff;border-radius:11px;padding:13px 14px;box-shadow:0 12px 34px rgba(6,14,32,.34);font:600 13.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;transform:translateX(120%);opacity:0;transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .26s;}'
        + '.rrgtoast.show{transform:translateX(0);opacity:1;}'
        + '.rrgtoast.err{background:#7a1f1a;}'
        + '.rrgtoast .rrgtico{flex:none;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-top:1px;}'
        + '.rrgtoast .rrgtmsg{flex:1;min-width:0;white-space:pre-wrap;}'
        + '.rrgtoast .rrgtx{flex:none;background:none;border:none;color:rgba(255,255,255,.7);font-size:17px;line-height:1;cursor:pointer;padding:0 2px;}'
        + '.rrgtoast .rrgtx:hover{color:#fff;}';
      document.head.appendChild(st);
    }
    function rrgToast(msg, type) {
      msg = String(msg == null ? '' : msg); if (!msg) return;
      _rrgToastCss();
      if (!_rrgToastWrap || !document.body.contains(_rrgToastWrap)) { _rrgToastWrap = document.createElement('div'); _rrgToastWrap.id = 'rrgtoastwrap'; document.body.appendChild(_rrgToastWrap); }
      var isErr = type === 'error' || /could not|couldn.t|couldn't|failed|error|not reach|unable|invalid|not yours|already exists|denied/i.test(msg);
      var card = document.createElement('div'); card.className = 'rrgtoast' + (isErr ? ' err' : '');
      var ico = document.createElement('span'); ico.className = 'rrgtico'; ico.textContent = isErr ? '!' : '✓';
      var m = document.createElement('span'); m.className = 'rrgtmsg'; m.textContent = msg;
      var x = document.createElement('button'); x.className = 'rrgtx'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
      card.appendChild(ico); card.appendChild(m); card.appendChild(x);
      _rrgToastWrap.appendChild(card);
      requestAnimationFrame(function () { card.classList.add('show'); });
      var t = setTimeout(dismiss, isErr ? 7000 : 4500);
      function dismiss() { clearTimeout(t); card.classList.remove('show'); setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 260); }
      x.addEventListener('click', dismiss);
      return dismiss;
    }
    window.rrgToast = rrgToast;
    // Route native alert() through the branded toast — non-blocking, no domain, no leaked brand.
    window.alert = function (mm) { try { rrgToast(mm); } catch (e) {} };

    // Branded confirm modal — replaces the native confirm() popup (which leaked the backend domain) app-wide.
    window.__nativeConfirm = window.confirm;
    function rrgConfirm(message, opts){
      opts = opts || {};
      return new Promise(function(resolve){
        try{
          var msg = String(message==null?'':message);
          var danger = (opts.danger!=null) ? !!opts.danger : /\b(delete|deleting|remove|removing|permanent|permanently|cannot be undone|can.t be undone|discard|revert|wipe|erase|unlink|disable)\b/i.test(msg);
          var appName='';
          try{ appName = window.__rrgAppName || localStorage.getItem('rrg_appname') || ''; }catch(e){}
          var title = opts.title || appName || 'Please confirm';
          if(!document.getElementById('rrgconfirm-css')){
            var st=document.createElement('style'); st.id='rrgconfirm-css';
            st.textContent='#rrgcfm-ov{position:fixed;inset:0;background:rgba(6,14,32,.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;opacity:0;transition:opacity .14s;}'
              +'#rrgcfm-ov.show{opacity:1;}'
              +'#rrgcfm-bx{background:#fff;border:1px solid #dbe0e9;border-radius:6px;max-width:440px;width:100%;box-shadow:0 18px 44px rgba(0,0,0,.24);overflow:hidden;transform:translateY(8px) scale(.985);transition:transform .16s cubic-bezier(.2,.8,.2,1);}'
              +'#rrgcfm-ov.show #rrgcfm-bx{transform:none;}'
              +'#rrgcfm-bx .h{font-weight:700;color:#0b1a38;font-size:14px;padding:13px 20px;background:#f4f6f9;border-bottom:1px solid #dbe0e9;}'
              +'#rrgcfm-bx .m{color:#3a4560;font-size:13.5px;line-height:1.5;padding:16px 20px;white-space:pre-wrap;}'
              +'#rrgcfm-bx .b{display:flex;gap:9px;justify-content:flex-end;padding:12px 20px;background:#f4f6f9;border-top:1px solid #dbe0e9;}'
              +'#rrgcfm-bx button{font:inherit;font-size:13px;font-weight:600;border-radius:3px;padding:9px 16px;cursor:pointer;border:1px solid #c4ccda;background:#fff;color:#33415c;}'
              +'#rrgcfm-bx button:hover{background:#eef2f7;}'
              +'#rrgcfm-bx button.ok{border:none;background:#0b1a38;color:#fff;}'
              +'#rrgcfm-bx button.ok:hover{filter:brightness(1.12);}'
              +'#rrgcfm-bx button.ok.danger{background:#DA2B1F;}';
            document.head.appendChild(st);
          }
          var ov=document.createElement('div'); ov.id='rrgcfm-ov';
          var bx=document.createElement('div'); bx.id='rrgcfm-bx';
          var h=document.createElement('div'); h.className='h'; h.textContent=title;
          var m=document.createElement('div'); m.className='m'; m.textContent=msg;
          var b=document.createElement('div'); b.className='b';
          var cancel=document.createElement('button'); cancel.type='button'; cancel.textContent=opts.cancelText||'Cancel';
          var ok=document.createElement('button'); ok.type='button'; ok.className='ok'+(danger?' danger':''); ok.textContent=opts.okText||(danger?'Delete':'OK');
          b.appendChild(cancel); b.appendChild(ok); bx.appendChild(h); bx.appendChild(m); bx.appendChild(b); ov.appendChild(bx);
          document.body.appendChild(ov);
          requestAnimationFrame(function(){ ov.classList.add('show'); });
          var done=false;
          function close(val){ if(done) return; done=true; ov.classList.remove('show'); document.removeEventListener('keydown',onKey,true); setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); },160); resolve(val); }
          function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(false); } else if(e.key==='Enter'){ e.preventDefault(); close(true); } }
          cancel.addEventListener('click',function(){ close(false); });
          ok.addEventListener('click',function(){ close(true); });
          ov.addEventListener('click',function(e){ if(e.target===ov) close(false); });
          document.addEventListener('keydown',onKey,true);
          setTimeout(function(){ try{ ok.focus(); }catch(e){} },30);
        }catch(e){ try{ resolve(window.__nativeConfirm ? window.__nativeConfirm(message) : true); }catch(_){ resolve(true); } }
      });
    }
    window.rrgConfirm = rrgConfirm;

    // Branded prompt modal — replaces native prompt() (which leaked the backend domain).
    // Resolves to the entered string, or null on cancel (matching native prompt semantics).
    function rrgPrompt(message, def, opts){
      opts = opts || {};
      return new Promise(function(resolve){
        try{
          var msg = String(message==null?'':message);
          var appName=''; try{ appName = window.__rrgAppName || localStorage.getItem('rrg_appname') || ''; }catch(e){}
          var title = opts.title || appName || 'Enter a value';
          if(!document.getElementById('rrgprompt-css')){
            var st=document.createElement('style'); st.id='rrgprompt-css';
            st.textContent='#rrgprm-ov{position:fixed;inset:0;background:rgba(6,14,32,.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;opacity:0;transition:opacity .14s;}'
              +'#rrgprm-ov.show{opacity:1;}'
              +'#rrgprm-bx{background:#fff;border:1px solid #dbe0e9;border-radius:6px;max-width:440px;width:100%;box-shadow:0 18px 44px rgba(0,0,0,.24);overflow:hidden;transform:translateY(8px) scale(.985);transition:transform .16s cubic-bezier(.2,.8,.2,1);}'
              +'#rrgprm-ov.show #rrgprm-bx{transform:none;}'
              +'#rrgprm-bx .h{font-weight:700;color:#0b1a38;font-size:14px;padding:13px 20px;background:#f4f6f9;border-bottom:1px solid #dbe0e9;}'
              +'#rrgprm-bx .m{color:#3a4560;font-size:13.5px;line-height:1.5;padding:16px 20px 8px;white-space:pre-wrap;}'
              +'#rrgprm-bx .ipwrap{padding:0 20px 16px;}'
              +'#rrgprm-bx input{width:100%;box-sizing:border-box;border:1px solid #c4ccda;border-radius:4px;padding:9px 11px;font:inherit;font-size:13.5px;color:#1f2a3d;}'
              +'#rrgprm-bx input:focus{outline:none;border-color:#2c5c8f;}'
              +'#rrgprm-bx .b{display:flex;gap:9px;justify-content:flex-end;padding:12px 20px;background:#f4f6f9;border-top:1px solid #dbe0e9;}'
              +'#rrgprm-bx button{font:inherit;font-size:13px;font-weight:600;border-radius:3px;padding:9px 16px;cursor:pointer;border:1px solid #c4ccda;background:#fff;color:#33415c;}'
              +'#rrgprm-bx button:hover{background:#eef2f7;}'
              +'#rrgprm-bx button.ok{border:none;background:#0b1a38;color:#fff;}'
              +'#rrgprm-bx button.ok:hover{filter:brightness(1.12);}';
            document.head.appendChild(st);
          }
          var ov=document.createElement('div'); ov.id='rrgprm-ov';
          var bx=document.createElement('div'); bx.id='rrgprm-bx';
          var h=document.createElement('div'); h.className='h'; h.textContent=title;
          var m=document.createElement('div'); m.className='m'; m.textContent=msg;
          var iw=document.createElement('div'); iw.className='ipwrap';
          var inp=document.createElement('input'); inp.type=opts.password?'password':'text'; inp.value=(def==null?'':String(def)); if(opts.placeholder) inp.placeholder=opts.placeholder;
          iw.appendChild(inp);
          var b=document.createElement('div'); b.className='b';
          var cancel=document.createElement('button'); cancel.type='button'; cancel.textContent=opts.cancelText||'Cancel';
          var ok=document.createElement('button'); ok.type='button'; ok.className='ok'; ok.textContent=opts.okText||'OK';
          b.appendChild(cancel); b.appendChild(ok);
          bx.appendChild(h); bx.appendChild(m); bx.appendChild(iw); bx.appendChild(b); ov.appendChild(bx);
          document.body.appendChild(ov);
          requestAnimationFrame(function(){ ov.classList.add('show'); });
          var done=false;
          function close(val){ if(done) return; done=true; ov.classList.remove('show'); document.removeEventListener('keydown',onKey,true); setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); },160); resolve(val); }
          function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(null); } else if(e.key==='Enter'){ e.preventDefault(); close(inp.value); } }
          cancel.addEventListener('click',function(){ close(null); });
          ok.addEventListener('click',function(){ close(inp.value); });
          ov.addEventListener('click',function(e){ if(e.target===ov) close(null); });
          document.addEventListener('keydown',onKey,true);
          setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(e){} },30);
        }catch(e){ resolve(null); }
      });
    }
    window.rrgPrompt = rrgPrompt;
  } catch (e) {}

  // Global phone formatting — any phone field, 10 digits -> (xxx) xxx-xxxx
  try { document.addEventListener("input", function(e){ var t=e.target; if(!t||t.tagName!=="INPUT") return; var key=((t.id||"")+" "+(t.name||"")+" "+(t.className||"")).toLowerCase(); if(t.type==="tel" || /phone/.test(key)){ var d=String(t.value||"").replace(/\D/g,"").slice(0,10); var f = d.length<4 ? d : (d.length<7 ? "("+d.slice(0,3)+") "+d.slice(3) : "("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6)); if(f!==t.value){ t.value=f; } } }); } catch(e){}

  try { (function(){ var _sym='$'; window.RRG_CCYSYM=_sym; window.rrgMoney=function(n){ n=Number(n); if(!isFinite(n)) n=0; return window.RRG_CCYSYM + n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }; fetch('/api/session',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(ss){ if(ss&&ss.currencySymbol){ window.RRG_CCYSYM=ss.currencySymbol; try{ document.querySelectorAll('.ccysym').forEach(function(el){ el.textContent=window.RRG_CCYSYM; }); }catch(e){} } }).catch(function(){}); })(); } catch(e){}

  var NAV = [
    { color: '#8fa2c4', items: [
      { ic: '▤', label: 'Views', href: '#', views: true },
      { ic: '☀︎', label: 'Daily Brief', href: 'rrg_brief.html', ai: true },
      { ic: '✔', label: 'Tasks', href: 'rrg_tasks.html' },
      { ic: '◫', label: 'Calendar', href: 'rrg_calendar.html' },
      { ic: '◱', label: 'Feed', href: 'rrg_feed.html' }
    ] },
    { grp: 'Book of Business', color: '#7ea6d8', items: [
      { ic: '▦', label: 'Companies', href: 'rrg_companies.html' },
      { ic: '◑', label: 'Contacts', href: 'rrg_people.html' },
      { ic: '❐', label: 'Documents', href: 'rrg_documents.html' },
    ] },
    { grp: 'Business Sales', color: '#6bbf95', items: [
      { ic: '⊞', label: 'Listings', href: 'rrg_board.html' },
      { ic: '◎', label: 'Buyers', href: 'rrg_buyer_board.html' },
      { ic: '▥', label: 'Data Rooms', href: 'rrg_rooms_queue.html' },
      { ic: '◈', label: 'Deals', href: 'rrg_deals.html' }
    ] },
    { grp: 'Tenant Rep', color: '#dfa937', items: [
      { ic: '⊡', label: 'Spaces', href: 'rrg_space_tracker.html' },
      { ic: '◧', label: 'Tenants', href: 'rrg_board.html?pipelineId=p_tenantrep' },
      { ic: '◎', label: 'Site Criteria', href: 'ssc_form.html' },
      { ic: '✚', label: 'Site & Concept Fit', href: 'rrg_site_fit.html' },
      { ic: '▤', label: 'Shopping Centers', href: 'rrg_centers.html' },
      { ic: '⊚', label: 'Tour Tracker', href: 'rrg_tour_tracker.html' },
      { ic: '§', label: 'LOI Builder', href: 'rrg_loi_builder.html' },
    ] },
    { grp: 'Landlord Rep', color: '#c98a5e', items: [
      { ic: '⊞', label: 'Space Listings', href: 'rrg_landlord_rep.html' }
    ] },
    { grp: 'Marketing', color: '#c77dc0', items: [
      { ic: '✉', label: 'Bulk Email', href: 'rrg_mass_studio.html', admin: true },
      { ic: '☷', label: 'Subscribers', href: 'rrg_mail_subscribers.html', admin: true },
      { ic: '✎', label: 'Email Templates', href: 'rrg_email_templates.html' },
      { ic: '▧', label: 'Marketing Packs', href: 'rrg_cim_queue.html' },
      { ic: '➤', label: 'Market Attack Plans', href: 'rrg_attack_queue.html' },
      { ic: '⟳', label: 'Automations', href: 'rrg_admin_automations.html', admin: true }
    ] },
    { grp: 'Accounting', admin: true, color: '#4fb0a6', items: [
      { ic: '❏', label: 'Invoices', href: 'rrg_invoices.html' },
      { ic: '＄', label: 'Payments', href: 'rrg_payments.html' },
      { ic: '⊟', label: 'Expenses', href: 'rrg_expenses.html' },
      { ic: '▦', label: 'Profit & Loss', href: 'rrg_pnl.html' },
      { ic: '≣', label: 'General Ledger', href: 'rrg_gl.html' }
    ] },
    { grp: 'Tools', color: '#a99be0', items: [
      { ic: '⌕', label: 'Email Finder', href: 'rrg_email_finder.html', admin: true },
      { ic: '▭', label: 'Lease Abstracts', href: 'rrg_lease_queue.html' },
      { ic: '◉', label: 'Tracked Emails', href: 'rrg_tracked_emails.html' },
      { ic: '∑', label: 'Calculators', href: 'rrg_calculators.html' }
    ] },
    { grp: 'Admin', admin: true, color: '#dd8a82', items: [
      { ic: '⚑', label: 'Wish List', href: 'rrg_feedback.html' },
      { ic: '✉', label: 'Office Requests', href: 'rrg_tickets.html' },
      { ic: '❖', label: 'Team', href: 'rrg_team.html' },
      { ic: '⚙', label: 'Settings', href: 'rrg_settings.html' },
      { ic: '<svg viewBox="0 0 20 20" width="14" height="14" style="vertical-align:-2px" fill="currentColor"><rect x="3" y="10" width="3" height="7" rx="1"></rect><rect x="8.5" y="6" width="3" height="11" rx="1"></rect><rect x="14" y="3" width="3" height="14" rx="1"></rect></svg>', label: 'Reports', href: 'rrg_reports.html', admin: true }
    ] }
  ];

  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function sameFile(href){ var f=(href||'').split('/').pop().split('#')[0].split('?')[0].toLowerCase(); return f===file || (href==='admin' && (file==='admin'||path==='/admin')); }
  var curHash=(location.hash||'').toLowerCase();
  function hrefHash(href){ var i=(href||'').indexOf('#'); return i>=0?(href.slice(i).toLowerCase()):''; }
  var _hashMatch=false; NAV.forEach(function(g){ (g.items||[]).forEach(function(it){ if(sameFile(it.href)){ var h=hrefHash(it.href); if(h && h===curHash) _hashMatch=true; } }); });
  function isActive(it){ if(!sameFile(it.href)) return false; var h=hrefHash(it.href); return h ? (h===curHash) : (!_hashMatch); }

  // ---------- styles ----------
  var css = ''
    + ':root{--navbg:var(--navbg,#0b1a38);}'
    + 'body.rrg-shelled{padding-left:238px !important;padding-top:56px !important;}'
    + 'body.rrg-shelled .top,body.rrg-shelled .rrg-back{display:none !important;}'
    + '@media print{body.rrg-shelled{padding-left:0 !important;padding-top:0 !important;}#rrgnav,#rrgtop,#rrgRecentBar,.rrgcrumb,#rrgviews{display:none !important;}}'
    + 'body.rrg-shelled .rrgcrumb{display:block;padding:16px 24px 0;font-size:12.5px;font-weight:600;color:#5f6a7d;line-height:1.4;}'
    + '.rrgcrumb a{color:#2c5c8f;text-decoration:none;} .rrgcrumb a:hover{text-decoration:underline;} .rrgcrumb .sep{color:#96a1b2;margin:0 7px;} .rrgcrumb .rrgcrumb-cur{color:#20334f;font-weight:700;}'
    + '#rrgnav{position:fixed;top:0;left:0;bottom:0;width:238px;background:var(--navbg,#0b1a38);color:#c7d0e4;display:flex;flex-direction:column;z-index:60;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '#rrgnav .nt{display:flex;align-items:center;gap:9px;padding:12px 14px 6px;}'
    + '#rrgnav .ws{display:flex;align-items:center;gap:9px;cursor:pointer;border-radius:9px;padding:5px 7px;flex:1;text-decoration:none;}'
    + '#rrgnav .ws:hover{background:rgba(255,255,255,.06);}'
    + '#rrgnav .disc{width:30px;height:30px;border-radius:8px;background:var(--red,#DA2B1F);color:#fff;font-family:"Arial Black",Arial;font-weight:900;font-size:12px;display:flex;align-items:center;justify-content:center;letter-spacing:-.04em;}'
    + '#rrgnav .wsn{font-weight:600;font-size:14.5px;color:#fff;}'
    + '#rrgnav .rrgbrand{display:block;width:100%;font-weight:700;font-size:18px;color:#fff;line-height:1.1;}'
    + '#rrgnav .rrgbrandimg{max-width:100%;max-height:48px;object-fit:contain;display:block;}'
    + '#rrgtop .create{display:inline-flex;align-items:center;gap:6px;background:#fff;color:var(--red,#DA2B1F);border:1px solid var(--red,#DA2B1F);border-radius:9px;padding:8px 15px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .12s,color .12s;}'
    + '#rrgtop .create:hover{background:var(--red,#DA2B1F);color:#fff;}'
    + '#rrgtop .create .cplus{font-size:15px;font-weight:700;line-height:1;}'
    + '#rrgtop .createwrap{position:relative;}'
    + '#rrgtop .createmenu{position:absolute;top:calc(100% + 6px);left:0;min-width:196px;background:#fff;border:1px solid var(--line,#dbe0e9);border-radius:4px;box-shadow:0 10px 30px rgba(12,22,54,.16);padding:5px;z-index:70;}'
    + '#rrgtop .createmenu[hidden]{display:none;}'
    + '#rrgtop .createmenu a{display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:3px;color:#2b3648;text-decoration:none;font-size:13px;font-weight:500;white-space:nowrap;}'
    + '#rrgtop .createmenu a:hover{background:#eef2f7;color:var(--navy,#20334f);}'
    + '#rrgtop .createmenu .cmi{width:18px;text-align:center;color:#69748a;font-size:13px;flex:none;}'
    + '#rrgtop .createmenu .cmsep{height:1px;background:var(--line,#dbe0e9);margin:5px 4px;}'
    + '#rrgnav .scroll{flex:1;overflow-y:auto;padding:10px 10px 14px;}'
    + '#rrgnav .scroll::-webkit-scrollbar{width:7px;}#rrgnav .scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:7px;}'
    + '#rrgnav .grp{margin-top:6px;background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important;}'
    + '#rrgnav .lbl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.34);font-weight:700;padding:2px 10px 2px;display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:7px;}'
    + '#rrgnav .lbl:hover{color:rgba(255,255,255,.6);background:rgba(255,255,255,.04);}'
    + '#rrgnav .lbl{background:transparent;border:0;box-shadow:none;}'
    + '#rrgnav a.it{background:transparent;box-shadow:none;}'
    + '#rrgnav .lbl .gcv{margin-left:auto;font-size:9px;color:rgba(255,255,255,.4);transition:transform .15s;}'
    + '#rrgnav .grp.collapsed .gcv{transform:rotate(-90deg);}'
    + '#rrgnav .grp.collapsed a.it{display:none;}'
    + '#rrgnav a.it{display:flex;align-items:center;gap:10px;padding:4px 10px;border-radius:7px;color:#c3cce0;text-decoration:none;font-size:13.5px;font-weight:500;margin-bottom:0;}'
    + '#rrgnav a.it:hover{background:rgba(255,255,255,.07);color:#fff;}'
    + '#rrgnav a.it.on{background:rgba(255,255,255,.12);color:#fff;font-weight:600;}'
    + '#rrgnav a.it .i{width:17px;text-align:center;color:var(--gc,rgba(255,255,255,.5));font-size:13.5px;flex:none;}'
    + '#rrgnav a.it[data-ai] .i,#rrgnav a.it[data-ai].on .i{color:#a78bfa;-webkit-text-fill-color:currentColor;}'
    + ''
    + ''
    + '#rrgnav a.it.on .i{color:#fff;}'
    + '#rrgnav a.it .navbadge{margin-left:7px;background:#f7dedb;color:#a5352c;font-size:10px;font-weight:700;min-width:17px;height:16px;line-height:16px;text-align:center;border-radius:4px;padding:0 5px;}'
    + '#rrgnav a.it .navbadge.gold{background:#f6e6c9;color:#8a5a12;}'
    + '#rrgnav a.it .navbadge + .navbadge{margin-left:4px;}'
    + '#rrgnav a.it .aitag{margin-left:5px;font-size:11px;line-height:1;opacity:.85;}'
    + '#rrgnav .foot{border-top:1px solid rgba(255,255,255,.09);padding:8px 8px;display:flex;align-items:center;gap:4px;}#rrgnav .foot a.it{flex:none;padding:6px 9px;}#rrgnav .foot a.it:first-child{flex:1;min-width:0;}#rrgnav .foot a.it:first-child #rrgacct{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '#rrgtop{position:fixed;top:0;left:238px;right:0;height:56px;background:#fff;border-bottom:1px solid #e9edf3;display:flex;align-items:center;gap:18px;padding:0 22px;z-index:59;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + 'html.rrg-anim #rrgnav{transition:width .16s ease;} html.rrg-anim #rrgtop{transition:left .16s ease;} html.rrg-anim body.rrg-shelled{transition:padding-left .16s ease;}'
    + '.rrgcol{margin-left:auto;flex:none;background:rgba(255,255,255,.08);border:none;color:#c7d0e4;cursor:pointer;border-radius:6px;width:26px;height:26px;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;}'
    + '.rrgcol:hover{background:rgba(255,255,255,.16);color:#fff;}'
    + '#rrgnav a.it{position:relative;}'
    + 'body.rrg-collapsed.rrg-shelled{padding-left:60px !important;}'
    + 'body.rrg-collapsed #rrgnav{width:60px;}'
    + 'body.rrg-collapsed #rrgtop{left:60px;}'
    + 'body.rrg-collapsed #rrgnav .itlbl{display:none;}'
    + 'body.rrg-collapsed #rrgnav .grp .lbl{display:none;}'
    + 'body.rrg-collapsed #rrgnav .grp{margin-top:2px;}'
    + 'body.rrg-collapsed #rrgnav .nt .rrgbrand{display:none;}'
    + 'body.rrg-collapsed #rrgnav .nt{justify-content:center;padding:12px 6px 6px;}'
    + 'body.rrg-collapsed .rrgcol{margin-left:0;}'
    + 'body.rrg-collapsed #rrgnav a.it{justify-content:center;padding-left:0;padding-right:0;gap:0;}'
    + 'body.rrg-collapsed #rrgnav a.it .aitag{display:none;}'
    + 'body.rrg-collapsed #rrgnav a.it .navbadge{position:absolute;top:1px;right:5px;transform:scale(.85);margin:0;}'
    + 'body.rrg-collapsed #rrgnav .foot{flex-direction:column;gap:2px;padding:8px 4px;}'
    + 'body.rrg-collapsed #rrgnav .foot a.it{flex:none;font-size:0;justify-content:center;}'
    + 'body.rrg-collapsed #rrgnav .foot a.it .i{font-size:13.5px;}'
    + 'body.rrg-collapsed #rrgnav .foot #rrgacct{display:none;}'
    + '#rrgtop .rrgtoplogo{display:flex;align-items:center;height:100%;text-decoration:none;flex:none;margin-right:8px;max-width:224px;overflow:hidden;}'
    + '#rrgtop .rrgtoplogo .rrgbrandimg{max-height:40px;max-width:212px;object-fit:contain;display:block;}'
    + '#rrgtop .rrgtoplogo .rrgbrand{font-weight:700;font-size:18px;color:var(--navy,#000E31);letter-spacing:-.01em;white-space:nowrap;}'
    + '#rrgtop .pt{font-size:16.5px;font-weight:600;color:#1d2739;min-width:90px;}'
    + '#rrgtop .rrgback{display:inline-flex;align-items:center;gap:6px;color:#1d2739;text-decoration:none;font-size:13.5px;font-weight:500;padding:7px 13px;border:1px solid #e9edf3;border-radius:9px;background:#fff;white-space:nowrap;transition:background .12s;}'
    + '#rrgtop .rrgback:hover{background:#f2f4f8;}'
    + '#rrgtop .srch{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46%;max-width:560px;}'
    + '#rrgtop .srch input{width:100%;border:1px solid #e9edf3;background:#f7f9fc;border-radius:10px;padding:9px 12px 9px 36px;font:inherit;font-size:13.5px;color:#1d2739;}'
    + '#rrgtop .srch .si{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#98a1b5;}'
    + '.rrgsr{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #e1e6ef;border-radius:11px;box-shadow:0 14px 44px rgba(10,20,50,.18);z-index:120;max-height:70vh;overflow:auto;padding:5px;}'
    + '.rrgsr[hidden]{display:none;}'
    + '.rrgsr .grp{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9aa4b6;padding:9px 11px 4px;}'
    + '.rrgsr a{display:flex;gap:10px;align-items:center;padding:8px 11px;border-radius:8px;text-decoration:none;color:#1d2739;}'
    + '.rrgsr a:hover,.rrgsr a.sel{background:#eef3fb;}'
    + '.rrgsr a .rt{font-size:13.5px;font-weight:700;}'
    + '.rrgsr a .rs{font-size:12px;color:#6b7488;font-weight:500;margin-left:4px;}'
    + '.rrgsr .ric{width:26px;height:26px;border-radius:7px;background:#f1f4f9;display:flex;align-items:center;justify-content:center;font-size:13px;color:#6b7488;flex:none;}'
    + '.rrgsr .rnone{padding:15px 12px;color:#8a93a8;font-size:13px;}'
    + '#rrgtop .acts{display:flex;align-items:center;gap:10px;margin-left:auto;}'
    + '#rrgRecentBar{display:flex;align-items:center;gap:2px;padding:10px 24px 0;margin:0;overflow-x:auto;scrollbar-width:thin;-ms-overflow-style:none;}'
    + '#rrgRecentBar::-webkit-scrollbar{height:0;}'
    + '#rrgRecentBar .rrgreclbl{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9aa4b6;flex:none;margin-right:8px;white-space:nowrap;}'
    + '#rrgRecentBar a{flex:none;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;border:1px solid #e4e8ef;background:#fff;color:#2c4260;text-decoration:none;font-size:12.5px;font-weight:600;white-space:nowrap;max-width:230px;overflow:hidden;text-overflow:ellipsis;}'
    + '#rrgRecentBar a:hover{background:#eef2f8;border-color:#c9d3e2;color:#20334f;}'
    + '#rrgRecentBar a .ri{color:#8593ab;font-size:11px;flex:none;}'
    + '#rrgRecentBar a .rs{color:#98a1b5;font-weight:500;}'
    + '#rrgRecentBar .rsep{flex:none;color:#c7cedb;padding:0 2px;}'
    + '#rrgtop .ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#6b7488;cursor:pointer;text-decoration:none;}'
    + '#rrgtop .ic:hover{background:#f2f4f8;color:#1d2739;}'
    + '#rrgtop .uav{width:32px;height:32px;border-radius:50%;background:var(--navbg,#233a68);color:#fff;font-weight:600;font-size:12.5px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;padding:0;}'
    + '#rrgtop .uavwrap{position:relative;display:inline-flex;}'
    + '#rrgtop .uavmenu{position:absolute;top:calc(100% + 8px);right:0;z-index:70;background:#fff;border:1px solid #e3e8f0;border-radius:10px;box-shadow:0 14px 40px rgba(12,22,54,.18);padding:6px;min-width:196px;}'
    + '#rrgtop .uavmenu[hidden]{display:none;}'
    + '#rrgtop .uavhd{font-size:11px;font-weight:700;color:#8a94a6;padding:7px 10px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;}'
    + '#rrgtop .uavitem{display:flex;align-items:center;gap:9px;width:100%;text-align:left;font:inherit;font-size:13px;font-weight:600;color:#26324a;background:#fff;border:none;border-radius:7px;padding:8px 10px;cursor:pointer;text-decoration:none;box-sizing:border-box;}'
    + '#rrgtop .uavitem:hover{background:#f4f7fb;}'
    + '#rrgtop .uavitem.danger{color:var(--red,#DA2B1F);}'
    + '#rrgtop .uavitem.danger:hover{background:#fff5f4;}'
    + '#rrgtop .uavsep{height:1px;background:#eef1f6;margin:5px 4px;}'
    + '#rrgtop .uavic{width:16px;text-align:center;opacity:.85;flex:none;}'
    + '@media(max-width:900px){body.rrg-shelled{padding-left:0 !important;}#rrgnav{transform:translateX(-100%);transition:transform .2s;}#rrgnav.open{transform:none;}#rrgtop{left:0;}}';
  var st = document.createElement('style'); st.id='rrgshellcss'; st.textContent=css; document.head.appendChild(st);

  // ---------- nav markup ----------
  var _cachedName = (function(){ try { return localStorage.getItem('rrg_appname') || ''; } catch(e){ return ''; } })();
  var _cachedLogo = (function(){ try { return localStorage.getItem('rrg_logo') || ''; } catch(e){ return ''; } })();
  var _brandInner = _cachedLogo ? ('<img src="'+esc(_cachedLogo)+'" alt="" class="rrgbrandimg">') : esc(_cachedName);
  // Custom tool names (Admin → Tool Labels) applied to the nav by default label, e.g. Listings→Engagements.
  // Cached so the rename shows on first paint; refreshed from /api/session below.
  var _NAVL = (function(){ try { return JSON.parse(localStorage.getItem('rrg_nav_labels_v1')||'{}') || {}; } catch(e){ return {}; } })();
  function _navLbl(def){ return (_NAVL && _NAVL[def]) || def; }
  var navHtml = '';
  navHtml += '<div class="nt"><a class="ws" href="index.html"><span class="rrgbrand" id="rrgbrand">'+_brandInner+'</span></a><button class="rrgcol" id="rrgcollapse" title="Collapse sidebar" aria-label="Collapse sidebar">\u00ab</button></div>';
  navHtml += '<div class="scroll">';
  NAV.forEach(function (g, gi) {
    var _sp = []; if (g.color) _sp.push('--gc:' + g.color); if (g.admin) _sp.push('display:none');
    var cls = (g.admin ? ' data-admingrp="1"' : '') + (_sp.length ? (' style="' + _sp.join(';') + '"') : '');
    navHtml += '<div class="grp"' + cls + '>';
    if (g.grp) navHtml += '<div class="lbl" data-grp="' + esc(g.grp) + '"><span>' + esc(g.grp) + '</span><span class="gcv">\u25be</span></div>';
    g.items.forEach(function (it) {
      var _na = it.need ? (' data-need="' + esc(it.need) + '" style="display:none"') : (it.admin ? ' data-adminit="1" style="display:none"' : '');
      var _ai = it.ai ? ' data-ai=""' : '';
      navHtml += '<a class="it' + (isActive(it) ? ' on' : '') + '"' + _na + _ai + (it.views ? ' data-views="1"' : '') + ' data-lbl="' + esc(it.label) + '" title="' + esc(_navLbl(it.label)) + '" href="' + esc(it.href) + '"><span class="i"' + (it.color ? (' style="color:' + it.color + '"') : '') + '>' + it.ic + '</span><span class="itlbl">' + esc(_navLbl(it.label)) + '</span></a>';
    });
    navHtml += '</div>';
  });
  navHtml += '</div>';
  // Account / Help / Log out moved to the top-right avatar menu; no bottom footer.

  var nav = document.createElement('aside'); nav.id='rrgnav'; nav.innerHTML=navHtml;

  // ---------- top bar ----------
  var activeLabel = '';
  NAV.forEach(function (g) { g.items.forEach(function (it) { if (isActive(it)) activeLabel = it.label; }); });
  if (!activeLabel) { var t = (document.title || '').split('—')[0].split(' - ')[0].trim(); activeLabel = t || _cachedName || ''; }
  var top = document.createElement('div'); top.id='rrgtop';
  top.innerHTML = ''
    + '<div class="ic" id="rrgburger" style="display:none">≡</div>'
    + '<div class="srch"><span class="si">⌕</span><input placeholder="Search contacts, companies, listings…" id="rrgsearch" autocomplete="off"><div class="rrgsr" id="rrgsr" hidden></div></div>'
    + '<div class="acts"><div class="createwrap">'
      + '<button class="create" id="rrgCreateBtn" type="button" aria-haspopup="true" aria-expanded="false"><span class="cplus">+</span> Create New</button>'
      + '<div class="createmenu" id="rrgCreateMenu" hidden>'
        + '<a href="rrg_companies.html?new=1"><span class="cmi">▦</span> Company</a>'
        + '<a href="rrg_people.html?new=1"><span class="cmi">◑</span> Contact</a>'
        + '<a href="rrg_tasks.html?new=1"><span class="cmi">✔</span> Task</a>'
        + '<div class="cmsep"></div>'
        + '<a href="rrg_agreements.html?new=1"><span class="cmi">⚖</span> Agreement</a>'
        + '<a href="rrg_rooms_queue.html?new=1"><span class="cmi">▤</span> Data Room</a>'
      + '</div>'
    + '</div><div class="uavwrap"><button class="uav" id="rrguav" type="button" aria-haspopup="true" aria-expanded="false" title="Account menu">·</button><div class="uavmenu" id="rrguavMenu" hidden><div class="uavhd" id="rrguavName">Signed in</div><a class="uavitem" id="rrguavPortal" href="rrg_portal.html"><span class="uavic">⌂</span> My Portal</a><a class="uavitem" id="rrguavRec" href="rrg_user.html"><span class="uavic">❖</span> My Record</a><a class="uavitem" href="rrg_account.html"><span class="uavic">◔</span> Account</a><a class="uavitem" href="index.html"><span class="uavic">?</span> Help</a><div class="uavsep"></div><a class="uavitem danger" href="/logout"><span class="uavic">⏻</span> Log out</a></div></div></div>';

  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();
  function _recentType(page){ page=String(page||'').toLowerCase();
    if(page.indexOf('rrg_person')===0) return 'Contact';
    if(page.indexOf('rrg_compan')===0) return 'Company';
    if(page.indexOf('rrg_assignment')===0) return 'Listing';
    if(page.indexOf('rrg_room')===0) return 'Data Room';
    if(page.indexOf('rrg_deal')===0) return 'Deal';
    if(page.indexOf('rrg_cim')===0) return 'Marketing Pack';
    if(page.indexOf('rrg_bov')===0) return 'Valuation';
    if(page.indexOf('rrg_space')===0) return 'Space';
    if(page.indexOf('rrg_center')===0) return 'Center';
    return ''; }
  function _recentIcon(type){ var m={ 'Contact':'◑','Company':'▦','Listing':'⊞','Data Room':'▤','Deal':'◈','Marketing Pack':'▧','Valuation':'§','Space':'▭','Center':'⌂' }; return m[type]||'•'; }
  function _recentSub(page){ try{
      if(page.indexOf('rrg_person')===0){ var P=window.P; if(P){ var co=String(P.companyName||P.company||(window.CO&&window.CO.name)||''); if(co==='No Company') co=''; var t=String(P.title||''); return [co,t].filter(Boolean).join(' · '); } }
      else if(page.indexOf('rrg_assignment')===0){ var A=window.A; if(A){ return [String(A.market||''), String(A.status||'')].filter(Boolean).join(' · '); } }
      else if(page.indexOf('rrg_compan')===0){ var C=window.C||window.CO; if(C){ return [String(C.type||''), String(C.market||'')].filter(Boolean).join(' · '); } }
      else if(page.indexOf('rrg_room')===0){ var RM=window.ROOM||window.R; if(RM){ return String((RM.business||RM.name||'')); } }
    }catch(e){} return ''; }
  function _recentName(page){ try{
      if(page.indexOf('rrg_person')===0){ if(window.P&&window.P.name) return String(window.P.name); }
      else if(page.indexOf('rrg_compan')===0){ var C=window.C||window.CO; if(C&&C.name) return String(C.name); }
      else if(page.indexOf('rrg_assignment')===0){ if(window.A) return String(window.A.businessOverride||window.A.business||''); }
      else if(page.indexOf('rrg_room')===0){ var R=window.ROOM||window.R; if(R&&(R.business||R.name)) return String(R.business||R.name); }
    }catch(e){}
    try{ var cur=document.querySelector('.rrgcrumb .rrgcrumb-cur'); if(cur){ var t=(cur.textContent||'').trim(); if(t) return t; } }catch(e){}
    return ''; }
  function _recentList(){ try{ return JSON.parse(localStorage.getItem('rrgRecent')||'[]')||[]; }catch(e){ return []; } }
  function _recordRecent(){ try{
      var page=(location.pathname.split('/').pop()||'').toLowerCase();
      var qs=new URLSearchParams(location.search);
      var idp=qs.get('id')||qs.get('key')||qs.get('room')||qs.get('deal')||qs.get('cim')||qs.get('bov')||qs.get('center')||qs.get('space')||'';
      if(!idp) return;
      var label=_recentName(page);
      var GEN={'command':1,'companies':1,'company':1,'contacts':1,'contact':1,'listings':1,'listing':1,'deals':1,'deal':1,'data rooms':1,'data room':1,'buyers':1,'buyer':1,'spaces':1,'space':1,'centers':1,'center':1,'shopping centers':1,'valuation':1,'marketing pack':1};
      if(!label || GEN[label.toLowerCase()]) return;
      var type=_recentType(page);
      var url=(location.pathname.split('/').pop()||'')+location.search;
      var list=_recentList().filter(function(x){ return x && x.url!==url; });
      var sub=_recentSub(page);
      list.unshift({ url:url, label:label.slice(0,90), type:type, sub:sub.slice(0,80) });
      list=list.slice(0,12);
      try{ localStorage.setItem('rrgRecent', JSON.stringify(list)); }catch(e){}
    }catch(e){} }
  function _renderRecentBar(){ try{
      var here=(location.pathname.split('/').pop()||'')+location.search;
      var items=_recentList().filter(function(x){ return x&&x.url&&x.url!==here; }).slice(0,8);
      var bar=document.getElementById('rrgRecentBar');
      if(!items.length){ if(bar) bar.parentNode.removeChild(bar); return; }
      if(!bar){ bar=document.createElement('div'); bar.id='rrgRecentBar';
        var crumb=document.querySelector('.rrgcrumb');
        if(crumb && crumb.parentNode){ crumb.parentNode.insertBefore(bar, crumb.nextSibling); }
        else { document.body.insertBefore(bar, document.body.firstChild); }
      }
      var html='<span class="rrgreclbl">Recent</span>';
      items.forEach(function(x,idx){ var sub=(x.sub||x.type||''); html+='<a href="'+esc(x.url)+'" title="'+esc(x.label+(sub?(' \u2014 '+sub):''))+'"><span class="ri">'+esc(_recentIcon(x.type))+'</span>'+esc(x.label)+(sub?(' <span class="rs">\u00b7 '+esc(sub)+'</span>'):'')+'</a>'; });
      bar.innerHTML=html;
    }catch(e){} }
  function mount(){
    if (document.getElementById('rrgnav')) return;
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(top, document.body.firstChild);
    document.body.classList.add('rrg-shelled');
    // ---------- Views panel — saved-views navigator across all major sections ----------
    (function(){
      if(window.__rrgViewsInit) return; window.__rrgViewsInit=true;
      var VS=[
        {k:'companies', ic:'▦', label:'Companies', all:'rrg_companies.html', bi:[]},
        {k:'contacts',  ic:'◑', label:'Contacts',  all:'rrg_people.html', bi:[]},
        {k:'documents', ic:'❐', label:'Documents', all:'rrg_documents.html', bi:[]},
        {k:'datarooms', ic:'▥', label:'Data Rooms', all:'rrg_rooms_queue.html', bi:[]},
        {k:'listings',  ic:'⊞', label:'Listings',  all:'rrg_assignments.html', bi:[{l:'Board view', h:'rrg_board.html'}]},
        {k:null,        ic:'◎', label:'Buyers',    all:'rrg_buyer_board.html', bi:[]},
        {k:'deals',     ic:'◈', label:'Deals',     all:'rrg_deals.html', bi:[]},
        {k:'subscribers', ic:'☷', label:'Subscribers', all:'rrg_mail_subscribers.html', bi:[]},
        {k:'emailtpls', ic:'✎', label:'Email Templates', all:'rrg_email_templates.html', bi:[]},
        {k:'__tasks',   ic:'✔', label:'Tasks', all:'rrg_tasks.html', bi:[{l:'My open tasks', h:'rrg_tasks.html?scope=mine&show=open'},{l:'All my tasks', h:'rrg_tasks.html?scope=mine'},{l:"Everyone's tasks", h:'rrg_tasks.html?scope=all'},{l:'Completed', h:'rrg_tasks.html?show=done'}]}
      ];
      if(!document.getElementById('rrgviews-css')){
        var st=document.createElement('style'); st.id='rrgviews-css';
        st.textContent='#rrgviews{position:fixed;top:0;bottom:0;width:264px;background:#fff;border-right:1px solid #e2e7f0;box-shadow:10px 0 34px rgba(11,26,56,.13);z-index:59;display:flex;flex-direction:column;transform:translateX(-10px);opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
          +'#rrgviews.on{opacity:1;transform:none;pointer-events:auto;}'
          +'#rrgviews .rvhd{display:flex;align-items:center;justify-content:space-between;padding:15px 16px 12px;border-bottom:1px solid #eef1f6;}'
          +'#rrgviews .rvhd b{font-size:14px;color:#0b1a38;font-weight:800;}'
          +'#rrgviews .rvx{border:none;background:none;font-size:20px;line-height:1;color:#8a93a8;cursor:pointer;padding:2px 5px;border-radius:6px;}#rrgviews .rvx:hover{color:#0b1a38;background:#f2f5fa;}'
          +'#rrgviews .rvbody{flex:1;overflow-y:auto;padding:6px 0 18px;}'
          +'#rrgviews .rvbody::-webkit-scrollbar{width:8px;}#rrgviews .rvbody::-webkit-scrollbar-thumb{background:#d7deea;border-radius:8px;}'
          +'#rrgviews .rvgrp{padding:5px 0 6px;}'
          +'#rrgviews .rvglbl{display:flex;align-items:center;gap:8px;padding:9px 16px 5px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#98a2b6;}'
          +'#rrgviews .rvglbl .rvic{font-size:13px;color:#5b6a86;width:15px;text-align:center;}'
          +'#rrgviews .rvlink{display:block;padding:7px 16px 7px 39px;font-size:13px;color:#33405a;text-decoration:none;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:2px solid transparent;}'
          +'#rrgviews .rvlink:hover{background:#f2f6fc;color:#16305c;border-left-color:#2c5c8f;}'
          +'#rrgviews .rvlink.all{color:#16305c;font-weight:700;}'
          +'#rrgviews .rvlink .rvtag{color:#98a2b6;font-weight:600;font-size:10.5px;margin-left:6px;text-transform:uppercase;letter-spacing:.04em;}'
          +'#rrgviews-bd{position:fixed;inset:0;z-index:58;background:transparent;}';
        document.head.appendChild(st);
      }
      var panel=document.getElementById('rrgviews');
      if(!panel){ panel=document.createElement('div'); panel.id='rrgviews'; panel.hidden=true; panel.innerHTML='<div class="rvhd"><b>Views</b><button class="rvx" id="rvClose" type="button">×</button></div><div class="rvbody" id="rvBody"></div>'; document.body.appendChild(panel); }
      var bd=null, OPEN=false, LOADED=false, BYLIST={};
      function evx(v){ var d=document.createElement('div'); d.textContent=v==null?'':String(v); return d.innerHTML; }
      function pos(){ var n=document.getElementById('rrgnav'); var x=n?Math.round(n.getBoundingClientRect().right):238; panel.style.left=x+'px'; }
      function renderBody(){
        var b=document.getElementById('rvBody'); if(!b) return;
        b.innerHTML=VS.map(function(sec){
          var links='<a class="rvlink all" href="'+sec.all+'">All '+evx(sec.label)+'</a>';
          (sec.bi||[]).forEach(function(v){ links+='<a class="rvlink" href="'+evx(v.h)+'">'+evx(v.l)+'</a>'; });
          if(sec.k && sec.k.charAt(0)!=='_'){ (BYLIST[sec.k]||[]).forEach(function(sc){ links+='<a class="rvlink" href="'+sec.all+'?view='+encodeURIComponent(sc.id)+'" title="'+evx(sc.name)+'">'+evx(sc.name)+(sc.shared?'<span class="rvtag">shared</span>':'')+'</a>'; }); }
          return '<div class="rvgrp"><div class="rvglbl"><span class="rvic">'+sec.ic+'</span>'+evx(sec.label)+'</div>'+links+'</div>';
        }).join('');
      }
      function load(){ renderBody(); if(LOADED) return; fetch('/api/saved-searches?all=1',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){ BYLIST=(j&&j.byList)||{}; LOADED=true; renderBody(); }).catch(function(){ LOADED=true; }); }
      function openP(){ OPEN=true; pos(); panel.hidden=false; requestAnimationFrame(function(){ panel.classList.add('on'); }); if(!bd){ bd=document.createElement('div'); bd.id='rrgviews-bd'; bd.addEventListener('click',closeP); } document.body.appendChild(bd); load(); }
      function closeP(){ OPEN=false; panel.classList.remove('on'); if(bd&&bd.parentNode) bd.parentNode.removeChild(bd); setTimeout(function(){ if(!OPEN) panel.hidden=true; },170); }
      function toggle(){ OPEN?closeP():openP(); }
      var vbtn=document.querySelector('#rrgnav [data-views]'); if(vbtn){ vbtn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); toggle(); }); }
      var cx=document.getElementById('rvClose'); if(cx) cx.addEventListener('click',closeP);
      document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&OPEN) closeP(); });
      window.addEventListener('resize',function(){ if(OPEN) pos(); });
    })();
    try{ var _skel=document.getElementById('rrgnav-skel'); if(_skel) _skel.remove(); }catch(e){}
    try{ localStorage.setItem('rrg_nav_html_v1', navHtml.replace(/class="it on"/g,'class="it"')); }catch(e){}
    try{ if(localStorage.getItem('rrg_nav_collapsed')==='1') document.body.classList.add('rrg-collapsed'); }catch(e){}
    try{ requestAnimationFrame(function(){ requestAnimationFrame(function(){ document.documentElement.classList.add('rrg-anim'); }); }); }catch(e){ document.documentElement.classList.add('rrg-anim'); }
    (function(){ var _cb=document.getElementById('rrgcollapse'); if(!_cb) return; function _sync(){ var on=document.body.classList.contains('rrg-collapsed'); _cb.textContent=on?'\u00bb':'\u00ab'; _cb.title=on?'Expand sidebar':'Collapse sidebar'; } _sync(); _cb.addEventListener('click',function(e){ e.preventDefault(); var on=document.body.classList.toggle('rrg-collapsed'); try{ localStorage.setItem('rrg_nav_collapsed',on?'1':'0'); }catch(_e){} _sync(); }); })();
    // Contextual back button in the header's left slot — pages opt in with
    // <meta name="rrg-back" content="rrg_companies.html|Companies">.
    // Standardized breadcrumb: pages opt in with <meta name="rrg-back" content="rrg_companies.html|Companies">.
    // Renders "Command › Companies › [record]" at the top of the content — same breadcrumb pattern as every other page.
    try { var _mb=document.querySelector('meta[name="rrg-back"]'); if(_mb && !document.querySelector('.navcrumb')){ var _p=String(_mb.getAttribute('content')||'').split('|'); var _href=(_p[0]||'').trim(), _lbl=(_p[1]||'Back').trim(); if(_href){
      var _bk=document.createElement('nav'); _bk.className='rrgcrumb';
      _bk.innerHTML='<a href="index.html">Command</a><span class="sep">›</span><a href="'+esc(_href)+'" class="rrgcrumb-back">'+esc(_lbl)+'</a>';
      var _pl=_bk.querySelector('.rrgcrumb-back'); if(_pl) _pl.addEventListener('click',function(e){ try{ var rf=(document.referrer||'').split('#')[0], cur=location.href.split('#')[0]; var _tgt=String(_href||'').replace(/^\.\//,'').split(/[?#]/)[0].toLowerCase(); var _rfp=(rf.indexOf(location.origin)===0?rf.slice(location.origin.length):'').replace(/^\//,'').split(/[?#]/)[0].toLowerCase(); if(rf && rf.indexOf(location.origin)===0 && rf!==cur && window.history.length>1 && _tgt && _rfp===_tgt){ e.preventDefault(); window.history.back(); } }catch(_e){} });
      document.body.insertBefore(_bk, document.body.firstChild);
      var _fillLeaf=function(){ try{ if(_bk.querySelector('.rrgcrumb-cur')) return; var _h1=document.querySelector('h1'); var _lf=_h1?String(_h1.textContent||'').trim():''; if(_lf){ var _s=document.createElement('span'); _s.className='sep'; _s.textContent='›'; var _c=document.createElement('span'); _c.className='rrgcrumb-cur'; _c.textContent=_lf; _bk.appendChild(_s); _bk.appendChild(_c); } }catch(_e){} };
      _fillLeaf(); setTimeout(_fillLeaf,400); setTimeout(_fillLeaf,1100);
    } } } catch(e){}
    // Public helper: a page can set an explicit breadcrumb trail once it has loaded record
    // context (e.g. a contact showing its parent company). items=[{label,href}...]; the last
    // item renders as the current page (no link). Overrides the auto-filled leaf above.
    window.rrgSetCrumb = function(items){ try{ var el=document.querySelector('.rrgcrumb'); if(!el||!items||!items.length) return; var h='<a href="index.html">Command</a>'; for(var i=0;i<items.length;i++){ var it=items[i]||{}; h+='<span class="sep">›</span>'; if(i<items.length-1 && it.href){ h+='<a href="'+esc(it.href)+'">'+esc(it.label||'')+'</a>'; } else { h+='<span class="rrgcrumb-cur">'+esc(it.label||'')+'</span>'; } } el.innerHTML=h; }catch(_e){} };
    try { fetch('/api/counts',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){ var od=(j&&j.overdue)||{}; var NOUN={'rrg_tickets.html':'past-due request','rrg_tasks.html':'overdue task'}; Object.keys(od).forEach(function(href){ var c=od[href]||0; if(c<=0) return; var tl=nav.querySelector('a.it[href="'+href+'"]'); if(!tl||tl.querySelector('.navbadge')) return; var noun=NOUN[href]||'item'; tl.title=c+' '+noun+(c===1?'':'s'); var b=document.createElement('span'); b.className='navbadge'; b.textContent=c>999?'999+':String(c); tl.appendChild(b); }); var dt=(j&&j.dueToday)||{}; Object.keys(dt).forEach(function(href){ var c=dt[href]||0; if(c<=0) return; var tl=nav.querySelector('a.it[href="'+href+'"]'); if(!tl||tl.querySelector('.navbadge.gold')) return; var g=document.createElement('span'); g.className='navbadge gold'; g.textContent=c>999?'999+':String(c); g.title=c+' task'+(c===1?'':'s')+' due today'; tl.appendChild(g); }); var nb=(j&&j.newbookings)||{}; Object.keys(nb).forEach(function(href){ var c=nb[href]||0; if(c<=0) return; var tl=nav.querySelector('a.it[href="'+href+'"]'); if(!tl||tl.querySelector('.navbadge')) return; var b=document.createElement('span'); b.className='navbadge'; b.textContent=c>99?'99+':String(c); b.title=c+' new meeting'+(c===1?'':'s')+' booked'; tl.appendChild(b); }); }).catch(function(){}); } catch(e){}
    // Create New dropdown
    (function(){ var cb=document.getElementById('rrgCreateBtn'), cm=document.getElementById('rrgCreateMenu'); if(!cb||!cm) return;
      function openM(){ cm.hidden=false; cb.setAttribute('aria-expanded','true'); }
      function closeM(){ cm.hidden=true; cb.setAttribute('aria-expanded','false'); }
      cb.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(cm.hidden) openM(); else closeM(); });
      document.addEventListener('click',function(e){ if(cm.hidden) return; if(!cm.contains(e.target)&&e.target!==cb) closeM(); });
    })();
    (function(){ function _go(){ _recordRecent(); _renderRecentBar(); } _go(); setTimeout(_go,500); setTimeout(_go,1500); setTimeout(_go,3000);
      window.addEventListener('storage',function(e){ if(e && e.key==='rrgRecent') _renderRecentBar(); });
    })();
    // Account menu (top-right avatar)
    (function(){ var ab=document.getElementById('rrguav'), am=document.getElementById('rrguavMenu'); if(!ab||!am) return;
      function openM(){ am.hidden=false; ab.setAttribute('aria-expanded','true'); }
      function closeM(){ am.hidden=true; ab.setAttribute('aria-expanded','false'); }
      ab.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(am.hidden) openM(); else closeM(); });
      document.addEventListener('click',function(e){ if(am.hidden) return; if(!am.contains(e.target)&&e.target!==ab) closeM(); });
      document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeM(); });
    })();
    // mobile burger
    var burger=document.getElementById('rrgburger'); if(window.innerWidth<=900){ burger.style.display='flex'; }
    burger && burger.addEventListener('click', function(){ nav.classList.toggle('open'); });
    // collapsible nav groups (remembered)
    var _CK='rrg_navcoll_v2';
    var _coll={}, _hadState=false;
    try{ var _raw=localStorage.getItem(_CK); if(_raw!=null){ _hadState=true; _coll=JSON.parse(_raw)||{}; } }catch(e){}
    if(!_hadState){ nav.querySelectorAll('.lbl[data-grp]').forEach(function(l){ _coll[l.getAttribute('data-grp')]=1; }); try{ localStorage.setItem(_CK, JSON.stringify(_coll)); }catch(e){} }
    nav.querySelectorAll('.lbl[data-grp]').forEach(function(l){ var g=l.getAttribute('data-grp'); if(_coll[g]){ var grp=l.closest('.grp'); if(grp) grp.classList.add('collapsed'); } l.addEventListener('click',function(){ var grp=l.closest('.grp'); if(!grp) return; var on=grp.classList.toggle('collapsed'); try{ var c=JSON.parse(localStorage.getItem(_CK)||'{}')||{}; if(on) c[g]=1; else delete c[g]; localStorage.setItem(_CK,JSON.stringify(c)); }catch(e){} }); });
    // Re-cache the nav HTML now that collapsed state is applied, so the pre-paint
    // skeleton on the next page matches (no expand→collapse flash on navigation).
    try{ localStorage.setItem('rrg_nav_html_v1', nav.innerHTML.replace(/class="it on"/g,'class="it"')); }catch(e){}
    // search → companies search (simple v1)
    var si=document.getElementById('rrgsearch');
    var sr=document.getElementById('rrgsr');
    var _sqt=null, _ssel=-1, _sres=[];
    function _sesc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function _srHide(){ if(sr){ sr.hidden=true; } _ssel=-1; }
    function _srSel(i){ _ssel=i; Array.prototype.forEach.call(sr.querySelectorAll('a'),function(a){ a.classList.toggle('sel', parseInt(a.getAttribute('data-i'),10)===i); }); }
    function _srRender(res,q){
      var raw=res||[];
      if(!raw.length){ _sres=[]; sr.innerHTML='<div class="rnone">No matches for “'+_sesc(q)+'”.</div>'; sr.hidden=false; _ssel=-1; return; }
      var ic={contact:'◑',company:'▦',listing:'⌂'}, lbl={contact:'Contacts',company:'Companies',listing:'Listings'}, order=['contact','company','listing'];
      // Prioritise the record type that matches the window you searched from (e.g. Companies first on the companies page).
      var _f=(location.pathname||'').toLowerCase().split('/').pop();
      var _ctx=/compan/.test(_f)?'company':((/person|people|contact/.test(_f))?'contact':((/listing|assignment/.test(_f))?'listing':''));
      if(_ctx && order.indexOf(_ctx)>=0){ order=[_ctx].concat(order.filter(function(t){return t!==_ctx;})); }
      var ql=String(q||'').trim().toLowerCase();
      function _exact(r){ return String(r.title||'').trim().toLowerCase()===ql; }
      var html='', flat=[];
      order.forEach(function(ty){ var g=raw.filter(function(r){return r.type===ty;}); if(!g.length) return; g.sort(function(a,b){ return (_exact(b)?1:0)-(_exact(a)?1:0); }); html+='<div class="grp">'+lbl[ty]+'</div>'; g.forEach(function(r){ var gi=flat.length; flat.push(r); html+='<a href="'+r.url+'" data-i="'+gi+'"><span class="ric">'+(ic[ty]||'•')+'</span><span><span class="rt">'+_sesc(r.title)+'</span>'+(r.sub?('<span class="rs">'+_sesc(r.sub)+'</span>'):'')+'</span></a>'; }); });
      _sres=flat;
      sr.innerHTML=html; sr.hidden=false;
      Array.prototype.forEach.call(sr.querySelectorAll('a'),function(a){ a.addEventListener('mousemove',function(){ _srSel(parseInt(a.getAttribute('data-i'),10)); }); });
      _srSel(0);
    }
    function _srSearch(q){ q=String(q||'').trim(); if(q.length<2){ _srHide(); _sres=[]; return; } if(sr){ sr.innerHTML='<div class="rnone">Searching\u2026</div>'; sr.hidden=false; } fetch('/api/search?q='+encodeURIComponent(q),{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){ if(String(si.value||'').trim().length<2){ _srHide(); return; } _srRender((j&&j.results)||[], q); }).catch(function(){ if(String(si.value||'').trim().length>=2 && sr){ sr.innerHTML='<div class="rnone">Search is waking up \u2014 give it a second and type again.</div>'; sr.hidden=false; } else { _srHide(); } }); }
    si && si.addEventListener('input', function(){ var v=si.value; try{ if(typeof window.rrgLiveSearch==='function') window.rrgLiveSearch(v); }catch(e){} if(_sqt) clearTimeout(_sqt); _sqt=setTimeout(function(){ _srSearch(v); },180); });
    si && si.addEventListener('keydown', function(e){
      if(e.key==='ArrowDown'){ if(_sres.length){ e.preventDefault(); _srSel(Math.min(_sres.length-1,_ssel+1)); var el=sr.querySelector('a.sel'); if(el) el.scrollIntoView({block:'nearest'}); } return; }
      if(e.key==='ArrowUp'){ if(_sres.length){ e.preventDefault(); _srSel(Math.max(0,_ssel-1)); var el2=sr.querySelector('a.sel'); if(el2) el2.scrollIntoView({block:'nearest'}); } return; }
      if(e.key==='Enter'){ e.preventDefault(); if(_sres.length && _ssel>=0){ location.href=_sres[_ssel].url; } else { _srSearch(si.value); } return; }
      if(e.key==='Escape'){ _srHide(); si.blur(); return; }
    });
    si && si.addEventListener('focus', function(){ if(String(si.value||'').trim().length>=2 && _sres.length){ sr.hidden=false; } });
    document.addEventListener('click', function(e){ if(sr && !sr.hidden && e.target && e.target.closest && !e.target.closest('.srch')){ _srHide(); } });
    // hydrate app name, role, user
    try {
      fetch('/api/appname',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
        try{ localStorage.setItem('rrg_logo', (j&&j.logoUrl)||''); }catch(e){}
        var brand=document.getElementById('rrgbrand'); if(brand){ if(j&&j.logoUrl){ if(brand.querySelector('img')){ /* already showing the logo — no swap, no flash */ } else { brand.innerHTML='<img src="'+j.logoUrl+'" alt="" class="rrgbrandimg">'; } } else if(j&&j.name){ brand.textContent=j.name; } }
      }).catch(function(){});
      fetch('/api/session',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(s){
        try{ window.__rrgSession=s; window.__rrgAssistant=(s&&s.assistant)||'the assistant'; document.dispatchEvent(new CustomEvent('rrg:session',{detail:s})); }catch(e){} try{ if(s&&s.assistant){ var _cl=nav.querySelector('a.it[href="rrg_consult.html"] .itlbl'); if(_cl) _cl.textContent='Consult '+s.assistant; } }catch(e){}
        // Apply custom tool names (Admin → Tool Labels) to the nav — a rename permeates the sidebar.
        try{ var _nl=(s&&s.navLabels)||{}; try{ localStorage.setItem('rrg_nav_labels_v1', JSON.stringify(_nl)); }catch(e){} nav.querySelectorAll('a.it[data-lbl]').forEach(function(el){ var d=el.getAttribute('data-lbl'); var lb=_nl[d]||d; var sp=el.querySelector('.itlbl'); if(sp && sp.textContent!==lb) sp.textContent=lb; el.setAttribute('title', lb); }); }catch(e){}
        if(s&&(s.role==='admin'||s.role==='creator')){ nav.querySelectorAll('[data-admingrp]').forEach(function(g){ g.style.display=''; }); nav.querySelectorAll('[data-adminit]').forEach(function(el){ el.style.display=''; }); }
        if(s&&s.canManageLoi){ nav.querySelectorAll('a.it[data-need="loi"]').forEach(function(el){ el.style.display=''; }); }
        (function(){ var _role=(s&&s.role)||''; var _owner=(_role==='admin'||_role==='creator'); var _nv=(s&&s.navVis)||{}; if(!_owner){ nav.querySelectorAll('.lbl[data-grp]').forEach(function(l){ var gg=l.getAttribute('data-grp'); var allow=_nv[gg]; if(allow&&allow.length&&allow.indexOf(_role)<0){ var grp=l.closest('.grp'); if(grp) grp.style.display='none'; } }); } })();
        if(s&&!s.canUseAi){ var aist=document.createElement('style'); aist.textContent='[data-ai]{display:none !important;}'; document.head.appendChild(aist); }
        var nm=(s&&(s.name||s.username))||''; var uav=document.getElementById('rrguav'); if(uav&&nm){ var parts=nm.trim().split(/\s+/); var _ini=((parts[0]||'')[0]||'')+((parts[1]||'')[0]||'')||nm[0].toUpperCase(); var _ph=(s&&s.photoUrl)||''; uav.textContent=_ini; uav.style.backgroundImage=''; uav.classList.remove('haspic'); if(_ph){ var _im=new Image(); _im.onload=function(){ uav.textContent=''; uav.style.backgroundImage='url("'+_ph+'")'; uav.style.backgroundSize='cover'; uav.style.backgroundPosition='center'; uav.classList.add('haspic'); }; _im.onerror=function(){}; _im.src=_ph; } uav.title=nm+' — account menu'; } var uavn=document.getElementById('rrguavName'); if(uavn&&nm){ uavn.textContent='Signed in as '+nm; } var _rec=document.getElementById('rrguavRec'); if(_rec&&s&&s.username){ _rec.href='rrg_user.html?u='+encodeURIComponent(s.username); }
        var ac=document.getElementById('rrgacct'); if(ac&&nm) ac.textContent=nm.split(/\s+/)[0];
      }).catch(function(){});
    } catch(e){}
  }
})();

/* Repaint the top-right account avatar without a page reload (called after the
   user saves or clears a headshot on the account page). */
window.rrgSetAvatar=function(url){
  var uav=document.getElementById('rrguav'); if(!uav) return;
  var s=window.__rrgSession||{};
  var nm=(s.name||s.username||'').trim();
  var parts=nm.split(/\s+/);
  var _ini=((parts[0]||'')[0]||'')+((parts[1]||'')[0]||'')||(nm?nm[0].toUpperCase():'?');
  if(url){ var _im=new Image(); _im.onload=function(){ uav.textContent=''; uav.style.backgroundImage='url("'+url+'")'; uav.style.backgroundSize='cover'; uav.style.backgroundPosition='center'; uav.classList.add('haspic'); }; _im.onerror=function(){}; _im.src=url; }
  else { uav.textContent=_ini; uav.style.backgroundImage=''; uav.classList.remove('haspic'); }
};

/* ---- Shared working box: ONE canonical dialog for every long action, app-wide.
       rrgWork = plain NetSuite style (navy). rrgAiWork = same box with a small AI twist (sparkle + purple accent).
       Both share markup/methods so every "working" dialog in the app looks identical. ---- */
(function(){
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function assistant(){ return window.__rrgAssistant||'AI'; }
  function injectCss(){ if(document.getElementById('rrgaiwork-css')) return; var st=document.createElement('style'); st.id='rrgaiwork-css';
    st.textContent='.rrgaiwork{position:fixed;inset:0;background:rgba(16,22,40,.5);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:100000;padding:20px;}'
    +'.rrgaiwork[hidden]{display:none!important;}'
    +'.rrgaiwbox{background:#fff;border:1px solid #dbe0e9;border-radius:6px;padding:28px 32px 22px;max-width:430px;width:100%;text-align:center;box-shadow:0 18px 44px rgba(11,26,56,.22);position:relative;}'
    +'.rrgaiwbox.ai{border-top:2px solid #2c5c8f;}'                                          /* the small NetSuite AI twist */
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
    +'.rrgaiwok{margin-top:16px;background:#20334f;border:1px solid #20334f;border-radius:3px;padding:9px 24px;font:inherit;font-size:12.5px;font-weight:700;color:#fff;cursor:pointer;}'
    +'.rrgaicfhd{font-weight:700;color:#20334f;font-size:16px;}'
    +'.rrgaicfbody{color:#5f6a7d;font-size:13px;margin-top:8px;line-height:1.55;}'
    +'.rrgaicfask{display:flex;align-items:center;gap:7px;font-size:12px;color:#5f6a7d;margin-top:14px;cursor:pointer;}'
    +'.rrgaicfbtns{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}'
    +'.rrgaicfcancel{background:#fff;border:1px solid #c4ccda;border-radius:3px;padding:9px 16px;font:inherit;font-size:12.5px;font-weight:700;color:#5f6a7d;cursor:pointer;}'
    +'.rrgaicfgo{background:#20334f;border:1px solid #20334f;border-radius:3px;padding:9px 18px;font:inherit;font-size:12.5px;font-weight:700;color:#fff;cursor:pointer;}';
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
  window.rrgAiConfirm=function(opts){ opts=opts||{}; if(window.__rrgAiConfirm===false){ if(opts.onProceed) opts.onProceed(); return; } var key='rrgai_skip_'+(opts.actionKey||'ai'); try{ if(localStorage.getItem(key)==='1'){ if(opts.onProceed) opts.onProceed(); return; } }catch(e){}
    injectCss(); var ov=document.createElement('div'); ov.className='rrgaiwork'; ov.style.zIndex='1001';
    ov.innerHTML='<div class="rrgaiwbox ai" style="text-align:left"><div class="rrgaicfhd">✦ '+esc(opts.title||('Run '+assistant()))+'</div><div class="rrgaicfbody">'+esc(opts.body||'This uses AI.')+'</div><label class="rrgaicfask"><input type="checkbox" id="rrgaidontask"> Don’t ask again for this</label><div class="rrgaicfbtns"><button type="button" class="rrgaicfcancel" id="rrgaicfcancel">Cancel</button><button type="button" class="rrgaicfgo" id="rrgaicfgo">Continue</button></div></div>';
    document.body.appendChild(ov); function close(){ ov.remove(); } ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    ov.querySelector('#rrgaicfcancel').addEventListener('click',close);
    ov.querySelector('#rrgaicfgo').addEventListener('click',function(){ if(document.getElementById('rrgaidontask').checked){ try{localStorage.setItem(key,'1');}catch(e){} } close(); if(opts.onProceed) opts.onProceed(); }); };
  // ---- Automation "flash dialog" steps: interruptive info modals queued for the enrolling rep ----
  function _rrgFlashStyle(){ if(document.getElementById('rrgflash-css'))return; var st=document.createElement('style'); st.id='rrgflash-css'; st.textContent='#rrgflash-ov{position:fixed;inset:0;background:rgba(6,14,32,.55);z-index:4000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;opacity:0;transition:opacity .14s;}#rrgflash-ov.show{opacity:1;}#rrgflash-bx{background:#fff;border:1px solid #dbe0e9;border-radius:12px;max-width:460px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.28);overflow:hidden;transform:translateY(8px) scale(.985);transition:transform .16s cubic-bezier(.2,.8,.2,1);}#rrgflash-ov.show #rrgflash-bx{transform:none;}#rrgflash-hd{padding:16px 20px 4px;font-size:16px;font-weight:700;color:#000E31;}#rrgflash-bd{padding:6px 20px 16px;font-size:14px;line-height:1.55;color:#2a3654;white-space:pre-wrap;}#rrgflash-meta{padding:0 20px 12px;font-size:11.5px;color:#8a94a6;}#rrgflash-ft{padding:12px 20px;border-top:1px solid #eef1f6;display:flex;justify-content:flex-end;gap:8px;}#rrgflash-ok{background:#000E31;color:#fff;border:none;border-radius:9px;padding:9px 22px;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer;}#rrgflash-ok:hover{background:#0a1a44;}'; document.head.appendChild(st); }
  function _rrgShowFlash(dlg, onDone){
    _rrgFlashStyle();
    var ov=document.createElement('div'); ov.id='rrgflash-ov';
    var meta=dlg.contactName?('Re: '+esc(dlg.contactName)+(dlg.automationName?(' · '+esc(dlg.automationName)):'')):(dlg.automationName?esc(dlg.automationName):'');
    ov.innerHTML='<div id="rrgflash-bx" role="dialog" aria-modal="true">'+(dlg.title?('<div id="rrgflash-hd">'+esc(dlg.title)+'</div>'):'')+'<div id="rrgflash-bd">'+esc(dlg.body||'')+'</div>'+(meta?('<div id="rrgflash-meta">'+meta+'</div>'):'')+'<div id="rrgflash-ft"><button type="button" id="rrgflash-ok">OK</button></div></div>';
    document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('show'); });
    function done(){ try{ fetch('/api/my-dialogs/'+encodeURIComponent(dlg.id)+'/ack',{method:'POST',credentials:'same-origin'}); }catch(e){} ov.classList.remove('show'); setTimeout(function(){ if(ov.parentNode) ov.remove(); if(onDone) onDone(); },160); }
    var okb=ov.querySelector('#rrgflash-ok'); okb.addEventListener('click',done); try{ okb.focus(); }catch(e){}
  }
  function _rrgPollFlash(){
    try{ fetch('/api/my-dialogs',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){ var ds=(j&&j.dialogs)||[]; if(!ds.length) return; if(document.getElementById('rrgflash-ov')) return; var i=0; (function next(){ if(i>=ds.length) return; _rrgShowFlash(ds[i], function(){ i++; next(); }); })(); }).catch(function(){}); }catch(e){}
  }
  try{ setTimeout(_rrgPollFlash, 1500); setInterval(_rrgPollFlash, 180000); }catch(e){}

})();
