/* Outils partagés : normalisation des réponses, stockage, sons, confettis. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /** Clé de comparaison : sans accents, ponctuation, articles ni espaces. */
  function key(s) {
    let t = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, ' ').trim();
    t = t.replace(/\b(saint|sainte|ste)\b/g, 'st');
    t = t.replace(/^(le|la|les|l|el|the|republique de|republique du|rep) /, '');
    return t.replace(/ /g, '');
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const fmt = s => { s = Math.max(0, Math.round(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('geoquiz:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('geoquiz:' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };

  /* ---------- Sons synthétisés (aucun fichier à télécharger) ---------- */
  let ctx = null;
  let muted = store.get('muted', false);
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, t0, dur, type = 'sine', vol = .18) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + t0);
    g.gain.setValueAtTime(0, c.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + .01);
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + t0 + dur);
    o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + .05);
  }
  const sfx = {
    good(combo = 0) { if (muted) return; const b = 520 * Math.pow(1.06, Math.min(combo, 12)); tone(b, 0, .12, 'triangle'); tone(b * 1.5, .07, .18, 'triangle'); },
    bad() { if (muted) return; tone(180, 0, .18, 'sawtooth', .08); tone(140, .09, .22, 'sawtooth', .08); if (navigator.vibrate) navigator.vibrate(40); },
    click() { if (muted) return; tone(800, 0, .05, 'square', .04); },
    skip() { if (muted) return; tone(330, 0, .12, 'triangle', .1); tone(260, .08, .15, 'triangle', .1); },
    win() { if (muted) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .12, .35, 'triangle', .16)); },
    end() { if (muted) return; [392, 330, 262].forEach((f, i) => tone(f, i * .14, .3, 'triangle', .14)); },
    get muted() { return muted; },
    toggle() { muted = !muted; store.set('muted', muted); return muted; },
  };

  /* ---------- Confettis ---------- */
  const cv = document.getElementById('confetti');
  const cx = cv.getContext('2d');
  let parts = [], raf = 0;
  const COLORS = ['#ffc94a', '#33d6a6', '#4cc9f0', '#ff6b9a', '#8f7bff', '#ff8a5b', '#ffffff'];
  function confetti({ x = .5, y = .4, n = 140, spread = 1 } = {}) {
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 9) * spread;
      parts.push({ x: x * innerWidth, y: y * innerHeight, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: 4 + Math.random() * 6,
        c: COLORS[(Math.random() * COLORS.length) | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 1, shape: Math.random() < .3 });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += .25; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= .006;
      cx.save(); cx.globalAlpha = Math.min(1, p.life * 2); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c;
      if (p.shape) { cx.beginPath(); cx.arc(0, 0, p.r / 2, 0, 7); cx.fill(); } else cx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      cx.restore();
    }
    raf = parts.length ? requestAnimationFrame(step) : (cx.clearRect(0, 0, innerWidth, innerHeight), 0);
  }

  window.U = { $, $$, key, shuffle, fmt, store, sfx, confetti };
})();
