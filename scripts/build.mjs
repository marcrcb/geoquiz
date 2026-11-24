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

// ---------- 2. Carte ----------
const world = JSON.parse(fs.readFileSync(path.join(NM, 'world-atlas/countries-50m.json')));
const numToIso = Object.fromEntries(wc.filter(c => c.ccn3).map(c => [c.ccn3, c.cca3]));
const playable = new Set(countries.map(c => c.id));
const geoms = world.objects.countries.geometries;
const groups = new Map(); // id -> [geoms]
const decor = [];
for (const g of geoms) {
  const nm = g.properties.name;
  let id = numToIso[g.id];
  if (nm === 'Kosovo') id = 'XKX';
  if (nm === 'Somaliland') id = 'SOM';
  if (nm === 'N. Cyprus') id = 'CYP';
  if (nm === 'Siachen Glacier') id = 'IND';
  if (nm === 'Antarctica') continue;
  if (id && playable.has(id)) {
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(g);
  } else decor.push({ ...g, id: undefined, properties: {} });
}
const newGeoms = [];
for (const [id, gs] of groups) {
  const geom = gs.length === 1 ? { ...gs[0] } : topo.mergeArcs(world, gs);
  geom.id = id; geom.properties = {};
  newGeoms.push(geom);
}
world.objects = { countries: { type: 'GeometryCollection', geometries: newGeoms },
                  decor: { type: 'GeometryCollection', geometries: decor } };
let t = simp.presimplify(world);
t = simp.simplify(t, simp.quantile(t, 0.35));
t = simp.filter(t, simp.filterWeight(t, 0.0001));
t.arcs = t.arcs.map(a => a.map(p => [p[0], p[1]]));
t = topo.quantize(t, 1e5);
const missing = countries.filter(c => !newGeoms.find(g => g.id === c.id)).map(c => c.id);
console.log('Pays sans tracé (affichés en point) :', missing.join(', '));
for (const c of countries) c.noShape = missing.includes(c.id) || undefined;

fs.writeFileSync(out('data/world.js'), 'window.WORLD=' + JSON.stringify(t) + ';\n');
fs.writeFileSync(out('data/countries.js'), '// Généré par scripts/build.mjs — modifiez scripts/pays.txt\nwindow.COUNTRIES=' +
  JSON.stringify(countries) + ';\n');

// ---------- 3. Drapeaux, librairies, polices ----------
for (const c of countries) {
  fs.copyFileSync(path.join(NM, 'flag-icons/flags/4x3', c.a2 + '.svg'), out('flags', c.a2 + '.svg'));
}
fs.copyFileSync(path.join(NM, 'd3/dist/d3.min.js'), out('vendor/d3.min.js'));
fs.copyFileSync(path.join(NM, 'topojson-client/dist/topojson-client.min.js'), out('vendor/topojson-client.min.js'));
for (const [pkg, w] of [['fredoka', 600], ['fredoka', 700], ['nunito', 400], ['nunito', 700], ['nunito', 800]]) {
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
