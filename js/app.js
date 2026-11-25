/* Accueil, configuration des parties, mode hors ligne. */
(function () {
  const { $, $$, store, fmt } = U;
  const { GAMES, ZONES, itemsFor, optionsOf, timeFor, recKey } = Game;

  // Cartes de l'accueil (texte court) — l'ordre définit l'affichage
  const CARDS = [
    ['gameCards', 'map', 'Nomme chaque pays sur la carte, ou retrouve-le du premier clic.'],
    ['gameCards', 'flags', '197 drapeaux à reconnaître : tape le nom du pays pour le révéler.'],
    ['gameCards', 'capitals', 'Pays → capitale, capitale → pays, ou place-les sur la carte.'],
    ['gameCards2', 'shapes', 'Reconnais un pays à sa seule silhouette.'],
    ['gameCards2', 'neighbors', 'Nomme tous les pays qui touchent celui affiché.'],
    ['gameCards2', 'scale', 'Redimensionne un pays à sa vraie taille, avec un autre pour seul repère.'],
    ['gameCards2', 'path', 'Va d’un pays à l’autre en passant par des voisins.'],
  ];
  for (const [host, id, txt] of CARDS) {
    const G = GAMES[id];
    const b = document.createElement('button');
    b.className = 'game-card'; b.dataset.game = id;
    b.innerHTML = `<span class="gc-num">${G.num}</span><h3></h3><p></p><span class="gc-best" data-best="${id}"></span><span class="gc-go">Jouer <span aria-hidden="true">→</span></span>`;
    b.querySelector('h3').textContent = G.title; b.querySelector('p').textContent = txt;
    $('#' + host).append(b);
  }

  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    if (id === 'home') refreshHome();
    if (id === 'atlas') Atlas.shown();
    window.scrollTo(0, 0);
  }

  function refreshHome() {
    for (const g of Object.keys(GAMES)) {
      const b = store.get('best:' + g, 0), G = GAMES[g];
      $(`[data-best="${g}"]`).textContent = b ? (G.bestText ? G.bestText(b) : `Record monde : ${b} %`) : '';
    }
  }

  /* ---------- Configuration ---------- */
  const saved = store.get('lastCfg', {});
  function openSetup(game) {
    const G = GAMES[game];
    const prev = saved[game] || {};
    const c = { game, mode: prev.mode || G.modes[0].id, zone: prev.zone || 'ALL', timer: prev.timer || 'timed' };
    for (const o of G.options || []) c[o.id] = prev[o.id] || o.choices[0][0];
    if (!G.modes.some(m => m.id === c.mode)) c.mode = G.modes[0].id;
    $('#setupNum').textContent = G.num;
    $('#setupTitle').textContent = G.title;
    $('#setupDesc').textContent = G.desc;
    $('#setupNote').hidden = !G.note; $('#setupNote').textContent = G.note || '';
    const chip = (v, label, on, small = '') => `<button class="chip${on ? ' on' : ''}" data-v="${v}">${label}${small !== '' ? `<small>${small}</small>` : ''}</button>`;

    const render = () => {
      const zones = ZONES.filter(([id]) => !G.zones || G.zones.includes(id));
      if (!zones.some(([id]) => id === c.zone)) c.zone = zones[0][0];
      const timers = G.timers || ['timed', 'free'];
      if (!timers.includes(c.timer)) c.timer = timers[0];
      $('#setupModes').innerHTML = G.modes.map(m => `<button class="mode${m.id === c.mode ? ' on' : ''}" data-v="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('');
      $('#setupModes').classList.toggle('single', G.modes.length === 1);
      $('#setupZones').innerHTML = zones.map(([id, name]) => chip(id, name, id === c.zone, itemsFor({ ...c, zone: id }).length)).join('');
      $('#setupOptions').innerHTML = optionsOf(c).map(o => `<h4>${o.label}</h4><div class="chips" data-opt="${o.id}">${o.choices.map(([v, l]) => chip(v, l, c[o.id] === v)).join('')}</div>`).join('');
      $('#setupTimer').innerHTML = timers.map(id => chip(id, id === 'timed' ? `Chrono ${fmt(timeFor(c))}` : 'Sans limite', id === c.timer)).join('');
      const r = store.get(recKey(c), null);
      $('#setupRecord').textContent = !r ? 'Pas encore de record' : r.total == null ? `Record : ${r.score} d’affilée` : `Record : ${r.score}/${r.total} en ${fmt(r.time)}`;
    };
    render();
    const pick = (sel, prop) => ($(sel).onclick = e => { const b = e.target.closest('[data-v]'); if (b) { c[prop] = b.dataset.v; render(); } });
    pick('#setupModes', 'mode'); pick('#setupZones', 'zone'); pick('#setupTimer', 'timer');
    $('#setupOptions').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { c[b.parentElement.dataset.opt] = b.dataset.v; render(); } };
    $('#startBtn').onclick = () => {
      saved[game] = { ...c }; store.set('lastCfg', saved);
      $('#setup').hidden = true;
      Game.start({ ...c });
    };
    $('#setup').hidden = false;
  }
  for (const id of ['gameCards', 'gameCards2']) $('#' + id).addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) openSetup(b.dataset.game); });
  $('#openAtlas').addEventListener('click', () => show('atlas'));
  $('#setup').addEventListener('click', e => { if (e.target.id === 'setup' || e.target.closest('[data-close]')) $('#setup').hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#setup').hidden) $('#setup').hidden = true; });

  /* ---------- Hors ligne & installation ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const banner = $('#updateBanner');
    let requested = false; // on ne recharge que si l'utilisateur l'a demandé (pas lors de la toute première installation)
    // Une nouvelle version est prête (installée, en attente) : on le propose sans interrompre la partie
    const offer = w => { if (!w || !navigator.serviceWorker.controller) return; banner.hidden = false; $('#updateNow').onclick = () => { requested = true; w.postMessage('skipWaiting'); }; };
    navigator.serviceWorker.register('sw.js').then(reg => {
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // vérifier les mises à jour au retour sur l'appli (et toutes les heures si elle reste ouverte)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 3600e3);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested) { requested = false; location.reload(); } });
    $('#updateLater').addEventListener('click', () => (banner.hidden = true));
  }
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; });

  /* ---------- Thème : auto (réglage du téléphone), clair, sombre ---------- */
  const THEMES = [['auto', 'Thème : auto'], ['light', 'Thème : clair'], ['dark', 'Thème : sombre']];
  let theme = store.get('theme', 'auto');
  const media = matchMedia('(prefers-color-scheme: light)');
  function applyTheme() {
    if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    const light = theme === 'light' || (theme === 'auto' && media.matches);
    document.querySelector('meta[name=theme-color]').setAttribute('content', light ? '#fafafa' : '#0a0a0a');
    $('#themeBtn').textContent = THEMES.find(t => t[0] === theme)[1];
  }
  $('#themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.findIndex(t => t[0] === theme) + 1) % THEMES.length][0];
    store.set('theme', theme); applyTheme();
  });
  media.addEventListener('change', applyTheme);
  applyTheme();

  window.App = { show };
  // Carte décorative de l'accueil, dessinée une fois après le premier affichage
  requestAnimationFrame(() => MapView.drawStatic($('#heroMap')));
  show('home');
})();
