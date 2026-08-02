/* RRG Questionnaire engine: schema-driven forms (Form > Category > Question > Answers) */
window.RRG_FORMS = window.RRG_FORMS || {};
window.RRG_FORMS.seller = {
  id:'seller', name:'Seller Screening', kicker:'The RRG Screen',
  header:[
    {id:'company', type:'company', label:'Company Name', required:true, prompt:"What's the name of the business?", hint:"Legal entity name if they have one — it has to match the lease and the tax returns later."},
    {id:'concept', type:'concept', label:'Concept', prompt:"And what's the concept called?", hint:"The name on the door. Often different from the LLC on the lease."},
    {id:'contact', type:'text', label:'Seller Contact Name', required:true, prompt:"Who am I speaking with today?", hint:"Full name — and confirm they're an owner. If they're not on the operating agreement you're screening the wrong person."},
    {id:'rep', type:'rep', label:'RRG Rep', required:true, prompt:"Which rep is running this call?", hint:"You. Auto-fills from your login — only change it if you're logging someone else's call."},
    {id:'calldate', type:'date', label:'Call Date', required:true, prompt:"Today's date.", hint:"Auto-fills. Change it only if you're entering a call from an earlier day."},
    {id:'metro', type:'metro', label:'Metro', required:true, prompt:"What market is the business in?", hint:"Drives the comps and the buyer list. Pick the metro, not the suburb."},
    {id:'address', type:'text', label:'Business Address', prompt:"What's the street address?", hint:"If they're worried about confidentiality, don't read the address back out loud — confirm cross streets and fill it in after."}
  ],
  categories:[
    { n:'1', title:'Business Profile', questions:[
      {type:'options', label:'Concept Type', required:true, cols:3, options:['Full Service Restaurant','Fast Casual','QSR','Bar / Beverage Forward','Café / Bakery','Nightclub / Entertainment','Other'], prompt:"How would you describe the concept — full service, fast casual, bar?", hint:"Let them answer before you read the list. How an owner self-describes tells you which buyer pool this belongs to."},
      {type:'options', label:'Franchise or Independent?', required:true, cols:2, options:['Franchise','Independent'], prompt:"Is it a franchise, or your own independent concept?", hint:"A franchisor holds approval rights over any buyer — that's a third party who can kill your deal. If franchise, ask for the FDD and the remaining franchise term."},
      {type:'options', label:'Owner’s Role', cols:3, options:['Owner-Operator (Daily)','Semi-Absentee','Absentee / Manager-Run'], prompt:"How involved are you in the business day to day?", hint:"Owner-operator earnings include their own labor — a buyer has to pay to replace it. Absentee sells at a premium and to a much wider pool."},
      {type:'options', label:'Ownership Structure', cols:2, options:['Sole Owner','Partnership','LLC / Corporation','Family-Owned'], prompt:"How is the ownership set up — is it just you, or do you have partners?", hint:"Every partner is a signature you need at closing. Find out now if one of them isn't on board."},
      {type:'options', id:'realEstate', required:true, label:'Real Estate', cols:3, options:['Owns Real Estate','Leases','Owns + Leases'], prompt:"Do you own the building, or do you lease the space?", hint:"If they own it you may have two deals. Ask whether they'd sell the real estate or lease it back to the buyer."},
      {type:'text', num:'dec2', label:'Years in Operation', required:true, prompt:"How long have you been operating?", hint:"Under three years is thin for SBA financing. Ten-plus under the same owner is a story worth telling buyers."},
      {type:'text', num:'int', label:'Number of Locations', required:true, prompt:"How many locations do you have?", hint:"Multi-unit changes the whole deal — allocation, shared overhead, and whether they're selling all of them or just one."},
      {type:'text', num:'int', label:'Approx. Employees', prompt:"Roughly how many people do you have on staff?", hint:"Listen for a key manager. If the business runs on one person who isn't the owner, ask whether that person stays."}
    ]},
    { n:'2', title:'Motivation & Timeline', questions:[
      {type:'options', label:'Primary Motivation for Selling', required:true, cols:3, options:['Retirement','Burnout / Lifestyle','New Venture','Health','Partnership Dispute','Financial Distress','Opportunistic','Other'], prompt:"What's got you thinking about selling?", hint:"Ask it open-ended and then stay quiet. Retirement, health and burnout are real motivation. 'Just seeing what it's worth' rarely moves on price."},
      {type:'textarea', label:'Motivation (Rep’s Own Words)', prompt:"Your read — what's actually driving this sale?", hint:"Your note, not theirs. Write what you believe is going on, not what they told you."},
      {type:'options', label:'Timeline', required:true, cols:2, options:['Immediate (0–3 months)','Short (3–6 months)','Medium (6–12 months)','Exploratory / No Rush'], prompt:"What kind of timeline are you working with?", hint:"'No rush' is not a listing. Ask what happens if it hasn't sold by their date — that's where the real deadline shows up."},
      {type:'options', label:'Exit Type', cols:2, options:['Full Exit','Partial / Keep Equity','Sell + Stay On','Real Estate Only'], prompt:"Are you looking to walk away completely, or stay involved in some way?", hint:"A seller willing to stay on or keep equity can bridge a valuation gap. It also tells you whether they'd carry paper."}
    ]},
    { n:'3', title:'Financials', questions:[
      {type:'options', label:'Profitability', required:true, cols:2, options:['Profitable','Break-Even','Declining','Losing Money'], prompt:"Is the business making money right now?", hint:"The single most important answer on this call. Losing money points straight at an asset sale, not a going-concern sale."},
      {type:'options', label:'Financial Records Available?', cols:3, options:['Yes (P&Ls & Tax Returns Ready)','Partial','No / Disorganized'], prompt:"Do you have P&Ls and tax returns we could work from?", hint:"No documentable financials means no lender and no multiple. Ask for three years of returns and the last twelve months of P&Ls before you leave the call."},
      {type:'money', label:'Annual Revenue', required:true, prompt:"Roughly what did you do in sales last year?", hint:"Ballpark is fine here — you'll verify against the returns. If they can't ballpark their own revenue, that's your answer on records."},
      {type:'options', label:'Sales vs. Prior Year', cols:3, options:['Up','Flat','Down'], prompt:"How does that compare to the year before?", hint:"Trend beats the absolute number. A business trending down needs an explanation before it goes to market."},
      {type:'options', label:'Earnings Basis', cols:3, options:['EBITDA','SDE','Owner’s Take'], prompt:"When you talk about what the business makes, do you mean SDE, EBITDA, or what you take home?", hint:"Most owners mean what they take home. Nail the basis down or the multiple you quote later is meaningless."},
      {type:'money', label:'Earnings Figure (Approx.)', prompt:"And roughly what is that number?", hint:"Capture it on the basis they just named — don't convert it in your head on the call."},
      {type:'options', label:'Earnings vs. Prior Year', cols:3, options:['Up','Flat','Down'], prompt:"And is that up or down from the year before?", hint:"Earnings trending down while sales hold flat usually means a cost problem a buyer can fix — which is an argument you can use."},
      {type:'options', id:'debtFlag', label:'Debt, Liens, Lawsuits, or Unusual Items?', cols:3, options:['Yes','No','Unsure'], prompt:"Is there any debt, any liens, or anything legal we'd need to clear at closing?", hint:"Ask it plainly and ask it early. A tax lien or an open suit can stop a transfer cold, and you'd rather find it now than in escrow."},
      {type:'text', full:true, showIf:{q:'debtFlag', any:['Yes','Unsure']}, label:'Debt / Lien / Lawsuit Details', prompt:"Tell me a little more about that.", hint:"Amount, who holds it, and whether it can be paid off from the sale proceeds."}
    ]},
    { n:'4', title:'Lease & Occupancy', sub:'If the Business Leases Its Space', showIf:{q:'realEstate', any:['Leases','Owns + Leases']}, questions:[
      {type:'number', id:'leaseBase', label:'Base Term Remaining (months)', prompt:"How many months are left on your base lease term?", hint:"This is a deal-killer field. Under five years of total secured term and most buyers can't get financing."},
      {type:'number', id:'leaseOption', label:'Option Period (months)', prompt:"And how much option time do you have after that?", hint:"Options only count toward a buyer's term if they survive assignment. Confirm against the actual lease, not memory."},
      {type:'readonly', id:'leaseTotal', label:'Total Remaining (incl. Options)', noprompt:true, hint:"Calculated for you — base plus options."},
      {type:'money', label:'Current Monthly Rent', prompt:"What's your rent right now?", hint:"Occupancy cost over roughly 10% of sales is something you'll have to explain to every buyer. Get base rent plus NNN if they know it."},
      {type:'options', label:'Current on Rent?', cols:3, options:['Current','Behind','Negotiating'], prompt:"Are you current with the landlord?", hint:"Being behind hands the landlord leverage over your assignment. Find out before you list, not after."},
      {type:'options', label:'Lease Assignable / Transferable?', cols:2, options:['Yes','With LL Consent','No','Unsure'], prompt:"Does your lease let you assign it to a buyer?", hint:"Get the actual lease document. 'I think so' is not something you can sell on — and a non-assignable lease is a pass."},
      {type:'options', label:'Landlord Aware of Sale?', cols:3, options:['Yes','No','Unsure'], prompt:"Does your landlord know you're thinking about selling?", hint:"If not, make sure they don't find out from a buyer walking the space. Plan that conversation with the seller before you market it."},
      {type:'textarea', full:true, label:'Lease Notes', prompt:"Anything else about the lease I should know about?", hint:"Percentage rent, personal guarantees, relocation or demolition clauses, CAM disputes, unpaid deferrals from 2020."}
    ]},
    { n:'5', title:'Expectations & Fit', questions:[
      {sub:'Valuation'},
      {type:'options', id:'valExp', label:'Has a Valuation Expectation?', cols:2, options:['Yes (Specific Number)','Yes (Rough Range)','No / Open to Guidance','Has Had a Formal Appraisal'], prompt:"Do you have a number in mind for the business?", hint:"Ask this before you offer any guidance. Whatever they say anchors the rest of the relationship."},
      {type:'range', showIf:{q:'valExp', not:['No / Open to Guidance']}, label:'Valuation Expectation', prompt:"What kind of number are you thinking?", hint:"Take the range, then stop talking. The silence after this question is where you learn how firm they are."},
      {type:'options', label:'Expectations Realistic? (Rep’s Assessment)', required:true, cols:3, options:['Realistic','Slightly High (Addressable)','Significantly Inflated'], prompt:"Your read — is that number anywhere near reality?", hint:"Your assessment, not theirs. Significantly inflated with no willingness to move is a pass, not a nurture."},
      {sub:'Prior Activity'},
      {type:'options', id:'priorBroker', label:'Prior Broker or Sale Attempt?', required:true, cols:3, options:['No (First Time)','Yes (With a Broker)','Yes (Tried Independently)'], prompt:"Have you had it on the market before — with a broker, or on your own?", hint:"A prior failed listing is free intelligence: the asking price, the buyer feedback, and why it died."},
      {type:'textarea', full:true, showIf:{q:'priorBroker', not:['No (First Time)']}, label:'What Happened?', prompt:"What happened that time around?", hint:"Listen for whether it was price, financials, or the landlord. The same problem will bite you unless it's been fixed."},
      {sub:'Process Fit'},
      {type:'options', label:'Confidentiality Importance', required:true, cols:3, options:['High','Medium','Low'], prompt:"How concerned are you about staff or customers finding out?", hint:"High confidentiality shapes how you market it — blind listing, NDA before the name. Set that expectation on this call."},
      {type:'options', label:'Speaking With Other Brokers?', cols:3, options:['No (First Conversation)','Yes (Shopping Around)','Unknown'], prompt:"Are you talking with anyone else about listing it?", hint:"Ask it straight. You'd much rather know you're in a beauty contest than find out after you've done the work."},
      {type:'email', full:true, id:'clientEmail', label:'RRG Rep Email — screening copy sent here', required:true, prompt:"Where should the screening copy go?", hint:"Your address, not the seller's. This is the internal copy of the call."},
      {sub:'Objection Tracking'},
      {type:'options', label:'Objections Raised on the Call', full:true, cols:3, options:['Not Ready Yet','Wants to Sell Themselves','Already Has a Buyer','Needs to Talk to Partner / Accountant','Talking to Other Brokers','Valuation / Price Gap','Confidentiality Concerns','Commission / Fees','None'], prompt:"What did they push back on during the call?", hint:"Your notes, not a question to ask. Log it even if you handled it — the same objection comes back at listing."}
    ]},
    { n:'6', title:'Call Outcome & Notes', decision:true, questions:[
      {sub:'Call Summary', draft:true},
      {type:'textarea', full:true, id:'callNotes', label:'Call Notes', required:true, placeholder:"3–4 sentences: motivation, financial picture, expectations, and your read on the lead. This goes into the contact's record in FullServe.", prompt:"Give me your 3–4 sentence summary — or hit Draft to generate one.", hint:"Write it so another broker could pick this lead up cold. Or hit Draft from answers and edit what comes back — never send it unread."},
      {type:'options', full:true, cols:2, required:true, label:'Deal Call', options:['Business Sale','Asset Sale','Nurture','Decline'], prompt:"Your call — business sale, asset sale, nurture, or decline?", hint:"Business Sale = going concern with transferable earnings. Asset Sale = the value is in the buildout, FF&E or license, not the earnings. Nurture = real but not ready. Decline = we can't deliver it or it's not worth our time. The AI pre-fills its read; you own the final call."}
    ]}
  ]
};
console.log('schema loaded:', window.RRG_FORMS.seller.categories.length, 'categories');

