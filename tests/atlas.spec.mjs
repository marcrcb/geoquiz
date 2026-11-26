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

test('carte : pastilles toujours affichées, qui rétrécissent progressivement avec le zoom', async ({ page }) => {
  await home(page);
  await page.click('#openAtlas');
  await page.waitForFunction(() => typeof WORLD_HD !== 'undefined'); // tracés détaillés préchargés
  await page.fill('#atlasSearch', 'monaco'); await page.press('#atlasSearch', 'Enter');
  await page.click('#atlasPanel [data-close]');
  await page.click('[data-azoom=reset]'); await page.waitForTimeout(700);
  const marker = id => page.evaluate(id => { const el = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === id); return el.style.display === 'none' ? 0 : el.getBoundingClientRect().width; }, id);
  const zoomK = () => page.evaluate(() => d3.zoomTransform(document.querySelector('#atlasMap svg')).k);
  const all = await page.evaluate(() => [...document.querySelectorAll('#atlasMap circle.marker')].filter(e => e.style.display !== 'none').length);
  expect(all).toBeGreaterThan(40); // vue d'ensemble : toutes les pastilles sont là
  const sizes = [await marker('MCO')];
  for (let i = 0; i < 8; i++) {
    const c = await page.evaluate(() => { const r = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === 'MCO').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(c[0], c[1]);
    for (let j = 0; j < 3; j++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(60); }
    await page.waitForTimeout(700);
    sizes.push(await marker('MCO'));
  }
  for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1] + 0.1); // jamais de grossissement
  expect(sizes[sizes.length - 1]).toBeLessThan(sizes[0] * 0.6);                                    // nettement plus petite
  expect(await zoomK()).toBeGreaterThan(10);
  expect(await marker('VAT')).toBeGreaterThanOrEqual(5.9); // Vatican (aucun contour) : jamais sous 3 px de rayon
});

test('atlas : noms visibles dès la vue d’ensemble, sans chevauchement, le plus grand pays prioritaire', async ({ page }) => {
  await home(page);
  await page.click('#openAtlas');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const vis = [...document.querySelectorAll('.atlas-label')].filter(e => !e.classList.contains('hide'));
    const boxes = vis.map(e => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) overlaps++;
    }
    return { n: vis.length, overlaps, names: vis.map(e => e.textContent) };
  });
  expect(r.n).toBeGreaterThan(50);
  expect(r.overlaps).toBe(0);
  for (const n of ['Russie', 'Canada', 'Chine', 'Brésil', 'Australie', 'Maldives']) expect(r.names).toContain(n);
});
