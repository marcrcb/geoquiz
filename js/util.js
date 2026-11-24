/* Outils partagés : normalisation des réponses, stockage local, formatage. */
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

  window.U = { $, $$, key, shuffle, fmt, store };
})();
