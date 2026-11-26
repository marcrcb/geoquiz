/* Jeux personnalisés branchés sur le moteur commun (js/game.js). */
(function () {
  const { register, API: A, zoneItems, recKey } = Game;
  const { $, store, fmt } = U;
  const byId = A.byId;
  const KEYS = new Map(COUNTRIES.map(c => [c.id, [c.n, ...c.alt].map(A.key)]));
  const ll = c => [c.capLL[1], c.capLL[0]]; // [lon, lat] de la capitale
  const km = (a, b) => d3.geoDistance(a, b) * 6371;
  const nf0 = new Intl.NumberFormat('fr-FR');
  // espace insécable classique : la police n'a pas l'espace fine utilisée par le format français
  const nf = { format: x => nf0.format(x).replace(/\u202f/g, '\u00a0') };
  const esc = s => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  /** Cherche la saisie parmi des pays candidats ; attend si elle est le début d'un autre nom (Niger → Nigeria). */
  function matchAmong(ids, force) {
    const S = A.S, k = A.key(A.el.input.value);
    clearTimeout(S.pending);
    if (!k) return { k };
    const hit = ids.find(id => KEYS.get(id).includes(k));
    if (!hit) return { k };
    if (!force && ids.some(id => id !== hit && KEYS.get(id).some(x => x.length > k.length && x.startsWith(k)))) {
      S.pending = A.later(() => A.S.C.input(true), 1100);
      return { k, wait: true };
    }
    return { k, hit };
  }
  /** Pays (parmi les 197) correspondant à la saisie, pour expliquer une erreur */
  const anyCountry = k => COUNTRIES.find(c => KEYS.get(c.id).includes(k));
  const best = () => store.get(recKey(A.S.cfg), null);

  /* =====================================================================
     Capitales sur la carte : cliquer l'emplacement d'une capitale
     ===================================================================== */
  register('locate', {
    items: cfg => zoneItems(cfg.zone),
    start() {
      const S = A.S, zone = S.cfg.zone;
      S.seq = A.shuffle(S.items); S.dists = [];
      // pas de pastilles de micro-États : on les confondrait avec des capitales
      A.newMap({ zone, inZone: id => zone === 'ALL' || byId[id].c === zone, onPoint: p => this.click(p), markers: false });
      A.el.form.hidden = true;
      this.next();
    },
    next() {
      const S = A.S;
      S.cur = S.seq.find(c => !S.res[c.id]); S.busy = false;
      if (!S.cur) return A.end('done');
      A.map.clearFx();
      A.ask(S.cur, `Capitale · ${S.cur.n}`, S.cur.cap);
    },
    click(p) {
      const S = A.S;
      if (!S || S.ended || S.paused || S.busy || !S.cur) return;
      const c = S.cur, d = km(p, ll(c));
      S.busy = true; S.dists.push(d);
      const r = d <= 100 ? 'good' : d <= 300 ? 'ok' : 'bad';
      S.res[c.id] = r;
      const m = A.map;
      m.line(p, ll(c), r);
      m.dot(p, 'guess', 4);
      m.dot(ll(c), 'cap ' + r, 6);
      m.text(ll(c), `${c.cap} · ${nf.format(Math.round(d))} km`);
      A.scored(d <= 300);
      A.toast(c, `${c.cap} : ${nf.format(Math.round(d))} km`);
      A.later(() => this.next(), 1600);
    },
    skip() {
      const S = A.S;
      if (S.busy || !S.cur) return;
      const c = S.cur; S.busy = true; S.res[c.id] = 'bad';
      A.map.dot(ll(c), 'cap bad', 6); A.map.text(ll(c), c.cap);
      A.map.zoomToIds([], [ll(c)], 4);
      A.scored(false);
      A.later(() => { A.map.resetZoom(); this.next(); }, 1600);
    },
    finish() {
      // Révision : toutes les capitales de la partie (pleines = réussies, vides = manquées)
      const S = A.S, m = A.map;
      m.clearFx();
      for (const c of S.items) {
        const r = S.res[c.id] || 'bad';
        m.dot(ll(c), 'cap ' + r, 4).append('title').text(`${c.cap} (${c.n})`);
      }
    },
    summary() {
      const S = A.S, d = S.dists;
      const avg = d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
      const b = best();
      return {
        small: `${S.score} / ${S.total} à moins de 300 km`,
        stats: [['Temps', fmt(S.elapsed)], ['Distance moyenne', avg == null ? '—' : `${nf.format(avg)} km`], ['Record', b ? `${b.score}/${b.total}` : '—']],
      };
    },
  });

  /* =====================================================================
     Pays voisins : nommer tous les voisins du pays affiché
     ===================================================================== */
  const roundsOf = (cfg, n) => (cfg.rounds === 'all' ? n : Math.min(n, +cfg.rounds));
  register('neighbors', {
    items: cfg => zoneItems(cfg.zone).filter(c => c.nb.length),
    count: cfg => roundsOf(cfg, zoneItems(cfg.zone).filter(c => c.nb.length).length),
    secPer: () => 30,
    progressByScore: true,
    start() {
      const S = A.S;
      S.rounds = A.shuffle(S.items).slice(0, roundsOf(S.cfg, S.items.length));
      A.setTotal(S.rounds.reduce((n, c) => n + c.nb.length, 0));
      S.complete = 0; S.ri = -1;
      A.newMap();
      A.el.skip.hidden = false;
      A.el.mapPanel.hidden = false;
      this.round(0);
    },
    round(i) {
      const S = A.S, m = A.map;
      if (S.cur) for (const id of [S.cur.id, ...S.cur.nb]) m.set(id, '');
      S.ri = i; S.cur = S.rounds[i]; S.nbFound = new Set(); S.busy = false;
      m.clearFx();
      m.set(S.cur.id, 'focus');
      m.tag(S.cur.id, S.cur.n);
      m.zoomToIds([S.cur.id, ...S.cur.nb]);
      A.el.input.placeholder = 'Un pays voisin…';
      this.panel();
    },
    redraw() {
      const S = A.S, m = A.map;
      m.set(S.cur.id, 'focus'); m.tag(S.cur.id, S.cur.n);
      for (const id of S.nbFound) { m.set(id, 'found'); m.tag(id, byId[id].n); }
      m.zoomToIds([S.cur.id, ...S.cur.nb]);
    },
    panel() {
      const S = A.S, c = S.cur;
      const chips = c.nb.map(id => (S.nbFound.has(id) ? `<span class="chip-n on">${esc(byId[id].n)}</span>` : (S.revealed ? `<span class="chip-n miss">${esc(byId[id].n)}</span>` : '<span class="chip-n">?</span>'))).join('');
      A.el.mapPanel.innerHTML = `<div class="mp-head"><img src="flags/thumb/${c.a2}.webp" alt=""><div><small>Pays ${S.ri + 1} / ${S.rounds.length}</small><strong>${esc(c.n)}</strong></div><span class="mp-count">${S.nbFound.size} / ${c.nb.length} voisin${c.nb.length > 1 ? 's' : ''}</span></div><div class="mp-chips">${chips}</div>`;
    },
    input(force) {
      const S = A.S;
      if (S.busy) return;
      const open = S.cur.nb.filter(id => !S.nbFound.has(id));
      const { k, hit, wait } = matchAmong(open, force);
      if (wait) return;
      if (hit) {
        S.nbFound.add(hit); A.el.input.value = '';
        A.map.set(hit, 'found'); A.map.tag(hit, byId[hit].n);
        A.scored(true);
        this.panel();
        if (S.nbFound.size === S.cur.nb.length) { S.complete++; S.busy = true; A.later(() => this.advance(), 900); }
        return;
      }
      if (force && k) {
        A.shakeBox();
        const o = anyCountry(k);
        if (o && S.nbFound.has(o.id)) A.toast(o, `${o.n} : déjà trouvé`);
        else if (o && o.id !== S.cur.id) A.toast(o, `Pas de frontière : ${o.n} / ${S.cur.n}`);
      }
    },
    skip() {
      const S = A.S;
      if (S.busy) return;
      S.busy = true;
      this.reveal();
      A.scored(false, 0);
      A.later(() => this.advance(), 1800);
    },
    reveal() {
      const S = A.S;
      for (const id of S.cur.nb) if (!S.nbFound.has(id)) { A.map.set(id, 'missed'); A.map.tag(id, byId[id].n); }
      S.revealed = true; this.panel(); S.revealed = false;
    },
    advance() {
      const S = A.S;
      if (S.ri + 1 >= S.rounds.length) return A.end('done');
      this.round(S.ri + 1);
    },
    finish() { if (A.S.cur && A.S.nbFound.size < A.S.cur.nb.length) this.reveal(); },
    summary() {
      const S = A.S, b = best();
      return {
        small: `${S.score} / ${S.total} voisins`,
        stats: [['Temps', fmt(S.elapsed)], ['Pays complets', `${S.complete} / ${S.rounds.length}`], ['Record', b ? `${b.score}/${b.total}` : '—']],
      };
    },
  });

  /* =====================================================================
     Chemin : relier deux pays par une suite de voisins
     ===================================================================== */
  function graphFor(zone) {
    const ids = new Set(zoneItems(zone).map(c => c.id));
    const adj = {};
    for (const id of ids) adj[id] = byId[id].nb.filter(n => ids.has(n));
    return adj;
  }
  /** Parcours en largeur ; `blocked` : pays infranchissables */
  function bfs(adj, from, blocked) {
    const dist = { [from]: 0 }, prev = {}, q = [from];
    while (q.length) {
      const u = q.shift();
      for (const v of adj[u]) if (!(v in dist) && !(blocked && blocked.has(v))) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); }
    }
    return { dist, prev };
  }
  const pathTo = (prev, from, to) => { const p = [to]; while (p[0] !== from) p.unshift(prev[p[0]]); return p; };

  register('path', {
    items: cfg => zoneItems(cfg.zone).filter(c => c.nb.length),
    count: cfg => +cfg.rounds || 5,
    secPer: () => 60,
    start() {
      const S = A.S;
      S.adj = graphFor(S.cfg.zone);
      S.routes = this.pickRoutes(+S.cfg.rounds || 5);
      A.setTotal(S.routes.length);
      S.optimal = 0; S.extra = 0; S.ri = -1;
      A.newMap();
      A.el.skip.hidden = false; A.el.back.hidden = false;
      A.el.mapPanel.hidden = false;
      this.round(0);
    },
    /** Trajets au hasard, de 4 à 7 frontières, avec 1 à 3 pays bloqués sur le chemin direct :
        il faut les contourner (le détour reste raisonnable, et il en existe toujours un). */
    pickRoutes(n) {
      const S = A.S, nodes = Object.keys(S.adj).filter(id => S.adj[id].length), out = [], used = new Set();
      for (let guard = 0; out.length < n && guard < 5000; guard++) {
        // petites régions : trajets plus courts, puis sans pays bloqué s'il n'existe aucun détour (Amérique centrale)
        const lo = guard < 2500 ? 4 : 3, needBlock = guard < 4000;
        const a = nodes[(Math.random() * nodes.length) | 0];
        const { dist, prev } = bfs(S.adj, a);
        const far = Object.keys(dist).filter(id => dist[id] >= lo && dist[id] <= 7);
        if (!far.length) continue;
        const b = far[(Math.random() * far.length) | 0];
        const k = [a, b].sort().join();
        if (used.has(k)) continue;
        const direct = pathTo(prev, a, b), want = 1 + (Math.random() < .5) + (direct.length > 6 && Math.random() < .4);
        const blocked = new Set();
        let best = direct;
        for (let i = 0; i < want; i++) {
          // bloque un pays du chemin le plus court actuel, si un détour pas trop long existe
          const cands = A.shuffle(best.slice(1, -1));
          let ok = false;
          for (const c of cands) {
            const bl = new Set([...blocked, c]), r = bfs(S.adj, a, bl);
            if (!(b in r.dist) || r.dist[b] > direct.length - 1 + 4) continue;
            blocked.add(c); best = pathTo(r.prev, a, b); ok = true; break;
          }
          if (!ok) break;
        }
        if (!blocked.size && needBlock) continue;
        used.add(k);
        out.push({ a, b, best, blocked: [...blocked] });
      }
      return out;
    },
    round(i) {
      const S = A.S, m = A.map;
      if (S.route) for (const id of new Set([...S.chain, ...S.route.best, ...S.route.blocked])) m.set(id, '');
      S.ri = i; S.route = S.routes[i]; S.chain = [S.route.a]; S.busy = false; S.revealed = false;
      this.redraw();
      this.panel();
    },
    redraw() {
      const S = A.S, m = A.map, r = S.route;
      m.clearFx();
      m.set(r.a, 'focus'); m.set(r.b, 'focus');
      for (const id of r.blocked) m.set(id, 'blocked');
      for (const id of S.chain.slice(1)) if (id !== r.b) m.set(id, 'found');
      for (const id of new Set([r.a, r.b, ...S.chain])) m.tag(id, byId[id].n);
      m.zoomToIds([...r.best, ...r.blocked]);
    },
    panel() {
      const S = A.S, r = S.route;
      const steps = S.chain.length - 1, minMid = r.best.length - 2;
      const chain = [...S.chain.map(id => `<span class="chip-n on">${esc(byId[id].n)}</span>`), S.chain[S.chain.length - 1] === r.b ? '' : `<span class="chip-n">…</span><span class="chip-n goal">${esc(byId[r.b].n)}</span>`].join('<i>→</i>');
      const blocked = r.blocked.map(id => `<span class="chip-n block">${esc(byId[id].n)}</span>`).join('');
      A.el.mapPanel.innerHTML = `<div class="mp-head"><div><small>Trajet ${S.ri + 1} / ${S.routes.length} · le plus court passe par ${minMid} pays</small><strong>${esc(byId[r.a].n)} → ${esc(byId[r.b].n)}</strong></div><span class="mp-count">${steps} étape${steps > 1 ? 's' : ''}</span></div><div class="mp-chips path">${chain}</div>${blocked ? `<div class="mp-sub">Bloqué${r.blocked.length > 1 ? 's' : ''} : ${blocked}</div>` : ''}`;
      A.el.input.placeholder = 'Pays suivant…';
    },
    input(force) {
      const S = A.S;
      if (S.busy) return;
      const endId = S.chain[S.chain.length - 1];
      const open = S.adj[endId].filter(id => !S.chain.includes(id) && !S.route.blocked.includes(id));
      const { k, hit, wait } = matchAmong(open, force);
      if (wait) return;
      if (hit) {
        S.chain.push(hit); A.el.input.value = '';
        if (hit !== S.route.b) { A.map.set(hit, 'found'); A.map.tag(hit, byId[hit].n); }
        A.map.label(hit, byId[hit].n);
        // Jonction faite : le pays tapé touche l'arrivée, pas besoin de taper l'arrivée elle-même
        if (hit !== S.route.b && S.adj[hit].includes(S.route.b)) S.chain.push(S.route.b);
        if (S.chain[S.chain.length - 1] !== S.route.b) A.map.zoomToIds([...S.route.best, ...S.route.blocked, ...S.chain]);
        this.panel();
        if (S.chain[S.chain.length - 1] === S.route.b) this.arrived();
        return;
      }
      if (force && k) {
        A.shakeBox();
        const o = anyCountry(k), e = byId[endId];
        if (!o) return;
        if (S.route.blocked.includes(o.id)) A.toast(o, `${o.n} est bloqué : contourne-le`);
        else if (S.chain.includes(o.id)) A.toast(o, `${o.n} : déjà dans le trajet`);
        else if (e.nb.includes(o.id)) A.toast(o, `${o.n} : hors de la région choisie`);
        else A.toast(o, `Pas de frontière : ${o.n} / ${e.n}`);
      }
    },
    arrived() {
      const S = A.S, mid = S.chain.length - 2, min = S.route.best.length - 2;
      S.busy = true;
      if (mid === min) S.optimal++;
      S.extra += mid - min;
      A.scored(true);
      A.toast(byId[S.route.b], mid === min ? 'Arrivé — trajet optimal' : `Arrivé — ${mid - min} étape${mid - min > 1 ? 's' : ''} de plus que le minimum`);
      A.later(() => this.advance(), 1500);
    },
    back() {
      const S = A.S;
      if (S.busy || S.chain.length < 2) return;
      const id = S.chain.pop();
      A.map.set(id, '');
      A.map.clearFx();
      for (const x of new Set([S.route.a, S.route.b, ...S.chain])) A.map.tag(x, byId[x].n);
      this.panel();
      A.el.input.focus({ preventScroll: true });
    },
    skip() {
      const S = A.S;
      if (S.busy) return;
      S.busy = true;
      this.reveal();
      A.scored(false);
      A.later(() => this.advance(), 2200);
    },
    reveal() {
      const S = A.S, m = A.map;
      for (const id of S.route.best.slice(1, -1)) if (!S.chain.includes(id)) { m.set(id, 'missed'); m.tag(id, byId[id].n); }
    },
    advance() {
      const S = A.S;
      if (S.ri + 1 >= S.routes.length) return A.end('done');
      this.round(S.ri + 1);
    },
    finish() { const S = A.S; if (S.route && S.chain[S.chain.length - 1] !== S.route.b) this.reveal(); },
    summary() {
      const S = A.S;
      return {
        small: `${S.score} / ${S.total} trajets`,
        stats: [['Temps', fmt(S.elapsed)], ['Trajets optimaux', `${S.optimal} / ${S.routes.length}`], ['Étapes en trop', String(S.extra)]],
      };
    },
  });

  /* =====================================================================
     À l'échelle : redimensionner le 2e pays par rapport au 1er (fixe)
     ===================================================================== */
  /** Aire (px²) d'un tracé SVG « M x,y L… Z » produit au build */
  function pathArea(d) {
    let total = 0;
    for (const ring of d.split('M').filter(Boolean)) {
      const pts = ring.replace(/Z/g, '').split('L').map(p => p.split(',').map(Number));
      let a = 0;
      for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
      total += a / 2; // anneaux intérieurs (lacs) orientés en sens inverse : ils se soustraient
    }
    return Math.abs(total);
  }
  const AREA = {}; // km² du territoire principal, d'après la silhouette
  const areaOf = id => (AREA[id] ??= pathArea(SHAPES[id]) * SHAPE_KM[id] ** 2);
  const times = r => `${nf.format(+(r >= 10 ? r.toFixed(0) : r.toFixed(1)))} ×`;

  const SVGNS = 'http://www.w3.org/2000/svg';
  const VB_W = 800, VB_H = 420;        // proportions de la zone de jeu
  const V_MIN = -6, V_MAX = 6;          // ×1/400 à ×400 en longueur : pratiquement illimité

  register('scale', {
    items: cfg => zoneItems(cfg.zone).filter(c => SHAPES[c.id]),
    count: cfg => +cfg.rounds || 5,
    secPer: () => 30,
    noReview: true,
    start() {
      const S = A.S, n = +S.cfg.rounds || 5;
      S.pairs = this.pick(n);
      A.setTotal(S.pairs.length * 100);
      S.errs = []; S.ri = -1;
      A.el.form.hidden = true;
      const st = A.el.customStage; st.hidden = false;
      st.innerHTML = `<div class="scale">
        <p class="scale-q">Donne sa vraie taille à : <b class="n2"></b></p>
        <p class="scale-sub">Repère fixe : <b class="n1"></b></p>
        <svg class="scale-svg" viewBox="0 0 ${VB_W} ${VB_H}" aria-label="Comparaison des deux pays">
          <line class="scale-ground"/>
          <g class="s1"><path/></g><g class="s2"><path/></g><g class="sg"><path/></g>
          <text class="scale-lbl l1"></text><text class="scale-lbl l2"></text>
        </svg>
        <div class="scale-ctrl">
          <button class="icon-btn" data-step="-1" aria-label="Réduire">−</button>
          <button class="icon-btn" data-step="1" aria-label="Agrandir">+</button>
          <button class="btn primary scale-go">Valider</button>
        </div>
        <p class="scale-res" aria-live="polite"></p>
        <p class="scale-help">Glisse vers le haut ou le bas (ou pince) pour redimensionner · molette · flèches · Entrée pour valider</p>
      </div>`;
      const q = sel => st.querySelector(sel);
      S.ui = { svg: q('.scale-svg'), g1: q('.s1'), g2: q('.s2'), gg: q('.sg'), ground: q('.scale-ground'), l1: q('.l1'), l2: q('.l2'),
        go: q('.scale-go'), res: q('.scale-res'), n1: q('.n1'), n2: q('.n2') };
      // Boutons − / + : un clic = un cran, un appui long = en continu
      st.querySelectorAll('[data-step]').forEach(b => {
        let rep = null;
        const stop = () => { clearInterval(rep); rep = null; };
        b.addEventListener('pointerdown', e => { e.preventDefault(); this.nudge(+b.dataset.step * 0.06); rep = setInterval(() => this.nudge(+b.dataset.step * 0.03), 60); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, stop));
      });
      this.gestures(S.ui.svg);
      S.ui.go.addEventListener('click', () => (S.revealed ? this.advance() : this.validate()));
      this.round(0);
    },
    /** Glisser (haut = agrandir), pincer, molette : aucune limite de taille */
    gestures(svg) {
      const pts = new Map();
      let last = null;
      const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      svg.addEventListener('pointerdown', e => { try { svg.setPointerCapture(e.pointerId); } catch { /* pointeur sans capture possible */ } pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = pts.size === 2 ? spread() : e.clientY; });
      svg.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) { const d = spread(); if (last) this.nudge(Math.log(d / last)); last = d; }
        else if (pts.size === 1) { this.nudge((last - e.clientY) * 0.006); last = e.clientY; }
      });
      const up = e => { pts.delete(e.pointerId); last = pts.size === 1 ? [...pts.values()][0].y : null; };
      ['pointerup', 'pointercancel'].forEach(t => svg.addEventListener(t, up));
      svg.addEventListener('wheel', e => { e.preventDefault(); this.nudge(-e.deltaY * 0.0015); }, { passive: false });
    },
    /** Paires de pays dont le rapport de surface reste lisible (entre 1,3 et 20) */
    pick(n) {
      const S = A.S, out = [], used = new Set();
      for (let guard = 0; out.length < n && guard < 5000; guard++) {
        const [a, b] = [S.items[(Math.random() * S.items.length) | 0], S.items[(Math.random() * S.items.length) | 0]];
        if (a.id === b.id || used.has(a.id) || used.has(b.id)) continue;
        const r = areaOf(b.id) / areaOf(a.id);
        if (Math.max(r, 1 / r) < 1.3 || Math.max(r, 1 / r) > 20) continue;
        used.add(a.id); used.add(b.id); out.push([a, b]);
      }
      return out;
    },
    round(i) {
      const S = A.S, [c1, c2] = S.pairs[i], u = S.ui;
      S.ri = i; S.revealed = false;
      u.n1.textContent = c1.n; u.n2.textContent = c2.n;
      u.l1.textContent = c1.n; u.l2.textContent = c2.n;
      u.g1.firstChild.setAttribute('d', SHAPES[c1.id]);
      u.g2.firstChild.setAttribute('d', SHAPES[c2.id]);
      u.gg.firstChild.setAttribute('d', SHAPES[c2.id]);
      u.gg.style.display = 'none';
      u.g2.classList.remove('done');
      // Contours réels des formes (pour poser les pays sur une même ligne de sol)
      S.b1 = u.g1.firstChild.getBBox(); S.b2 = u.g2.firstChild.getBBox();
      // Échelle réelle du 2e pays par rapport au 1er (km par pixel de chaque silhouette)
      S.kTrue = SHAPE_KM[c2.id] / SHAPE_KM[c1.id];
      // Taille de départ fausse : entre 1,5 et 3,5 fois trop grand ou trop petit (en longueur)
      S.v = (Math.random() < .5 ? -1 : 1) * (0.4 + Math.random() * 0.85);
      this.layout();
      u.res.textContent = ''; u.res.className = 'scale-res';
      u.go.textContent = 'Valider';
      A.setProgress(i / S.pairs.length);
    },
    /** Place les deux pays côte à côte sur le sol et cadre la vue pour tout montrer */
    layout() {
      const S = A.S, u = S.ui, b1 = S.b1, b2 = S.b2;
      const kU = S.kTrue * Math.exp(S.v), kG = S.revealed ? S.kTrue : 0;
      const gap = 0.12 * Math.max(b1.width, b1.height, b2.width * kU, b2.height * kU);
      const x2 = b1.width + gap;
      const place = (g, b, k, x) => g.setAttribute('transform', `translate(${x - b.x * k} ${-(b.y + b.height) * k}) scale(${k})`);
      place(u.g1, b1, 1, 0);
      place(u.g2, b2, kU, x2);
      if (kG) place(u.gg, b2, kG, x2);
      const w2 = b2.width * Math.max(kU, kG), h = Math.max(b1.height, b2.height * Math.max(kU, kG));
      const W = x2 + w2;
      // Vue : tout tient dans le cadre, avec une marge et la place des noms sous le sol
      const sc = Math.max(W / (VB_W * 0.86), h / (VB_H * 0.72));
      const cx = W / 2, top = -h - VB_H * sc * 0.1;
      u.svg.setAttribute('viewBox', `${cx - VB_W * sc / 2} ${top} ${VB_W * sc} ${VB_H * sc}`);
      const fs = 15 * sc;
      u.ground.setAttribute('x1', cx - VB_W * sc / 2); u.ground.setAttribute('x2', cx + VB_W * sc / 2);
      u.ground.setAttribute('y1', 0); u.ground.setAttribute('y2', 0); u.ground.setAttribute('stroke-width', 1 * sc);
      for (const [t, x] of [[u.l1, b1.width / 2], [u.l2, x2 + b2.width * kU / 2]]) {
        t.setAttribute('x', x); t.setAttribute('y', fs * 1.6); t.setAttribute('font-size', fs);
      }
    },
    nudge(dv) {
      const S = A.S;
      if (!S || S.ended || S.revealed || S.paused || S.C !== this) return;
      S.v = Math.max(V_MIN, Math.min(V_MAX, S.v + dv));
      this.layout();
    },
    key(e) {
      const S = A.S;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.nudge(-0.04); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.nudge(0.04); }
      else if (e.key === 'Enter') { e.preventDefault(); S.revealed ? this.advance() : this.validate(); }
    },
    validate() {
      const S = A.S;
      if (S.ended || S.paused || S.revealed) return;
      S.revealed = true;
      const [c1, c2] = S.pairs[S.ri], u = S.ui;
      const guess = Math.exp(2 * S.v); // rapport de surface : réponse / réalité
      // Note sur 100 : 100 si exact, 50 si la surface est 2 fois trop grande ou trop petite, 0 au-delà de 4 fois
      const pts = Math.max(0, Math.round(100 * (1 - Math.abs(Math.log(guess)) / Math.log(4))));
      S.errs.push(Math.abs(Math.log(guess)));
      u.gg.style.display = ''; u.g2.classList.add('done');
      this.layout();
      const real = areaOf(c2.id) / areaOf(c1.id);
      const off = Math.abs(Math.log(guess)) < 0.01 ? 'parfait' : guess >= 1 ? `${Math.round((guess - 1) * 100)} % trop grand` : `${Math.round((1 - guess) * 100)} % trop petit`;
      const rel = real >= 1 ? `${c2.n} ≈ ${times(real)} ${c1.n}` : `${c1.n} ≈ ${times(1 / real)} ${c2.n}`;
      u.res.innerHTML = `<span class="scale-pts">${pts}<small> / 100</small></span><span>${esc(off)}</span><small>Taille réelle (pointillés) : ${esc(rel)}</small>`;
      u.res.className = 'scale-res on';
      A.scored(pts > 0, pts);
      A.setProgress((S.ri + 1) / S.pairs.length);
      u.go.textContent = S.ri + 1 >= S.pairs.length ? 'Voir le résultat' : 'Manche suivante';
      u.go.focus({ preventScroll: true });
    },
    advance() {
      const S = A.S;
      if (S.ended || S.paused) return;
      if (S.ri + 1 >= S.pairs.length) return A.end('done');
      this.round(S.ri + 1);
    },
    summary() {
      const S = A.S, b = best();
      const mean = S.errs.length ? Math.exp(S.errs.reduce((a, x) => a + x, 0) / S.errs.length) : null;
      return {
        big: `${S.score}`, small: `points sur ${S.total}`,
        stats: [['Temps', fmt(S.elapsed)], ['Écart moyen', mean == null ? '—' : `${Math.round((mean - 1) * 100)} %`], ['Record', b ? `${b.score} / ${b.total}` : '—']],
      };
    },
  });

  /* =====================================================================
     Pays mystère : chaque proposition se colore selon sa distance au pays caché
     ===================================================================== */
  /** Sommets d'un pays en vecteurs unitaires 3D (calcul rapide des distances à la surface du globe) */
  const VEC = {};
  function vecOf(id) {
    if (VEC[id]) return VEC[id];
    const f = A.map && A.map.feats[id], pts = [];
    const add = ([lon, lat]) => { const l = lon * Math.PI / 180, p = lat * Math.PI / 180; pts.push(Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)); };
    if (f && f.geometry) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) for (const q of ring) add(q);
    }
    if (!pts.length) add(ll(byId[id])); // pays sans contour (Vatican, Tuvalu) : la capitale
    return (VEC[id] = new Float64Array(pts));
  }
  /** Plus courte distance (km) entre les frontières de deux pays ; 0 s'ils se touchent */
  function borderKm(a, b) {
    if (a === b || byId[a].nb.includes(b)) return 0;
    const A3 = vecOf(a), B3 = vecOf(b);
    let best = -2;
    for (let i = 0; i < A3.length; i += 3) {
      const x = A3[i], y = A3[i + 1], z = A3[i + 2];
      for (let j = 0; j < B3.length; j += 3) { const d = x * B3[j] + y * B3[j + 1] + z * B3[j + 2]; if (d > best) best = d; }
    }
    return Math.acos(Math.min(1, best)) * 6371;
  }
  /** Teinte d'une proposition : couleur des pays au loin, presque celle des pays trouvés tout près */
  const heat = d => Math.round(8 + 77 * (1 - Math.min(d, 12000) / 12000) ** 2);
  const heatFill = d => `color-mix(in srgb, var(--found) ${heat(d)}%, var(--land))`;
  const kmTxt = d => (d === 0 ? 'frontalier' : `${nf.format(d < 100 ? Math.round(d) : Math.round(d / 10) * 10)} km`);

  register('mystery', {
    items: cfg => zoneItems(cfg.zone),
    count: () => 1,
    secPer: () => 300,
    noReview: true,
    start() {
      const S = A.S;
      S.target = S.items[(Math.random() * S.items.length) | 0].id;
      S.guesses = []; S.hints = 0; S.won = false;
      A.setTotal(1);
      A.newMap();
      A.el.hint.hidden = false;
      A.el.mapPanel.hidden = false;
      A.el.input.placeholder = 'Propose un pays…';
      this.panel();
    },
    paint(id, d) {
      for (const el of [A.map.paths[id], A.map.markers[id]]) if (el) el.style.fill = d == null ? '' : heatFill(d);
    },
    redraw() {
      const S = A.S, m = A.map;
      m.clearFx();
      for (const g of S.guesses) { if (g.id === S.target) m.set(g.id, 'found'); else this.paint(g.id, g.d); m.tag(g.id, byId[g.id].n); }
    },
    panel() {
      const S = A.S, z = S.cfg.zone, n = S.guesses.length;
      const list = [...S.guesses].sort((a, b) => a.d - b.d).slice(0, 6);
      const rows = list.map(g => `<span class="mys-row${g.id === S.target ? ' win' : ''}"><i style="background:${g.id === S.target ? 'var(--found)' : heatFill(g.d)}"></i>${esc(byId[g.id].n)}<b>${g.id === S.target ? 'trouvé' : kmTxt(g.d)}</b></span>`).join('');
      const t = byId[S.target], hints = [];
      if (S.hints >= 1) hints.push(Game.ZONE_NAME[t.c]);
      if (S.hints >= 2) hints.push(`commence par « ${t.n[0]} »`);
      const flag = S.hints >= 3 ? `<img src="flags/thumb/${t.a2}.webp" alt="">` : '';
      const head = S.won ? esc(t.n) : n ? `Le plus proche : ${esc(byId[list[0].id].n)}` : 'Quel est le pays mystère ?';
      A.el.mapPanel.innerHTML = `<div class="mp-head">${flag}<div><small>${z === 'ALL' ? 'Un pays du monde' : 'Un pays · ' + Game.ZONE_NAME[z]}${hints.length ? ' · ' + esc(hints.join(' · ')) : ''}</small><strong>${head}</strong></div><span class="mp-count">${n} essai${n > 1 ? 's' : ''}</span></div>`
        + (n ? `<div class="mys-list">${rows}</div>` : '<div class="mp-sub">Propose un pays : plus il est proche du pays mystère, plus il s’éclaire sur la carte.</div>')
        + '<div class="mys-scale"><span>loin</span><i></i><span>proche</span></div>';
    },
    input(force) {
      const S = A.S;
      if (S.won) return;
      const open = COUNTRIES.map(c => c.id).filter(id => !S.guesses.some(g => g.id === id));
      const { k, hit, wait } = matchAmong(open, force);
      if (wait) return;
      if (hit) {
        A.el.input.value = '';
        const d = borderKm(hit, S.target), m = A.map;
        S.guesses.push({ id: hit, d });
        m.tag(hit, byId[hit].n);
        if (hit === S.target) {
          S.won = true;
          m.set(hit, 'found');
          A.scored(true);
          m.zoomToIds([hit]);
          A.toast(byId[hit], `Trouvé en ${S.guesses.length} essai${S.guesses.length > 1 ? 's' : ''}`);
          this.panel();
          A.later(() => A.end('done'), 1600);
          return;
        }
        this.paint(hit, d);
        A.toast(byId[hit], `${byId[hit].n} : ${kmTxt(d)}`);
        this.panel();
        return;
      }
      if (force && k) {
        A.shakeBox();
        const o = anyCountry(k);
        if (o) A.toast(o, `${o.n} : déjà proposé`);
      }
    },
    hint() {
      const S = A.S;
      if (S.won || S.hints >= 3) return;
      S.hints++; this.panel();
      if (S.hints >= 3) A.el.hint.hidden = true;
      A.el.input.focus({ preventScroll: true });
    },
    finish() {
      const S = A.S;
      if (S.won) return;
      const t = S.target;
      A.map.set(t, 'target'); A.map.tag(t, byId[t].n);
      A.map.zoomToIds([t]);
      S.revealed = true;
    },
    summary(elapsed) {
      const S = A.S, n = S.guesses.length, t = byId[S.target], rk = 'mys:' + S.cfg.zone;
      let rec = store.get(rk, 0), isRec = false;
      if (S.won && (!rec || n < rec)) { store.set(rk, n); rec = n; isRec = true; }
      const titles = [[1, 'Du premier coup.'], [3, 'Excellent.'], [6, 'Très bien.'], [10, 'Bien.'], [20, 'Trouvé.'], [Infinity, 'Trouvé, enfin.']];
      return {
        big: S.won ? String(n) : '—',
        small: S.won ? `essai${n > 1 ? 's' : ''} · ${t.n}` : `C’était : ${t.n}`,
        frac: null,
        title: S.won ? titles.find(([m]) => n <= m)[1] : 'Pays non trouvé.',
        msg: S.won ? (isRec && n > 1 ? 'Nouveau record d’essais' : 'Pays mystère trouvé') : (S.cfg.timer === 'timed' && elapsed >= S.limit ? 'Temps écoulé' : 'Partie abandonnée'),
        stats: [['Temps', fmt(elapsed)], ['Essais', String(n)], ['Record', rec ? `${rec} essai${rec > 1 ? 's' : ''}` : '—']],
      };
    },
  });
})();
