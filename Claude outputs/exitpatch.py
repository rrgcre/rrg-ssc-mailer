import sys, re
root = sys.argv[1]
p = root + '/public/sell_site.html'
s = open(p, encoding='utf-8').read()
style = open(root + '/Claude outputs/exit_style.css', encoding='utf-8').read().rstrip('\n')
i = s.index('<link rel="preconnect" href="https://fonts.googleapis.com">')
j = s.index('</style>', i) + len('</style>')
s = s[:i] + style + s[j:]

R = [
  ('<div class="wrap">\n  <header class="top">', '<div class="asphalt"><div class="wrap">\n  <header class="top">'),
  ('  </main>\n</div>\n\n<section>', '  </main>\n</div><div class="lane" aria-hidden="true"></div></div>\n\n<section>'),
  ('<span class="no" aria-hidden="true">No. 0127</span>', '<span class="no" id="exitTab" aria-hidden="true">EXIT</span>'),
  ("  var VARIANT=document.body.getAttribute('data-variant')||'groups';",
   "  var VARIANT=document.body.getAttribute('data-variant')||'groups';\n  $('exitTab').textContent=(VARIANT==='restaurant')?'EXIT 1':'EXIT 2+';"),
]
for a, b in R:
    assert s.count(a) == 1, a
    s = s.replace(a, b)

# brand mark: exit-sign badge instead of the guest-check icon
s, n = re.subn(r'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">.*?</svg>\s*<span data-k="brand">Sell My Texas Restaurant</span>',
               '<span class="sign"><span data-k="brand">Texas Restaurant Exit</span></span>', s, count=1, flags=re.S)
assert n == 1
# yellow checks on asphalt
a = '<circle cx="11" cy="11" r="10" fill="#1e4d3a"/><path d="M6.5 11.3l3 3 6-6.3" stroke="#fff"'
assert s.count(a) == 3
s = s.replace(a, '<circle cx="11" cy="11" r="10" fill="#f2c300"/><path d="M6.5 11.3l3 3 6-6.3" stroke="#23282c"')
# name
s = s.replace('Sell My Texas Restaurant', 'Texas Restaurant Exit')
open(p, 'w', encoding='utf-8').write(s)

p = root + '/server.js'
s = open(p, encoding='utf-8').read()
a = "  title: 'Sell My Texas Restaurant — What is your restaurant worth?',"
assert s.count(a) == 1
s = s.replace(a, "  title: 'Texas Restaurant Exit — What is your restaurant worth?',")
a = "_sc.brand || process.env.SELL_SITE_NAME || 'Sell My Texas Restaurant'"
assert s.count(a) == 1
s = s.replace(a, "_sc.brand || process.env.SELL_SITE_NAME || 'Texas Restaurant Exit'")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
