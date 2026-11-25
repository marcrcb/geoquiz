import { test, expect } from '@playwright/test';
import { home } from './helpers.mjs';

test('atlas : recherche, fiche, voisins, filtre par continent', async ({ page }) => {
  const errors = await home(page);
  await page.click('#openAtlas');
  await expect(page.locator('#atlas')).toHaveClass(/active/);
  await page.fill('#atlasSearch', 'par');
  await expect(page.locator('.atlas-sugg li').first()).toContainText('France');
  await page.press('#atlasSearch', 'Enter');
  await expect(page.locator('#atlasPanel h2')).toHaveText('France');
  const panel = await page.textContent('#atlasPanel');
  expect(panel).toContain('Paris');
  expect(panel).toContain('Voisins terrestres (8)');
  expect(panel).not.toMatch(/superficie/i);
  await page.click('#atlasPanel [data-go="ESP"]');
  await expect(page.locator('#atlasPanel h2')).toHaveText('Espagne');
  await page.keyboard.press('Escape');
  await expect(page.locator('#atlasPanel')).toBeHidden();

  await page.click('#atlasFilter [data-z=AF]');
  await page.waitForTimeout(1200);
  const conts = await page.evaluate(() => [...document.querySelectorAll('.atlas-label')].filter(e => !e.classList.contains('hide')).map(e => COUNTRIES.find(c => c.n === e.textContent).c));
  expect(conts.length).toBeGreaterThan(10);
  expect(conts.every(c => c === 'AF')).toBe(true);
  await page.click('#atlasFilter [data-z=ALL]');
  await expect(page.locator('#atlasMap path.country.dim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('carte : pastilles de taille fixe, masquées quand le pays est visible', async ({ page }) => {
  await home(page);
  await page.click('#openAtlas');
  await page.waitForFunction(() => typeof WORLD_HD !== 'undefined'); // tracés détaillés préchargés
  await page.fill('#atlasSearch', 'monaco'); await page.press('#atlasSearch', 'Enter');
  await page.click('#atlasPanel [data-close]');
  const marker = () => page.evaluate(() => { const el = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === 'MCO'); return { w: el.getBoundingClientRect().width, hidden: el.style.display === 'none' }; });
  const sizes = [];
  for (let i = 0; i < 12 && !(await marker()).hidden; i++) {
    const c = await page.evaluate(() => { const m = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === 'MCO'); const el = m.style.display === 'none' ? [...document.querySelectorAll('#atlasMap path.country')].find(e => e.__id === 'MCO') : m; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(c[0], c[1]);
    for (let j = 0; j < 3; j++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(60); }
    await page.waitForTimeout(900);
    const m = await marker(); if (!m.hidden) sizes.push(Math.round(m.w));
  }
  expect(new Set(sizes).size).toBe(1); // même taille à tous les zooms
  expect((await marker()).hidden).toBe(true); // Monaco assez grand : pastille retirée
  expect(await page.evaluate(() => d3.zoomTransform(document.querySelector('#atlasMap svg')).k)).toBeLessThanOrEqual(120);
});
