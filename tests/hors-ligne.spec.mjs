import { test, expect } from '@playwright/test';
import { home, startGame } from './helpers.mjs';

test('hors ligne : tout fonctionne sans réseau après une première visite', async ({ page, context }) => {
  const errors = await home(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // attendre que la mise en cache complète soit terminée
  await expect.poll(() => page.evaluate(async () => { const k = await caches.keys(); return k.length ? (await (await caches.open(k[0])).keys()).length : 0; }), { timeout: 30_000 }).toBeGreaterThan(400);
  await context.setOffline(true);
  await page.reload();
  await startGame(page, 'flags', { mode: 'grid' });
  await expect(page.locator('.tile')).toHaveCount(197);
  const broken = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.tile img')].slice(0, 40);
    imgs.forEach(i => i.scrollIntoView());
    await new Promise(r => setTimeout(r, 800));
    return imgs.filter(i => i.complete && i.naturalWidth === 0).length;
  });
  expect(broken).toBe(0);
  for (const g of ['shapes', 'neighbors', 'path', 'scale']) await startGame(page, g, g === 'shapes' ? { mode: 'grid', zone: 'EU' } : { zone: 'EU' });
  await page.evaluate(() => App.show('home'));
  await page.click('#openAtlas');
  await page.fill('#atlasSearch', 'bresil'); await page.press('#atlasSearch', 'Enter');
  await expect(page.locator('#atlasPanel h2')).toHaveText('Brésil');
  expect(errors).toEqual([]);
});

test('première visite : pas de rechargement intempestif quand le hors-ligne s’installe', async ({ page }) => {
  await home(page);
  await page.click('#openAtlas');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2000);
  await expect(page.locator('#atlas')).toHaveClass(/active/); // on reste sur l'écran ouvert
});
