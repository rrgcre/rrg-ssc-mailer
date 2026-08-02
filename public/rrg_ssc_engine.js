/* RRG Questionnaire engine: schema-driven forms (Form > Category > Question > Answers) */
window.RRG_FORMS = window.RRG_FORMS || {};
window.RRG_FORMS.seller = {
  id:'seller', name:'Seller Screening', kicker:'The RRG Screen',
  header:[
    {id:'company', type:'company', label:'Company Name', required:true, prompt:"What's the name of the company or business?"},
    {id:'concept', type:'concept', label:'Concept', prompt:"What concept or brand are we talking about?"},
    {id:'contact', type:'text', label:'Seller Contact Name', required:true, prompt:"Who are we speaking with — the seller's name?"},
    {id:'rep', type:'rep', label:'RRG Rep', required:true, prompt:"Which RRG rep is running this call?"},
    {id:'calldate', type:'date', label:'Call Date', required:true, prompt:"What's today's date?"},
    {id:'metro', type:'metro', label:'Metro', required:true, prompt:"Which market or metro is this in?"},
    {id:'address', type:'text', label:'Business Address', prompt:"What's the business address?"}
  ],
  categories:[
    { n:'1', title:'Business Profile', questions:[
      {type:'options', label:'Concept Type', required:true, cols:3, options:['Full Service Restaurant','Fast Casual','QSR','Bar / Beverage Forward','Café / Bakery','Nightclub / Entertainment','Other'], prompt:"What type of concept is it — quick service, full service, bar?"},
      {type:'options', label:'Franchise or Independent?', required:true, cols:2, options:['Franchise','Independent'], prompt:"Is it a franchise or independent?"},
      {type:'options', label:'Owner’s Role', cols:3, options:['Owner-Operator (Daily)','Semi-Absentee','Absentee / Manager-Run'], prompt:"How involved is the owner day to day?"},
      {type:'options', label:'Ownership Structure', cols:2, options:['Sole Owner','Partnership','LLC / Corporation','Family-Owned'], prompt:"How is ownership structured — sole owner, partners?"},
      {type:'options', label:'Real Estate', cols:3, options:['Owns Real Estate','Leases','Owns + Leases'], prompt:"Do they own the real estate, or lease the space?"},
      {type:'text', num:'dec2', label:'Years in Operation', required:true, prompt:"How many years have they been in operation?"},
      {type:'text', num:'int', label:'Number of Locations', required:true, prompt:"How many locations do they operate?"},
      {type:'text', num:'int', label:'Approx. Employees', prompt:"Roughly how many employees do they have?"}
    ]},
    { n:'2', title:'Motivation & Timeline', questions:[
      {type:'options', label:'Primary Motivation for Selling', required:true, cols:3, options:['Retirement','Burnout / Lifestyle','New Venture','Health','Partnership Dispute','Financial Distress','Opportunistic','Other'], prompt:"What's their main reason for selling?"},
      {type:'textarea', label:'Motivation (Rep’s Own Words)', prompt:"In your own words — what's really driving this sale?"},
      {type:'options', label:'Timeline', required:true, cols:2, options:['Immediate (0–3 months)','Short (3–6 months)','Medium (6–12 months)','Exploratory / No Rush'], prompt:"What's their timeline to sell?"},
      {type:'options', label:'Exit Type', cols:2, options:['Full Exit','Partial / Keep Equity','Sell + Stay On','Real Estate Only'], prompt:"What kind of exit are they after — full sale, partial, walk away?"}
    ]},
    { n:'3', title:'Financials', questions:[
      {type:'options', label:'Profitability', required:true, cols:2, options:['Profitable','Break-Even','Declining','Losing Money'], prompt:"Is the business profitable right now?"},
      {type:'options', label:'Financial Records Available?', cols:3, options:['Yes (P&Ls & Tax Returns Ready)','Partial','No / Disorganized'], prompt:"Do they have clean financial records available?"},
      {type:'money', label:'Annual Revenue', required:true, prompt:"Roughly what are their annual sales?"},
      {type:'options', label:'Sales vs. Prior Year', cols:3, options:['Up','Flat','Down'], prompt:"How are sales trending versus last year?"},
      {type:'options', label:'Earnings Basis', cols:3, options:['EBITDA','SDE','Owner’s Take'], prompt:"What earnings basis are we using — SDE, EBITDA, cash flow?"},
      {type:'money', label:'Earnings Figure (Approx.)', prompt:"Roughly what are the annual earnings on that basis?"},
      {type:'options', label:'Earnings vs. Prior Year', cols:3, options:['Up','Flat','Down'], prompt:"How are earnings trending versus last year?"},
      {type:'options', label:'Debt, Liens, Lawsuits, or Unusual Items?', cols:3, options:['Yes','No','Unsure'], prompt:"Any debt, liens, lawsuits, or anything unusual?"},
      {type:'text', full:true, label:'Debt / Lien / Lawsuit Details', prompt:"Tell me more about that debt or legal item."}
    ]},
    { n:'4', title:'Lease & Occupancy', sub:'If the Business Leases Its Space', questions:[
      {type:'number', id:'leaseBase', label:'Base Term Remaining (months)', prompt:"How many months are left on the base lease term?"},
      {type:'number', id:'leaseOption', label:'Option Period (months)', prompt:"How many months of option periods do they have?"},
      {type:'readonly', id:'leaseTotal', label:'Total Remaining (incl. Options)', noprompt:true},
      {type:'money', label:'Current Monthly Rent', prompt:"What's their current monthly rent?"},
      {type:'options', label:'Current on Rent?', cols:3, options:['Current','Behind','Negotiating'], prompt:"Are they current on rent, behind, or negotiating?"},
      {type:'options', label:'Lease Assignable / Transferable?', cols:2, options:['Yes','With LL Consent','No','Unsure'], prompt:"Is the lease assignable or transferable to a buyer?"},
      {type:'options', label:'Landlord Aware of Sale?', cols:3, options:['Yes','No','Unsure'], prompt:"Is the landlord aware they're planning to sell?"},
      {type:'textarea', full:true, label:'Lease Notes', prompt:"Anything else important about the lease?"}
    ]},
    { n:'5', title:'Expectations & Fit', questions:[
      {sub:'Valuation'},
      {type:'options', label:'Has a Valuation Expectation?', cols:2, options:['Yes (Specific Number)','Yes (Rough Range)','No / Open to Guidance','Has Had a Formal Appraisal'], prompt:"Do they have a price or valuation in mind?"},
      {type:'range', label:'Valuation Expectation', prompt:"What number or range are they expecting?"},
      {type:'options', label:'Expectations Realistic? (Rep’s Assessment)', required:true, cols:3, options:['Realistic','Slightly High (Addressable)','Significantly Inflated'], prompt:"Your read — are their expectations realistic?"},
      {sub:'Prior Activity'},
      {type:'options', label:'Prior Broker or Sale Attempt?', required:true, cols:3, options:['No (First Time)','Yes (With a Broker)','Yes (Tried Independently)'], prompt:"Have they listed with a broker or tried to sell before?"},
      {type:'textarea', full:true, label:'What Happened?', prompt:"What happened with that prior attempt?"},
      {sub:'Process Fit'},
      {type:'options', label:'Confidentiality Importance', required:true, cols:3, options:['High','Medium','Low'], prompt:"How important is confidentiality — high, medium, or low?"},
      {type:'options', label:'Speaking With Other Brokers?', cols:3, options:['No (First Conversation)','Yes (Shopping Around)','Unknown'], prompt:"Are they talking to other brokers right now?"},
      {type:'email', full:true, id:'clientEmail', label:'RRG Rep Email — screening copy sent here', required:true, prompt:"What email should the screening copy go to?"},
      {sub:'Objection Tracking'},
      {type:'options', label:'Objections Raised on the Call', full:true, cols:3, options:['Not Ready Yet','Wants to Sell Themselves','Already Has a Buyer','Needs to Talk to Partner / Accountant','Talking to Other Brokers','Valuation / Price Gap','Confidentiality Concerns','Commission / Fees','None'], prompt:"What objections or hesitations did they raise?"}
    ]},
    { n:'6', title:'Call Outcome & Notes', decision:true, questions:[
      {sub:'Call Summary', draft:true},
      {type:'textarea', full:true, id:'callNotes', label:'Call Notes', required:true, placeholder:"3–4 sentences: motivation, financial picture, expectations, and your read on the lead. This goes into the contact's record in FullServe.", prompt:"Give me your 3–4 sentence summary — or hit Draft to generate one."},
      {type:'readonly', full:true, id:'recPath', label:'Recommended Path', placeholder:'Hit “✨ Draft from answers” — business sale, asset sale, or pass'},
      {sub:'Lead Outcome'},
      {type:'options', label:'Lead Status', required:true, full:true, cols:2, options:['Advance (Strong Lead, Financials Requested)','Nurture (Interested, Not Ready)','Pass (Not a Fit)','Refer Out (Wrong Market or Type)'], prompt:"Your call — do we advance, nurture, pass, or refer this out?"}
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
  function renderSub(q){ var extra=q.draft?' <button type="button" id="draftBtn" style="margin-left:10px;background:#5b46b8;border:1px solid #5b46b8;border-radius:8px;padding:6px 13px;font:inherit;font-size:12px;font-weight:700;color:#fff;cursor:pointer">✨ Draft from answers</button>':''; return '<div class="subhead">'+esc(q.sub)+extra+'</div>'; }
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
  function injectPrompt(html,q){ if(!q) return html; var a=''; if(q.prompt) a+='data-prompt="'+esc(q.prompt)+'" '; if(q.hint) a+='data-hint="'+esc(q.hint)+'" '; return a ? html.replace('<div ', '<div '+a) : html; }
  function renderCat(cat){
    var h='<div class="sec brk'+(cat.decision?' decisionsec':'')+'"><div class="num">'+esc(cat.n)+'</div><h2>'+esc(cat.title)+'</h2><div class="flex"></div></div>';
    if(cat.decision) h+='<div class="decisionnote"><b>Decision point.</b> Based on everything above — do we move forward with this seller, or not?</div>';
    if(cat.sub) h+='<div class="subhead">'+esc(cat.sub)+'</div>';
    var grid=[];
    function flush(){ if(grid.length){ h+='<div class="grid rowgap">'+grid.join('')+'</div>'; grid=[]; } }
    (cat.questions||[]).forEach(function(q){
      if(q.sub){ flush(); h+=renderSub(q); return; }
      if(q.type==='group'){ flush(); h+=injectPrompt(renderGroup(q),q); return; }
      if(q.type==='options'||q.type==='textarea'||q.type==='range'||q.full){ flush(); h+= injectPrompt(q.type==='options'?renderOptions(q):renderField(q), q); }
      else grid.push(injectPrompt(renderField(q), q));
    });
    flush();
    return h;
  }
  window.RRG_FORMS.render=function(f){
    var h='<div class="grid rowgap">'+f.header.map(function(q){return injectPrompt(renderField(q),q);}).join('')+'</div>';
    f.categories.forEach(function(c){ h+=renderCat(c); });
    return h;
  };
})();
