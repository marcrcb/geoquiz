/* Moteur commun des jeux : chrono, pause, score, résultats, records.
   - Jeux « standards » : saisie libre (liste), grille à case active, ou question par question.
   - Jeux « personnalisés » (js/modes.js) : se branchent via Game.register() et l'API ci-dessous. */
(function () {
  const { $, $$, key, shuffle, fmt, store } = U;

  const ZONES = [
    ['ALL', 'Monde'], ['EU', 'Europe'], ['AF', 'Afrique'], ['AS', 'Asie'],
    ['NA', 'Amérique du Nord'], ['SA', 'Amérique du Sud'], ['OC', 'Océanie'],
  ];
  const ZONE_NAME = Object.fromEntries(ZONES);
  const CONT_ORDER = ['EU', 'AF', 'AS', 'NA', 'SA', 'OC'];
  const byId = Object.fromEntries(COUNTRIES.map(c => [c.id, c]));
  const names = c => [c.n, ...c.alt];

  const GAMES = {
    map: {
      title: 'Carte du monde', num: '01', desc: 'Retrouve les pays sur la carte interactive.',
      modes: [
        { id: 'type', name: 'Tout nommer', desc: 'Tape les noms des pays : chacun apparaît sur la carte.', sec: 5 },
        { id: 'click', name: 'Localiser', desc: 'Un pays est demandé : clique dessus. 3 essais par pays.', sec: 7 },
      ],
      answers: names, placeholder: 'Tape un pays…',
    },
    flags: {
      title: 'Drapeaux', num: '02', desc: 'Reconnais les drapeaux du monde entier.',
      modes: [
        { id: 'grid', name: 'Tous les drapeaux', desc: 'Tous les drapeaux affichés : remplis-les dans l’ordre ou clique sur une case.', sec: 4 },
        { id: 'solo', name: 'Un par un', desc: 'Un drapeau à la fois, avec indices et possibilité de passer.', sec: 6 },
      ],
      answers: names, placeholder: 'Quel est ce pays ?',
    },
    capitals: {
      title: 'Capitales', num: '03', desc: 'Trouve la capitale de chaque pays… ou l’inverse.',
      modes: [
        { id: 'grid', name: 'Liste complète', desc: 'Tous les pays par continent : remplis-les dans l’ordre ou clique sur une case.', sec: 5 },
        { id: 'solo', name: 'Un par un', desc: 'Une question à la fois, avec indices et possibilité de passer.', sec: 7 },
        { id: 'locate', name: 'Sur la carte', desc: 'Une capitale est donnée : clique à son emplacement. Réussi à moins de 300 km.', sec: 8, custom: 'locate' },
      ],
      options: [{ id: 'dir', label: 'Sens', modes: ['grid', 'solo'], choices: [['fwd', 'Pays → capitale'], ['rev', 'Capitale → pays']] }],
      answers: (c, cfg) => (cfg.dir === 'rev' ? names(c) : [c.cap, ...c.capAlt]),
      placeholder: 'Tape une capitale…',
    },
    shapes: {
      title: 'Silhouettes', num: '04', desc: 'Reconnais les pays à leur seule forme.',
      modes: [
        { id: 'solo', name: 'Un par un', desc: 'Une silhouette à la fois, avec indices et possibilité de passer.', sec: 7 },
        { id: 'grid', name: 'Toutes les silhouettes', desc: 'Toutes les formes affichées : remplis-les dans l’ordre ou clique sur une case.', sec: 5 },
      ],
      items: zone => zoneItems(zone).filter(c => SHAPES[c.id]),
      answers: names, placeholder: 'Quel est ce pays ?',
      note: 'Les micro-États et archipels trop dispersés ne sont pas inclus.',
    },
    neighbors: {
      title: 'Pays voisins', num: '05', desc: 'Un pays s’affiche : nomme tous ceux qui le touchent.',
      modes: [{ id: 'round', name: 'Tous les voisins', desc: 'Nomme chaque pays qui partage une frontière terrestre avec celui qui est affiché.', custom: 'neighbors' }],
      zones: ['ALL', 'EU', 'AF', 'AS', 'NA', 'SA'],
      options: [{ id: 'rounds', label: 'Pays', choices: [['10', '10'], ['25', '25'], ['all', 'Tous']] }],
      placeholder: 'Un pays voisin…',
    },
    bigger: {
      title: 'Le plus grand', num: '06', desc: 'Deux pays : lequel l’emporte ? Une erreur et c’est fini.',
      modes: [{ id: 'duel', name: 'Duel', desc: 'Choisis entre deux pays. La série continue tant que tu as raison.', custom: 'bigger' }],
      options: [{ id: 'crit', label: 'Critère', choices: [['area', 'Superficie'], ['north', 'Capitale la plus au nord'], ['east', 'Capitale la plus à l’est']] }],
      timers: ['free'],
      bestText: v => `Record monde : ${v} d’affilée`,
    },
    path: {
      title: 'Chemin', num: '07', desc: 'Relie deux pays en passant par des voisins.',
      modes: [{ id: 'route', name: 'Relier deux pays', desc: 'Tape une suite de pays voisins pour aller du départ à l’arrivée, en un minimum d’étapes.', custom: 'path' }],
      zones: ['ALL', 'EU', 'AF', 'AS', 'NA', 'SA'],
      options: [{ id: 'rounds', label: 'Trajets', choices: [['5', '5'], ['10', '10']] }],
      placeholder: 'Pays suivant…',
    },
    scale: {
      title: 'À l’échelle', num: '08', desc: 'Deux pays : donne au second sa vraie taille, avec le premier comme seul repère.',
      modes: [{ id: 'resize', name: 'Ajuster la taille', desc: 'Le premier pays est fixe. Agrandis ou réduis le second jusqu’à sa taille réelle, puis valide.', custom: 'scale' }],
      options: [{ id: 'rounds', label: 'Manches', choices: [['5', '5'], ['10', '10'], ['20', '20']] }],
      timers: ['free', 'timed'],
      note: 'Seul le territoire principal de chaque pays est représenté (sans les îles lointaines), à la même échelle.',
    },
  };

  /** Modules des jeux personnalisés (enregistrés par js/modes.js) */
  const CUSTOM = {};
  const register = (name, impl) => (CUSTOM[name] = impl);

  const zoneItems = z => COUNTRIES.filter(c => z === 'ALL' || c.c === z);
  const modeOf = cfg => GAMES[cfg.game].modes.find(m => m.id === cfg.mode);
  const optionsOf = cfg => (GAMES[cfg.game].options || []).filter(o => !o.modes || o.modes.includes(cfg.mode));
  const itemsFor = cfg => {
    const G = GAMES[cfg.game], M = modeOf(cfg);
    if (M.custom) return CUSTOM[M.custom].items(cfg);
    return G.items ? G.items(cfg.zone) : zoneItems(cfg.zone);
  };
  /** Durée du chrono (s) : `sec` par question, arrondie à la minute */
  const timeFor = cfg => {
    const M = modeOf(cfg);
    const per = M.custom && CUSTOM[M.custom].secPer ? CUSTOM[M.custom].secPer(cfg) : M.sec;
    const n = M.custom && CUSTOM[M.custom].count ? CUSTOM[M.custom].count(cfg) : itemsFor(cfg).length;
    return Math.max(2, Math.ceil(n * per / 60)) * 60;
  };
  const recKey = cfg => ['rec', cfg.game, cfg.mode, cfg.zone, cfg.timer, ...optionsOf(cfg).map(o => cfg[o.id])].join(':');

  let S = null; // état de la partie en cours
  let map = null;

  const el = {
    body: $('#gameBody'), mapStage: $('#mapStage'), gridStage: $('#gridStage'), grid: $('#grid'), soloStage: $('#soloStage'),
    customStage: $('#customStage'), mapPanel: $('#mapPanel'),
    form: $('#answerForm'), input: $('#answer'), box: $('.answer-box'), toasts: $('#toasts'),
    score: $('#gScore'), total: $('#gTotal'), timer: $('#gTimer'), timerBox: $('#gTimerBox'), progress: $('#gProgress'),
    ask: $('#ask'), legend: $('#mapLegend'), review: $('#reviewBar'),
    hint: $('#hintBtn'), skip: $('#skipBtn'), back: $('#backBtn'), pauseBtn: $('#pauseBtn'), pauseOverlay: $('#pauseOverlay'),
  };

  /** setTimeout lié à la partie en cours : ignoré si une autre partie a démarré, différé pendant la pause. */
  function later(fn, ms) {
    const s = S;
    return setTimeout(() => {
      if (S !== s || s.ended) return;
      if (s.paused) s.deferred.push(fn); else fn();
    }, ms);
  }
  /** Temps de jeu écoulé (s), pauses exclues. */
  const elapsedOf = s => ((s.paused ? s.pauseAt : performance.now()) - s.t0) / 1000;

  /* =================== Démarrage =================== */
  function start(cfg) {
    stop();
    const G = GAMES[cfg.game], M = modeOf(cfg), C = M.custom ? CUSTOM[M.custom] : null;
    const items = itemsFor(cfg);
    S = {
      cfg, G, M, C, items, total: items.length, found: new Set(), res: {}, score: 0, done: 0,
      streak: 0, bestStreak: 0, lastFind: 0, t0: performance.now(), limit: cfg.timer === 'timed' ? timeFor(cfg) : 0,
      ended: false, seq: null, cur: null, tries: 0, hints: 0, busy: false, pending: null, paused: false, pauseAt: 0, deferred: [],
    };
    if (!C) S.keys = new Map(items.map(c => [c.id, G.answers(c, cfg).map(key)]));
    $('#gTitle').textContent = G.title;
    const opt = optionsOf(cfg).map(o => o.choices.find(ch => ch[0] === cfg[o.id])[1]);
    $('#gSub').textContent = [M.name, ZONE_NAME[cfg.zone], ...opt].join(' · ');
    el.score.textContent = '0';
    setProgress(0);
    el.review.hidden = true; el.ask.hidden = true; el.mapPanel.hidden = true; el.legend.hidden = false;
    el.mapStage.hidden = el.gridStage.hidden = el.soloStage.hidden = el.customStage.hidden = true;
    el.form.hidden = cfg.mode === 'click';
    el.input.value = ''; el.input.placeholder = G.placeholder || '';
    el.hint.hidden = cfg.mode !== 'solo';
    el.skip.hidden = cfg.mode !== 'solo' && cfg.mode !== 'grid';
    el.back.hidden = true;
    el.toasts.innerHTML = '';
    $('#askTries').hidden = false;
    $('#giveUpBtn').hidden = false;
    el.pauseBtn.hidden = false;
    showPaused(false);
    App.show('game');
    map = null;

    if (C) {
      C.start(API);
    } else {
      if (cfg.game === 'map') {
        el.mapStage.hidden = false;
        const zone = cfg.zone, inZone = id => zone === 'ALL' || byId[id].c === zone;
        map = new MapView($('#mapSvg'), { zone, inZone, onClick: onMapClick });
        buildLegend();
      }
      if (cfg.mode === 'grid') {
        const grouped = cfg.game === 'capitals';
        buildGrid(grouped ? groupByCont(items) : shuffle(items));
        select(S.order[0]);
      }
      if (cfg.mode === 'click' || cfg.mode === 'solo') {
        S.seq = shuffle(items);
        if (cfg.mode === 'solo') el.soloStage.hidden = false;
        next();
      }
    }
    setTotal(S.total);
    S.tick = setInterval(tick, 250); tick();
    if (!el.form.hidden) setTimeout(() => el.input.focus(), 350);
  }

  function setTotal(n) { S.total = n; el.total.textContent = n == null ? '' : '/' + n; }

  function stop() {
    if (S) { clearInterval(S.tick); clearTimeout(S.pending); S.ended = true; }
  }

  function tick() {
    if (!S || S.ended) return;
    if (S.paused) return;
    const el_ = elapsedOf(S);
    if (S.limit) {
      const left = S.limit - el_;
      el.timer.textContent = fmt(Math.ceil(left));
      el.timerBox.classList.toggle('warn', left <= 30);
      if (left <= 0) end('time');
    } else { el.timer.textContent = fmt(el_); el.timerBox.classList.remove('warn'); }
  }

  /* =================== Progression & retours visuels =================== */
  const isListMode = () => S.cfg.mode === 'type' || S.cfg.mode === 'grid' || (S.C && S.C.progressByScore);
  function scored(ok, n = 1) {
    S.done++;
    if (ok) {
      S.score += n;
      const now = performance.now();
      S.streak = isListMode() && !S.C ? (now - S.lastFind < 6000 ? S.streak + 1 : 1) : S.streak + 1;
      S.lastFind = now;
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      el.score.textContent = S.score;
    } else S.streak = 0;
    if (S.total) setProgress((isListMode() ? S.score : S.done) / S.total);
  }
  function setProgress(f) { el.progress.style.transform = `scaleX(${Math.min(1, f)})`; }

  function toast(c, txt) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = c ? `<img src="flags/thumb/${c.a2}.webp" alt=""><span></span>` : '<span></span>';
    t.querySelector('span').textContent = txt;
    el.toasts.prepend(t);
    while (el.toasts.children.length > 3) el.toasts.lastChild.remove();
    setTimeout(() => t.remove(), 1700);
  }
  function shakeBox() { el.box.classList.remove('ko'); void el.box.offsetWidth; el.box.classList.add('ko'); }

  /* =================== Visuels des questions =================== */
  const rev = () => S.cfg.game === 'capitals' && S.cfg.dir === 'rev';
  const flagImg = (c, big) => `<img src="flags/${big ? '' : 'thumb/'}${c.a2}.${big ? 'svg' : 'webp'}" alt="" ${big ? '' : 'loading="lazy" decoding="async"'}>`;
  const shapeSvg = c => `<svg class="shape" viewBox="0 0 400 300" aria-label="Silhouette à deviner"><path d="${SHAPES[c.id]}"/></svg>`;
  /** Réponse principale attendue pour une question */
  function mainAnswer(c) {
    if (S.cfg.game === 'capitals') return rev() ? c.n : c.cap;
    return c.n;
  }

  /* =================== Grilles =================== */
  function groupByCont(items) {
    return CONT_ORDER.flatMap(c => items.filter(i => i.c === c).sort((a, b) => a.n.localeCompare(b.n, 'fr')).map((x, i) => (i === 0 ? { ...x, sep: c } : x)));
  }

  function buildGrid(list) {
    el.gridStage.hidden = false; el.gridStage.scrollTop = 0;
    const cap = S.cfg.game === 'capitals', shapes = S.cfg.game === 'shapes';
    el.grid.className = 'grid' + (cap ? ' capitals' : '') + (shapes ? ' shapes' : '');
    el.grid.innerHTML = '';
    S.tiles = {}; S.order = list.map(c => c.id); S.sel = null;
    const frag = document.createDocumentFragment();
    for (const c of list) {
      if (c.sep && S.cfg.zone === 'ALL') {
        const h = document.createElement('div'); h.className = 'grid-sep';
        h.textContent = ZONE_NAME[c.c]; frag.append(h);
      }
      const t = document.createElement('div');
      t.className = 'tile' + (cap ? ' cap-tile' : '');
      t.dataset.id = c.id;
      if (cap) {
        // Sens inverse : le drapeau trahirait la réponse, il n'apparaît qu'une fois trouvé
        t.innerHTML = `<div class="tile-inner">${rev() ? '<div class="flag-ph"></div>' : flagImg(c)}<div class="cap-info"><div class="cap-country"></div><div class="t-name">?</div></div></div>`;
        t.querySelector('.cap-country').textContent = rev() ? c.cap : c.n;
      } else {
        t.innerHTML = `<div class="tile-inner">${shapes ? shapeSvg(c) : flagImg(c)}<div class="t-name">?</div></div>`;
      }
      S.tiles[c.id] = t; frag.append(t);
    }
    el.grid.append(frag);
  }

  function tileSet(c, st) {
    const t = S.tiles && S.tiles[c.id]; if (!t) return;
    t.classList.remove('found', 'missed'); t.classList.add(st);
    t.querySelector('.t-name').textContent = mainAnswer(c);
    const ph = t.querySelector('.flag-ph');
    if (ph) ph.outerHTML = flagImg(c);
  }

  function buildLegend() {
    const conts = S.cfg.zone === 'ALL' ? CONT_ORDER : [S.cfg.zone];
    el.legend.innerHTML = conts.map(c => `<div class="lg" data-c="${c}">${ZONE_NAME[c]}<span class="lg-n"></span></div>`).join('');
    updLegend();
  }
  function updLegend() {
    if (!map || S.C) return;
    for (const row of $$('.lg', el.legend)) {
      const c = row.dataset.c, all = S.items.filter(i => i.c === c);
      const n = all.filter(i => S.res[i.id] === 'good' || S.res[i.id] === 'ok' || S.found.has(i.id)).length;
      row.querySelector('.lg-n').textContent = `${n}/${all.length}`;
      row.classList.toggle('done', n === all.length);
    }
  }

  /* ---------- Grilles : une case active, remplie dans l'ordre ou choisie au clic ---------- */
  function select(id, scroll = true) {
    if (S.sel && S.tiles[S.sel]) S.tiles[S.sel].classList.remove('sel');
    S.sel = id || null;
    if (!id) return;
    const t = S.tiles[id];
    t.classList.add('sel');
    const c = byId[id];
    el.input.placeholder = S.cfg.game === 'capitals' ? (rev() ? `Pays de : ${c.cap}` : `Capitale : ${c.n}`) : 'Quel est ce pays ?';
    if (scroll) t.scrollIntoView({ block: 'nearest' });
  }

  /** Prochaine case non trouvée après `id` dans le sens `dir` (en bouclant). */
  function nextOpen(id, dir = 1) {
    const o = S.order, n = o.length, i0 = o.indexOf(id);
    for (let k = 1; k <= n; k++) {
      const cand = o[(i0 + dir * k + n * k) % n];
      if (!S.found.has(cand)) return cand;
    }
    return null;
  }

  function gridInput(force) {
    if (!S.sel) return;
    const k = key(el.input.value);
    if (k && S.keys.get(S.sel).includes(k)) {
      const id = S.sel;
      accept(byId[id]);
      select(nextOpen(id));
      return;
    }
    if (force && k) {
      shakeBox();
      const t = S.tiles[S.sel]; t.classList.remove('wrong'); void t.offsetWidth; t.classList.add('wrong');
    }
  }

  function moveSel(dir) {
    if (!S || S.ended || S.cfg.mode !== 'grid' || !S.sel) return;
    select(nextOpen(S.sel, dir));
    el.input.value = '';
    el.input.focus({ preventScroll: true });
  }

  /* ---------- Saisie libre (carte « Tout nommer ») ---------- */
  function listInput(force) {
    clearTimeout(S.pending);
    const k = key(el.input.value);
    if (!k) return;
    const cand = S.items.find(c => !S.found.has(c.id) && S.keys.get(c.id).includes(k));
    if (!cand) {
      if (force) shakeBox();
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
    toast(c, S.cfg.game === 'capitals' ? `${c.cap} · ${c.n}` : c.n);
    if (map) {
      map.set(c.id, 'found');
      map.label(c.id, c.n);
      updLegend();
    }
    tileSet(c, 'found');
    if (S.found.size === S.total) later(() => end('done'), 500);
  }

  /* =================== Question par question (localiser, un par un) =================== */
  function next() {
    if (S.ended) return;
    S.cur = S.seq.find(c => !S.res[c.id]);
    S.tries = 0; S.hints = 0; S.busy = false;
    if (!S.cur) return end('done');
    const c = S.cur;
    if (S.cfg.mode === 'click') {
      el.ask.hidden = false;
      $('#askFlag').src = `flags/thumb/${c.a2}.webp`; $('#askFlag').hidden = false;
      $('#askLabel').textContent = 'Où se trouve';
      $('#askName').textContent = c.n;
      $('#askTries').innerHTML = '<i></i><i></i><i></i>';
    } else {
      const v = $('#soloFlag');
      v.className = ''; void v.offsetWidth;
      const g = S.cfg.game;
      v.classList.toggle('is-shape', g === 'shapes');
      v.classList.toggle('is-text', rev());
      if (g === 'shapes') v.innerHTML = shapeSvg(c);
      else if (rev()) { v.innerHTML = '<span class="solo-cap"></span>'; v.firstChild.textContent = c.cap; }
      else v.innerHTML = flagImg(c, true);
      v.classList.add('in');
      const q = $('#soloQ');
      if (g === 'capitals') {
        q.innerHTML = rev() ? '<small>De quel pays est-ce la capitale ?</small>' : '<small>Capitale de</small>';
        if (!rev()) q.append(c.n);
      } else q.innerHTML = '<small>Quel est ce pays ?</small>';
      $('#soloHint').textContent = '';
      const r = $('#soloReveal'); r.textContent = ''; r.className = 'solo-reveal';
      el.input.value = '';
      el.input.focus({ preventScroll: true });
    }
  }

  function soloInput(force) {
    if (S.busy || !S.cur) return;
    const k = key(el.input.value);
    if (k && S.keys.get(S.cur.id).includes(k)) return soloResult(S.hints ? 'ok' : 'good');
    if (force && k) { shakeBox(); const v = $('#soloFlag'); v.classList.remove('out-bad'); void v.offsetWidth; v.classList.add('out-bad'); }
  }

  function soloResult(r) {
    const c = S.cur; S.busy = true; S.res[c.id] = r;
    const v = $('#soloFlag'), rv = $('#soloReveal');
    if (r === 'bad') {
      scored(false);
      rv.className = 'solo-reveal bad'; rv.textContent = mainAnswer(c);
      v.classList.remove('out-bad'); void v.offsetWidth; v.classList.add('out-bad');
      later(next, 1500);
    } else {
      scored(true);
      rv.className = 'solo-reveal good'; rv.textContent = mainAnswer(c);
      el.input.value = '';
      later(() => v.classList.add('out-good'), 250);
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
    el.input.focus();
  }

  function onMapClick(id) {
    if (!S || S.ended || S.paused) return;
    if (S.C) { if (S.C.mapClick) S.C.mapClick(id); return; }
    if (S.cfg.mode !== 'click' || S.busy || !S.cur) return;
    const c = S.cur;
    if (S.res[id] && id !== c.id) return; // pays déjà joué : rien
    if (id === c.id) {
      const r = S.tries === 0 ? 'good' : 'ok';
      S.res[c.id] = r; map.set(c.id, r);
      map.label(c.id, c.n);
      scored(true); updLegend();
      S.busy = true; later(next, 450);
    } else {
      S.tries++;
      $$('#askTries i').forEach((d, i) => d.classList.toggle('used', i < S.tries));
      map.flashWrong(id);
      map.label(id, map.byId[id].n);
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
    if (S.paused) resume();
    const elapsed = Math.min(S.limit || Infinity, elapsedOf(S));
    S.elapsed = elapsed;
    el.input.blur();
    if (S.C) { if (S.C.finish) S.C.finish(reason); }
    else {
      for (const c of S.items) {
        if (!S.found.has(c.id) && !S.res[c.id]) S.res[c.id] = 'missed';
        if (S.res[c.id] === 'missed') { map && map.set(c.id, 'missed'); tileSet(c, 'missed'); }
      }
    }
    if (map) map.reveal = true;
    if (S.sel && S.tiles && S.tiles[S.sel]) S.tiles[S.sel].classList.remove('sel');
    el.form.hidden = true; el.ask.hidden = true;
    $('#giveUpBtn').hidden = true;
    el.pauseBtn.hidden = true;

    // Records : meilleur score, puis meilleur temps à score égal
    const rk = recKey(S.cfg);
    const prev = store.get(rk, null);
    const isRec = S.score > 0 && (!prev || S.score > prev.score || (S.score === prev.score && elapsed < prev.time));
    if (isRec) store.set(rk, { score: S.score, total: S.total, time: Math.round(elapsed), date: Date.now() });
    const homeVal = S.total ? Math.round(100 * S.score / S.total) : S.score;
    if (S.cfg.zone === 'ALL' && homeVal > store.get('best:' + S.cfg.game, 0)) store.set('best:' + S.cfg.game, homeVal);
    const best = isRec ? { score: S.score, total: S.total } : prev;

    setTimeout(() => showResults({ elapsed, best, isRec, reason }), reason === 'done' ? 300 : 150);
  }

  function showResults({ elapsed, best, isRec, reason }) {
    $('#results').hidden = false;
    const pct = S.total ? Math.round(100 * S.score / S.total) : null;
    const sum = S.C && S.C.summary ? S.C.summary(elapsed) : {};
    $('#rPct').textContent = sum.big ?? pct + ' %';
    $('#rCount').textContent = sum.small ?? `${S.score} / ${S.total}`;
    const frac = sum.frac ?? (pct != null ? pct / 100 : 0);
    const bar = $('#rBar'); bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; void bar.offsetWidth;
    bar.style.transition = ''; bar.style.transform = `scaleX(${frac})`;
    $('#rBar').parentElement.hidden = sum.frac === null;
    const titles = [[100, 'Sans faute.'], [90, 'Excellent.'], [75, 'Très bien.'], [50, 'Bien.'], [25, 'Encore un effort.'], [0, 'À réviser.']];
    $('#rTitle').textContent = sum.title ?? titles.find(([p]) => pct >= p)[1];
    $('#rMsg').textContent = sum.msg ?? (reason === 'time' ? 'Temps écoulé' : reason === 'done' ? 'Tout trouvé' : 'Partie terminée');
    const stats = sum.stats ?? [['Temps', fmt(elapsed)], ['Meilleure série', S.bestStreak], ['Record', best ? `${best.score}/${S.total}` : '—']];
    $$('.r-grid div').forEach((d, i) => { d.querySelector('small').textContent = stats[i][0]; d.querySelector('b').textContent = stats[i][1]; });
    $('#rBadge').hidden = !isRec;
    $('#rReview').hidden = !!(S.C && S.C.noReview);
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
    if (S.C && S.C.review) S.C.review();
  }

  /* =================== Événements =================== */
  function routeInput(force) {
    if (!S || S.ended || S.paused) return;
    if (S.C) { if (S.C.input) S.C.input(force); return; }
    if (S.cfg.mode === 'solo') soloInput(force); else if (S.cfg.mode === 'grid') gridInput(force); else listInput(force);
  }
  el.input.addEventListener('input', () => routeInput(false));
  el.form.addEventListener('submit', e => { e.preventDefault(); routeInput(true); });
  el.hint.addEventListener('click', () => { if (S && S.C && S.C.hint) S.C.hint(); else hint(); });
  el.skip.addEventListener('click', () => {
    if (!S || S.ended || S.paused) return;
    if (S.C) { if (S.C.skip) S.C.skip(); return; }
    if (S.cfg.mode === 'grid') return moveSel(1);
    if (!S.busy) soloResult('bad');
    el.input.focus();
  });
  el.back.addEventListener('click', () => { if (S && !S.ended && !S.paused && S.C && S.C.back) S.C.back(); });
  // Clic sur une case : elle devient la case active
  el.grid.addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (!t || !S || S.ended || S.paused || S.cfg.mode !== 'grid' || S.found.has(t.dataset.id)) return;
    select(t.dataset.id, false);
    el.input.value = '';
    el.input.focus({ preventScroll: true });
  });
  // Tab / Maj+Tab : case suivante / précédente
  el.input.addEventListener('keydown', e => {
    if (e.key === 'Tab' && S && S.cfg.mode === 'grid' && !S.ended) { e.preventDefault(); moveSel(e.shiftKey ? -1 : 1); }
  });
  $('#askSkip').addEventListener('click', () => {
    if (!S || S.ended || S.paused) return;
    if (S.C) { if (S.C.skip) S.C.skip(); return; }
    if (!S.busy && S.cur) revealTarget();
  });
  $('#giveUpBtn').addEventListener('click', () => end('giveup'));

  /* =================== Pause =================== */
  const scoreText = () => (S.total == null ? String(S.score) : `${S.score} / ${S.total}`);
  function pause() {
    if (!S || S.ended || S.paused) return;
    tick(); // fige l'affichage sur la valeur exacte
    if (S.ended) return;
    S.paused = true; S.pauseAt = performance.now();
    // une validation « Niger → Nigeria » en attente est rejouée à la reprise
    if (S.pending) { clearTimeout(S.pending); S.pending = null; S.deferred.push(() => routeInput(false)); }
    el.input.blur();
    $('#pauseTime').textContent = S.limit ? `${fmt(Math.ceil(S.limit - elapsedOf(S)))} restantes` : `${fmt(elapsedOf(S))} écoulées`;
    $('#pauseScore').textContent = scoreText();
    showPaused(true);
  }
  function resume() {
    if (!S || !S.paused) return;
    const d = performance.now() - S.pauseAt;
    S.t0 += d; S.lastFind += d;
    S.paused = false;
    showPaused(false);
    const q = S.deferred; S.deferred = [];
    q.forEach(fn => { if (!S.ended) fn(); });
    tick();
    if (!S.ended && !el.form.hidden) el.input.focus({ preventScroll: true });
  }
  function showPaused(on) {
    $('#game').classList.toggle('paused', on);
    el.pauseOverlay.hidden = !on;
    el.pauseBtn.setAttribute('aria-pressed', on);
    el.pauseBtn.title = on ? 'Reprendre' : 'Pause';
    el.pauseBtn.setAttribute('aria-label', on ? 'Reprendre la partie' : 'Mettre en pause');
  }
  el.pauseBtn.addEventListener('click', () => (S && S.paused ? resume() : pause()));
  $('#resumeBtn').addEventListener('click', resume);
  // Pause automatique quand on quitte l'onglet ou l'application
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  // Échap : efface la saisie, ou met en pause si elle est vide ; Échap/Entrée reprennent
  addEventListener('keydown', e => {
    if (!S || S.ended || !$('#game').classList.contains('active')) return;
    if (S.paused && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); resume(); }
    else if (!S.paused && e.key === 'Escape' && !el.input.value) { e.preventDefault(); pause(); }
    else if (!S.paused && S.C && S.C.key) S.C.key(e);
  });
  $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    if (!map) return;
    const z = b.dataset.zoom; z === 'in' ? map.zoomBy(1.8) : z === 'out' ? map.zoomBy(1 / 1.8) : map.resetZoom();
  }));
  // Touche Échap : effacer la saisie
  el.input.addEventListener('keydown', e => { if (e.key === 'Escape' && el.input.value) { el.input.value = ''; e.stopPropagation(); } });
  // Redessiner la carte seulement si la largeur change (le clavier mobile ne modifie que la hauteur)
  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!map || el.mapStage.hidden) return;
      const w = el.mapStage.clientWidth;
      if (Math.abs(w - map.W) > 40) {
        const r = map.reveal; map.build(); map.reveal = r;
        if (S && S.C && S.C.redraw) S.C.redraw();
      }
    }, 250);
  });

  const again = () => { $('#results').hidden = true; start(S.cfg); };
  $('#rAgain').addEventListener('click', again);
  $('#reviewAgain').addEventListener('click', again);
  $('#rReview').addEventListener('click', review);
  const menu = () => { $('#results').hidden = true; stop(); App.show('home'); };
  $('#rMenu').addEventListener('click', menu);
  $('#reviewMenu').addEventListener('click', menu);
  $('#quitBtn').addEventListener('click', () => {
    if (S && !S.ended && (S.done > 0 || S.score > 0) && !confirm('Quitter la partie en cours ?')) return;
    menu();
  });

  /* =================== API pour les jeux personnalisés =================== */
  const API = {
    get S() { return S; }, get map() { return map; }, el, byId, key, shuffle, fmt,
    later, scored, setTotal, setProgress, toast, shakeBox, end,
    /** Crée la carte du jeu (plein écran, sans légende) */
    newMap(opts = {}) {
      el.mapStage.hidden = false; el.legend.hidden = true;
      map = new MapView($('#mapSvg'), { zone: opts.zone || 'ALL', inZone: opts.inZone, onClick: onMapClick, onPoint: opts.onPoint, markers: opts.markers !== false });
      return map;
    },
    /** Bandeau de question en bas (mode carte) */
    ask(c, label, name, { flag = true, tries = false } = {}) {
      el.ask.hidden = false;
      $('#askFlag').hidden = !flag; if (flag) $('#askFlag').src = `flags/thumb/${c.a2}.webp`;
      $('#askLabel').textContent = label; $('#askName').textContent = name;
      $('#askTries').hidden = !tries;
    },
  };

  window.Game = { GAMES, ZONES, ZONE_NAME, zoneItems, itemsFor, optionsOf, timeFor, recKey, start, register, API, get state() { return S; } };
})();
