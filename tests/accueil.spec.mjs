import { test, expect } from '@playwright/test';
import { home } from './helpers.mjs';

test('accueil : 8 jeux, atlas, thème mémorisé', async ({ page }) => {
  const errors = await home(page);
  await expect(page.locator('[data-game]')).toHaveCount(8);
  await expect(page.locator('#gameCards2 .gc-num')).toHaveText(['04', '05', '06', '07', '08']);
  await expect(page.locator('#openAtlas')).toBeVisible();

  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(page.locator('#themeBtn')).toHaveText('Thème : auto');
  await page.click('#themeBtn');
  await expect(page.locator('#themeBtn')).toHaveText('Thème : clair');
  expect(await bg()).toBe('rgb(250, 250, 250)');
  await page.click('#themeBtn');
  await expect(page.locator('#themeBtn')).toHaveText('Thème : sombre');
  expect(await bg()).toBe('rgb(10, 10, 10)');
  await page.reload();
  expect(await bg()).toBe('rgb(10, 10, 10)'); // choix gardé, appliqué avant l'affichage
  expect(errors).toEqual([]);
});

test('thème auto : suit le réglage clair du système', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto('/');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(250, 250, 250)');
  await ctx.close();
});

test('configuration : modes, régions et options propres à chaque jeu', async ({ page }) => {
  await home(page);
  await page.click('[data-game=capitals]');
  await expect(page.locator('#setupModes .mode')).toHaveCount(3);
  await expect(page.locator('#setupOptions [data-opt=dir] .chip')).toHaveText(['Pays → capitale', 'Capitale → pays']);
  await page.click('#setupModes [data-v=locate]');
  await expect(page.locator('#setupOptions [data-opt=dir]')).toHaveCount(0); // le sens ne s'applique pas à la carte
  await page.click('[data-close]');
  await page.click('[data-game=path]');
  await expect(page.locator('#setupZones [data-v=OC]')).toHaveCount(0); // pas de chemin terrestre en Océanie
});
