// Génère data/physique.js (fleuves, montagnes, déserts) à partir de Natural Earth (domaine public).
// Usage : node scripts/physique.mjs            → télécharge les données sources depuis GitHub
//         node scripts/physique.mjs <dossier>  → utilise des fichiers .geojson déjà téléchargés
import fs from 'node:fs';
import path from 'node:path';
import { FLEUVES, MONTAGNES, DESERTS } from './physique-liste.mjs';
import * as d3 from 'd3';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const SOURCES = { rivers: 'ne_50m_rivers_lake_centerlines', regions: 'ne_50m_geography_regions_polys' };

async function load(name) {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(path.join(process.argv[2], name + '.geojson'), 'utf8'));
  const res = await fetch(BASE + name + '.geojson');
  if (!res.ok) throw new Error(`${name} : ${res.status}`);
  return res.json();
}
const norm = s => s.replace(/\s+/g, ' ').trim();

/** Douglas-Peucker sur une ligne [lon, lat] (tolérance en degrés), coordonnées arrondies à 0,01° (~1 km) */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, dmax = tol;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      // segment de longueur nulle (anneau fermé : premier point = dernier) → distance au point
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}
const lines = g => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);
const polys = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

const rivers = (await load(SOURCES.rivers)).features;
const regions = (await load(SOURCES.regions)).features;
const out = [], missing = [];

for (const r of FLEUVES) {
  const src = new Set(r.src.map(norm));
  const parts = rivers.filter(f => f.properties.featurecla === 'River' && src.has(norm(f.properties.name || '')));
  if (!parts.length) { missing.push(r.fr); continue; }
  const coords = parts.flatMap(f => lines(f.geometry)).map(l => simplify(l, 0.03)).filter(l => l.length > 1);
  out.push({ t: 'f', n: r.fr, alt: r.alt || [], c: r.c, g: { type: 'MultiLineString', coordinates: coords } });
}
for (const [t, list] of [['m', MONTAGNES], ['d', DESERTS]]) {
  for (const r of list) {
    const parts = regions.filter(f => r.src.includes(f.properties.NAME));
    if (!parts.length) { missing.push(r.fr); continue; }
    const coords = parts.flatMap(f => polys(f.geometry)).map(p => p.map(ring => simplify(ring, 0.04)).filter(ring => ring.length > 3)).filter(p => p.length)
      // d3 attend l'anneau extérieur dans le sens horaire (sphérique) ; sinon le polygone couvrirait toute la Terre
      .map(p => (d3.geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI ? p.map(ring => ring.slice().reverse()) : p));
    out.push({ t, n: r.fr, alt: r.alt || [], c: r.c, g: { type: 'MultiPolygon', coordinates: coords } });
  }
}
for (const x of out) {
  if (!x.g.coordinates.length) throw new Error('géométrie vide : ' + x.n);
  if (x.g.type === 'MultiPolygon' && (d3.geoArea(x.g) > Math.PI || d3.geoArea(x.g) === 0)) throw new Error('polygone inversé ou vide : ' + x.n);
}
if (missing.length) { console.error('Introuvables dans Natural Earth :', missing.join(', ')); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'data/physique.js'), '// Généré par scripts/physique.mjs — Natural Earth (domaine public), noms français revus\nwindow.PHYSIQUE=' + JSON.stringify(out) + ';\n');
const count = t => out.filter(x => x.t === t).length;
console.log(`${count('f')} fleuves, ${count('m')} montagnes, ${count('d')} déserts — data/physique.js : ${(fs.statSync(path.join(ROOT, 'data/physique.js')).size / 1024) | 0} Ko`);
