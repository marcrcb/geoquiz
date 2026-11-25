import { test, expect } from '@playwright/test';
import { home, startGame, state, nameOf, type } from './helpers.mjs';

test('silhouettes : un par un et grille', async ({ page }) => {
  const errors = await home(page);
  await startGame(page, 'shapes', { mode: 'solo' });
  await expect(page.locator('#soloFlag svg.shape path')).toHaveCount(1);
  await type(page, await state(page, () => Game.state.cur.n), 300);
  await expect(page.locator('#gScore')).toHaveText('1');
  await startGame(page, 'shapes', { mode: 'grid', zone: 'EU' });
  expect(await page.locator('.tile svg.shape').count()).toBeGreaterThan(35);
  expect(errors).toEqual([]);
});

test('pays voisins : refus, acceptation, pays suivant', async ({ page }) => {
  await home(page);
  await startGame(page, 'neighbors', { zone: 'EU', opt: { rounds: '10' } });
  const cur = await state(page, () => Game.state.cur);
  await type(page, 'Japon'); await page.press('#answer', 'Enter');
  await expect(page.locator('#gScore')).toHaveText('0');
  for (const id of cur.nb) await type(page, await nameOf(page, id), 1300);
  await expect(page.locator('#gScore')).toHaveText(String(cur.nb.length));
  await expect.poll(() => state(page, () => Game.state.ri)).toBe(1);
});

test('chemin : validé dès que la jonction avec l’arrivée est faite', async ({ page }) => {
  await home(page);
  await startGame(page, 'path', { zone: 'EU', opt: { rounds: '5' } });
  const rt = await state(page, () => Game.state.route);
  await type(page, 'Islande'); await page.press('#answer', 'Enter');
  expect(await state(page, () => Game.state.chain.length)).toBe(1);
  for (const id of rt.best.slice(1, -1)) await type(page, await nameOf(page, id), 1300);
  await expect(page.locator('#gScore')).toHaveText('1'); // sans taper le pays d'arrivée
  expect(await state(page, () => Game.state.optimal)).toBe(1);
});

test('à l’échelle : taille libre, note sur 100', async ({ page }) => {
  await home(page);
  await startGame(page, 'scale', { opt: { rounds: '5' } });
  await expect(page.locator('#gTotal')).toHaveText('/500');
  const inside = () => page.evaluate(() => {
    const s = document.querySelector('.scale-svg').getBoundingClientRect();
    return ['.s1', '.s2'].every(sel => { const b = document.querySelector('.scale-svg ' + sel).getBoundingClientRect(); return b.left >= s.left - 1 && b.right <= s.right + 1 && b.top >= s.top - 1 && b.bottom <= s.bottom + 1; });
  });
  for (let i = 0; i < 40; i++) await page.evaluate(() => Game.API.S.C.nudge(0.5));
  expect(await inside()).toBe(true); // ×400 : la vue recule, tout reste visible
  await page.evaluate(() => { Game.state.v = 0; Game.API.S.C.layout(); });
  await page.keyboard.press('Enter');
  await expect(page.locator('.scale-pts')).toContainText('100');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { Game.state.v = Math.log(3) / 2; Game.API.S.C.layout(); }); // surface ×3
  await page.click('.scale-go');
  await expect(page.locator('.scale-pts')).toContainText('21');
});

test('capitales sur la carte : clic juste et clic à 800 km', async ({ page }) => {
  await home(page);
  await startGame(page, 'capitals', { mode: 'locate', zone: 'EU' });
  const clickAt = async ll => {
    const pt = await page.evaluate(([lo, la]) => { const m = Game.API.map, q = m.proj([lo, la]), t = d3.zoomTransform(m.svg.node()), r = m.svg.node().getBoundingClientRect(); return [r.left + (t.x + q[0] * t.k) * r.width / m.W, r.top + (t.y + q[1] * t.k) * r.height / m.H]; }, ll);
    await page.mouse.click(pt[0], pt[1]);
  };
  const c1 = await state(page, () => Game.state.cur);
  await clickAt([c1.capLL[1], c1.capLL[0]]);
  await expect(page.locator('#gScore')).toHaveText('1');
  await expect.poll(() => state(page, () => Game.state.cur.id)).not.toBe(c1.id);
  const c2 = await state(page, () => Game.state.cur);
  await clickAt([c2.capLL[1] + 12, c2.capLL[0]]);
  await page.waitForTimeout(300);
  await expect(page.locator('#gScore')).toHaveText('1');
});
