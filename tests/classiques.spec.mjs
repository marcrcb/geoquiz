import { test, expect } from '@playwright/test';
import { home, startGame, state, nameOf, capOf, type } from './helpers.mjs';

test('carte « Tout nommer » : saisie tolérante, Niger puis Nigeria, résultats', async ({ page }) => {
  const errors = await home(page);
  await startGame(page, 'map', { mode: 'type' });
  for (const n of ['france', 'Bresil', 'CHINE', 'côte d ivoire', 'vatican', 'Tuvalu']) await type(page, n);
  await expect(page.locator('#gScore')).toHaveText('6');
  await type(page, 'Niger', 1400); // début de « Nigeria » : validé après une courte attente
  await type(page, 'Nigeria');
  await expect(page.locator('#gScore')).toHaveText('8');
  await page.click('#giveUpBtn');
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#rCount')).toHaveText('8 / 197');
  expect(errors).toEqual([]);
});

test('carte « Localiser » : mauvais clic puis bon clic', async ({ page }) => {
  await home(page);
  await startGame(page, 'map', { mode: 'click', zone: 'EU' });
  const target = await state(page, () => Game.state.cur.id);
  await page.evaluate(t => [...document.querySelectorAll('#mapSvg path.country:not(.off)')].find(e => e.__id !== t).dispatchEvent(new MouseEvent('click', { bubbles: true })), target);
  expect(await state(page, () => Game.state.tries)).toBe(1);
  await page.evaluate(t => [...document.querySelectorAll('#mapSvg path.country, #mapSvg circle.marker')].find(e => e.__id === t).dispatchEvent(new MouseEvent('click', { bubbles: true })), target);
  await expect(page.locator('#gScore')).toHaveText('1');
});

test('drapeaux en grille : case active, refus d’une autre case, clic, Tab', async ({ page }) => {
  await home(page);
  await startGame(page, 'flags', { mode: 'grid' });
  const order = await state(page, () => Game.state.order);
  await expect(page.locator('.tile.sel')).toHaveCount(1);
  await type(page, await nameOf(page, order[5]));
  await page.press('#answer', 'Enter');
  await expect(page.locator('#gScore')).toHaveText('0'); // le nom d'une autre case ne valide rien
  await type(page, await nameOf(page, order[0]));
  await expect(page.locator('#gScore')).toHaveText('1');
  expect(await state(page, () => Game.state.sel)).toBe(order[1]);
  await page.click(`.tile[data-id="${order[30]}"]`);
  expect(await state(page, () => Game.state.sel)).toBe(order[30]);
  await page.press('#answer', 'Tab');
  expect(await state(page, () => Game.state.sel)).toBe(order[31]);
});

test('capitales : grille complète d’Europe jusqu’aux résultats', async ({ page }) => {
  await home(page);
  await startGame(page, 'capitals', { mode: 'grid', zone: 'EU' });
  for (let i = 0; i < 46; i++) {
    const id = await state(page, () => Game.state.sel);
    if (!id) break;
    await type(page, await capOf(page, id), 20);
  }
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#rCount')).toHaveText('46 / 46');
});

test('capitales en sens inverse : le drapeau n’apparaît qu’une fois trouvé', async ({ page }) => {
  await home(page);
  await startGame(page, 'capitals', { mode: 'grid', zone: 'EU', opt: { dir: 'rev' } });
  await expect(page.locator('.tile img')).toHaveCount(0);
  const id = await state(page, () => Game.state.sel);
  await type(page, await capOf(page, id));
  await page.press('#answer', 'Enter');
  await expect(page.locator('#gScore')).toHaveText('0');
  await type(page, await nameOf(page, id));
  await expect(page.locator('#gScore')).toHaveText('1');
  await expect(page.locator('.tile.found img')).toHaveCount(1);
});

test('pause : chrono figé, plateau masqué, progression conservée', async ({ page }) => {
  await home(page);
  await startGame(page, 'map', { mode: 'type' });
  await type(page, 'france');
  await page.click('#pauseBtn');
  const t = await page.textContent('#gTimer');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await expect(page.locator('#answer')).toBeHidden();
  await page.waitForTimeout(2200);
  await expect(page.locator('#gTimer')).toHaveText(t);
  await page.keyboard.press('Enter');
  await expect(page.locator('#pauseOverlay')).toBeHidden();
  await expect(page.locator('#gScore')).toHaveText('1');
  const before = await state(page, () => (performance.now() - Game.state.t0) / 1000);
  await page.click('#pauseBtn'); await page.waitForTimeout(1500); await page.click('#resumeBtn');
  const after = await state(page, () => (performance.now() - Game.state.t0) / 1000);
  expect(after - before).toBeLessThan(0.5); // le temps de pause n'est pas compté
});

test('pastilles : toujours pleines — fond clair si trouvé, fond sombre et contour clair sinon', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1366, height: 820 } });
  const page = await ctx.newPage();
  await home(page);
  await startGame(page, 'map', { mode: 'type', zone: 'NA' });
  await page.waitForFunction(() => typeof WORLD_HD !== 'undefined');
  for (const n of ['grenade', 'sainte-lucie', 'barbade', 'dominique']) await type(page, n);
  const look = id => page.evaluate(id => { const m = [...document.querySelectorAll('#mapSvg circle.marker')].find(e => e.__id === id); if (m.style.display === 'none') return 'masquée'; const cs = getComputedStyle(m); return `${cs.fill}|${cs.stroke}`; }, id);
  const WHITE = 'rgb(242, 242, 242)', BLACK = 'rgb(10, 10, 10)';
  // zoom à mi-chemin sur les Petites Antilles
  const c = await page.evaluate(() => { const r = [...document.querySelectorAll('#mapSvg circle.marker')].find(e => e.__id === 'LCA').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(c[0], c[1]);
  for (let j = 0; j < 4; j++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(60); }
  await page.waitForTimeout(900);
  for (const id of ['LCA', 'BRB']) expect(await look(id)).toBe(`${WHITE}|${WHITE}`);   // trouvés : fond blanc
  expect(await look('KNA')).toBe(`${BLACK}|${WHITE}`);                                  // pas trouvé : fond noir, contour blanc
  await ctx.close();
});
