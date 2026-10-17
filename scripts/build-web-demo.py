#!/usr/bin/env python3
"""Builds a static, clickable demo of the desktop website (/web/) — no server needed.

Usage: start the server (npm start), then
    python3 scripts/build-web-demo.py [out_dir]      # default: demo-web/
Needs leaflet CSS (npm i leaflet@1.9.4 anywhere; path via LEAFLET_CSS env).
Same approach as build-demo.py: index.html + img/ + uploads/ + menu.json, absolute paths made relative,
/api/* answered in the browser by scripts/demo-backend.js. Map tiles are drawn on a canvas (demo streets),
because a published demo page may not load map servers.
Optional env DEMO_ZONES=1 keeps the server's delivery zones (renamed as samples); default: no zones.
"""
import json, os, re, shutil, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'demo-web')
PUB = os.path.join(ROOT, 'public')
LEAFLET_CSS = os.environ.get('LEAFLET_CSS', 'node_modules/leaflet/dist/leaflet.css')

rel = lambda t: re.sub(r"""(["'`(])/(img|uploads)/""", r"\1\2/", t)
rd = lambda p: open(p, encoding='utf-8').read()

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
shutil.copytree(os.path.join(PUB, 'img'), os.path.join(OUT, 'img'))
shutil.copytree(os.path.join(ROOT, 'uploads'), os.path.join(OUT, 'uploads'), ignore=shutil.ignore_patterns('.*', 'chat'))

menu = json.loads(urllib.request.urlopen('http://localhost:3000/api/menu').read().decode())
for b in menu['branches']:
    b['open_now'] = True  # the demo is always "open"
# contact links on the live site come from the admin panel; the demo shows none rather than made-up ones
for k in ('support_email', 'app_store_url', 'google_play_url', 'instagram_url', 'telegram_url', 'facebook_url', 'about_text', 'yandex_key'):
    menu['settings'][k] = ''
menu['zones'] = []
if os.environ.get('DEMO_ZONES'):
    zones = json.loads(urllib.request.urlopen('http://localhost:3000/api/zones').read().decode())['zones']
    for z in zones:
        z['name'] = z['name'].split(' ')[0] + ' (namuna)'
    menu['zones'] = zones
if not menu.get('promos'):
    menu['promos'] = [{'code': 'WENDYS10', 'percent': 10, 'fixed': 0, 'min_total': 0, 'title': 'Скидка 10%', 'title_uz': '10% chegirma', 'info': 'НА ЛЮБОЙ ЗАКАЗ', 'info_uz': 'ISTALGAN BUYURTMAGA', 'valid_until': ''}]
open(os.path.join(OUT, 'menu.json'), 'w', encoding='utf-8').write(rel(json.dumps(menu, ensure_ascii=False)))

css = rd(os.path.join(PUB, 'web', 'web.css')) + '\n' + rd(LEAFLET_CSS).replace('url(images/', 'url(data:,') + '\n:root { color-scheme: dark; }\n'
js = rel(rd(os.path.join(PUB, 'web', 'web.js')))
# demo streets instead of a tile server (light map; the dark map style inverts it like real tiles)
TILES = r'''const tiles = () => { const g = L.gridLayer({ maxZoom: 19 }); g.createTile = function (c) {
  const t = document.createElement('canvas'); t.width = t.height = 256; const x = t.getContext('2d'), SP = 120, gx0 = c.x * 256, gy0 = c.y * 256;
  const h = (...a) => { let v = 0; for (const n of a) v = (Math.imul(v, 1000003) + Math.imul(n, 2654435761)) >>> 0; return v; };
  x.fillStyle = '#f2efe9'; x.fillRect(0, 0, 256, 256);
  const i0 = Math.floor(gx0 / SP) - 1, j0 = Math.floor(gy0 / SP) - 1, xs = {}, ys = {};
  for (let i = i0; i < i0 + 5; i++) xs[i] = i * SP + h(i, 1, c.z) % 40;
  for (let j = j0; j < j0 + 5; j++) ys[j] = j * SP + h(j, 2, c.z) % 40;
  for (let i = i0; i < i0 + 4; i++) for (let j = j0; j < j0 + 4; j++) {
    const r = h(i, j, c.z) % 9; if (r > 2) continue; const p = r === 2 ? 20 : 14;
    x.fillStyle = ['#d6ecce', '#e2e8f0', '#e8e4dc'][r]; x.beginPath(); x.roundRect(xs[i] - gx0 + p, ys[j] - gy0 + p, xs[i + 1] - xs[i] - 2 * p, ys[j + 1] - ys[j] - 2 * p, 8); x.fill();
  }
  for (const [o, isX] of [[xs, true], [ys, false]]) for (const k in o) {
    const main = isX ? k % 5 === 0 : k % 4 === 0, v = o[k] - (isX ? gx0 : gy0);
    x.strokeStyle = main ? '#ffe296' : '#ffffff'; x.lineWidth = main ? 18 : 11; x.beginPath();
    if (isX) { x.moveTo(v, 0); x.lineTo(v, 256); } else { x.moveTo(0, v); x.lineTo(256, v); } x.stroke();
  }
  return t; }; return g; };'''
js, n = re.subn(r'^const tiles = \(\) => \{.*$', lambda m: TILES, js, count=1, flags=re.M)
assert n == 1, 'tiles() not found'
js = js.replace('<a href="/?m=1">', '<a href="#">')
assert '</script' not in js

shim = rd(os.path.join(ROOT, 'scripts', 'demo-backend.js'))
html = f"""<meta charset="utf-8">
<title>Wendy's Website</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&subset=cyrillic&display=swap" rel="stylesheet">
<style>{css}</style>
<div id="site"></div>
<div id="modals"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>
<script>{shim}</script>
<script>{js}</script>
"""
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
print('web demo written to', OUT)
