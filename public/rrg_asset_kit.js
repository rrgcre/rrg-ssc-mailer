// Shared definitions for the Space & Assets listing details and the mobile walkthrough.
// KIT keys mirror the server's CONVEY_KIT; QUICK = [name, category, ownership default, note].
var FFE_CATS=['Cooking','Refrigeration','Prep & Storage','Warewashing','Bar & Beverage','Display & Retail','Furniture & Decor','POS & Tech','Smallwares','Signage','Other'];
// QUICK row: [name, category, ownership default, note that prints, hint shown to the rep only]
var QUICK=[
  // Cooking — the line first, then ovens, smoker & outdoor, holding, then small appliances
  ['Range','Cooking'],['Fryer','Cooking'],['Griddle','Cooking'],['Charbroiler','Cooking'],['Grill','Cooking'],['Salamander','Cooking'],['Panini press','Cooking'],['Convection oven','Cooking','','','Make · gas or electric · single or double stack'],['Pizza oven','Cooking','','','Deck, conveyor or wood-fired · make'],['Combi oven','Cooking'],['Smoker','Cooking'],['Outdoor grill','Cooking','','','Patio / outdoor kitchen · gas or charcoal'],['Steam table','Cooking'],['Holding cabinet','Cooking'],['Toaster','Cooking','','','Conveyor or pop-up'],['Microwave','Cooking','','','How many'],
  // Refrigeration — reach-ins, then under-the-line units, then ice
  ['Reach-in refrigerator','Refrigeration'],['Reach-in freezer','Refrigeration'],['Refrigerated prep table','Refrigeration','','','Sandwich / pizza make line — length'],['Chef base','Refrigeration','','','Refrigerated drawers under the line — length'],['Undercounter refrigerator','Refrigeration'],['Undercounter freezer','Refrigeration'],['Ice machine','Refrigeration','Confirm','','Make · lbs per day — often leased, confirm owned or rented'],
  // Prep & dish — tables and machines, then storage, then the dish machine
  ['Stainless prep tables','Prep & Storage','','','How many · lengths'],['Commercial mixer','Prep & Storage','','','Make · quarts (20, 60, 80 qt)'],['Meat slicer','Prep & Storage'],['Food processor','Prep & Storage'],['Sheet pan racks','Prep & Storage','','','How many · full or half size'],['Shelving','Prep & Storage','','','Wire, stainless or dunnage · sections'],['Carts','Prep & Storage','','','Bus, utility or speed-rack carts · how many'],['Dish machine','Warewashing','Confirm','','Often leased from the chemical supplier (Ecolab, Auto-Chlor) — confirm owned or rented'],
  // Bar
  ['Back bar coolers','Bar & Beverage','Confirm','','How many doors'],['Beer system — glycol','Bar & Beverage','Confirm'],['Beer system — direct draw','Bar & Beverage','Confirm'],['Soda fountain','Bar & Beverage','Confirm','Dispenser only — the syrup contract does not transfer','Usually owned by Coke or Pepsi — confirm'],['Espresso machine','Bar & Beverage','Confirm','','Often leased from the coffee roaster — confirm'],
  // Display & retail — dry, then refrigerated, then distributor-placed
  ['Display case','Display & Retail'],['Bakery case','Display & Retail'],['Refrigerated display case','Display & Retail'],['Open-air cooler','Display & Retail','','','Grab-and-go merchandiser — length'],['Merchandising cooler','Display & Retail','Confirm','','Often placed by a beverage distributor (Coke, Pepsi, Red Bull) — confirm owned'],['Merchandising freezer','Display & Retail','Confirm','','Ice cream / frozen novelty case — often placed by the distributor, confirm owned'],
  // Dining room — inside, then bar seating, then patio
  ['Dining tables','Furniture & Decor'],['Dining chairs','Furniture & Decor'],['Booths','Furniture & Decor'],['Barstools','Furniture & Decor'],['Patio tables','Furniture & Decor'],['Patio chairs','Furniture & Decor'],
  // Tech
  ['POS stations','POS & Tech','Confirm','Hardware only — the software account does not transfer','Brand — often financed, confirm'],['Kitchen display screens (KDS)','POS & Tech','Confirm','Screens only — KDS software does not transfer','Brand — often bundled with the POS'],['Security camera system','POS & Tech','Confirm','Cameras & recorder — monitoring contract does not transfer','Camera count — often leased from the alarm company'],['Sound system','POS & Tech','Owned','Speakers & amp — music service and licensing do not transfer',''],['TVs','POS & Tech','Owned','TVs & mounts — cable and sports packages do not transfer','Sizes'],
  // Smallwares
  ['Smallwares (lot)','Smallwares','Owned','Pots, pans, utensils, plates, glassware & flatware — sold as a lot, as-is'],
  // Office & other
  ['Safe','Other','','Combination or keys handed over at closing','Floor, drop or office safe · bolted down?']];
