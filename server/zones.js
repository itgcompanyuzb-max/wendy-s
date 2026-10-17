/* Delivery zones: real boundaries (polygons) instead of circles.
 * A zone is stored as `polys` = [polygon, ...], polygon = [outerRing, hole, ...], ring = [[lat, lng], ...].
 * When at least one active zone exists, an address is delivered only if it lies inside a zone,
 * and only by the branches linked to that zone. Without zones the old per-branch radius still works. */
const db = require('./db');

const MAX_POINTS = 6000;

// accepts the stored format or GeoJSON geometry (Polygon / MultiPolygon, [lng, lat] order)
function normalize(input) {
  let polys = input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const flip = ring => ring.map(([lng, lat]) => [lat, lng]);
    if (input.type === 'Polygon') polys = [input.coordinates.map(flip)];
    else if (input.type === 'MultiPolygon') polys = input.coordinates.map(p => p.map(flip));
    else throw new Error('Нужен полигон');
  }
  if (!Array.isArray(polys) || !polys.length || polys.length > 50) throw new Error('Нарисуйте зону на карте');
  let total = 0;
  const out = polys.map(poly => {
    if (!Array.isArray(poly) || !poly.length) throw new Error('Неверная зона');
    return poly.map(ring => {
      if (!Array.isArray(ring)) throw new Error('Неверная зона');
      const pts = ring.map(p => {
        const lat = Number(p?.[0]), lng = Number(p?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Неверные координаты зоны');
        return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
      });
      // drop the closing point GeoJSON repeats
      if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
      if (pts.length < 3) throw new Error('В зоне должно быть минимум 3 точки');
      total += pts.length;
      return pts;
    });
  });
  if (total > MAX_POINTS) throw new Error(`Слишком подробная граница (${total} точек, максимум ${MAX_POINTS})`);
  return out;
}

function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolys = (lat, lng, polys) => polys.some(([outer, ...holes]) => inRing(lat, lng, outer) && !holes.some(h => inRing(lat, lng, h)));

function list(onlyActive = false) {
  const links = {};
  for (const r of db.prepare('SELECT zone_id, branch_id FROM zone_branches').all()) (links[r.zone_id] = links[r.zone_id] || []).push(r.branch_id);
  return db.prepare(`SELECT * FROM zones ${onlyActive ? 'WHERE active=1' : ''} ORDER BY sort, id`).all()
    .map(z => ({ id: z.id, name: z.name, color: z.color, active: z.active, sort: z.sort, polys: JSON.parse(z.polys || '[]'), branch_ids: links[z.id] || [] }));
}

// null = zones are not used (fall back to radius); otherwise the active zones containing the point
function zonesAt(lat, lng) {
  const zones = list(true);
  if (!zones.length) return null;
  return zones.filter(z => inPolys(lat, lng, z.polys));
}

function save(id, body) {
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!name) throw new Error('Укажите название зоны');
  const polys = normalize(body.polys);
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#e2203d';
  const active = body.active === undefined ? 1 : (Number(body.active) ? 1 : 0);
  const branchIds = [...new Set((Array.isArray(body.branch_ids) ? body.branch_ids : []).map(Number).filter(Number.isInteger))];
  const known = new Set(db.prepare('SELECT id FROM branches').all().map(b => b.id));
  if (branchIds.some(b => !known.has(b))) throw new Error('Неизвестный филиал');
  db.exec('BEGIN');
  try {
    if (id) {
      if (!db.prepare('SELECT id FROM zones WHERE id=?').get(id)) throw new Error('Зона не найдена');
      db.prepare('UPDATE zones SET name=?, color=?, active=?, polys=? WHERE id=?').run(name, color, active, JSON.stringify(polys), id);
    } else {
      id = Number(db.prepare('INSERT INTO zones (name,color,active,polys) VALUES (?,?,?,?)').run(name, color, active, JSON.stringify(polys)).lastInsertRowid);
    }
    db.prepare('DELETE FROM zone_branches WHERE zone_id=?').run(id);
    for (const b of branchIds) db.prepare('INSERT INTO zone_branches (zone_id, branch_id) VALUES (?,?)').run(id, b);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return list().find(z => z.id === id);
}

function remove(id) {
  db.prepare('DELETE FROM zone_branches WHERE zone_id=?').run(id);
  db.prepare('DELETE FROM zones WHERE id=?').run(id);
}

// district / city boundary from OpenStreetMap (Nominatim), e.g. "Qibray tumani"
async function lookup(q) {
  const base = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
  const url = `${base}/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.0003&limit=8&countrycodes=uz&accept-language=ru&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'wendys-delivery-app/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Сервис карт ответил ${r.status}`);
  const rows = await r.json();
  const out = [];
  for (const x of Array.isArray(rows) ? rows : []) {
    if (!['Polygon', 'MultiPolygon'].includes(x.geojson?.type)) continue;
    try { out.push({ name: x.display_name, type: x.addresstype || x.type || '', polys: normalize(x.geojson) }); } catch { /* too detailed or broken: skip */ }
  }
  return out;
}

module.exports = { normalize, inPolys, list, zonesAt, save, remove, lookup };
