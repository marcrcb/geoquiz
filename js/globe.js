/* Globe animé de l'accueil (canvas, orthographique, déplaçable au doigt ou à la souris). */
(function () {
  const COLORS = { AF: '#ffb347', EU: '#6c8cff', AS: '#ff6b9a', NA: '#33d6a6', SA: '#b388ff', OC: '#4cc9f0' };
  let started = false;

  function start() {
    if (started) return; started = true;
    const canvas = document.getElementById('globe');
    const ctx = canvas.getContext('2d');
    const contOf = Object.fromEntries(COUNTRIES.map(c => [c.id, c.c]));
    const land = topojson.feature(WORLD, WORLD.objects.countries).features;
    const decor = topojson.feature(WORLD, WORLD.objects.decor);
    const proj = d3.geoOrthographic().clipAngle(90).precision(.6);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule10();
    let size = 0, rot = [-10, -18], vel = .18, dragging = false, highlight = null, hlT = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = canvas.clientWidth;
      canvas.width = size * dpr; canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      proj.translate([size / 2, size / 2]).scale(size / 2 - 6);
    }
    resize(); addEventListener('resize', resize);

    // Un pays au hasard clignote de temps en temps
    function pickHighlight() {
      const visible = land.filter(f => d3.geoDistance(d3.geoCentroid(f), [-rot[0] - 40, -rot[1]]) < 1.1);
      highlight = visible.length ? visible[(Math.random() * visible.length) | 0].id : null; hlT = 0;
    }

    function draw() {
      if (!dragging) rot[0] += vel;
      proj.rotate(rot);
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size * .38, size * .32, size * .05, size / 2, size / 2, size / 2);
      g.addColorStop(0, '#1d3d84'); g.addColorStop(1, '#0a1840');
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(140,180,255,.12)'; ctx.lineWidth = .6; ctx.stroke();
      ctx.beginPath(); path(decor); ctx.fillStyle = '#2a3b6e'; ctx.fill();
      for (const f of land) {
        ctx.beginPath(); path(f);
        const col = COLORS[contOf[f.id]];
        if (f.id === highlight) {
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = .35 + .65 * Math.abs(Math.sin(hlT * Math.PI));
          ctx.fill(); ctx.globalAlpha = 1;
        } else { ctx.fillStyle = col; ctx.globalAlpha = .82; ctx.fill(); ctx.globalAlpha = 1; }
        ctx.strokeStyle = 'rgba(10,20,50,.7)'; ctx.lineWidth = .5; ctx.stroke();
      }
      // reflet
      const s = ctx.createRadialGradient(size * .32, size * .28, 0, size * .32, size * .28, size * .55);
      s.addColorStop(0, 'rgba(255,255,255,.22)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = s; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(160,200,255,.35)'; ctx.stroke();
      hlT += .012; if (hlT > 2) pickHighlight();
      if (document.getElementById('home').classList.contains('active')) requestAnimationFrame(draw);
      else running = false;
    }
    let running = false;
    function run() { if (!running) { running = true; requestAnimationFrame(draw); } }
    window.Globe.run = run;

    let last = null;
    canvas.addEventListener('pointerdown', e => { dragging = true; last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const k = 120 / proj.scale();
      rot[0] += (e.clientX - last[0]) * k * 1.5; rot[1] = Math.max(-60, Math.min(60, rot[1] - (e.clientY - last[1]) * k * 1.5));
      vel = (e.clientX - last[0]) * k * .6 || vel; last = [e.clientX, e.clientY];
    });
    const up = () => { dragging = false; vel = Math.sign(vel || 1) * Math.min(2, Math.max(.18, Math.abs(vel))); setTimeout(() => (vel = Math.sign(vel) * .18), 1500); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    pickHighlight();
    run();
  }

  window.Globe = { start, run() {} };
})();
