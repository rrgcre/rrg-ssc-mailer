import io

ROOT = '/sessions/rcw-01jk2rgaxo157gmieyjd7h3b/mnt/rrg-ssc-mailer/'

def load(p):
    return io.open(ROOT + p, encoding='utf-8').read()

def save(p, s):
    io.open(ROOT + p, 'w', encoding='utf-8').write(s)

class F(object):
    def __init__(self, path):
        self.path = path
        self.s = load(path)
        self.orig = self.s
    def rep(self, old, new, n=1):
        c = self.s.count(old)
        assert c == n, '%s: expected %d occurrences, found %d for: %r' % (self.path, n, c, old[:120])
        self.s = self.s.replace(old, new)
    def write(self):
        assert self.s != self.orig, '%s: nothing changed' % self.path
        save(self.path, self.s)
        print(self.path + ' patched OK')

# =====================================================================================
# 1. rrg_person.html -- the launchers hand the call the ids, not just the names.
# =====================================================================================
f = F('public/rrg_person.html')

OLD_TAIL = ("location.href='./seller_screening.html?sellerName='+nm+'&company='+co"
            "+'&market='+mk+'&address='+ad;")
NEW_TAIL = ("location.href='./seller_screening.html?sellerName='+nm+'&company='+co"
            "+'&market='+mk+'&address='+ad+'&contactId='+pid+'&companyId='+cid;")

# Both launchers build the same four name params. Add the two id params to each.
# pid/cid are declared alongside nm/co/mk/ad in the same var run.
OLD_VARS = ("var ad=encodeURIComponent((typeof CO!=='undefined'&&CO&&CO.address)||''); ")
NEW_VARS = ("var ad=encodeURIComponent((typeof CO!=='undefined'&&CO&&CO.address)||''); "
            "var pid=encodeURIComponent((typeof P!=='undefined'&&P&&P.id)||(typeof ID!=='undefined'&&ID)||''); "
            "var cid=encodeURIComponent((typeof CO!=='undefined'&&CO&&CO.id)||''); ")
# three sites use OLD_VARS: actSQC (202), Screening Call (1092), Valuation Call (1093)
f.rep(OLD_VARS, NEW_VARS, n=3)
f.rep(OLD_TAIL, NEW_TAIL, n=2)

# The valuation call already passes the contact id as ?contact= -- add the company id.
f.rep("location.href='./valuation_questionnaire.html?contact='+encodeURIComponent(ID)"
      "+'&sellerName='+nm+'&company='+co+'&market='+mk+'&address='+ad;",
      "location.href='./valuation_questionnaire.html?contact='+encodeURIComponent(ID)"
      "+'&sellerName='+nm+'&company='+co+'&market='+mk+'&address='+ad+'&companyId='+cid;")
f.write()

# =====================================================================================
# 2. seller_screening.html -- hold the party ids and send them with every save.
# =====================================================================================
f = F('public/seller_screening.html')

# ---- 2a. one place holds the answer to "whose call is this?" -------------------------
f.rep("""(function(){
  var API2=(typeof API!=='undefined'?API:'');
  function e2(s){""",
"""// ---- Party link ---------------------------------------------------------------------
// A call belongs to a contact and a company, and the only durable way to say which is the
// id. Restaurants rename, DBAs change, one owner runs three concepts -- matching on the
// text typed into the header was always a stopgap. The ids arrive on the URL when the call
// is launched from a record, get set when the rep picks a company off the autocomplete, and
// are read back when a saved call is reopened. Everything the call produces downstream --
// questionnaire, valuation, marketing pack, lease abstract -- inherits them from here.
window.RRG_PARTY = window.RRG_PARTY || { personId:'', companyId:'' };
(function(){
  var q=new URLSearchParams(location.search);
  var p=q.get('contactId')||q.get('contact')||'', c=q.get('companyId')||q.get('coId')||'';
  if(p) window.RRG_PARTY.personId=String(p);
  if(c) window.RRG_PARTY.companyId=String(c);
})();
(function(){
  var API2=(typeof API!=='undefined'?API:'');
  function e2(s){""")

# ---- 2b. the company autocomplete is the rep's way of setting/changing the company ----
f.rep("ci.addEventListener('input',function(){ SSC.coId=''; SSC.concepts=[];",
      "ci.addEventListener('input',function(){ SSC.coId=''; window.RRG_PARTY.companyId=''; SSC.concepts=[];")
