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
  const conts = await page.evaluate(() => [...document.querySelectorAll('.atlas-label')].filter(e => !e.classList.contains('hide')).map(e => COUNTRIES.find(c => c.n === e.dataset.name).c));
  expect(conts.length).toBeGreaterThan(10);
  expect(conts.every(c => c === 'AF')).toBe(true);
  await page.click('#atlasFilter [data-z=ALL]');
  await expect(page.locator('#atlasMap path.country.dim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('carte : pastille pleine tant que l’île est invisible, puis elle rétrécit et disparaît quand l’île se voit', async ({ page }) => {
  await home(page);
  await page.click('#openAtlas');
  await page.waitForFunction(() => typeof WORLD_HD !== 'undefined'); // tracés détaillés préchargés
  await page.fill('#atlasSearch', 'monaco'); await page.press('#atlasSearch', 'Enter');
  await page.click('#atlasPanel [data-close]');
  await page.click('[data-azoom=reset]'); await page.waitForTimeout(700);
  const st = () => page.evaluate(() => {
    const m = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === 'MCO');
    const land = [...document.querySelectorAll('#atlasMap path.country')].find(e => e.__id === 'MCO').getBoundingClientRect();
    const capDot = [...document.querySelectorAll('.atlas-caps circle')][COUNTRIES.findIndex(c => c.id === 'MCO')];
    return { marker: m.style.display === 'none' ? 0 : m.getBoundingClientRect().width, island: Math.max(land.width, land.height), capDot: !capDot.classList.contains('hide') };
  });
  expect(await page.evaluate(() => [...document.querySelectorAll('#atlasMap circle.marker')].filter(e => e.style.display !== 'none').length)).toBeGreaterThan(40);
  const steps = [await st()];
  for (let i = 0; i < 16 && steps[steps.length - 1].marker > 0; i++) {
    const c = await page.evaluate(() => { const m = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === 'MCO'); const el = m.style.display === 'none' ? [...document.querySelectorAll('#atlasMap path.country')].find(e => e.__id === 'MCO') : m; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(c[0], c[1]);
    for (let j = 0; j < 3; j++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(60); }
    await page.waitForTimeout(800);
    steps.push(await st());
  }
  for (let i = 1; i < steps.length; i++) expect(steps[i].marker).toBeLessThanOrEqual(steps[i - 1].marker + 0.1); // jamais de grossissement
  for (const s of steps) if (s.island < 2.5) expect(s.marker).toBeGreaterThan(9);       // île invisible : pastille pleine taille
  for (const s of steps) if (s.marker > 2) expect(s.capDot).toBe(false);                // pas de point de capitale sous la pastille
  const last = steps[steps.length - 1];
  expect(last.marker).toBe(0);                                                            // disparue…
  expect(last.island).toBeGreaterThan(9);                                                 // …quand l'île se voit
  expect(await page.evaluate(() => { const v = [...document.querySelectorAll('#atlasMap circle.marker')].find(e => e.__id === 'VAT'); return v.style.display !== 'none' && v.getBoundingClientRect().width; })).toBeGreaterThanOrEqual(5.9); // Vatican (aucun contour)
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
    return { n: vis.length, overlaps, names: vis.map(e => e.dataset.name) };
  });
  expect(r.n).toBeGreaterThan(50);
  expect(r.overlaps).toBe(0);
  for (const n of ['Russie', 'Canada', 'Chine', 'Brésil', 'Australie', 'Maldives']) expect(r.names).toContain(n);
});
