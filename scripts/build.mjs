// Génère les données et les ressources statiques du site (à lancer avec `npm run build`).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const topo = require('topojson-client');
const simp = require('topojson-simplify');
const wc = require('world-countries');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NM = path.join(ROOT, 'node_modules');
const out = (...p) => path.join(ROOT, ...p);
fs.mkdirSync(out('data'), { recursive: true });
fs.mkdirSync(out('flags'), { recursive: true });
fs.mkdirSync(out('vendor'), { recursive: true });
fs.mkdirSync(out('fonts'), { recursive: true });

// ---------- 1. Table des pays ----------
const rows = fs.readFileSync(out('scripts/pays.txt'), 'utf8').split('\n')
  .filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|').map(s => s.trim()));
const byIso3 = Object.fromEntries(wc.map(c => [c.cca3 === 'UNK' ? 'XKX' : c.cca3, c]));
const CONT = { Africa: 'AF', Europe: 'EU', Asia: 'AS', Oceania: 'OC' };
const countries = rows.map(([iso3, name, alts, cap, capAlts]) => {
  const w = byIso3[iso3];
  if (!w) throw new Error('inconnu ' + iso3);
  let cont = w.region === 'Americas' ? (w.subregion === 'South America' ? 'SA' : 'NA') : CONT[w.region];
  return {
    id: iso3, a2: w.cca2.toLowerCase(), n: name,
    alt: alts ? alts.split(',').map(s => s.trim()) : [],
    cap, capAlt: capAlts ? capAlts.split(',').map(s => s.trim()) : [],
    c: cont, ll: w.latlng.map(v => Math.round(v * 100) / 100), area: Math.round(w.area),
  };
}).sort((a, b) => a.n.localeCompare(b.n, 'fr'));

// Voisins terrestres (world-countries) restreints aux 197 pays, rendus symétriques.
// Frontières maritimes retirées : Inde – Sri Lanka.
const MARITIME = new Set(['IND-LKA', 'LKA-IND']);
const ids = new Set(countries.map(c => c.id));
const fix3 = x => (x === 'UNK' ? 'XKX' : x);
const nb = Object.fromEntries(countries.map(c => [c.id, new Set()]));
for (const c of countries) for (const b of byIso3[c.id].borders.map(fix3)) {
  if (!ids.has(b) || MARITIME.has(c.id + '-' + b)) continue;
  nb[c.id].add(b); nb[b].add(c.id);
}
// Coordonnées des capitales [lat, lon] : GeoNames, Ciudad de la Paz corrigée (capitale depuis 2026)
const capLL = JSON.parse(fs.readFileSync(out('scripts/capitales-coords.json')));
for (const c of countries) {
  c.nb = [...nb[c.id]].sort();
  if (!capLL[c.id]) throw new Error('capitale sans coordonnées : ' + c.id);
  c.capLL = capLL[c.id];
}

// ---------- 2. Carte ----------
const numToIso = Object.fromEntries(wc.filter(c => c.ccn3).map(c => [c.ccn3, c.cca3]));
const playable = new Set(countries.map(c => c.id));
// Territoires sans code ISO rattachés à un pays jouable (les autres restent en décor)
const ATTACH = { 'Kosovo': 'XKX', 'Somaliland': 'SOM', 'N. Cyprus': 'CYP', 'Siachen Glacier': 'IND', 'Baikonur': 'KAZ' };

/** Topologie prête à l'emploi : un objet par pays jouable (identifiant ISO3), le reste en décor. */
function prepare(file, keep, withDecor) {
  const world = JSON.parse(fs.readFileSync(path.join(NM, 'world-atlas', file)));
  const groups = new Map(), decor = [];
  for (const g of world.objects.countries.geometries) {
    const nm = g.properties.name;
    if (nm === 'Antarctica') continue;
    const id = ATTACH[nm] || numToIso[g.id];
    if (id && playable.has(id)) {
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(g);
    } else if (withDecor) decor.push({ ...g, id: undefined, properties: {} });
  }
  const geoms = [];
  for (const [id, gs] of groups) {
    const geom = gs.length === 1 ? { ...gs[0] } : topo.mergeArcs(world, gs);
    geom.id = id; geom.properties = {};
    geoms.push(geom);
  }
  world.objects = { countries: { type: 'GeometryCollection', geometries: geoms } };
  if (withDecor) world.objects.decor = { type: 'GeometryCollection', geometries: decor };
  // Simplification Visvalingam : on garde en priorité les points qui dessinent la forme
  let t = simp.presimplify(world);
  t = simp.simplify(t, simp.quantile(t, keep));
  t = simp.filter(t, simp.filterWeight(t, 0.0001));
  t.arcs = t.arcs.map(a => a.map(p => [p[0], p[1]]));
  return topo.quantize(t, withDecor ? 1e5 : 1e6);
}

// Carte légère (vue d'ensemble) et carte détaillée (1:10 M), chargée seulement quand on zoome
const t = prepare('countries-50m.json', 0.35, true);
const hd = prepare('countries-10m.json', 0.3, false);
const missing = countries.filter(c => !t.objects.countries.geometries.find(g => g.id === c.id)).map(c => c.id);
console.log('Pays sans tracé (affichés en point) :', missing.join(', '));
for (const c of countries) c.noShape = missing.includes(c.id) || undefined;
const hdIds = new Set(hd.objects.countries.geometries.map(g => g.id));
console.log('Tracés détaillés :', hdIds.size, 'pays ; absents :', countries.filter(c => !hdIds.has(c.id)).map(c => c.id).join(' ') || 'aucun');
fs.writeFileSync(out('data/world-hd.js'), '// Généré par scripts/build.mjs — tracés détaillés (Natural Earth 1:10 M)\nwindow.WORLD_HD=' + JSON.stringify(hd) + ';\n');