f.rep("ci.value=r.getAttribute('data-nm'); SSC.coId=r.getAttribute('data-id');",
      "ci.value=r.getAttribute('data-nm'); SSC.coId=r.getAttribute('data-id'); window.RRG_PARTY.companyId=SSC.coId||'';")

# ---- 2c. every save carries the ids ---------------------------------------------------
f.rep("""    return {
      formId: window.RRG_FORM_ID,
      snapshot: (window.rrgSerialize ? window.rrgSerialize() : null),""",
"""    return {
      formId: window.RRG_FORM_ID,
      personId: (window.RRG_PARTY&&window.RRG_PARTY.personId)||'',
      companyId: (window.RRG_PARTY&&window.RRG_PARTY.companyId)||'',
      snapshot: (window.rrgSerialize ? window.rrgSerialize() : null),""")

# ---- 2d. prefill must not throw away the ids it was handed ----------------------------
# setByLabel fires the company field's input handler, which clears the picked-company id
# by design. Put the launcher's id back once the prefill has settled.
f.rep("      window.__sscPrefill={company:pc,contact:pn,market:pm,address:pa};",
"""      window.__sscPrefill={company:pc,contact:pn,market:pm,address:pa};
      // Filling the company field fires the autocomplete's input handler, which clears the
      // picked-company id by design. The id the launcher handed us is still the right one.
      var _c0=q.get('companyId')||'';
      if(_c0) setTimeout(function(){ window.RRG_PARTY.companyId=String(_c0); },0);""")

# Launched with a contact id but no company id: the contact record knows its company.
f.rep("""            if(c){ if(!pn) pn=(((c.firstName||'')+' '+(c.lastName||'')).trim())||c.name||'';
                   if(!pc) pc=c.company||''; }
            fill(); })""",
"""            if(c){ if(!pn) pn=(((c.firstName||'')+' '+(c.lastName||'')).trim())||c.name||'';
                   if(!pc) pc=c.company||''; }
            fill();
            if(c && c.companyId) setTimeout(function(){ if(!window.RRG_PARTY.companyId) window.RRG_PARTY.companyId=String(c.companyId); },0); })""")

# ---- 2e. reopening a saved call reattaches it to the same party -----------------------
f.rep("""    if(d.preparedBy && repSel){ ensureOption(repSel,d.preparedBy); repSel.value=d.preparedBy; repSel.dispatchEvent(new Event('change',{bubbles:true})); }""",
"""    if(d.preparedBy && repSel){ ensureOption(repSel,d.preparedBy); repSel.value=d.preparedBy; repSel.dispatchEvent(new Event('change',{bubbles:true})); }
    // Reattach to the contact/company this call was created against. After the restore
    // above, not before -- restoring the company field clears the picked-company id.
    var _pp=String(s.personId||d.personId||''), _cc=String(s.companyId||d.companyId||'');
    if(_pp||_cc) setTimeout(function(){ if(_pp) window.RRG_PARTY.personId=_pp; if(_cc) window.RRG_PARTY.companyId=_cc; },0);""")
f.write()

# =====================================================================================
# 3. valuation_questionnaire.html -- same ids on the way in, same ids on the way out.
# =====================================================================================
f = F('public/valuation_questionnaire.html')
f.rep("""      formId: (window.RRG_Q_FORM_ID || (window.RRG_Q_FORM_ID='q_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8))),
      snapshot: (window.rrgSerialize ? window.rrgSerialize() : null),""",
"""      formId: (window.RRG_Q_FORM_ID || (window.RRG_Q_FORM_ID='q_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8))),
      // Whose valuation this is. Passed on the URL when launched from a contact record;
      // when the questionnaire was raised off a screening call the server already carries
      // the link forward, and a blank here never overwrites what is on file.
      personId: (function(){ var q=new URLSearchParams(location.search); return q.get('contactId')||q.get('contact')||''; })(),
      companyId: (function(){ var q=new URLSearchParams(location.search); return q.get('companyId')||''; })(),
      snapshot: (window.rrgSerialize ? window.rrgSerialize() : null),""")
f.write()

print('front-end patched OK')