var QGROUPS=[['Cooking',['Cooking']],['Refrigeration',['Refrigeration']],['Prep & dish',['Prep & Storage','Warewashing']],['Bar',['Bar & Beverage']],['Display & retail',['Display & Retail']],['Dining room',['Furniture & Decor']],['Tech',['POS & Tech']],['Smallwares',['Smallwares']],['Office & other',['Other','Signage']]];
var CAT_GUESS=[[/\bsafe\b/i,'Other'],[/display case|bakery case|pastry case|merchandis|grab.?and.?go|deli case|open.?air/i,'Display & Retail'],[/pos|terminal|printer|tablet|ipad|kds|computer|router|camera|speaker|tv|television|music/i,'POS & Tech'],[/beer|draft|draught|keg|tap|glycol|soda|fountain|ice machine|bar |back ?bar|wine|liquor|espresso|coffee|blender|bottle/i,'Bar & Beverage'],[/fridge|refrig|freez|cooler|walk-?in|reach-?in|prep table|sandwich|make ?line|ice cream|chiller|lowboy|chef.?base/i,'Refrigeration'],[/dish|sink|washer|disposal|booster|pre-?rinse/i,'Warewashing'],[/fryer|grill|griddle|range|oven|salamander|broiler|smoker|steamer|kettle|wok|burner|charbroil|hot ?hold|warmer|holding|toaster|microwave|pizza|combi|rotisserie|hood|tilt/i,'Cooking'],[/table|chair|stool|booth|bench|banquette|host stand|decor|art|mirror|lamp|light|umbrella|heater/i,'Furniture & Decor'],[/shelf|shelving|rack|cart|speed ?rack|sheet ?pan|mixer|slicer|scale|work ?table|prep|bin|cabinet|dunnage/i,'Prep & Storage'],[/sign|pylon|neon|menu ?board/i,'Signage'],[/pan|pot|utensil|knife|knives|plate|glass|silverware|flatware|smallware|china|tray/i,'Smallwares']];
// Beer / draft systems carry a tap count.
function isBeer(t){ return /beer|draft|draught|glycol|direct.?draw|kegerator|tap tower/i.test(String(t||'')); }
function guessCat(t){ for(var i=0;i<CAT_GUESS.length;i++) if(CAT_GUESS[i][0].test(t)) return CAT_GUESS[i][1]; return ''; }
var KIT=[
  {g:'Kitchen', items:[['hood1','Type I hood','Length (ft)','ft'],['hood2','Type II hood','Length (ft)','ft'],['nohood','No hood',''],['ansul','Fire suppression','Certified 2025'],['mua','Make-up air',''],['gas','Gas line','2" natural gas'],['water','Water heater','Gallons or tankless','gal'],['grease','Grease trap / interceptor','Gallons','gal'],['walkinC','Walk-in cooler','8×10'],['walkinF','Walk-in freezer','6×8'],['dry','Dry storage',''],['hand','Hand sinks','How many'],['prep','Prep sink',''],['sink3','3-compartment sink',''],['mop','Mop sink',''],['drains','Floor drains','']]},
  {g:'Building', items:[['sprink','Fire sprinklers',''],['restrooms','ADA restrooms','How many'],['bar','Built-in bar','24 ft · 14 seats'],['counter','Order counter',''],['window','Pickup / walk-up window',''],['drive','Drive-thru',''],['pdr','Private dining room','Seats','seats'],['patio','Patio',''],['office','Office','']]}
];
// ── Listing photos (shared by listing details + walkthrough) ───────────────────
// Phone photos are shrunk in the browser (longest side 2000px, JPEG) so they upload fast over cell
// signal, then go one at a time to the listing's photos and are copied into the data room (Photos).
function rrgShrinkPhoto(file){
  return new Promise(function(res,rej){
    var fr=new FileReader(); fr.onerror=rej; fr.onload=function(){
      var img=new Image(); img.onerror=function(){ rej(new Error('img')); }; img.onload=function(){
        var M=2000, w=img.naturalWidth, h=img.naturalHeight, s=Math.min(1, M/Math.max(w,h));
        var c=document.createElement('canvas'); c.width=Math.round(w*s); c.height=Math.round(h*s);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',0.82));
      }; img.src=fr.result;
    }; fr.readAsDataURL(file);
  });
}
function rrgUploadPhotos(key, files, captionFor, onStep, startMedia){
  files=[].slice.call(files||[]).filter(function(f){ return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name||''); });
  var media=startMedia||null, done=0, failed=0;
  function post(u,b){ return fetch(u,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){ return r.json(); }); }
  return files.reduce(function(chain,f,i){ return chain.then(function(){
    if(onStep) onStep(i,files.length);
    return rrgShrinkPhoto(f).then(function(dataUrl){
      var before={}; ((media&&media.photos)||[]).forEach(function(p){ before[p.id]=1; });
      return post('/api/assignment/'+encodeURIComponent(key)+'/photos',{ files:[{ filename:'photo.jpg', dataB64:dataUrl, caption:captionFor(i) }] }).then(function(j){
        if(!j||!j.ok){ failed++; return; } media=j.media; done++;
        var fresh=(media.photos||[]).filter(function(p){ return !before[p.id] && p.caption===captionFor(i); })[0];
        if(fresh) return post('/api/assignment/'+encodeURIComponent(key)+'/photo/'+encodeURIComponent(fresh.id)+'/to-room',{}).then(function(r){ if(r&&r.media) media=r.media; }).catch(function(){});
      });
    }).catch(function(){ failed++; });
  }); }, Promise.resolve()).then(function(){ return { media:media, done:done, failed:failed, total:files.length }; });
}
function quickHint(item){ item=String(item||'').toLowerCase(); for(var i=0;i<QUICK.length;i++) if(QUICK[i][0].toLowerCase()===item) return QUICK[i][4]||''; return ''; }
