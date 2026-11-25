// Fonctions communes aux tests
import { expect } from '@playwright/test';

/** Ouvre l'accueil et vérifie qu'aucune erreur JavaScript ne survient pendant le test */
export async function home(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await expect(page.locator('#home')).toHaveClass(/active/);
  return errors;
}

/** Lance une partie depuis l'accueil : home(page) d'abord */
export async function startGame(page, game, { mode, zone = 'ALL', opt = {}, timer } = {}) {
  await page.evaluate(() => { document.getElementById('results').hidden = true; App.show('home'); });
  await page.click(`[data-game=${game}]`);
  if (mode) await page.click(`#setupModes [data-v=${mode}]`);
  await page.click(`#setupZones [data-v=${zone}]`);
  for (const [k, v] of Object.entries(opt)) await page.click(`#setupOptions [data-opt=${k}] [data-v="${v}"]`);
  if (timer) await page.click(`#setupTimer [data-v=${timer}]`);
  await page.click('#startBtn');
  await expect(page.locator('#game')).toHaveClass(/active/);
}

export const state = (page, fn, arg) => page.evaluate(fn, arg);
export const nameOf = (page, id) => page.evaluate(id => COUNTRIES.find(c => c.id === id).n, id);
export const capOf = (page, id) => page.evaluate(id => COUNTRIES.find(c => c.id === id).cap, id);

/** Tape une réponse et laisse le temps à la validation (y compris l'attente « Niger → Nigeria ») */
export async function type(page, text, wait = 150) {
  await page.fill('#answer', text);
  await page.waitForTimeout(wait);
}