fs.writeFileSync(out('data/world.js'), 'window.WORLD=' + JSON.stringify(t) + ';\n');

// ---------- Silhouettes (pré-calculées : projection centrée sur chaque pays, sans déformation) ----------
const d3 = await import('d3');
const SW = 400, SH = 300;
const shapes = {}, scale = {};
/** Ne garde que le territoire principal : polygones à moins de 800 km (de proche en proche) du plus grand. */
function mainland(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const polys = f.geometry.coordinates.map(c => ({ c, a: d3.geoArea({ type: 'Polygon', coordinates: c }), pts: c[0].filter((_, i) => i % 3 === 0) }));
  polys.sort((x, y) => y.a - x.a);
  const near = (p, q) => p.pts.some(a => q.pts.some(b => d3.geoDistance(a, b) * 6371 < 800));
  const kept = [polys[0]];
  let added = true;
  while (added) {
    added = false;
    for (const p of polys) if (!kept.includes(p) && kept.some(k => near(p, k))) { kept.push(p); added = true; }
  }
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: kept.map(p => p.c) } };
}
/** Retire les points à moins de `tol` px du précédent : détail fin sans alourdir le fichier */
function thin(d, tol = 2) {
  return d.split('M').filter(Boolean).map(ring => {
    const pts = ring.replace(/Z/g, '').split('L').map(q => q.split(',').map(Number));
    const kept = [pts[0]];
    for (const q of pts.slice(1)) { const l = kept[kept.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= tol) kept.push(q); }
    // îlots de moins de 2,5 px : invisibles à cette taille, on les retire
    const xs = kept.map(q => q[0]), ys = kept.map(q => q[1]);
    if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 2.5) return '';
    return kept.length >= 3 ? 'M' + kept.map(q => q.join(',')).join('L') + 'Z' : '';
  }).join('');
}
for (const f0 of topo.feature(hd, hd.objects.countries).features) {
  const f = mainland(f0);
  const [lon, lat] = d3.geoCentroid(f);
  const proj = d3.geoAzimuthalEqualArea().rotate([-lon, -lat]).fitExtent([[14, 14], [SW - 14, SH - 14]], f);
  const p = d3.geoPath(proj).digits(1);
  const pts = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2).length;
  // On écarte les formes illisibles : micro-États réduits à quelques points, archipels trop dispersés
  const [[x0, y0], [x1, y1]] = p.bounds(f);
  if (pts < 14 || p.area(f) < (x1 - x0) * (y1 - y0) * 0.05) continue;
  shapes[f.id] = thin(p(f));
  // Projection à aires égales : km par pixel (linéaire) pour comparer deux pays à la même échelle
  scale[f.id] = +Math.sqrt(d3.geoArea(f) * 6371 ** 2 / p.area(f)).toFixed(3);
}
fs.writeFileSync(out('data/shapes.js'), '// Généré par scripts/build.mjs\nwindow.SHAPES=' + JSON.stringify(shapes) + ';\nwindow.SHAPE_KM=' + JSON.stringify(scale) + ';\n');
console.log('Silhouettes :', Object.keys(shapes).length, 'pays ; écartés :', countries.filter(c => !shapes[c.id]).map(c => c.id).join(' '));
fs.writeFileSync(out('data/countries.js'), '// Généré par scripts/build.mjs — modifiez scripts/pays.txt\nwindow.COUNTRIES=' +
  JSON.stringify(countries) + ';\n');

// ---------- 3. Drapeaux, librairies, polices ----------
// SVG nets pour les grands affichages, vignettes WebP pré-calculées pour les grilles (rapides à décoder)
const sharp = require('sharp');
fs.mkdirSync(out('flags/thumb'), { recursive: true });
for (const c of countries) {
  const src = path.join(NM, 'flag-icons/flags/4x3', c.a2 + '.svg');
  fs.copyFileSync(src, out('flags', c.a2 + '.svg'));
  await sharp(src, { density: 200 }).resize(320, 240, { fit: 'cover' }).webp({ quality: 82 }).toFile(out('flags/thumb', c.a2 + '.webp'));
}
fs.copyFileSync(path.join(NM, 'd3/dist/d3.min.js'), out('vendor/d3.min.js'));
fs.copyFileSync(path.join(NM, 'topojson-client/dist/topojson-client.min.js'), out('vendor/topojson-client.min.js'));
for (const [pkg, w] of [['inter', 400], ['inter', 500], ['inter', 600], ['inter', 700]]) {
  const f = `${pkg}-latin-${w}-normal.woff2`;
  fs.copyFileSync(path.join(NM, '@fontsource', pkg, 'files', f), out('fonts', f));
}

// ---------- 4. Liste de pré-cache du service worker ----------
const walk = d => fs.readdirSync(out(d), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = ['index.html', 'manifest.webmanifest', ...['css', 'js', 'data', 'flags', 'vendor', 'fonts', 'icons']
  .filter(d => fs.existsSync(out(d))).flatMap(walk)].map(f => f.split(path.sep).join('/'));
const hash = crypto.createHash('sha1');
for (const f of files) hash.update(fs.readFileSync(out(f)));
const version = hash.digest('hex').slice(0, 10);
fs.writeFileSync(out('precache.js'), `// Généré par scripts/build.mjs\nself.PRECACHE_VERSION='${version}';\nself.PRECACHE=${JSON.stringify(['./', ...files])};\n`);
console.log(`${countries.length} pays, ${files.length} fichiers en cache (version ${version}), carte ${(fs.statSync(out('data/world.js')).size / 1024) | 0} Ko`);
