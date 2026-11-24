/* Moteur des trois jeux : saisie libre (liste) ou question par question (série). */
(function () {
  const { $, $$, key, shuffle, fmt, store, sfx, confetti } = U;

  const ZONES = [
    ['ALL', 'Monde', '🌍'], ['EU', 'Europe', '🏰'], ['AF', 'Afrique', '🦁'], ['AS', 'Asie', '🏯'],
    ['NA', 'Amérique du Nord', '🗽'], ['SA', 'Amérique du Sud', '🦜'], ['OC', 'Océanie', '🏝️'],
  ];
  const ZONE_NAME = Object.fromEntries(ZONES.map(z => [z[0], z[1]]));
  const CONT_ORDER = ['EU', 'AF', 'AS', 'NA', 'SA', 'OC'];

  const GAMES = {
    map: {
      title: 'La carte du monde', emoji: '🗺️', desc: 'Retrouve les pays sur la carte interactive.',
      modes: [
        { id: 'type', name: 'Tout nommer', desc: 'Tape les noms des pays : chacun s’illumine sur la carte.', sec: 5 },
        { id: 'click', name: 'Localiser', desc: 'Un pays est demandé : clique dessus. 3 essais par pays.', sec: 7 },
      ],
      answers: c => [c.n, ...c.alt], placeholder: 'Tape un pays…',
    },
    flags: {
      title: 'Les drapeaux', emoji: '🚩', desc: 'Reconnais les drapeaux du monde entier.',
      modes: [
        { id: 'grid', name: 'Tous les drapeaux', desc: 'Tous les drapeaux affichés : tape les pays dans l’ordre que tu veux.', sec: 4 },
        { id: 'solo', name: 'Un par un', desc: 'Un drapeau à la fois, avec indices et possibilité de passer.', sec: 6 },
      ],
      answers: c => [c.n, ...c.alt], placeholder: 'Quel est ce pays ?',
    },
    capitals: {
      title: 'Les capitales', emoji: '🏛️', desc: 'Trouve la capitale de chaque pays.',
      modes: [
        { id: 'grid', name: 'Liste complète', desc: 'Tous les pays par continent : tape les capitales dans le désordre.', sec: 5 },
        { id: 'solo', name: 'Un par un', desc: 'Un pays à la fois, avec indices et possibilité de passer.', sec: 7 },
      ],
      answers: c => [c.cap, ...c.capAlt], placeholder: 'Tape une capitale…',
    },
  };

  const zoneItems = z => COUNTRIES.filter(c => z === 'ALL' || c.c === z);
  const timeFor = (game, mode, zone) => {
    const m = GAMES[game].modes.find(x => x.id === mode);
    return Math.max(2, Math.ceil(zoneItems(zone).length * m.sec / 60)) * 60;
  };
  const recKey = cfg => `rec:${cfg.game}:${cfg.mode}:${cfg.zone}:${cfg.timer}`;

  let S = null; // état de la partie en cours
  let map = null;

  const el = {
    body: $('#gameBody'), mapStage: $('#mapStage'), gridStage: $('#gridStage'), grid: $('#grid'), soloStage: $('#soloStage'),
    form: $('#answerForm'), input: $('#answer'), box: $('.answer-box'), toasts: $('#toasts'),
    score: $('#gScore'), total: $('#gTotal'), timer: $('#gTimer'), timerBox: $('#gTimerBox'), progress: $('#gProgress'),
    combo: $('#combo'), ask: $('#ask'), legend: $('#mapLegend'), review: $('#reviewBar'),
    hint: $('#hintBtn'), skip: $('#skipBtn'),
  };

  /** setTimeout lié à la partie en cours : ignoré si une autre partie a démarré entre-temps. */
  function later(fn, ms) { const s = S; return setTimeout(() => { if (S === s && !s.ended) fn(); }, ms); }

  /* =================== Démarrage =================== */
  function start(cfg) {
    stop();
    const G = GAMES[cfg.game];
    const items = zoneItems(cfg.zone);
    S = {
      cfg, G, items, total: items.length, found: new Set(), res: {}, score: 0, done: 0,
      streak: 0, bestStreak: 0, lastFind: 0, t0: performance.now(), limit: cfg.timer === 'timed' ? timeFor(cfg.game, cfg.mode, cfg.zone) : 0,
      ended: false, seq: null, cur: null, tries: 0, hints: 0, busy: false, pending: null,
    };
    S.keys = new Map(items.map(c => [c.id, G.answers(c).map(key)]));
    $('#gTitle').textContent = G.title;
    $('#gSub').textContent = `${G.modes.find(m => m.id === cfg.mode).name} · ${ZONE_NAME[cfg.zone]}`;
    el.total.textContent = '/' + S.total;
    el.score.textContent = '0';
    el.progress.style.width = '0';
    el.review.hidden = true; el.ask.hidden = true; el.combo.hidden = true;
    el.mapStage.hidden = el.gridStage.hidden = el.soloStage.hidden = true;
    el.form.hidden = cfg.mode === 'click';
    el.input.value = ''; el.input.placeholder = G.placeholder;
    el.hint.hidden = el.skip.hidden = cfg.mode !== 'solo';
    el.toasts.innerHTML = '';
    $('#giveUpBtn').hidden = false;
    App.show('game');

    if (cfg.game === 'map') {
      el.mapStage.hidden = false;
      const zone = cfg.zone, contOf = Object.fromEntries(COUNTRIES.map(c => [c.id, c.c])), inZone = id => zone === 'ALL' || contOf[id] === zone;
      map = new MapView($('#mapSvg'), { zone, inZone, onClick: onMapClick });
      buildLegend();
    } else map = null;

    if (cfg.mode === 'grid') buildGrid(cfg.game === 'capitals' ? groupByCont(items) : shuffle(items));
    if (cfg.mode === 'click' || cfg.mode === 'solo') {
      S.seq = shuffle(items);
      if (cfg.mode === 'solo') el.soloStage.hidden = false;
      next();
    }
    S.tick = setInterval(tick, 250); tick();
    if (cfg.mode !== 'click') setTimeout(() => el.input.focus(), 350);
  }

  function stop() {
    if (S) { clearInterval(S.tick); clearTimeout(S.pending); S.ended = true; }
  }

  function tick() {
    if (!S || S.ended) return;
    const el_ = (performance.now() - S.t0) / 1000;
    if (S.limit) {
      const left = S.limit - el_;
      el.timer.textContent = fmt(Math.ceil(left));
      el.timerBox.classList.toggle('warn', left <= 30);
      if (left <= 0) end('time');
    } else { el.timer.textContent = fmt(el_); el.timerBox.classList.remove('warn'); }
  }

  /* =================== Progression & retours visuels =================== */
  function scored(ok) {
    S.done++;
    if (ok) {
      S.score++;
      const now = performance.now();
      S.streak = (S.cfg.mode === 'type' || S.cfg.mode === 'grid') ? (now - S.lastFind < 6000 ? S.streak + 1 : 1) : S.streak + 1;
      S.lastFind = now;
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      if (S.streak >= 3 && S.streak % (S.streak >= 10 ? 5 : 1) === 0) showCombo(S.streak);
      if (S.streak > 0 && S.streak % 10 === 0) confetti({ y: .25, n: 60, spread: .7 });
      el.score.textContent = S.score;
      const st = el.score.parentElement; st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump');
    } else S.streak = 0;
    const p = (S.cfg.mode === 'type' || S.cfg.mode === 'grid') ? S.score : S.done;
    el.progress.style.width = (100 * p / S.total) + '%';
  }

  function showCombo(n) {
    const words = ['', '', '', 'Bien !', 'Super !', 'Génial !', 'Incroyable !', 'En feu !', 'Inarrêtable !', 'Légendaire !'];
    el.combo.textContent = `🔥 ${n} d’affilée · ${words[Math.min(n, 9)] || 'Légendaire !'}`;
    el.combo.hidden = false; el.combo.style.animation = 'none'; void el.combo.offsetWidth; el.combo.style.animation = '';
    clearTimeout(showCombo.t); showCombo.t = setTimeout(() => (el.combo.hidden = true), 1400);
  }

  function toast(c, txt, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.innerHTML = `<img src="flags/${c.a2}.svg" alt=""><span></span>`;
    t.querySelector('span').textContent = txt;
    el.toasts.prepend(t);
    while (el.toasts.children.length > 3) el.toasts.lastChild.remove();
    setTimeout(() => t.remove(), 1900);
  }
  function boxFx(cls) { el.box.classList.remove('ok', 'ko'); void el.box.offsetWidth; el.box.classList.add(cls); }

  /* =================== Mode liste (carte « Tout nommer », grilles) =================== */
  function groupByCont(items) {
    return CONT_ORDER.flatMap(c => items.filter(i => i.c === c).sort((a, b) => a.n.localeCompare(b.n, 'fr')).map((x, i) => (i === 0 ? { ...x, sep: c } : x)));
  }

  function buildGrid(list) {
    el.gridStage.hidden = false; el.gridStage.scrollTop = 0;
    const cap = S.cfg.game === 'capitals';
    el.grid.className = 'grid' + (cap ? ' capitals' : '');
    el.grid.innerHTML = '';
    S.tiles = {};
    const frag = document.createDocumentFragment();
    list.forEach((c, i) => {
      if (c.sep && S.cfg.zone === 'ALL') {
        const h = document.createElement('div'); h.className = 'grid-sep'; h.style.setProperty('--cc', `var(--c-${c.c})`);
        h.innerHTML = `<i></i>${ZONE_NAME[c.c]}`; frag.append(h);
      }
      const t = document.createElement('div');
      t.className = 'tile' + (cap ? ' cap-tile' : '');
      t.style.setProperty('--cc', `var(--c-${c.c})`);
      t.style.animationDelay = Math.min(i * 12, 900) + 'ms';
      t.innerHTML = cap
        ? `<div class="tile-inner"><img src="flags/${c.a2}.svg" alt="" loading="lazy"><div class="cap-info"><div class="cap-country"></div><div class="t-name">?</div></div></div>`
        : `<div class="tile-inner"><img src="flags/${c.a2}.svg" alt="Drapeau à deviner" loading="lazy"><div class="t-name">?</div></div>`;
      if (cap) t.querySelector('.cap-country').textContent = c.n;
      S.tiles[c.id] = t; frag.append(t);
    });
    el.grid.append(frag);
  }

  function tileSet(c, st) {
    const t = S.tiles && S.tiles[c.id]; if (!t) return;
    t.classList.remove('found', 'missed'); t.classList.add(st);
    t.querySelector('.t-name').textContent = S.cfg.game === 'capitals' ? c.cap : c.n;
  }

  function buildLegend() {
    const conts = S.cfg.zone === 'ALL' ? CONT_ORDER : [S.cfg.zone];
    el.legend.innerHTML = conts.map(c => `<div class="lg" data-c="${c}" style="--cc:var(--c-${c})"><i></i>${ZONE_NAME[c]}<span class="lg-n"></span></div>`).join('');
    updLegend();
  }
  function updLegend() {
    if (!map) return;
    for (const row of $$('.lg', el.legend)) {
      const c = row.dataset.c, all = S.items.filter(i => i.c === c);
      const n = all.filter(i => S.res[i.id] === 'good' || S.res[i.id] === 'ok' || S.found.has(i.id)).length;
      row.querySelector('.lg-n').textContent = `${n}/${all.length}`;
      row.classList.toggle('done', n === all.length);
    }
  }

  function listInput(force) {
    clearTimeout(S.pending);
    const k = key(el.input.value);
    if (!k) return;
    const cand = S.items.find(c => !S.found.has(c.id) && S.keys.get(c.id).includes(k));
    if (!cand) {
      if (force) { boxFx('ko'); sfx.bad(); }
      return;
    }
    // Si la saisie est le début d'un autre nom encore à trouver (Niger → Nigeria), on laisse le temps de finir.
    const longer = !force && S.items.some(c => c !== cand && !S.found.has(c.id) && S.keys.get(c.id).some(x => x.length > k.length && x.startsWith(k)));
    if (longer) { S.pending = later(() => listInput(true), 1100); return; }
    accept(cand);
  }

  function accept(c) {
    S.found.add(c.id); S.res[c.id] = 'good';
    el.input.value = '';
    scored(true);
    sfx.good(S.streak);
    boxFx('ok');
    const label = S.cfg.game === 'capitals' ? `${c.cap} · ${c.n}` : c.n;
    toast(c, '✓ ' + label);
    if (map) {
      map.set(c.id, 'found');
      map.celebrate(c.id, getComputedStyle(document.documentElement).getPropertyValue(`--c-${c.c}`).trim(), c.n);
      updLegend();
    }
    tileSet(c, 'found');
    if (S.found.size === S.total) later(() => end('done'), 500);
  }

  /* =================== Mode série (localiser, un par un) =================== */
  function next() {
    if (S.ended) return;
    S.cur = S.seq.find(c => !S.res[c.id]);
    S.tries = 0; S.hints = 0; S.busy = false;
    if (!S.cur) return end('done');
    const c = S.cur;
    if (S.cfg.mode === 'click') {
      el.ask.hidden = false;
      $('#askFlag').src = `flags/${c.a2}.svg`;
      $('#askName').textContent = c.n;
      $('#askTries').innerHTML = '<i></i><i></i><i></i>';
      el.ask.classList.remove('swap'); void el.ask.offsetWidth; el.ask.classList.add('swap');
    } else {
      const img = $('#soloFlag');
      img.className = ''; void img.offsetWidth;
      img.src = `flags/${c.a2}.svg`; img.alt = S.cfg.game === 'flags' ? 'Drapeau à deviner' : `Drapeau : ${c.n}`;
      img.className = 'in';
      $('.solo-flag-wrap').classList.add('wave');
      $('#soloQ').innerHTML = S.cfg.game === 'flags' ? '<small>Quel pays ?</small>' : '<small>Quelle est la capitale de…</small>';
      if (S.cfg.game === 'capitals') $('#soloQ').append(c.n);
      $('#soloHint').textContent = '';
      const r = $('#soloReveal'); r.textContent = ''; r.className = 'solo-reveal';
      el.input.value = '';
      el.input.focus({ preventScroll: true });
    }
  }

  function mainAnswer(c) { return S.cfg.game === 'capitals' ? c.cap : c.n; }

  function soloInput(force) {
    if (S.busy || !S.cur) return;
    const k = key(el.input.value);
    if (k && S.keys.get(S.cur.id).includes(k)) return soloResult(S.hints ? 'ok' : 'good');
    if (force && k) { boxFx('ko'); sfx.bad(); const img = $('#soloFlag'); img.className = ''; void img.offsetWidth; img.className = 'out-bad'; }
  }

  function soloResult(r) {
    const c = S.cur; S.busy = true; S.res[c.id] = r;
    const img = $('#soloFlag'), rev = $('#soloReveal');
    $('.solo-flag-wrap').classList.remove('wave');
    if (r === 'bad') {
      scored(false); sfx.skip();
      rev.className = 'solo-reveal bad'; rev.textContent = `→ ${mainAnswer(c)}`;
      img.className = ''; void img.offsetWidth; img.className = 'out-bad';
      later(next, 1500);
    } else {
      scored(true); sfx.good(S.streak); boxFx('ok');
      rev.className = 'solo-reveal good'; rev.textContent = `✓ ${mainAnswer(c)}`;
      el.input.value = '';
      later(() => { img.className = 'out-good'; }, 250);
      later(next, 700);
    }
  }

  function hint() {
    if (!S.cur || S.busy) return;
    const ans = mainAnswer(S.cur);
    const letters = [...ans].filter(ch => /\p{L}|\d/u.test(ch)).length;
    if (S.hints >= letters - 1) return;
    S.hints++;
    let shown = 0;
    $('#soloHint').textContent = [...ans].map(ch => {
      if (!/\p{L}|\d/u.test(ch)) return ch === ' ' ? '  ' : ch;
      return shown++ < S.hints ? ch : '_';
    }).join('');
    sfx.click();
    el.input.focus();
  }

  function onMapClick(id) {
    if (!S || S.ended || S.cfg.mode !== 'click' || S.busy || !S.cur) return;
    const c = S.cur;
    if (S.res[id] && id !== c.id) return; // pays déjà joué : rien
    if (id === c.id) {
      const r = S.tries === 0 ? 'good' : 'ok';
      S.res[c.id] = r; map.set(c.id, r);
      map.celebrate(c.id, r === 'good' ? '#33d6a6' : '#ffc94a', c.n);
      scored(true); sfx.good(S.streak); updLegend();
      S.busy = true; later(next, 450);
    } else {
      S.tries++;
      $$('#askTries i').forEach((d, i) => d.classList.toggle('used', i < S.tries));
      map.flashWrong(id);
      map.celebrate(id, '#ff6b6b', map.byId[id].n);
      sfx.bad();
      if (S.tries >= 3) revealTarget();
    }
  }

  function revealTarget() {
    const c = S.cur; S.busy = true; S.res[c.id] = 'bad';
    scored(false);
    map.set(c.id, 'target');
    const before = d3.zoomTransform(map.svg.node());
    map.zoomTo(c.id);
    later(() => {
      map.set(c.id, 'bad');
      if (!S.ended) map.svg.transition().duration(700).call(map.zoom.transform, before);
      later(next, 500);
    }, 1900);
  }

  /* =================== Fin de partie =================== */
  function end(reason) {
    if (!S || S.ended) return;
    stop();
    clearTimeout(S.pending);
    const elapsed = Math.min(S.limit || Infinity, (performance.now() - S.t0) / 1000);
    S.elapsed = elapsed;
    el.input.blur();
    // marquer les réponses manquées
    for (const c of S.items) {
      if (!S.found.has(c.id) && !S.res[c.id]) S.res[c.id] = 'missed';
      if (S.res[c.id] === 'missed') { map && map.set(c.id, 'missed'); tileSet(c, 'missed'); }
    }
    if (map) map.reveal = true;
    el.form.hidden = true; el.ask.hidden = true; el.combo.hidden = true;
    $('#giveUpBtn').hidden = true;

    const pct = Math.round(100 * S.score / S.total);
    const rk = recKey(S.cfg);
    const prev = store.get(rk, null);
    const isRec = S.score > 0 && (!prev || S.score > prev.score || (S.score === prev.score && elapsed < prev.time));
    if (isRec) store.set(rk, { score: S.score, total: S.total, time: Math.round(elapsed), date: Date.now() });
    const gbest = store.get('best:' + S.cfg.game, 0);
    if (S.cfg.zone === 'ALL' && pct > gbest) store.set('best:' + S.cfg.game, pct);
    const best = isRec ? { score: S.score, time: elapsed } : prev;

    setTimeout(() => showResults({ pct, elapsed, best, isRec, reason }), reason === 'done' ? 300 : 150);
  }

  function showResults({ pct, elapsed, best, isRec, reason }) {
    const m = $('#results');
    m.hidden = false;
    $('#rPct').textContent = '0%';
    $('#rCount').textContent = `${S.score} / ${S.total}`;
    const fg = $('#ringFg'); fg.style.transition = 'none'; fg.style.strokeDashoffset = 326.7; void fg.getBoundingClientRect();
    fg.style.transition = ''; fg.style.strokeDashoffset = 326.7 * (1 - pct / 100);
    fg.style.stroke = pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--gold)' : 'var(--coral)';
    // compteur animé
    const t0 = performance.now();
    (function count(t) { const k = Math.min(1, (t - t0) / 1500); $('#rPct').textContent = Math.round(pct * (1 - Math.pow(1 - k, 3))) + '%'; if (k < 1) requestAnimationFrame(count); })(t0);
    const stars = pct === 100 ? 3 : pct >= 75 ? 2 : pct >= 40 ? 1 : 0;
    $$('#rStars span').forEach((s, i) => { s.classList.remove('on'); void s.offsetWidth; s.classList.toggle('on', i < stars); });
    const titles = [[100, 'Parfait ! 🌍'], [90, 'Exceptionnel !'], [75, 'Excellent !'], [50, 'Bien joué !'], [25, 'Pas mal !'], [0, 'Il faut réviser !']];
    $('#rTitle').textContent = titles.find(([p]) => pct >= p)[1];
    $('#rMsg').textContent = reason === 'time' ? 'Temps écoulé !' : reason === 'done' ? 'Tout trouvé — chapeau bas.' : 'Partie terminée.';
    $('#rTime').textContent = fmt(elapsed);
    $('#rStreak').textContent = S.bestStreak;
    $('#rBest').textContent = best ? `${best.score}/${S.total}` : '—';
    $('#rBadge').hidden = !isRec;
    if (pct >= 50) { sfx.win(); confetti({ n: pct === 100 ? 320 : 150, y: .35 }); if (pct === 100) setTimeout(() => confetti({ x: .2, n: 120 }), 400), setTimeout(() => confetti({ x: .8, n: 120 }), 700); }
    else sfx.end();
  }

  function review() {
    $('#results').hidden = true;
    el.review.hidden = false;
    if (S.cfg.mode === 'solo') {
      el.soloStage.hidden = true;
      const list = S.cfg.game === 'capitals' ? groupByCont(S.items) : S.seq;
      buildGrid(list);
      for (const c of S.items) {
        const r = S.res[c.id];
        tileSet(c, r === 'good' || r === 'ok' ? 'found' : 'missed');
      }
    }
  }

  /* =================== Événements =================== */
  el.input.addEventListener('input', () => {
    if (!S || S.ended) return;
    if (S.cfg.mode === 'solo') soloInput(false); else listInput(false);
  });
  el.form.addEventListener('submit', e => {
    e.preventDefault();
    if (!S || S.ended) return;
    if (S.cfg.mode === 'solo') soloInput(true); else listInput(true);
  });
  el.hint.addEventListener('click', hint);
  el.skip.addEventListener('click', () => { if (S && !S.ended && !S.busy) soloResult('bad'); el.input.focus(); });
  $('#askSkip').addEventListener('click', () => { if (S && !S.ended && !S.busy && S.cur) revealTarget(); });
  $('#giveUpBtn').addEventListener('click', () => end('giveup'));
  $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    if (!map) return;
    const z = b.dataset.zoom; z === 'in' ? map.zoomBy(1.8) : z === 'out' ? map.zoomBy(1 / 1.8) : map.resetZoom();
  }));
  // Touche Échap : effacer la saisie
  el.input.addEventListener('keydown', e => { if (e.key === 'Escape') el.input.value = ''; });
  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (map && !el.mapStage.hidden) { const r = map.reveal; map.build(); map.reveal = r; } }, 250);
  });

  const again = () => { $('#results').hidden = true; start(S.cfg); };
  $('#rAgain').addEventListener('click', again);
  $('#reviewAgain').addEventListener('click', again);
  $('#rReview').addEventListener('click', review);
  const menu = () => { $('#results').hidden = true; stop(); App.show('home'); };
  $('#rMenu').addEventListener('click', menu);
  $('#reviewMenu').addEventListener('click', menu);
  $('#quitBtn').addEventListener('click', () => {
    if (S && !S.ended && S.done > 0 && !confirm('Quitter la partie en cours ?')) return;
    menu();
  });

  window.Game = { GAMES, ZONES, zoneItems, timeFor, recKey, start, get state() { return S; } };
})();
