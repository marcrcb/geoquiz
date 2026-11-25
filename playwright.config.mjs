// Tests de bout en bout : npm test (le serveur local démarre tout seul)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: { command: 'node tests/server.mjs 4173', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
});
