/* Accueil, configuration des parties, mode hors ligne. */
(function () {
  const { $, $$, store, sfx, fmt } = U;
  const { GAMES, ZONES, zoneItems, timeFor, recKey } = Game;

  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    if (id === 'home') { refreshHome(); Globe.run(); }
    window.scrollTo(0, 0);
  }

  function refreshHome() {
    for (const g of Object.keys(GAMES)) {
      const b = store.get('best:' + g, 0);
      $(`[data-best="${g}"]`).textContent = b ? `🏆 Record monde : ${b} %` : '';
    }
    const played = Object.keys(GAMES).map(g => store.get('best:' + g, 0));
    $('#heroStats').innerHTML = [
      ['197', 'pays & drapeaux'],
      [String(new Set(COUNTRIES.map(c => c.cap)).size), 'capitales'],
      [played.some(Boolean) ? Math.max(...played) + ' %' : '—', 'ton meilleur score'],
    ].map(([v, l]) => `<div class="hs"><b>${v}</b><small>${l}</small></div>`).join('');
  }

  /* ---------- Configuration ---------- */
  let cfg = store.get('lastCfg', {});
  function openSetup(game) {
    const G = GAMES[game];
    const prev = cfg[game] || {};
    const c = { game, mode: prev.mode || G.modes[0].id, zone: prev.zone || 'ALL', timer: prev.timer || 'timed' };
    $('#setupEmoji').textContent = G.emoji;
    $('#setupTitle').textContent = G.title;
    $('#setupDesc').textContent = G.desc;

    const render = () => {
      $('#setupModes').innerHTML = G.modes.map(m => `<button class="mode${m.id === c.mode ? ' on' : ''}" data-v="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('');
      $('#setupZones').innerHTML = ZONES.map(([id, name, emo]) => `<button class="chip${id === c.zone ? ' on' : ''}" data-v="${id}">${emo} ${name}<small>${zoneItems(id).length}</small></button>`).join('');
      $('#setupTimer').innerHTML = [['timed', `⏱ Chrono ${fmt(timeFor(game, c.mode, c.zone))}`], ['free', '♾️ Sans limite']]
        .map(([id, l]) => `<button class="chip${id === c.timer ? ' on' : ''}" data-v="${id}">${l}</button>`).join('');
      const r = store.get(recKey(c), null);
      $('#setupRecord').textContent = r ? `🏆 Record : ${r.score}/${r.total} en ${fmt(r.time)}` : 'Pas encore de record ici';
    };
    render();
    $('#setupModes').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { c.mode = b.dataset.v; sfx.click(); render(); } };
    $('#setupZones').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { c.zone = b.dataset.v; sfx.click(); render(); } };
    $('#setupTimer').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { c.timer = b.dataset.v; sfx.click(); render(); } };
    $('#startBtn').onclick = () => {
      cfg[game] = { mode: c.mode, zone: c.zone, timer: c.timer }; store.set('lastCfg', cfg);
      $('#setup').hidden = true;
      Game.start({ ...c });
    };
    $('#setup').hidden = false;
  }
  $('#gameCards').addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) { sfx.click(); openSetup(b.dataset.game); } });
  $('#setup').addEventListener('click', e => { if (e.target.id === 'setup' || e.target.closest('[data-close]')) $('#setup').hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#setup').hidden) $('#setup').hidden = true; });

  /* ---------- Son ---------- */
  const sb = $('#soundBtn');
  const paintSound = () => (sb.textContent = sfx.muted ? '🔇' : '🔊');
  sb.addEventListener('click', () => { sfx.toggle(); paintSound(); sfx.click(); });
  paintSound();

  /* ---------- Hors ligne & installation ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      const ready = () => ($('#offlinePill').hidden = false);
      if (navigator.serviceWorker.controller) ready();
      navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'cached') ready(); });
      reg.addEventListener('updatefound', () => {});
    }).catch(() => {});
  }
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; });

  window.App = { show };
  Globe.start();
  show('home');
})();
