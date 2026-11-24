/* Carte interactive (SVG + d3) : zoom/déplacement, micro-États en pastilles, animations. */
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
  const TINY_PX = 26; // surface (px²) en dessous de laquelle un pays reçoit une pastille

  function boxGeom([w, s, e, n]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const x = w + (e - w) * i / 8; pts.push([x, s], [x, n]); }
    for (let i = 0; i <= 8; i++) { const y = s + (n - s) * i / 8; pts.push([w, y], [e, y]); }
    return { type: 'MultiPoint', coordinates: pts };
  }

  class MapView {
    constructor(host, { zone = 'ALL', inZone, onClick }) {
      this.host = host; this.zone = zone; this.inZone = inZone; this.onClick = onClick;
      this.byId = Object.fromEntries(COUNTRIES.map(c => [c.id, c]));
      this.state = {}; this.reveal = false; this.k = 1;
      this.tip = $('#tooltip');
      this.build();
    }

    build() {
      const host = this.host; host.innerHTML = '';
      const W = host.clientWidth || 800, H = host.clientHeight || 500;
      this.W = W; this.H = H;
      this.r0 = Math.max(3, Math.min(5, 5 * W / 1100));
      const z = ZONES[this.zone] || ZONES.ALL;
      const proj = d3.geoNaturalEarth1().rotate(z.rotate);
      const pad = Math.min(W, H) * .06;
      const fitTo = z.box ? boxGeom(z.box) : { type: 'Sphere' };
      proj.fitExtent([[pad, pad + 10], [W - pad, H - pad - 70]], fitTo);
      this.proj = proj;
      const path = d3.geoPath(proj); this.path = path;

      const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'interactive');
      this.svg = svg;
      const defs = svg.append('defs');
      const rg = defs.append('radialGradient').attr('id', 'oceanGrad').attr('cx', '50%').attr('cy', '40%').attr('r', '65%');
      rg.append('stop').attr('offset', '0%').attr('stop-color', '#17336f');
      rg.append('stop').attr('offset', '100%').attr('stop-color', '#0a1840');

      const g = svg.append('g'); this.g = g;
      g.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
      g.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
      g.append('path').attr('class', 'decor').attr('d', path(topojson.feature(WORLD, WORLD.objects.decor)));

      const feats = topojson.feature(WORLD, WORLD.objects.countries).features;
      this.feats = Object.fromEntries(feats.map(f => [f.id, f]));
      const self = this;
      this.paths = {};
      g.append('g').selectAll('path').data(feats).join('path')
        .attr('d', path).attr('class', d => 'country' + (this.inZone(d.id) ? '' : ' off'))
        .attr('style', d => `--cc:var(--c-${this.byId[d.id].c})`)
        .each(function (d) { self.paths[d.id] = this; });

      // Pastilles pour les micro-États (et pays sans tracé)
      this.markers = {}; this.centroids = {};
      const mk = g.append('g');
      for (const c of COUNTRIES) {
        const f = this.feats[c.id];
        let pt, tiny = !f;
        if (f) {
          const a = path.area(f);
          tiny = a < TINY_PX * Math.pow(W / 1100, 2);
          pt = tiny ? (proj([c.ll[1], c.ll[0]]) || path.centroid(f)) : path.centroid(f);
          // centre visuel : on préfère le plus grand polygone
          if (!tiny && f.geometry.type === 'MultiPolygon') {
            let best = 0;
            for (const poly of f.geometry.coordinates) {
              const pf = { type: 'Polygon', coordinates: poly }, ar = path.area(pf);
              if (ar > best) { best = ar; pt = path.centroid(pf); }
            }
          }
          if (tiny && Math.hypot(...pt.map((v, i) => v - path.centroid(f)[i])) > 40) pt = path.centroid(f);
        } else pt = proj([c.ll[1], c.ll[0]]);
        if (!pt || !isFinite(pt[0])) continue;
        this.centroids[c.id] = pt;
        if (tiny) {
          const el = mk.append('circle').attr('class', 'marker' + (this.inZone(c.id) ? '' : ' off'))
            .attr('cx', pt[0]).attr('cy', pt[1]).attr('r', this.r0).attr('style', `--cc:var(--c-${c.c})`).datum({ id: c.id }).node();
          this.markers[c.id] = el;
        }
      }
      this.fx = g.append('g');

      // Interactions
      const hit = sel => sel
        .on('click', (e, d) => { if (this.inZone(d.id)) this.onClick && this.onClick(d.id, e); })
        .on('pointermove', (e, d) => this.hover(d.id, e))
        .on('pointerleave', () => this.hover(null));
      hit(g.selectAll('path.country')); hit(mk.selectAll('circle'));

      this.zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[-W * .5, -H * .5], [W * 1.5, H * 1.5]])
        .on('zoom', e => {
          this.k = e.transform.k;
          g.attr('transform', e.transform);
          mk.selectAll('circle').attr('r', this.r0 / Math.pow(this.k, .6));
          this.fx.selectAll('text').attr('font-size', 15 / this.k);
          this.hover(null);
        });
      svg.call(this.zoom).on('dblclick.zoom', null);
      for (const id in this.state) this.set(id, this.state[id]);
    }

    zoomBy(f) { this.svg.transition().duration(350).call(this.zoom.scaleBy, f); }
    resetZoom() { this.svg.transition().duration(600).call(this.zoom.transform, d3.zoomIdentity); }
    zoomTo(id, maxK = 6) {
      const f = this.feats[id];
      let [[x0, y0], [x1, y1]] = f ? this.path.bounds(f) : [[0, 0], [0, 0]];
      const c = this.centroids[id];
      if (!f || this.markers[id] || x1 - x0 > this.W * .9) { x0 = c[0] - 30; x1 = c[0] + 30; y0 = c[1] - 30; y1 = c[1] + 30; }
      const k = Math.min(maxK, .5 / Math.max((x1 - x0) / this.W, (y1 - y0) / this.H));
      const t = d3.zoomIdentity.translate(this.W / 2, this.H / 2).scale(Math.max(1, k)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(900).call(this.zoom.transform, t);
    }

    /** état : '', 'found', 'good', 'ok', 'bad', 'missed', 'target' */
    set(id, st) {
      this.state[id] = st;
      for (const el of [this.paths[id], this.markers[id]]) {
        if (!el) continue;
        el.classList.remove('found', 'good', 'ok', 'bad', 'missed', 'target');
        if (st) el.classList.add(st);
      }
    }
    flashWrong(id) {
      for (const el of [this.paths[id], this.markers[id]]) {
        if (!el) continue;
        el.classList.remove('wrong-flash'); void el.getBBox(); el.classList.add('wrong-flash');
        setTimeout(() => el.classList.remove('wrong-flash'), 750);
      }
    }
    highlight(id, on) { for (const el of [this.paths[id], this.markers[id]]) el && el.classList.toggle('hl', on); }

    /** Onde + nom qui s'envole depuis le centre du pays */
    celebrate(id, color = '#33d6a6', label) {
      const c = this.centroids[id]; if (!c) return;
      const k = this.k;
      const ring = this.fx.append('circle').attr('class', 'pulse').attr('cx', c[0]).attr('cy', c[1])
        .attr('r', 2 / k).attr('stroke', color).attr('opacity', 1);
      ring.transition().duration(900).ease(d3.easeCubicOut).attr('r', 40 / k).attr('opacity', 0).remove();
      if (label) {
        const t = this.fx.append('text').attr('class', 'float-label').attr('x', c[0]).attr('y', c[1])
          .attr('font-size', 15 / k).text(label).attr('opacity', 0);
        t.transition().duration(250).attr('opacity', 1).attr('y', c[1] - 8 / k)
          .transition().delay(700).duration(700).attr('y', c[1] - 28 / k).attr('opacity', 0).remove();
      }
    }

    hover(id, e) {
      if (this.hoverId && this.hoverId !== id) this.highlight(this.hoverId, false);
      this.hoverId = id;
      if (!id || !this.inZone(id)) { this.tip.hidden = true; return; }
      this.highlight(id, true);
      const st = this.state[id];
      if (!(this.reveal || (st && st !== 'target'))) { this.tip.hidden = true; return; }
      const c = this.byId[id];
      this.tip.innerHTML = `<img src="flags/${c.a2}.svg" alt=""><span>${c.n}</span>`;
      const r = this.host.getBoundingClientRect();
      this.tip.style.left = (e.clientX - r.left) + 'px';
      this.tip.style.top = (e.clientY - r.top) + 'px';
      this.tip.hidden = false;
    }
  }

  window.MapView = MapView;
})();
