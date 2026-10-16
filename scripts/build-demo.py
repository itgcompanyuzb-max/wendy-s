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
open(os.path.join(OUT, 'menu.json'), 'w', encoding='utf-8').write(rel(menu))

css = rel(rd(os.path.join(PUB, 'app.css'))) + '\n' + rd(LEAFLET_CSS).replace('url(images/', 'url(data:,')
# app scripts in the same order as public/index.html (local ones only, not CDN)
scripts = re.findall(r'<script src="/([^"]+\.js)"', rd(os.path.join(PUB, 'index.html')))
js = '\n'.join(rel(rd(os.path.join(PUB, f))) for f in scripts)
js = js.replace("token: LS.get('token', null)", "token: 'demo'", 1)
assert "token: 'demo'" in js and '</script' not in js

shim = """(function(){var of=window.fetch.bind(window);
function J(o,s){return Promise.resolve(new Response(JSON.stringify(o),{status:s||200,headers:{'Content-Type':'application/json'}}));}
window.fetch=function(u,o){
 if(typeof u==='string'&&u.indexOf('/api/')===0){
  var m=(o&&o.method)||'GET', p=u.split('?')[0];
  if(m==='GET'&&p==='/api/menu')return of('menu.json');
  if(m==='GET'&&p==='/api/me')return J({user:{id:1,name:'Демо',phone:'+998901234567',avatar:0,notify:1,coins:50000}});
  if(m==='GET'&&p==='/api/addresses')return J({addresses:[]});
  if(m==='GET'&&p==='/api/cards')return J({cards:[]});
  if(m==='GET'&&p==='/api/orders')return J({orders:[]});
  return J({error:'Демо-режим: эта функция доступна в полной версии'},400);}
 return of(u,o);};})();"""

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
