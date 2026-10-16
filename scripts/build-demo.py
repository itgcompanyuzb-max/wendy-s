#!/usr/bin/env python3
"""Builds a static demo of the customer app (menu + UI, no login/orders).

Usage: start the server (npm start), then
    python3 scripts/build-demo.py [out_dir]      # default: demo-dist/
Needs: npm i leaflet@1.9.4 (run once in any folder; path via LEAFLET_CSS env).
The result is a single index.html + img/ + uploads/ + menu.json, with absolute
paths rewritten to relative ones and /api/* answered by a small fetch shim.
"""
import os, re, shutil, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'demo-dist')
PUB = os.path.join(ROOT, 'public')
LEAFLET_CSS = os.environ.get('LEAFLET_CSS', 'node_modules/leaflet/dist/leaflet.css')

rel = lambda t: re.sub(r"""(["'`(])/(img|uploads)/""", r"\1\2/", t)
rd = lambda p: open(p, encoding='utf-8').read()

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
shutil.copytree(os.path.join(PUB, 'img'), os.path.join(OUT, 'img'))
shutil.copytree(os.path.join(ROOT, 'uploads'), os.path.join(OUT, 'uploads'),
                ignore=shutil.ignore_patterns('.*'))
menu = urllib.request.urlopen('http://localhost:3000/api/menu').read().decode()
import json
menu_obj = json.loads(menu)
if not menu_obj.get('promos'):
    menu_obj['promos'] = [{'id': 1, 'code': 'WENDYS10', 'percent': 10, 'fixed': 0, 'min_total': 0, 'title': 'Скидка 10%', 'title_uz': '10% chegirma', 'info': '', 'info_uz': '', 'valid_until': '', 'active': 1}]
open(os.path.join(OUT, 'menu.json'), 'w', encoding='utf-8').write(rel(json.dumps(menu_obj, ensure_ascii=False)))

css = rel(rd(os.path.join(PUB, 'app.css'))) + '\n' + rd(LEAFLET_CSS).replace('url(images/', 'url(data:,')
# app scripts in the same order as public/index.html (local ones only, not CDN)
scripts = re.findall(r'<script src="/([^"]+\.js)"', rd(os.path.join(PUB, 'index.html')))
js = '\n'.join(rel(rd(os.path.join(PUB, f))) for f in scripts)
js = js.replace("token: LS.get('token', null)", "token: 'demo'", 1)
TILE_OLD = "return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });"
TILE_NEW = '''{ const g = L.gridLayer({ maxZoom: 19 }); g.createTile = function (c) { const t = document.createElement('canvas'); t.width = t.height = 256; const x = t.getContext('2d'); x.fillStyle = '#1e1e22'; x.fillRect(0, 0, 256, 256); for (const [step, col, w] of [[128, '#2a2a30', 2], [512, '#3a3a42', 4]]) { x.strokeStyle = col; x.lineWidth = w; for (let i = 0; i < 256; i++) { if (((c.x * 256 + i) % step) === 0) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); } if (((c.y * 256 + i) % step) === 0) { x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); } } } return t; }; return g; }'''
assert TILE_OLD in js
js = js.replace(TILE_OLD, TILE_NEW, 1)
assert "token: 'demo'" in js and '</script' not in js

shim = rd(os.path.join(ROOT, 'scripts', 'demo-backend.js'))

html = f"""<title>Wendy's доставка</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&subset=cyrillic&display=swap" rel="stylesheet">
<style>{css}</style>
<div id="app"><div id="view"></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>
<script>{shim}</script>
<script>{js}</script>
"""
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
print('demo written to', OUT)