/* ---- Renderer: schema -> form HTML (matches existing classes/ids) ---- */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function reqstar(q){ return q.required?'<span class="req-star">*</span>':''; }
  function lab(q){ return '<label class="k">'+esc(q.label)+reqstar(q)+'</label>'; }
  function optcls(q){ var n=q.cols||2; return 'optcols'+(n>=4?' c4':(n===3?' c3':'')); }
  function renderOptions(q){
    var cls='oset'+(q.full?' full':'')+(q.multi?'':' single')+' rowgap'+(q.required?'" data-req="1':'');
    var h='<div class="'+cls+'">'+lab(q)+'<div class="'+optcls(q)+'">';
    (q.options||[]).forEach(function(o){ h+='<label class="opt"><input type="checkbox">'+esc(o)+'</label>'; });
    return h+'</div></div>';
  }
  function renderField(q){
    var t=q.type, id=q.id?(' id="'+q.id+'"'):'';
    // Instruction card: script, disclosure or coaching copy the rep reads. No answer captured.
    if(t==='instruction'||t==='note') return '<div class="field instrfield full rowgap" data-instr="1">'+lab(q)+'<div class="instrbody">'+esc(q.text||q.body||'').replace(/\n/g,'<br>')+'</div></div>';
    if(t==='company') return '<div class="field">'+lab(q)+'<div class="coauto2"><input type="text" class="req" id="sscCompany" autocomplete="off"><div class="cosug2" id="sscCosug" hidden></div></div></div>';
    if(t==='concept') return '<div class="field">'+lab(q)+'<div class="coauto2"><input type="text" id="sscConcept" autocomplete="off" placeholder="Pick or add a concept"><div class="cosug2" id="sscConceptSug" hidden></div></div></div>';
    if(t==='rep') return '<div class="field">'+lab(q)+'<select class="req" id="repSelect"><option value="">Select…</option></select></div>';
    if(t==='date') return '<div class="field">'+lab(q)+'<input type="date" class="req" id="callDate"></div>';
    if(t==='metro') return '<div class="field">'+lab(q)+'<select class="req" id="metroSelect"><option value="">Select…</option><option>Austin</option><option>Dallas</option><option>Houston</option><option>San Antonio</option><option>RGV</option><option>Other</option></select></div>';
    if(t==='readonly') return '<div class="field'+(q.full?' full rowgap':'')+'">'+lab(q)+'<input type="text"'+id+' readonly placeholder="'+esc(q.placeholder||'auto-calculated')+'" style="background:#f7f9fc"></div>';
    if(t==='number') return '<div class="field">'+lab(q)+'<input type="number" min="0" step="1"'+id+' placeholder="months"></div>';
    if(t==='money') return '<div class="field'+(q.full?' full rowgap':'')+'">'+lab(q)+'<span class="madorn"><span class="ad-pre">$</span><input type="text" class="money'+(q.required?' req':'')+'" inputmode="numeric"'+id+'></span></div>';
    if(t==='range') return '<div class="field full rowgap rangefield">'+lab(q)+'<div class="rangewrap"><span class="madorn"><span class="ad-pre">$</span><input type="text" class="money" inputmode="numeric" placeholder="Amount / low"></span><span class="rangeto">to</span><span class="madorn"><span class="ad-pre">$</span><input type="text" class="money" inputmode="numeric" placeholder="High (optional)"></span></div></div>';
    if(t==='textarea') return '<div class="field'+(q.full?' full rowgap':'')+'">'+lab(q)+'<textarea'+(q.required?' class="req"':'')+id+(q.placeholder?(' placeholder="'+esc(q.placeholder)+'"'):'')+'></textarea></div>';
    if(t==='email') return '<div class="field'+(q.full?' full':'')+'">'+lab(q)+'<input type="text" class="'+(q.required?'req email':'email')+'"'+id+'></div>';
    var extra=q.num?(' '+q.num):''; // text with numeric class
    return '<div class="field'+(q.full?' full rowgap':'')+'">'+lab(q)+'<input type="text" class="'+((q.required?'req':'')+extra).trim()+'"'+id+(q.placeholder?(' placeholder="'+esc(q.placeholder)+'"'):'')+'></div>';
  }
  function renderSub(q,ca){ var extra=q.draft?' <button type="button" id="draftBtn" style="margin-left:10px;background:#000E31;border:1px solid #000E31;border-radius:9px;padding:6px 13px;font:inherit;font-size:12px;font-weight:700;color:#fff;cursor:pointer">✨ Draft from answers</button>':''; return '<div '+(ca||'')+'class="subhead">'+esc(q.sub)+extra+'</div>'; }
  function partInput(p, id){
    var t=p.type||'text';
    if(t==='textarea') return '<textarea'+(id?(' id="'+id+'"'):'')+'></textarea>';
    if(t==='number') return '<input type="number" min="0" step="1"'+(id?(' id="'+id+'"'):'')+'>';
    if(t==='money') return '<span class="madorn"><span class="ad-pre">$</span><input type="text" class="money" inputmode="numeric"'+(id?(' id="'+id+'"'):'')+'></span>';
    if(t==='date') return '<input type="date"'+(id?(' id="'+id+'"'):'')+'>';
    if(t==='email') return '<input type="text" class="email"'+(id?(' id="'+id+'"'):'')+'>';
    return '<input type="text"'+(id?(' id="'+id+'"'):'')+'>';
  }
  function renderGroup(q){
    var gid=q.id||('grp'+Math.round((q.label||'').length));
    var cols=q.cols||2, cc=cols>=3?' c3':(cols<=1?' c1':'');
    var parts=(q.parts||[]).map(function(p,i){ return '<div class="gpart"><label class="gk">'+esc(p.label||'')+'</label>'+partInput(p, gid+'_'+i)+'</div>'; }).join('');
    return '<div class="field group full rowgap">'+lab(q)+'<div class="groupgrid'+cc+'">'+parts+'</div></div>';
  }
  function condAttr(c){ return c ? ('data-showif="'+esc(JSON.stringify(c))+'" ') : ''; }
  function injectPrompt(html,q,cat){ if(!q) return html; var a='';
    if(q.prompt) a+='data-prompt="'+esc(q.prompt)+'" ';
    if(q.hint) a+='data-hint="'+esc(q.hint)+'" ';
    if(q.id) a+='data-qid="'+esc(q.id)+'" ';
    a+=condAttr(q.showIf || (cat && cat.showIf) || null);
    return a ? html.replace('<div ', '<div '+a) : html; }
  function renderCat(cat){
    // A conditional category carries its condition on the section header, the subhead and
    // every question inside it, so the whole block appears and disappears as one piece.
    var ca=condAttr(cat.showIf);
    var h='<div '+ca+'class="sec brk'+(cat.decision?' decisionsec':'')+'"><div class="num">'+esc(cat.n)+'</div><h2>'+esc(cat.title)+'</h2><div class="flex"></div></div>';
    if(cat.decision) h+='<div '+ca+'class="decisionnote"><b>Decision point.</b> Based on everything above — do we move forward with this seller, or not?</div>';
    if(cat.sub) h+='<div '+ca+'class="subhead">'+esc(cat.sub)+'</div>';
    var grid=[];
    function flush(){ if(grid.length){ h+='<div '+ca+'class="grid rowgap">'+grid.join('')+'</div>'; grid=[]; } }
    (cat.questions||[]).forEach(function(q){
      if(q.sub){ flush(); h+=renderSub(q,ca); return; }
      if(q.type==='group'){ flush(); h+=injectPrompt(renderGroup(q),q,cat); return; }
      if(q.type==='instruction'||q.type==='note'){ flush(); h+=injectPrompt(renderField(q),q,cat); return; }
      if(q.type==='options'||q.type==='textarea'||q.type==='range'||q.full){ flush(); h+= injectPrompt(q.type==='options'?renderOptions(q):renderField(q), q, cat); }
      else grid.push(injectPrompt(renderField(q), q, cat));
    });
    flush();
    return h;
  }
  /* ---- Conditional questions ----------------------------------------------------
     A rep on a live call should never be reading lease questions to an owner who has no
     lease. A dependent block carries data-showif={"q":<trigger id>,"any":[...]} (or
     "not":[...]); the trigger block carries data-qid. Rules, in order:
       - trigger not present in this form at all  -> show it (never suppress a question
         we cannot evaluate; a custom form may not have the trigger)
       - trigger present but unanswered           -> hide it (silence is not a yes)
       - answered                                 -> match against any/not
     Hiding clears the block. If a seller flips from Leases to Owns Real Estate, the lease
     answers are wrong and must not ride along into the record. */
  function condAnswers(qid){
    var host=document.querySelector('[data-qid="'+qid+'"]');
    if(!host) return null;                      // null = cannot evaluate
    if(host.classList.contains('oset')){
      return [].slice.call(host.querySelectorAll('label.opt')).filter(function(l){ var i=l.querySelector('input'); return i&&i.checked; })
               .map(function(l){ return l.textContent.trim(); });
    }
    var out=[];
    [].slice.call(host.querySelectorAll('input,textarea,select')).forEach(function(x){
      if(x.type==='hidden') return;
      if(x.type==='checkbox'||x.type==='radio'){ if(x.checked) out.push(String((x.parentNode&&x.parentNode.textContent)||'').trim()); }
      else if(String(x.value||'').trim()) out.push(String(x.value).trim());
    });
    return out;
  }
  function cnorm(v){ return String(v==null?'':v).trim().toLowerCase(); }
  function condMet(c){
    if(!c||!c.q) return true;
    var have=condAnswers(c.q);
    if(have===null) return true;
    have=have.map(cnorm).filter(Boolean);
    if(!have.length) return false;
    if(c.any) return c.any.some(function(v){ return have.indexOf(cnorm(v))>=0; });
    if(c.not) return !c.not.some(function(v){ return have.indexOf(cnorm(v))>=0; });
    return true;
  }
  // A branch that switches off KEEPS its answers. The rep may have captured them before a
  // later answer routed the call elsewhere, and a mis-click on a trigger must not cost them
  // the work. "Hidden" means "does not apply", not "deleted": the readers on the form skip
  // hidden blocks, so a branch that is off contributes nothing to the record, the email or
  // the PDF -- and switching it back on hands the rep exactly what they had.
  // All this does is drop the red "missing" flag, since a question nobody is being asked
  // cannot be unanswered.
  function condRelease(el){
    [].slice.call(el.querySelectorAll('.missing')).forEach(function(x){ x.classList.remove('missing'); });
    el.classList.remove('missing');
  }
  function applyConditionals(){
    // Query the whole document, not just the form: Call Mode physically lifts the current
    // question out into its own panel, so a trigger may not be inside the form right now.
    [].slice.call(document.querySelectorAll('[data-showif]')).forEach(function(el){
      var c; try{ c=JSON.parse(el.getAttribute('data-showif')); }catch(e){ return; }
      var ok=condMet(c), wasVisible=!el.hasAttribute('hidden');
      if(ok){ el.removeAttribute('hidden'); return; }
      if(wasVisible) condRelease(el);
      el.setAttribute('hidden','');
    });
  }
  window.RRG_FORMS.applyConditionals=applyConditionals;
  window.RRG_FORMS.wireConditionals=function(){
    applyConditionals();
    if(window.__rrgCondWired) return;
    window.__rrgCondWired=true;
    document.addEventListener('change', applyConditionals);
    document.addEventListener('input', applyConditionals);
  };
  window.RRG_FORMS.render=function(f){
    var h='<div class="grid rowgap">'+f.header.map(function(q){return injectPrompt(renderField(q),q);}).join('')+'</div>';
    f.categories.forEach(function(c){ h+=renderCat(c); });
    return h;
  };
})();
