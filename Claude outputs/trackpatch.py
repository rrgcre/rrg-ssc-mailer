import sys, re
root = sys.argv[1]
def sub1(s, a, b):
    assert s.count(a) == 1, ('not unique/missing', a[:80], s.count(a))
    return s.replace(a, b)

# ---------- server.js ----------
p = root + '/server.js'; s = open(p, encoding='utf-8').read()

s = sub1(s, "const SELL_SHARED = [_SF('Brand & contact', 'brand', 'Brand name'),",
 "const SELL_TRACK_KEYS = { gAdsId: /^AW-\\d{6,14}$/, gAdsLabel: /^[A-Za-z0-9_-]{4,40}$/, ga4Id: /^G-[A-Z0-9]{4,16}$/ };\n"
 "const SELL_SHARED = [_SF('Tracking (Google Ads)', 'gAdsId', 'Google Ads ID — AW-1234567890'), _SF('Tracking (Google Ads)', 'gAdsLabel', 'Lead conversion label (from the conversion action’s tag setup)'), _SF('Tracking (Google Ads)', 'ga4Id', 'Google Analytics 4 ID — G-XXXXXXX (optional)'), _SF('Brand & contact', 'brand', 'Brand name'),")

# render: tracking keys never fill a text slot; they become the Google tag in <head>
s = sub1(s, "    if (k === 'metaDesc') { html = html.replace(/(data-k=\"metaDesc\" content=\")[^\"]*(\")/, (m0, a, b) => a + E(v) + b); return; }",
 "    if (SELL_TRACK_KEYS[k]) return;\n    if (k === 'metaDesc') { html = html.replace(/(data-k=\"metaDesc\" content=\")[^\"]*(\")/, (m0, a, b) => a + E(v) + b); return; }")
s = sub1(s, "  html = html.replace(/data-variant=\"[a-z]+\"/, 'data-variant=\"' + pg.id + '\"').replace(/\\{\\{BASE\\}\\}/g, base || '');",
 "  html = html.replace(/data-variant=\"[a-z]+\"/, 'data-variant=\"' + pg.id + '\"').replace(/\\{\\{BASE\\}\\}/g, base || '');\n"
 "  // Google tag (Ads + GA4) — only on the public domain, never on the staff preview, so test visits don't count.\n"
 "  const T = c.shared || {}; const ads = SELL_TRACK_KEYS.gAdsId.test(T.gAdsId || '') ? T.gAdsId : '', ga4 = SELL_TRACK_KEYS.ga4Id.test(T.ga4Id || '') ? T.ga4Id : '', lbl = SELL_TRACK_KEYS.gAdsLabel.test(T.gAdsLabel || '') ? T.gAdsLabel : '';\n"
 "  if (!base && (ads || ga4)) {\n"
 "    const tag = '<script async src=\"https://www.googletagmanager.com/gtag/js?id=' + (ads || ga4) + '\"></script>\\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\\'js\\',new Date());'"
 " + (ads ? 'gtag(\\'config\\',\\'' + ads + '\\');' : '') + (ga4 ? 'gtag(\\'config\\',\\'' + ga4 + '\\');' : '') + 'window.SELL_TRACK={ads:\\'' + ads + '\\',label:\\'' + lbl + '\\'};</script>\\n';\n"
 "    html = html.replace('</head>', tag + '</head>');\n"
 "  }")
# save: tracking values must match their format (a bad paste is dropped, never injected)
s = sub1(s, "if (v && v !== d[k]) o[k] = v;",
 "if (SELL_TRACK_KEYS[k] && v && !SELL_TRACK_KEYS[k].test(v)) return; if (v && v !== d[k]) o[k] = v;")
# lead: where it came from
s = sub1(s, "    const page = ['restaurant', 'groups'].indexOf(String(b.variant || '')) >= 0 ? String(b.variant) : 'groups';",
 "    const page = ['restaurant', 'groups'].indexOf(String(b.variant || '')) >= 0 ? String(b.variant) : 'groups';\n"
 "    const A = (b.attrib && typeof b.attrib === 'object') ? b.attrib : {}; const AS = k => String(A[k] || '').replace(/[\\r\\n]+/g, ' ').trim().slice(0, 120);\n"
 "    const srcLine = A.gclid ? ('Source: Google Ads' + (AS('utm_campaign') ? (' · campaign ' + AS('utm_campaign')) : '') + (AS('utm_term') ? (' · keyword \"' + AS('utm_term') + '\"') : ''))\n"
 "      : (AS('utm_source') ? ('Source: ' + AS('utm_source') + (AS('utm_medium') ? (' / ' + AS('utm_medium')) : '') + (AS('utm_campaign') ? (' · ' + AS('utm_campaign')) : '')) : (AS('ref') ? ('Source: referred from ' + AS('ref')) : 'Source: direct / unknown'));")
s = sub1(s, "      (d.nda ? 'WANTS AN NDA FIRST",
 "      srcLine,\n      (d.nda ? 'WANTS AN NDA FIRST")
open(p, 'w', encoding='utf-8').write(s)

# ---------- shared tracking snippet for both pages ----------
SNIP = """
  // Remember where the visitor came from (Google Ads click id, UTM tags, referring site) for the lead record.
  try{ var _q=new URLSearchParams(location.search), _a={}; ['gclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){ var v=_q.get(k); if(v) _a[k]=v.slice(0,120); });
    if(document.referrer && document.referrer.indexOf(location.host)<0) _a.ref=document.referrer.split('/')[2]||'';
    if(Object.keys(_a).length) sessionStorage.setItem('sellAttrib',JSON.stringify(_a)); }catch(e){}
"""

p = root + '/public/sell_site.html'; s = open(p, encoding='utf-8').read()
s = sub1(s, "  var VARIANT=document.body.getAttribute('data-variant')||'groups';",
 "  var VARIANT=document.body.getAttribute('data-variant')||'groups';" + SNIP +
 "  function track(ev,params){ try{ if(window.gtag) gtag('event',ev,params||{}); }catch(e){} }\n"
 "  var _started=false; $('f').addEventListener('input',function(){ if(_started) return; _started=true; track('form_start',{page:VARIANT}); },true);\n"
 "  $('f').addEventListener('change',function(){ if(_started) return; _started=true; track('form_start',{page:VARIANT}); },true);\n")
s = sub1(s, "nda:!!$('nda').checked, firstName:$('fn').value.trim(),",
 "nda:!!$('nda').checked, attrib:(function(){ try{ return JSON.parse(sessionStorage.getItem('sellAttrib')||'{}'); }catch(e){ return {}; } })(), firstName:$('fn').value.trim(),")
s = sub1(s, "      render(j.estimate||estimate(d), d);",
 "      // Count the lead in Google Ads (the conversion) and GA4.\n"
 "      try{ var T=window.SELL_TRACK||{}; if(window.gtag){ if(T.ads&&T.label) gtag('event','conversion',{send_to:T.ads+'/'+T.label}); gtag('event','generate_lead',{page:VARIANT,units:d.units}); } }catch(e){}\n"
 "      render(j.estimate||estimate(d), d);")
open(p, 'w', encoding='utf-8').write(s)

p = root + '/public/sell_home.html'; s = open(p, encoding='utf-8').read()
s = sub1(s, "<script>document.getElementById('yr').textContent=new Date().getFullYear();</script>",
 "<script>document.getElementById('yr').textContent=new Date().getFullYear();" + ' '.join(l for l in SNIP.split('\n') if not l.strip().startswith('//')) + "</script>")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
