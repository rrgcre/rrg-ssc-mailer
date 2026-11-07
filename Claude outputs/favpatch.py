import sys
root = sys.argv[1]
def sub1(s, a, b):
    assert s.count(a) == 1, (a[:80], s.count(a)); return s.replace(a, b)
p = root + '/server.js'; s = open(p, encoding='utf-8').read()
s = sub1(s, "    if (req.path === '/api/sell/lead' || req.path === '/favicon.ico') return next();",
 "    // The seller site has its own icons (exit sign), never Lavano's.\n"
 "    const _ico = { '/favicon.ico': 'sell_favicon.ico', '/favicon.svg': 'sell_favicon.svg', '/apple-touch-icon.png': 'sell_apple_touch.png', '/apple-touch-icon-precomposed.png': 'sell_apple_touch.png', '/icon-192.png': 'sell_icon_192.png', '/icon-512.png': 'sell_icon_512.png' }[req.path];\n"
 "    if (_ico) { res.set('Cache-Control', 'public, max-age=86400'); return res.sendFile(path.join(__dirname, 'public', _ico)); }\n"
 "    if (req.path === '/site.webmanifest') return res.type('application/manifest+json').send(JSON.stringify({ name: 'Texas Restaurant Exit', short_name: 'TX Exit', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }], theme_color: '#2e3337', background_color: '#2e3337', display: 'browser' }));\n"
 "    if (req.path === '/api/sell/lead') return next();")
open(p, 'w', encoding='utf-8').write(s)
HEAD = ('<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any">'
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#2e3337">\n')
for f in ('sell_site.html', 'sell_home.html'):
    p = root + '/public/' + f; s = open(p, encoding='utf-8').read()
    a = '<link rel="preconnect" href="https://fonts.googleapis.com">'
    assert s.count(a) == 1, f
    s = s.replace(a, HEAD + a)
    open(p, 'w', encoding='utf-8').write(s)
print('ok')
