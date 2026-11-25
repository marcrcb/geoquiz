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
    constructor(host, { zone = 'ALL', inZone = () => true, onClick, onPoint, markers = true, tip, onZoom, onZoomEnd, onBuild }) {
      this.host = host; this.zone = zone; this.inZone = inZone; this.onClick = onClick; this.onPoint = onPoint; this.showMarkers = markers;
      this.onZoom = onZoom; this.onZoomEnd = onZoomEnd; this.onBuild = onBuild;
      this.byId = Object.fromEntries(COUNTRIES.map(c => [c.id, c]));
      this.state = {}; this.reveal = false; this.k = 1;
      this.tip = tip || $('#tooltip'); this.tipId = null;
      this.build();
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
      svg.append('defs').append('pattern').attr('id', 'hatch').attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 4).attr('height', 4).attr('patternTransform', 'rotate(45)')
        .call(p => { p.append('rect').attr('width', 4).attr('height', 4).attr('fill', '#2c2c2c'); p.append('rect').attr('width', 1.4).attr('height', 4).attr('fill', '#9a9a9a'); });

      const g = svg.append('g'); this.g = g;
      g.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
      g.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
      g.append('path').attr('class', 'decor').attr('d', path(decor));

      this.feats = Object.fromEntries(feats.map(f => [f.id, f]));
      this._mb = {};
      this.paths = {};
      const countries = g.append('g').attr('stroke-width', STROKE); this.countriesG = countries;
      for (const f of feats) {
        const el = countries.append('path').attr('d', path(f)).attr('class', 'country' + (this.inZone(f.id) ? '' : ' off')).node();
        el.__id = f.id; this.paths[f.id] = el;
      }

      // Pastilles pour les micro-États (et pays sans tracé)
      this.markers = {}; this.centroids = {};
      const mk = g.append('g').attr('stroke-width', 1); this.mk = mk;
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
          const el = mk.append('circle').attr('class', 'marker' + (this.inZone(c.id) ? '' : ' off'))
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

      this.zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[-W * .5, -H * .5], [W * 1.5, H * 1.5]])
        .on('start', () => this.hover(null))
        .on('zoom', e => {
          const k = e.transform.k, kChanged = k !== this.k;
          this.k = k;
          g.attr('transform', e.transform);
          if (kChanged) {
            countries.attr('stroke-width', STROKE / k);
            mk.attr('stroke-width', 1 / k);
            const r = this.r0 / Math.pow(k, .6);
            for (const id in this.markers) this.markers[id].setAttribute('r', r);
            this.fx.selectAll('text').attr('font-size', 14 / k).attr('stroke-width', 3 / k);
            this.fx.selectAll('circle[data-r]').attr('r', function () { return this.dataset.r / k; }).attr('stroke-width', 1.5 / k);
            this.fxLines.attr('stroke-width', 1.5 / k);
            if (this.onZoom) this.onZoom(k);
          }
        })
        .on('end', e => { if (this.onZoomEnd) this.onZoomEnd(e.transform.k); });
      svg.call(this.zoom).on('dblclick.zoom', null);
      this.k = 1;
      for (const id in this.state) this.set(id, this.state[id]);
      if (this.onBuild) this.onBuild(this);
    }

    zoomBy(f) { this.svg.transition().duration(300).call(this.zoom.scaleBy, f); }
    resetZoom() { this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity); }
    zoomTo(id, maxK = 6) {
      const f = this.feats[id];
      let [[x0, y0], [x1, y1]] = f ? this.path.bounds(f) : [[0, 0], [0, 0]];
      const c = this.centroids[id];
      if (!f || this.markers[id] || x1 - x0 > this.W * .9) { x0 = c[0] - 30; x1 = c[0] + 30; y0 = c[1] - 30; y1 = c[1] + 30; }
      const k = Math.min(maxK, .5 / Math.max((x1 - x0) / this.W, (y1 - y0) / this.H));
      const t = d3.zoomIdentity.translate(this.W / 2, this.H / 2).scale(Math.max(1, k)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(700).call(this.zoom.transform, t);
    }

    /** état : '', 'found', 'good', 'ok', 'bad', 'missed', 'target' */
    set(id, st) {
      this.state[id] = st;
      for (const el of [this.paths[id], this.markers[id]]) {
        if (!el) continue;
        el.classList.remove('found', 'good', 'ok', 'bad', 'missed', 'target', 'focus');
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
