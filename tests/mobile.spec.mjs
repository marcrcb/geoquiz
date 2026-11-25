import { test, expect } from '@playwright/test';
import { home, startGame, state, type } from './helpers.mjs';

test('mobile : grille de drapeaux, la case active reste visible au-dessus de la saisie', async ({ page }) => {
  const errors = await home(page);
  await startGame(page, 'flags', { mode: 'grid' });
  for (let i = 0; i < 12; i++) await type(page, await state(page, () => COUNTRIES.find(c => c.id === Game.state.sel).n), 60);
  const visible = await page.evaluate(() => { const r = document.querySelector('.tile.sel').getBoundingClientRect(), a = document.querySelector('.answer').getBoundingClientRect(); return r.top >= 50 && r.bottom <= a.top; });
  expect(visible).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile : atlas, fiche en bas de l’écran et filtre défilant', async ({ page }) => {
  await home(page);
  await page.click('#openAtlas');
  await page.click('#atlasFilter [data-z=SA]');
  await page.fill('#atlasSearch', 'japon'); await page.press('#atlasSearch', 'Enter');
  await expect(page.locator('#atlasPanel h2')).toHaveText('Japon');
  const box = await page.locator('#atlasPanel').boundingBox();
  const vh = page.viewportSize().height;
  expect(box.y + box.height).toBeGreaterThan(vh * 0.9); // ancrée en bas
});

test('mobile : à l’échelle, pincer pour agrandir', async ({ page }) => {
  await home(page);
  await startGame(page, 'scale');
  const v0 = await state(page, () => Game.state.v);
  await page.evaluate(() => {
    const s = document.querySelector('.scale-svg'), r = s.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t, id, px) => s.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: px, clientY: y, bubbles: true }));
    ev('pointerdown', 11, x - 40); ev('pointerdown', 12, x + 40);
    for (let i = 1; i <= 10; i++) { ev('pointermove', 11, x - 40 - i * 8); ev('pointermove', 12, x + 40 + i * 8); }
    ev('pointerup', 11, 0); ev('pointerup', 12, 0);
  });
  expect(Math.exp((await state(page, () => Game.state.v)) - v0)).toBeCloseTo(3, 1);
});
