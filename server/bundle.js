/* The mobile web app (public/index.html with all its scripts, styles, map library and fonts) as ONE html file.
   The iPhone/Android app ships this file inside and opens it without the internet; the data (menu, orders, coins)
   still comes from the server. The server also hands out the newest copy (/app-bundle.json, /app-bundle.html),
   so the app updates its design by itself without a new install. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUB = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(PUB, p.replace(/^\//, '')), 'utf8');
const MIME = { woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg' };

// styles: fonts go inside as data, other files (map images) stay as server paths
function inlineCss(href) {
  const dir = path.posix.dirname(href);
  return read(href).replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
    if (/^(data:|https?:|\/)/.test(u)) return m;
    const abs = path.posix.normalize(path.posix.join(dir, u));
    const ext = abs.split('.').pop().toLowerCase();
    if (ext === 'woff2' || ext === 'woff') return `url(data:${MIME[ext]};base64,${fs.readFileSync(path.join(PUB, abs.replace(/^\//, ''))).toString('base64')})`;
    return `url(${abs})`;
  });
}

function build() {
  let html = read('/index.html');
  html = html.replace(/<link rel="stylesheet" href="(\/[^"]+)">/g, (m, href) => `<style>\n${inlineCss(href)}\n</style>`);
  html = html.replace(/<script src="(\/[^"]+)"><\/script>/g, (m, src) => `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);
  const version = crypto.createHash('sha1').update(html).digest('hex').slice(0, 12);
  html = html.replace('<head>', `<head>\n<script>window.__BUNDLE__ = '${version}';</script>`);
  return { version, html };
}

let cached = null;
const get = () => (cached ||= build()); // files only change with a new deploy

function mount(app) {
  app.get('/app-bundle.json', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.json({ version: get().version }); });
  app.get('/app-bundle.html', (req, res) => {
    const b = get();
    res.setHeader('Cache-Control', 'no-cache'); res.setHeader('ETag', `"${b.version}"`);
    if (req.headers['if-none-match'] === `"${b.version}"`) return res.sendStatus(304);
    res.type('html').send(b.html);
  });
}

module.exports = { build, get, mount };
