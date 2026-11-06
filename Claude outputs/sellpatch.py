import sys
root=sys.argv[1]
p=root+'/public/sell_site.html';s=open(p).read()
a='<a class="brand" href="#top" aria-label="Sell My Texas Restaurant">'
assert s.count(a)==1
s=s.replace(a,'<a class="brand" href="{{BASE}}/" aria-label="Home">'); open(p,'w').write(s)
p=root+'/server.js';s=open(p).read()
i=s.index("// ---- Editable text for the seller site (Settings → Seller Site).")
j=s.index("app.post('/api/admin/sell-site'",i); j=s.index("\n});",j)+4
new=open(root+'/Claude outputs/sellblock.js').read()
s=s[:i]+new+s[j:]
a="app.get('/sell-site', (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(renderSellSite()); });\n"
assert s.count(a)==1
s=s.replace(a,"")
a="if (req.path === '/' || req.path === '/index.html') { res.set('Cache-Control', 'no-cache'); return res.type('html').send(renderSellSite()); }"
assert s.count(a)==1
s=s.replace(a,"const _pg = _sellPageFor(req.path); if (_pg) { res.set('Cache-Control', 'no-cache'); return res.type('html').send(renderSellPage(_pg, '')); }")
a="  const _sc = loadSellContent();\n  const brand = String(_sc.brand ||"
assert s.count(a)==1
s=s.replace(a,"  const _sc = loadSellContent().shared || {};\n  const brand = String(_sc.brand ||")
a="    const est = _sellEstimate(d);"
assert s.count(a)==1
s=s.replace(a,"    const page = ['restaurant', 'groups'].indexOf(String(b.variant || '')) >= 0 ? String(b.variant) : 'groups';\n    const est = _sellEstimate(d);")
a="      (d.units > 1 ? ('Multi-unit group: '"
assert s.count(a)==1
s=s.replace(a,"      'Came in on the ' + (page === 'restaurant' ? 'one-restaurant' : 'restaurant-groups') + ' page',\n"+a)
open(p,'w').write(s)
print('ok')
