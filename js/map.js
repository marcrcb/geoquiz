/* Carte interactive (SVG + d3) : zoom/déplacement, micro-États en pastilles. */
(function () {
  const { $ } = U;

  // Cadrage de chaque région [ouest, sud, est, nord] et rotation de la projection
  const ZONES = {
    ALL: { rotate: [-11, 0] },
    AF: { box: [-26, -36, 58, 38], rotate: [-15, 0] },
    EU: { box: [-25, 34, 45, 71], rotate: [-10, 0] },
    AS: { box: [25, -11, 150, 56], rotate: [-90, 0] },
    NA: { box: [-170, 6, -52, 74], rotate: [100, 0] },
    SA: { box: [-92, -56, -33, 13], rotate: [60, 0] },
    OC: { box: [110, -48, 195, 15], rotate: [-160, 0] },
  };
  const TINY_PX = 26; // surface (px², pour une carte de 1100 px) sous laquelle un pays reçoit une pastille
  const STROKE = .6;  // épaisseur des frontières à l'écran (px)

  function boxGeom([w, s, e, n]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const x = w + (e - w) * i / 8; pts.push([x, s], [x, n]); }
    for (let i = 0; i <= 8; i++) { const y = s + (n - s) * i / 8; pts.push([w, y], [e, y]); }
    return { type: 'MultiPoint', coordinates: pts };
  }

  // Les géométries ne changent jamais : on les décode une seule fois.
  let FEATS = null, DECOR = null;
  function features() {
    if (!FEATS) {
      FEATS = topojson.feature(WORLD, WORLD.objects.countries).features;
      DECOR = topojson.feature(WORLD, WORLD.objects.decor);
    }
    return { feats: FEATS, decor: DECOR };
  }

  class MapView {
    constructor(host, { zone = 'ALL', inZone = () => true, onClick, onPoint, markers = true, continents = true, tip, onZoom, onZoomEnd, onBuild }) {
      this.continents = continents;
      this.host = host; this.zone = zone; this.inZone = inZone; this.onClick = onClick; this.onPoint = onPoint; this.showMarkers = markers;
      this.onZoom = onZoom; this.onZoomEnd = onZoomEnd; this.onBuild = onBuild;
      this.byId = Object.fromEntries(COUNTRIES.map(c => [c.id, c]));
      this.state = {}; this.reveal = false; this.k = 1;
      this.tip = tip || $('#tooltip'); this.tipId = null;
      this.build();
      // préchargement discret des tracés détaillés, pour que le premier zoom soit immédiat
      (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => loadHD());
    }

    build() {
      const host = this.host; host.innerHTML = '';
      const W = host.clientWidth || 800, H = host.clientHeight || 500;
      this.W = W; this.H = H;
      this.r0 = Math.max(3, Math.min(5, 5 * W / 1100));
      const z = ZONES[this.zone] || ZONES.ALL;
      const proj = d3.geoNaturalEarth1().rotate(z.rotate);
      const pad = Math.min(W, H) * .05;
      proj.fitExtent([[pad, pad], [W - pad, H - pad - 64]], z.box ? boxGeom(z.box) : { type: 'Sphere' });
      this.proj = proj;
      const path = d3.geoPath(proj); this.path = path;
      const { feats, decor } = features();

      const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'interactive' + (this.showMarkers ? '' : ' no-markers'));
      this.svg = svg;
      // Hachures pour les pays manqués
      const defs = svg.append('defs');
      // Quadrillage pour les pays bloqués (jeu Chemin)
      // identifiants préfixés par la carte : l'atlas et le jeu ont chacun les leurs (sinon Safari/Firefox
      // prennent ceux de la carte masquée et le pays reste sans remplissage)
      const pid = (host.id || 'map') + '-';
      // quadrillage fin (maille de 4 px à l'écran, quel que soit le zoom : voir 'zoom')
      this.blockPat = defs.append('pattern').attr('id', pid + 'block').attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 4).attr('height', 4).attr('patternTransform', 'rotate(45)')
        .call(p => { p.append('rect').attr('width', 4).attr('height', 4).style('fill', 'var(--land)'); p.append('rect').attr('width', .8).attr('height', 4).style('fill', 'var(--hatch)'); p.append('rect').attr('width', 4).attr('height', .8).style('fill', 'var(--hatch)'); });
      defs.append('pattern').attr('id', pid + 'hatch').attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 4).attr('height', 4).attr('patternTransform', 'rotate(45)')
        .call(p => { p.append('rect').attr('width', 4).attr('height', 4).style('fill', 'var(--land)'); p.append('rect').attr('width', 1.4).attr('height', 4).style('fill', 'var(--hatch)'); });

      const g = svg.append('g'); this.g = g;
      g.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
      g.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
      g.append('path').attr('class', 'decor').attr('d', path(decor));

      this.feats = Object.fromEntries(feats.map(f => [f.id, f]));
      this._mb = {}; this._lb = {}; this._hdp = {}; this._sig = {};
      this.paths = {}; this._ld = {}; this._hd = {}; this.hdOn = new Set();
      const countries = g.append('g').attr('stroke-width', STROKE); this.countriesG = countries;
      for (const f of feats) {
        const d = path(f); this._ld[f.id] = d;
        const el = countries.append('path').attr('d', d).attr('class', 'country' + this.ctClass(f.id)).node();
        el.__id = f.id; this.paths[f.id] = el;
      }
      // Micro-États sans contour dans la carte légère : forme vide, remplie par les tracés détaillés au zoom
      for (const c of COUNTRIES) if (!this.paths[c.id]) {
        const el = countries.append('path').attr('d', '').attr('class', 'country' + this.ctClass(c.id)).node();
        el.__id = c.id; this.paths[c.id] = el; this._ld[c.id] = '';
      }

      // Pastilles pour les micro-États (et pays sans tracé)
      this.markers = {}; this.centroids = {}; this._msz = {};
      const mk = g.append('g').attr('stroke-width', 1.5); this.mk = mk; // contour de 1,5 px à l'écran
      for (const c of COUNTRIES) {
        const f = this.feats[c.id];
        let pt, tiny = !f;
        if (f) {
          tiny = path.area(f) < TINY_PX * Math.pow(W / 1100, 2);
          const cen = path.centroid(f);
          pt = cen;
          if (tiny) {
            const ll = proj([c.ll[1], c.ll[0]]);
            if (ll && Math.hypot(ll[0] - cen[0], ll[1] - cen[1]) < 40) pt = ll;
          } else if (f.geometry.type === 'MultiPolygon') {
            // centre visuel : celui du plus grand polygone
            let best = 0;
            for (const poly of f.geometry.coordinates) {
              const pf = { type: 'Polygon', coordinates: poly }, ar = path.area(pf);
              if (ar > best) { best = ar; pt = path.centroid(pf); }
            }
          }
        } else pt = proj([c.ll[1], c.ll[0]]);
        if (!pt || !isFinite(pt[0])) continue;
        this.centroids[c.id] = pt;
        if (tiny) {
          const el = mk.append('circle').attr('class', 'marker' + this.ctClass(c.id))
            .attr('cx', pt[0]).attr('cy', pt[1]).attr('r', this.r0).node();
          el.__id = c.id; this.markers[c.id] = el;
        }
      }
      this.fxLines = g.append('g').attr('class', 'fx-lines').attr('stroke-width', 1.5);
      this.fx = g.append('g');
      this.redrawFx();

      // Interactions : un seul écouteur délégué au lieu d'un par pays
      const idOf = e => e.target.__id;
      svg.on('click', e => {
        const id = idOf(e);
        if (this.onPoint) {
          // clic libre (n'importe où, même en mer) : coordonnées [lon, lat]
          const ll = this.proj.invert(d3.pointer(e, g.node()));
          if (ll && isFinite(ll[0]) && d3.geoContains({ type: 'Sphere' }, ll)) this.onPoint(ll, id);
          return;
        }
        if (id && this.inZone(id) && this.onClick) this.onClick(id, e);
      })
        .on('pointermove', e => this.hover(idOf(e), e))
        .on('pointerleave', () => this.hover(null));

      this.zoom = d3.zoom().scaleExtent([1, 120]).translateExtent([[-W * .5, -H * .5], [W * 1.5, H * 1.5]])
        .on('start', () => { this.hover(null); this.cancelLOD(); })
        .on('zoom', e => {
          const k = e.transform.k, kChanged = k !== this.k;
          this.k = k;
          g.attr('transform', e.transform);
          if (kChanged) {
            this.blockPat.attr('patternTransform', `rotate(45) scale(${1 / k})`);
            countries.attr('stroke-width', STROKE / k);
            mk.attr('stroke-width', 1.5 / k);
            this.sizeMarkers(k);
            this.fx.selectAll('text').attr('font-size', 14 / k).attr('stroke-width', 3 / k);
            this.fx.selectAll('circle[data-r]').attr('r', function () { return this.dataset.r / k; }).attr('stroke-width', 1.5 / k);
            this.fxLines.attr('stroke-width', 1.5 / k);
            if (this.onZoom) this.onZoom(k);
          }
        })
        .on('end', e => { this.sizeMarkers(e.transform.k); this.updateLOD(); if (this.onZoomEnd) this.onZoomEnd(e.transform.k); });
      svg.call(this.zoom).on('dblclick.zoom', null);
      this.k = 1;
      for (const id in this.state) this.set(id, this.state[id]);
      if (this.onBuild) this.onBuild(this);
    }

    zoomBy(f) { this.svg.transition().duration(300).call(this.zoom.scaleBy, f); }
    resetZoom() { this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity); }
    /** Cadre une région (Europe, Afrique…) sur une carte du monde */
    zoomToZone(zone) {
      const z = ZONES[zone];
      if (!z || !z.box) return this.resetZoom();
      const [[x0, y0], [x1, y1]] = this.path.bounds(boxGeom(z.box));
      const k = Math.max(1, Math.min(12, .92 / Math.max((x1 - x0) / this.W, (y1 - y0) / this.H)));
      const t = d3.zoomIdentity.translate(this.W / 2, this.H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(700).call(this.zoom.transform, t);
    }
    zoomTo(id, maxK = 6) {
      const f = this.feats[id];
      let [[x0, y0], [x1, y1]] = f ? this.path.bounds(f) : [[0, 0], [0, 0]];
      const c = this.centroids[id];
      if (!f || this.markers[id] || x1 - x0 > this.W * .9) { x0 = c[0] - 30; x1 = c[0] + 30; y0 = c[1] - 30; y1 = c[1] + 30; }
      const k = Math.min(maxK, .5 / Math.max((x1 - x0) / this.W, (y1 - y0) / this.H));
      const t = d3.zoomIdentity.translate(this.W / 2, this.H / 2).scale(Math.max(1, k)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(700).call(this.zoom.transform, t);
    }

    /** Classes de base : hors zone, ou teinte du continent */
    ctClass(id) {
      if (!this.inZone(id)) return ' off';
      const c = this.byId[id];
      return this.continents && c ? ` ct ct-${c.c}` : '';
    }
    /** état : '', 'found', 'good', 'ok', 'bad', 'missed', 'target' */
    set(id, st) {
      this.state[id] = st;
      for (const el of [this.paths[id], this.markers[id]]) {
        if (!el) continue;
        el.classList.remove('found', 'good', 'ok', 'bad', 'missed', 'target', 'focus', 'blocked');
        if (st) el.classList.add(st);
      }
    }
    flashWrong(id) {
      for (const el of [this.paths[id], this.markers[id]]) {
        if (!el) continue;
        el.classList.add('wrong-flash');
        setTimeout(() => el.classList.remove('wrong-flash'), 600);
      }
    }
    highlight(id, on) { for (const el of [this.paths[id], this.markers[id]]) el && el.classList.toggle('hl', on); }

    /** Cadre la vue sur un ensemble de pays (et éventuellement de points [lon, lat]). */
    zoomToIds(ids, pts = [], maxK = 8) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = ([a, b], [c, d]) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
      // Les pays immenses (Russie, Canada…) ne dictent pas le cadrage s'il y a d'autres pays à montrer
      const huge = id => { const b = this.mainBounds(id); return !!b && b[1][0] - b[0][0] > this.W * .3; };
      if (ids.some(id => !huge(id))) ids = ids.filter(id => !huge(id));
      for (const id of ids) {
        const f = this.feats[id], c = this.centroids[id];
        if (f && !this.markers[id]) {
          const b = this.mainBounds(id);
          // pays immenses ou à cheval sur la carte (Russie, États-Unis…) : on garde le cadre raisonnable
          if (b[1][0] - b[0][0] < this.W * .8) add(...b); else if (c) add([c[0] - 60, c[1] - 60], [c[0] + 60, c[1] + 60]);
        } else if (c) add([c[0] - 25, c[1] - 25], [c[0] + 25, c[1] + 25]);
      }
      for (const ll of pts) { const q = this.proj(ll); if (q) add([q[0] - 25, q[1] - 25], [q[0] + 25, q[1] + 25]); }
      if (!isFinite(x0)) return this.resetZoom();
      const avail = { w: this.W, h: this.H - 140 }; // place pour la saisie et le bandeau
      const k = Math.max(1, Math.min(maxK, .85 / Math.max((x1 - x0) / avail.w, (y1 - y0) / avail.h)));
      const t = d3.zoomIdentity.translate(this.W / 2, (this.H - 60) / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(650).call(this.zoom.transform, t);
    }

    /** Cadre du territoire principal (plus grand polygone) : ignore Guyane, Hawaï, île de Pâques… */
    mainBounds(id) {
      const f = this.feats[id]; if (!f) return null;
      this._mb = this._mb || {};
      if (this._mb[id]) return this._mb[id];
      let best = null, area = -1;
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const c of polys) { const g = { type: 'Polygon', coordinates: c }, a = this.path.area(g); if (a > area) { area = a; best = g; } }
      return (this._mb[id] = this.path.bounds(best));
    }

    /* ---------- Annotations : points, lignes, textes (taille constante à l'écran) ---------- */
    redrawFx() {
      const k = this.k || 1;
      this.fx.selectAll('circle[data-r]').attr('r', function () { return this.dataset.r / k; }).attr('stroke-width', 1.5 / k);
      this.fxLines.attr('stroke-width', 1.5 / k);
    }
    dot(ll, cls = '', r = 5) {
      const q = this.proj(ll); if (!q) return null;
      return this.fx.append('circle').attr('class', 'fx-dot ' + cls).attr('data-r', r).attr('cx', q[0]).attr('cy', q[1])
        .attr('r', r / this.k).attr('stroke-width', 1.5 / this.k);
    }
    /** Ligne géodésique entre deux points [lon, lat] */
    line(a, b, cls = '') { return this.fxLines.append('path').attr('class', 'fx-line ' + cls).attr('d', this.path({ type: 'LineString', coordinates: [a, b] })); }
    text(ll, str, dy = -10) {
      const q = this.proj(ll); if (!q) return null;
      return this.fx.append('text').attr('class', 'float-label').attr('x', q[0]).attr('y', q[1] + dy / this.k)
        .attr('font-size', 14 / this.k).attr('stroke-width', 3 / this.k).text(str);
    }
    /** Étiquette permanente au centre d'un pays */
    tag(id, str) {
      const c = this.centroids[id]; if (!c) return null;
      return this.fx.append('text').attr('class', 'float-label tag').attr('x', c[0]).attr('y', c[1])
        .attr('font-size', 14 / this.k).attr('stroke-width', 3 / this.k).text(str);
    }
    clearFx() { this.fx.selectAll('*').remove(); this.fxLines.selectAll('*').remove(); }

    /** Nom qui apparaît brièvement au-dessus du pays */
    label(id, text) {
      const c = this.centroids[id]; if (!c) return;
      const k = this.k;
      const t = this.fx.append('text').attr('class', 'float-label').attr('x', c[0]).attr('y', c[1] - 6 / k)
        .attr('font-size', 14 / k).attr('stroke-width', 3 / k).text(text).attr('opacity', 0);
      t.transition().duration(150).attr('opacity', 1).transition().delay(900).duration(400).attr('opacity', 0).remove();
    }

    hover(id, e) {
      if (this.hoverId !== id) {
        if (this.hoverId) this.highlight(this.hoverId, false);
        this.hoverId = id;
        if (id && this.inZone(id)) this.highlight(id, true);
      }
      const st = id && this.state[id];
      if (!id || !this.inZone(id) || !(this.reveal || (st && st !== 'target'))) { this.tip.hidden = true; return; }
      if (this.tipId !== id) {
        const c = this.byId[id];
        this.tip.innerHTML = `<img src="flags/thumb/${c.a2}.webp" alt=""><span>${c.n}</span>`;
        this.tipId = id;
        this.rect = this.host.getBoundingClientRect();
      }
      this.tip.hidden = false;
      this.tip.style.transform = `translate(${e.clientX - this.rect.left}px, ${e.clientY - this.rect.top}px) translate(-50%, calc(-100% - 12px))`;
    }
  }

  /* ---------- Pastilles des micro-États ----------
     Taille constante à l'écran ; elles disparaissent dès que le vrai contour du pays est assez grand
     pour être vu et touché, pour ne jamais le cacher. */
  const MAX_K = 120;      // zoom maximal de la carte
  const MIN_NO_SHAPE = 3; // rayon minimal (px) des pays sans aucun contour (Vatican, Tuvalu)
  MapView.prototype.markerSize = function (id) {
    // plus grande dimension du pays sur la carte (zoom ×1), d'après le tracé le plus précis disponible
    if (this._msz[id] != null) return this._msz[id];
    if (!HD && !this.feats[id]) return 0;
    const f = (HD && HD[id]) || this.feats[id];
    let size = 0;
    // taille de la plus grande île (un archipel dispersé comme Kiribati n'est pas « grand » pour autant)
    if (f && f.geometry) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let best = -1;
      for (const c of polys) {
        const g = { type: 'Polygon', coordinates: c }, a = this.path.area(g);
        if (a > best) { best = a; const b = this.path.bounds(g); if (isFinite(b[0][0])) size = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]); }
      }
    }
    // pays sans aucun contour (Vatican, Tuvalu) : la pastille reste toujours
    if (HD) this._msz[id] = size; // valeur définitive une fois les tracés détaillés chargés
    return size;
  };
  /** Pastille pleine tant que l'île est trop petite pour être vue ; dès que l'île apparaît à l'écran
      (3 px), la pastille rétrécit progressivement et disparaît quand l'île atteint 12 px. */
  const ISLAND_SHOWS = 3, ISLAND_SEEN = 12;
  MapView.prototype.sizeMarkers = function (k) {
    for (const id in this.markers) {
      const el = this.markers[id], size = this.markerSize(id);
      // rayon à l'écran (px) ; pays sans aucun contour (Vatican, Tuvalu) : jamais sous 3 px
      let rs = size ? this.r0 * Math.max(0, Math.min(1, (ISLAND_SEEN - size * k) / (ISLAND_SEEN - ISLAND_SHOWS))) : Math.max(MIN_NO_SHAPE, this.r0 * Math.max(0, 1 - Math.log(k) / Math.log(MAX_K)));
      el.setAttribute('r', rs / k);
      el.setAttribute('stroke-width', Math.min(1.5, rs * .3) / k); // contour proportionné aux petites pastilles
      el.style.display = rs < .6 ? 'none' : '';
    }
  };

  /* ---------- Niveau de détail ----------
     Vue d'ensemble : tracés légers (1:50 M). En zoomant, seuls les pays visibles à l'écran passent
     sur les tracés détaillés (1:10 M), chargés à la première utilisation : la carte reste fluide. */
  const LOD_K = 2.2;
  // Paliers de finesse : écart minimal entre deux points ≈ 1,5 px à l'écran (0 = tracé complet)
  const LEVELS = [[14, 0], [7, .2], [4, .35], [LOD_K, .6]];
  const tolFor = k => LEVELS.find(([kk]) => k >= kk)[1];
  let HD = null, hdLoading = null;
  function loadHD() {
    if (HD) return Promise.resolve(HD);
    if (!hdLoading) hdLoading = new Promise(res => {
      const done = () => { HD = Object.fromEntries(topojson.feature(WORLD_HD, WORLD_HD.objects.countries).features.map(f => [f.id, f])); res(HD); };
      if (window.WORLD_HD) return done();
      const sc = document.createElement('script');
      sc.src = 'data/world-hd.js'; sc.onload = done; sc.onerror = () => { hdLoading = null; };
      document.head.append(sc);
    });
    return hdLoading;
  }
  /** Allège un tracé SVG « M…L…Z » : retire les points à moins de `tol` px du précédent */
  function thin(d, tol) {
    return d.split('M').filter(Boolean).map(ring => {
      const pts = ring.replace(/Z/g, '').split('L');
      const kept = [pts[0]]; let [lx, ly] = pts[0].split(',').map(Number);
      for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i].split(',').map(Number); if (Math.abs(x - lx) + Math.abs(y - ly) >= tol) { kept.push(pts[i]); lx = x; ly = y; } }
      return kept.length >= 3 ? 'M' + kept.join('L') + 'Z' : '';
    }).join('');
  }
  /** Découpe un pays détaillé en morceaux (îles, enclaves) : tracé fin, tracé allégé, cadre */
  MapView.prototype.hdParts = function (id) {
    this._hdp = this._hdp || {};
    if (this._hdp[id]) return this._hdp[id];
    const g = HD[id].geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return (this._hdp[id] = polys.map(c => {
      const poly = { type: 'Polygon', coordinates: c }, fine = this.path(poly) || '';
      return { fine, coarse: thin(fine, .9), lv: {}, b: this.path.bounds(poly) };
    }));
  };
  /** Planifie la mise à jour du détail : découpée en tranches de ~6 ms, annulée si un zoom reprend */
  MapView.prototype.updateLOD = function () {
    this.cancelLOD();
    const job = this._lodJob = { ids: null, i: 0 };
    const step = () => {
      if (this._lodJob !== job || !this.svg.node().isConnected) return;
      if (!job.ids && !this.lodSetup(job)) return;
      const t0 = performance.now();
      while (job.i < job.ids.length && performance.now() - t0 < 6) this.lodOne(job, job.ids[job.i++]);
      if (job.i < job.ids.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  MapView.prototype.cancelLOD = function () { this._lodJob = null; };
  MapView.prototype.lodSetup = function (job) {
    const k = d3.zoomTransform(this.svg.node()).k;
    if (k < LOD_K) { for (const id of this.hdOn) this.paths[id].setAttribute('d', this._ld[id]); this.hdOn.clear(); this._sig = {}; return false; }
    if (!HD) { const me = this; loadHD().then(() => me.svg.node().isConnected && me.updateLOD()); return false; }
    // fenêtre visible en coordonnées de carte (avec une marge)
    const t = d3.zoomTransform(this.svg.node()), mx = this.W * .25 / k, my = this.H * .25 / k;
    const x0 = -t.x / k - mx, x1 = (this.W - t.x) / k + mx, y0 = -t.y / k - my, y1 = (this.H - t.y) / k + my;
    job.k = k; job.inView = b => b[1][0] >= x0 && b[0][0] <= x1 && b[1][1] >= y0 && b[0][1] <= y1;
    this._lb = this._lb || {}; this._sig = this._sig || {};
    job.ids = Object.keys(this.paths);
    return true;
  };
  MapView.prototype.lodOne = function (job, id) {
    const k = job.k, inView = job.inView;
    {
      const src = this.feats[id] || HD[id];
      if (!src) return; // Vatican, Tuvalu : aucun tracé, la pastille suffit
      const lb = this._lb[id] || (this._lb[id] = this.path.bounds(src));
      let sig = '';
      if (HD[id] && inView(lb)) {
        // détail seulement pour les morceaux visibles ; les parties lointaines restent allégées
        const parts = this.hdParts(id), vis = parts.map(q => inView(q.b));
        if (vis.some(Boolean)) {
          const tol = tolFor(k);
          sig = tol + ':' + vis.map(v => (v ? 1 : 0)).join('');
          const at = q => (tol ? (q.lv[tol] ??= thin(q.fine, tol)) : q.fine);
          if (this._sig[id] !== sig) this.paths[id].setAttribute('d', parts.map((q, i) => (vis[i] ? at(q) : q.coarse)).join(''));
        }
      }
      if (sig) { this.hdOn.add(id); this._sig[id] = sig; }
      else if (this.hdOn.has(id)) { this.paths[id].setAttribute('d', this._ld[id]); this.hdOn.delete(id); delete this._sig[id]; }
    }
  };

  /** Petite carte statique de l'accueil (dessinée une seule fois, sans animation). */
  MapView.drawStatic = function (host) {
    const W = 1000, H = 500;
    const proj = d3.geoNaturalEarth1().rotate([-11, 0]).fitExtent([[2, 2], [W - 2, H - 2]], { type: 'Sphere' });
    const path = d3.geoPath(proj);
    const { feats, decor } = features();
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><path class="grat" d="${path(d3.geoGraticule10())}"/><path d="${path(decor)}"/>${feats.map(f => `<path d="${path(f)}"/>`).join('')}</svg>`;
  };

  window.MapView = MapView;
})();
