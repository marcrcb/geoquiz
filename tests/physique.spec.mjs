import { test, expect } from '@playwright/test';
import { home, startGame, state, type } from './helpers.mjs';

/** Clique à des coordonnées [lon, lat] sur la carte du jeu */
async function clickAt(page, ll) {
  const pt = await page.evaluate(([lo, la]) => { const m = Game.API.map, q = m.proj([lo, la]), t = d3.zoomTransform(m.svg.node()), r = m.svg.node().getBoundingClientRect(); return [r.left + (t.x + q[0] * t.k) * r.width / m.W, r.top + (t.y + q[1] * t.k) * r.height / m.H]; }, ll);
  await page.mouse.click(pt[0], pt[1]);
}

test('géographie physique : données cohérentes', async ({ page }) => {
  await home(page);
  const r = await page.evaluate(() => {
    const c = t => PHYSIQUE.filter(x => x.t === t).length;
    const sah = PHYSIQUE.find(x => x.n === 'Sahara').g;
    return { f: c('f'), m: c('m'), d: c('d'), tam: d3.geoContains(sah, [5.52, 22.78]), paris: d3.geoContains(sah, [2.35, 48.85]),
      alpes: d3.geoContains(PHYSIQUE.find(x => x.n === 'Alpes').g, [6.87, 45.92]) };
  });
  expect(r).toEqual({ f: 78, m: 63, d: 26, tam: true, paris: false, alpes: true });
});

test('situer : clic sur le repère juste, puis 3 erreurs révèlent le repère', async ({ page }) => {
  const errors = await home(page);
  await startGame(page, 'physique', { mode: 'locate', zone: 'EU', opt: { cat: 'all' } });
  await expect(page.locator('#ask')).toBeVisible();
  // clic sur un point du repère demandé (centre d'une région, ou point d'un fleuve)
  const target = await state(page, () => { const x = Game.state.cur; return x.t === 'f' ? x.g.coordinates[0][x.g.coordinates[0].length >> 1] : d3.geoCentroid(x.g); });
  await clickAt(page, target);
  await expect(page.locator('#gScore')).toHaveText('1');
  await expect.poll(() => state(page, () => Game.state.done)).toBe(1);
  await page.waitForTimeout(1500);
  // trois clics en plein Atlantique : raté, le repère est montré
  for (let i = 0; i < 3; i++) { await clickAt(page, [-30, 45 + i]); await page.waitForTimeout(150); }
  await expect.poll(() => state(page, () => Object.values(Game.state.res).filter(r => r === 'bad').length)).toBe(1);
  await expect(page.locator('#gScore')).toHaveText('1');
  await page.waitForTimeout(2800);
  await page.click('#giveUpBtn');
  await expect(page.locator('#results')).toBeVisible();
  await page.click('#rReview');
  expect(await page.locator('.phys-layer path:visible').count()).toBeGreaterThan(20); // révision : tous les repères
  expect(errors).toEqual([]);
});

test('nommer : forme longue, forme courte, indice, passer', async ({ page }) => {
  await home(page);
  await startGame(page, 'physique', { mode: 'name', zone: 'ALL', opt: { cat: 'd' } });
  await expect(page.locator('.phys.target')).toHaveCount(1);
  const name = await state(page, () => Game.state.cur.n);
  await type(page, 'Mississippi'); await page.press('#answer', 'Enter');
  await expect(page.locator('#gScore')).toHaveText('0');
  await type(page, name, 300);
  await expect(page.locator('#gScore')).toHaveText('1');
  // forme courte acceptée (« Kalahari » pour « Désert du Kalahari »)
  await page.waitForTimeout(1100);
  await page.evaluate(() => { const S = Game.state, i = S.seq.findIndex(x => x.n === 'Désert du Kalahari'); if (!S.res[S.seq[i].id]) { S.seq.splice(i, 1); } });
  await page.click('#hintBtn');
  await expect(page.locator('.mp-hint')).toBeVisible();
  await page.click('#skipBtn');
  await page.waitForTimeout(1900);
  expect(await state(page, () => Object.values(Game.state.res).filter(r => r === 'bad').length)).toBe(1);
});

test('nommer : réponses courtes sans « désert du », « monts », précision entre parenthèses', async ({ page }) => {
  await home(page);
  const ok = await page.evaluate(() => {
    const keys = n => { const x = PHYSIQUE.find(y => y.n === n); const short = s => s.replace(/\s*\(.*\)$/, '').replace(/^(désert|grand désert|monts?|montagnes|massif|chaîne|cordillère|hauts plateaux|plateau|massif)\s+(de la |de l’|de l'|des |du |de |d’|d')?/i, ''); return [x.n, ...x.alt, short(x.n)].map(U.key); };
    return { kalahari: keys('Désert du Kalahari').includes(U.key('Kalahari')), rocheuses: keys('Rocheuses').includes(U.key('montagnes rocheuses')),
      sierra: keys('Sierra Nevada (Espagne)').includes(U.key('Sierra Nevada')), yangzi: keys('Yangzi Jiang').includes(U.key('fleuve bleu')) };
  });
  expect(ok).toEqual({ kalahari: true, rocheuses: true, sierra: true, yangzi: true });
});
