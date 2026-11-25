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
     Le plus grand : duel entre deux pays, série jusqu'à la première erreur
     ===================================================================== */
  const CRIT = {
    area: { q: 'Lequel est le plus grand ?', v: c => c.area, f: c => `${nf.format(c.area)} km²`, sub: () => '' },
    north: { q: 'Quelle capitale est la plus au nord ?', v: c => c.capLL[0], f: c => `${nf.format(Math.abs(c.capLL[0]))}° ${c.capLL[0] >= 0 ? 'N' : 'S'}`, sub: c => c.cap },
    east: { q: 'Quelle capitale est la plus à l’est ?', v: c => c.capLL[1], f: c => `${nf.format(Math.abs(c.capLL[1]))}° ${c.capLL[1] >= 0 ? 'E' : 'O'}`, sub: c => c.cap },
  };
  register('bigger', {
    items: cfg => zoneItems(cfg.zone),
    noReview: true,
    start() {
      const S = A.S;
      S.crit = CRIT[S.cfg.crit] || CRIT.area;
      A.setTotal(null);
      A.el.form.hidden = true;
      S.deck = []; S.pair = [this.draw(), null]; S.pair[1] = this.draw(S.pair[0]);
      const st = A.el.customStage; st.hidden = false;
      st.innerHTML = `<div class="duel"><p class="duel-q"></p><div class="duel-cards">
        <button class="duel-card" data-side="0"></button><span class="duel-or">ou</span><button class="duel-card" data-side="1"></button></div>
        <p class="duel-help">Clique sur ta réponse — ou flèches ← →</p></div>`;
      st.querySelector('.duel-q').textContent = S.crit.q;
      st.querySelector('.duel-cards').onclick = e => { const b = e.target.closest('[data-side]'); if (b) this.choose(+b.dataset.side); };
      this.render();
    },
    /** Pioche un pays (paquet mélangé), différent de `other` et de valeur distincte */
    draw(other) {
      const S = A.S;
      for (let guard = 0; guard < 500; guard++) {
        if (!S.deck.length) S.deck = A.shuffle(S.items);
        const c = S.deck.pop();
        if (other && (c.id === other.id || S.crit.v(c) === S.crit.v(other))) continue;
        return c;
      }
    },
    render() {
      const S = A.S;
      A.el.customStage.querySelectorAll('.duel-card').forEach((b, i) => {
        const c = S.pair[i];
        b.className = 'duel-card in';
        b.disabled = false;
        b.innerHTML = `<img src="flags/${c.a2}.svg" alt=""><strong></strong><small></small><span class="duel-val">?</span>`;
        b.querySelector('strong').textContent = c.n;
        b.querySelector('small').textContent = S.crit.sub(c);
      });
      S.busy = false;
    },
    key(e) {
      if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); this.choose(0); }
      if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); this.choose(1); }
    },
    choose(side) {
      const S = A.S;
      if (!S || S.ended || S.paused || S.busy) return;
      S.busy = true;
      const [a, b] = S.pair, va = S.crit.v(a), vb = S.crit.v(b);
      const win = va > vb ? 0 : 1, ok = side === win;
      A.el.customStage.querySelectorAll('.duel-card').forEach((btn, i) => {
        btn.disabled = true;
        btn.querySelector('.duel-val').textContent = S.crit.f(S.pair[i]);
        btn.classList.add(i === win ? 'win' : 'lose');
        if (i === side) btn.classList.add('picked');
      });
      A.scored(ok);
      if (!ok) { S.lastPair = S.pair; return A.later(() => A.end('done'), 1500); }
      // Le gagnant reste, un nouvel adversaire arrive
      A.later(() => { const keep = S.pair[win]; S.pair = [keep, this.draw(keep)]; this.render(); }, 1100);
    },
    summary() {
      const S = A.S, b = best(), n = S.score;
      const titles = [[30, 'Phénoménal.'], [20, 'Impressionnant.'], [10, 'Très bien.'], [5, 'Bien.'], [0, 'Encore un effort.']];
      return {
        big: String(n), small: n > 1 ? 'bonnes réponses d’affilée' : 'bonne réponse', frac: null,
        title: titles.find(([p]) => n >= p)[1], msg: 'Série terminée',
        stats: [['Temps', fmt(S.elapsed)], ['Critère', { area: 'Superficie', north: 'Nord', east: 'Est' }[S.cfg.crit] || 'Superficie'], ['Record', b ? String(b.score) : '—']],
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
  function bfs(adj, from) {
    const dist = { [from]: 0 }, prev = {}, q = [from];
    while (q.length) {
      const u = q.shift();
      for (const v of adj[u]) if (!(v in dist)) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); }
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
    /** Trajets au hasard dont le plus court passe par 2 à 4 pays intermédiaires */
    pickRoutes(n) {
      const S = A.S, nodes = Object.keys(S.adj).filter(id => S.adj[id].length), out = [], used = new Set();
      for (let guard = 0; out.length < n && guard < 3000; guard++) {
        const a = nodes[(Math.random() * nodes.length) | 0];
        const { dist, prev } = bfs(S.adj, a);
        const far = Object.keys(dist).filter(id => dist[id] >= 3 && dist[id] <= 5);
        if (!far.length) continue;
        const b = far[(Math.random() * far.length) | 0];
        const k = [a, b].sort().join();
        if (used.has(k)) continue;
        used.add(k);
        out.push({ a, b, best: pathTo(prev, a, b) });
      }
      return out;
    },
    round(i) {
      const S = A.S, m = A.map;
      if (S.route) for (const id of new Set([...S.chain, ...S.route.best])) m.set(id, '');
      S.ri = i; S.route = S.routes[i]; S.chain = [S.route.a]; S.busy = false; S.revealed = false;
      m.clearFx();
      m.set(S.route.a, 'focus'); m.set(S.route.b, 'focus');
      m.tag(S.route.a, byId[S.route.a].n); m.tag(S.route.b, byId[S.route.b].n);
      m.zoomToIds(S.route.best);
      this.panel();
    },
    redraw() {
      const S = A.S, m = A.map;
      m.set(S.route.a, 'focus'); m.set(S.route.b, 'focus');
      for (const id of S.chain.slice(1)) m.set(id, 'found');
      for (const id of new Set([S.route.a, S.route.b, ...S.chain])) m.tag(id, byId[id].n);
      m.zoomToIds(S.route.best);
    },
    panel() {
      const S = A.S, r = S.route;
      const steps = S.chain.length - 1, minMid = r.best.length - 2;
      const chain = [...S.chain.map(id => `<span class="chip-n on">${esc(byId[id].n)}</span>`), S.chain[S.chain.length - 1] === r.b ? '' : `<span class="chip-n">…</span><span class="chip-n goal">${esc(byId[r.b].n)}</span>`].join('<i>→</i>');
      A.el.mapPanel.innerHTML = `<div class="mp-head"><div><small>Trajet ${S.ri + 1} / ${S.routes.length} · le plus court passe par ${minMid} pays</small><strong>${esc(byId[r.a].n)} → ${esc(byId[r.b].n)}</strong></div><span class="mp-count">${steps} étape${steps > 1 ? 's' : ''}</span></div><div class="mp-chips path">${chain}</div>`;
      A.el.input.placeholder = 'Pays suivant…';
    },
    input(force) {
      const S = A.S;
      if (S.busy) return;
      const endId = S.chain[S.chain.length - 1];
      const open = S.adj[endId].filter(id => !S.chain.includes(id));
      const { k, hit, wait } = matchAmong(open, force);
      if (wait) return;
      if (hit) {
        S.chain.push(hit); A.el.input.value = '';
        if (hit !== S.route.b) { A.map.set(hit, 'found'); A.map.tag(hit, byId[hit].n); }
        A.map.label(hit, byId[hit].n);
        this.panel();
        if (hit === S.route.b) this.arrived();
        return;
      }
      if (force && k) {
        A.shakeBox();
        const o = anyCountry(k), e = byId[endId];
        if (!o) return;
        if (S.chain.includes(o.id)) A.toast(o, `${o.n} : déjà dans le trajet`);
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

  register('scale', {
    items: cfg => zoneItems(cfg.zone).filter(c => SHAPES[c.id]),
    count: cfg => +cfg.rounds || 10,
    secPer: () => 30,
    noReview: true,
    start() {
      const S = A.S, n = +S.cfg.rounds || 10;
      S.pairs = this.pick(n);
      A.setTotal(S.pairs.length * 100);
      S.errs = []; S.ri = -1;
      A.el.form.hidden = true;
      const st = A.el.customStage; st.hidden = false;
      st.innerHTML = `<div class="scale">
        <p class="scale-q">Donne au 2<sup>e</sup> pays sa vraie taille</p>
        <div class="scale-names"><div><b class="n1"></b><small>fixe</small></div><div><b class="n2"></b><small>à ajuster</small></div></div>
        <svg class="scale-svg" viewBox="0 0 800 380" aria-label="Comparaison des deux pays">
          <line x1="400" y1="20" x2="400" y2="360" class="scale-sep"/>
          <g class="s1"><path/></g><g class="s2"><path/></g><g class="sg"><path/></g>
        </svg>
        <div class="scale-ctrl">
          <button class="icon-btn" data-step="-1" aria-label="Réduire">−</button>
          <input type="range" min="0" max="1000" step="1" aria-label="Taille du second pays">
          <button class="icon-btn" data-step="1" aria-label="Agrandir">+</button>
          <button class="btn primary scale-go">Valider</button>
        </div>
        <p class="scale-res" aria-live="polite"></p>
        <p class="duel-help">Curseur, molette ou flèches ← → · Entrée pour valider</p>
      </div>`;
      const q = sel => st.querySelector(sel);
      S.ui = { svg: q('.scale-svg'), g1: q('.s1'), g2: q('.s2'), gg: q('.sg'), range: q('input'), go: q('.scale-go'), res: q('.scale-res'), n1: q('.n1'), n2: q('.n2') };
      S.ui.range.addEventListener('input', () => this.setT(+S.ui.range.value));
      st.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => this.nudge(+b.dataset.step * 0.04)));
      S.ui.svg.addEventListener('wheel', e => { e.preventDefault(); this.nudge(-Math.sign(e.deltaY) * 0.035); }, { passive: false });
      S.ui.go.addEventListener('click', () => (S.revealed ? this.advance() : this.validate()));
      this.round(0);
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
      S.ri = i; S.revealed = false; S.busy = false;
      u.n1.textContent = c1.n; u.n2.textContent = c2.n;
      u.g1.firstChild.setAttribute('d', SHAPES[c1.id]);
      u.g2.firstChild.setAttribute('d', SHAPES[c2.id]);
      u.gg.firstChild.setAttribute('d', SHAPES[c2.id]);
      u.gg.style.display = 'none';
      u.g2.classList.remove('done');
      // Échelle commune (km par pixel d'écran) : le plus grand des deux occupe la moitié de son cadre,
      // pour laisser de la marge quand on agrandit le second pays
      const s1 = SHAPE_KM[c1.id], s2 = SHAPE_KM[c2.id], m = Math.max(s1, s2) / 0.5;
      S.k1 = s1 / m; S.k2 = s2 / m;
      u.g1.setAttribute('transform', this.tf(200, S.k1));
      u.gg.setAttribute('transform', this.tf(600, S.k2));
      // Plage du curseur décalée au hasard : la bonne réponse n'est jamais au milieu
      // …et jamais au-delà de sa moitié du cadre (taille affichée ≤ 1)
      S.lo = -Math.log(3) - Math.random() * 0.6;
      S.hi = Math.max(Math.log(1.8), Math.log((0.95 + Math.random() * 0.05) / S.k2));
      let v; do { v = S.lo + Math.random() * (S.hi - S.lo); } while (Math.abs(v) < 0.3);
      this.setV(v);
      u.res.textContent = ''; u.res.className = 'scale-res';
      u.go.textContent = 'Valider'; u.range.disabled = false;
      A.setProgress(i / S.pairs.length);
    },
    tf: (cx, k) => `translate(${cx} 190) scale(${k}) translate(-200 -150)`,
    setV(v) {
      const S = A.S;
      S.v = Math.max(S.lo, Math.min(S.hi, v));
      S.ui.range.value = Math.round(1000 * (S.v - S.lo) / (S.hi - S.lo));
      S.ui.g2.setAttribute('transform', this.tf(600, S.k2 * Math.exp(S.v)));
    },
    setT(t) { const S = A.S; if (!S.revealed && !S.paused) this.setV(S.lo + (t / 1000) * (S.hi - S.lo)); },
    nudge(dv) { const S = A.S; if (!S.ended && !S.revealed && !S.paused) this.setV(S.v + dv); },
    key(e) {
      const S = A.S;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.nudge(-0.03); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.nudge(0.03); }
      else if (e.key === 'Enter') { e.preventDefault(); S.revealed ? this.advance() : this.validate(); }
    },
    validate() {
      const S = A.S;
      if (S.ended || S.paused || S.revealed) return;
      S.revealed = true;
      const [c1, c2] = S.pairs[S.ri], u = S.ui;
      const guess = Math.exp(2 * S.v); // rapport de surface : réponse / réalité
      const pts = Math.max(0, Math.round(100 * (1 - Math.abs(Math.log(guess)) / Math.log(4))));
      S.errs.push(Math.abs(Math.log(guess)));
      u.gg.style.display = ''; u.g2.classList.add('done'); u.range.disabled = true;
      const real = areaOf(c2.id) / areaOf(c1.id);
      const off = guess >= 1 ? `${Math.round((guess - 1) * 100)} % trop grand` : `${Math.round((1 - guess) * 100)} % trop petit`;
      const rel = real >= 1 ? `Taille réelle : ${c2.n} ≈ ${times(real)} ${c1.n}` : `Taille réelle : ${c1.n} ≈ ${times(1 / real)} ${c2.n}`;
      u.res.innerHTML = `<b>+${pts} points</b> · ${Math.abs(Math.log(guess)) < 0.01 ? 'parfait' : esc(off)}<br><small>${esc(rel)} (territoire principal)</small>`;
      u.res.className = 'scale-res on';
      A.scored(pts > 0, pts);
      A.setProgress((S.ri + 1) / S.pairs.length);
      u.go.textContent = S.ri + 1 >= S.pairs.length ? 'Voir le résultat' : 'Suivant';
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
        small: `${S.score} / ${S.total} points`,
        stats: [['Temps', fmt(S.elapsed)], ['Écart moyen', mean == null ? '—' : `${Math.round((mean - 1) * 100)} %`], ['Record', b ? `${b.score} pts` : '—']],
      };
    },
  });
})();
