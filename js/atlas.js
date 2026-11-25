/* Atlas : carte libre avec noms des pays et capitales, recherche et fiche détaillée au clic. */
(function () {
  const { $, key } = U;
  const byId = Object.fromEntries(COUNTRIES.map(c => [c.id, c]));
  const nf0 = new Intl.NumberFormat('fr-FR');
  const nf = { format: x => nf0.format(x).replace(/\u202f/g, '\u00a0') };
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const CHAR = 7.2;  // largeur moyenne d'un caractère à 12 px (px écran)
  const FONT = 12, CAP_FONT = 10.5;

  let map = null, sel = null, labels = [], caps = [];
  const el = { host: $('#atlasMap'), panel: $('#atlasPanel'), search: $('#atlasSearch'), sugg: $('#atlasSugg') };

  function ensureMap() {
    if (map) return;
    map = new MapView(el.host, {
      tip: $('#atlasTip'),
      onClick: id => select(id, false),
      onZoom: k => scaleLayers(k),
      onZoomEnd: k => visibility(k),
      onBuild: m => layers(m),
    });
    map.reveal = true; // infobulle avec le nom au survol
  }

  /* ---------- Calques : noms des pays et capitales ---------- */
  function layers(m) {
    map = m; // appelé pendant la construction de la carte, avant le retour du constructeur
    const g = map.g, k = map.k || 1;
    labels = []; caps = [];
    const capG = g.append('g').attr('class', 'atlas-caps');
    const capLabelG = g.append('g').attr('class', 'atlas-cap-labels');
    const labelG = g.append('g').attr('class', 'atlas-labels');
    map.atlasG = { capG, capLabelG, labelG };
    for (const c of COUNTRIES) {
      const pt = map.centroids[c.id];
      if (!pt) continue;
      // Seuil de zoom : le nom s'affiche quand il tient dans la largeur du pays
      const b = map.mainBounds(c.id);
      const w = b && !map.markers[c.id] ? Math.min(b[1][0] - b[0][0], (b[1][1] - b[0][1]) * 2.2) : 3;
      const kMin = Math.max(1, (c.n.length * CHAR) / Math.max(w * 1.25, 1));
      const t = labelG.append('text').attr('class', 'atlas-label').attr('x', pt[0]).attr('y', pt[1]).text(c.n).node();
      t.__id = c.id;
      labels.push({ el: t, id: c.id, x: pt[0], y: pt[1], w: c.n.length * CHAR, area: c.area, kMin: map.markers[c.id] ? Math.max(kMin, 5) : kMin });
      const q = map.proj([c.capLL[1], c.capLL[0]]);
      if (!q) continue;
      const dot = capG.append('circle').attr('cx', q[0]).attr('cy', q[1]).node();
      const ct = capLabelG.append('text').attr('class', 'atlas-cap').attr('x', q[0]).attr('y', q[1]).attr('dy', '-0.55em').text(c.cap).node();
      caps.push({ dot, el: ct, x: q[0], y: q[1], w: c.cap.length * CHAR * .9, kMin: Math.max(2.5, kMin * 1.6) });
    }
    labels.sort((a, b) => b.area - a.area); // les grands pays d'abord
    scaleLayers(k); visibility(k);
    if (sel) map.set(sel, 'focus');
  }
  /** Taille constante à l'écran : un seul attribut par groupe, pas un par texte */
  function scaleLayers(k) {
    if (!map || !map.atlasG) return;
    const { capG, capLabelG, labelG } = map.atlasG;
    labelG.attr('font-size', FONT / k).attr('stroke-width', 3 / k);
    capLabelG.attr('font-size', CAP_FONT / k).attr('stroke-width', 2.5 / k);
    capG.attr('stroke-width', 1 / k);
    const r = 2.6 / k;
    for (const c of caps) c.dot.setAttribute('r', r);
  }
  /** Affiche seulement les noms qui ont la place (recalculé à la fin du zoom) */
  function visibility(k) {
    // Boîtes en coordonnées de carte : un nom qui chevauche un nom déjà placé est masqué
    const placed = [];
    const fits = (x0, y0, x1, y1) => !placed.some(b => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]);
    const order = sel ? [...labels.filter(l => l.id === sel), ...labels.filter(l => l.id !== sel)] : labels;
    for (const l of order) {
      const hw = (l.w / 2 + 3) / k, hh = 8 / k;
      const on = l.id === sel || (k >= l.kMin && fits(l.x - hw, l.y - hh, l.x + hw, l.y + hh));
      if (on) placed.push([l.x - hw, l.y - hh, l.x + hw, l.y + hh]);
      l.el.classList.toggle('hide', !on);
    }
    for (const c of caps) {
      const hw = (c.w / 2 + 2) / k, top = c.y - 15 / k;
      const on = k >= c.kMin && fits(c.x - hw, top, c.x + hw, c.y);
      if (on) placed.push([c.x - hw, top, c.x + hw, c.y]);
      c.el.classList.toggle('hide', !on);
      c.dot.classList.toggle('hide', k < 1.6);
    }
  }

  /* ---------- Fiche pays ---------- */
  function select(id, zoom) {
    if (!id) return;
    if (sel && sel !== id) map.set(sel, '');
    sel = id;
    map.set(id, 'focus');
    visibility(map.k);
    if (zoom) map.zoomToIds([id], [], 6);
    const c = byId[id], z = Game.ZONE_NAME[c.c];
    const ll = (v, pos, neg) => `${nf.format(Math.abs(v))}° ${v >= 0 ? pos : neg}`;
    const nb = c.nb.length
      ? c.nb.map(n => byId[n]).sort((a, b) => a.n.localeCompare(b.n, 'fr')).map(n => `<button class="chip-n on" data-go="${n.id}">${esc(n.n)}</button>`).join('')
      : '<span class="muted">Aucun : pas de frontière terrestre</span>';
    el.panel.innerHTML = `
      <button class="icon-btn close" data-close aria-label="Fermer la fiche">✕</button>
      <img class="ap-flag" src="flags/${c.a2}.svg" alt="Drapeau : ${esc(c.n)}">
      <h2>${esc(c.n)}</h2>
      ${c.alt.length ? `<p class="ap-alt">Aussi accepté : ${c.alt.map(esc).join(', ')}</p>` : ''}
      <dl>
        <dt>Capitale</dt><dd><b>${esc(c.cap)}</b>${c.capAlt.length ? `<small>Aussi accepté : ${c.capAlt.map(esc).join(', ')}</small>` : ''}</dd>
        <dt>Continent</dt><dd>${esc(z)}</dd>
        <dt>Superficie</dt><dd>${nf.format(c.area)} km²</dd>
        <dt>Position de la capitale</dt><dd>${ll(c.capLL[0], 'N', 'S')} · ${ll(c.capLL[1], 'E', 'O')}</dd>
        <dt>Voisins terrestres${c.nb.length ? ` (${c.nb.length})` : ''}</dt><dd class="ap-nb">${nb}</dd>
      </dl>
      ${SHAPES[c.id] ? `<figure class="ap-shape"><svg class="shape" viewBox="0 0 400 300" aria-hidden="true"><path d="${SHAPES[c.id]}"/></svg><figcaption>Silhouette (territoire principal)</figcaption></figure>` : ''}
      <p class="ap-code">Codes ISO : ${c.id} · ${c.a2.toUpperCase()}</p>`;
    el.panel.hidden = false;
    el.panel.scrollTop = 0;
  }
  function closePanel() {
    el.panel.hidden = true;
    if (sel) map.set(sel, '');
    sel = null; visibility(map.k);
  }
  el.panel.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closePanel();
    const go = e.target.closest('[data-go]');
    if (go) select(go.dataset.go, true);
  });

  /* ---------- Recherche (pays ou capitale) ---------- */
  const INDEX = COUNTRIES.flatMap(c => [
    ...[c.n, ...c.alt].map(t => ({ k: key(t), id: c.id, kind: 'pays' })),
    ...[c.cap, ...c.capAlt].map(t => ({ k: key(t), id: c.id, kind: 'capitale' })),
  ]);
  function suggest() {
    const q = key(el.search.value);
    if (!q) { el.sugg.hidden = true; return []; }
    const seen = new Set(), out = [];
    // d'abord les noms qui commencent par la saisie, puis ceux qui la contiennent
    for (const pass of [x => x.k.startsWith(q), x => x.k.includes(q)]) {
      for (const x of INDEX) if (pass(x) && !seen.has(x.id)) { seen.add(x.id); out.push(x); if (out.length >= 7) break; }
    }
    el.sugg.innerHTML = out.length
      ? out.map((x, i) => { const c = byId[x.id]; return `<li><button data-go="${c.id}" class="${i === 0 ? 'first' : ''}"><img src="flags/thumb/${c.a2}.webp" alt=""><span>${esc(c.n)}</span><small>${esc(c.cap)}</small></button></li>`; }).join('')
      : '<li class="none">Aucun résultat</li>';
    el.sugg.hidden = false;
    return out;
  }
  el.search.addEventListener('input', suggest);
  el.search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const r = suggest(); if (r[0]) { pick(r[0].id); } e.preventDefault(); }
    if (e.key === 'Escape') { el.search.value = ''; el.sugg.hidden = true; }
  });
  el.sugg.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) pick(b.dataset.go); });
  function pick(id) { el.search.value = ''; el.sugg.hidden = true; el.search.blur(); select(id, true); }
  document.addEventListener('click', e => { if (!e.target.closest('.atlas-search')) el.sugg.hidden = true; });

  /* ---------- Commandes ---------- */
  document.querySelectorAll('[data-azoom]').forEach(b => b.addEventListener('click', () => {
    if (!map) return;
    const z = b.dataset.azoom; z === 'in' ? map.zoomBy(1.8) : z === 'out' ? map.zoomBy(1 / 1.8) : map.resetZoom();
  }));
  $('#atlasBack').addEventListener('click', () => App.show('home'));
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#atlas').classList.contains('active') && document.activeElement !== el.search && !el.panel.hidden) closePanel();
  });
  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (map && $('#atlas').classList.contains('active') && Math.abs(el.host.clientWidth - map.W) > 40) map.build(); }, 250);
  });

  window.Atlas = {
    /** Appelé quand l'écran devient visible (la carte a besoin de sa taille réelle) */
    shown() {
      ensureMap();
      if (Math.abs(el.host.clientWidth - map.W) > 40 || Math.abs(el.host.clientHeight - map.H) > 40) map.build();
    },
    select: id => { ensureMap(); select(id, true); },
  };
})();
