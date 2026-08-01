import pathModule from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

const __dirname = pathModule.dirname(fileURLToPath(import.meta.url));

/**
 * /api/* is fail-closed: the dev server needs AUTOTUBE_API_KEY and the app
 * needs the same value to send as X-API-Key. Prefer a real environment /
 * .env.local key (so a reused dev server keeps working) and otherwise fall
 * back to a throwaway key rather than disabling auth for tests.
 */
const fileEnv = loadEnv('development', __dirname, '');
const apiKey = (
  process.env.AUTOTUBE_API_KEY ||
  fileEnv.AUTOTUBE_API_KEY ||
  process.env.VITE_AUTOTUBE_API_KEY ||
  fileEnv.VITE_AUTOTUBE_API_KEY ||
  'autotube-e2e-api-key'
).trim();

// Exported to the test workers (fixtures read it) and to the dev server below.
process.env.AUTOTUBE_API_KEY = apiKey;
process.env.VITE_AUTOTUBE_API_KEY = apiKey;

export default defineConfig({
  testDir: process.env.PLAYWRIGHT_TEST_DIR ?? './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  workers: 1,
  reporter: 'list',
  timeout: 600000, // 10 minutes for E2E tests
  expect: {
    timeout: 120000, // 2 minutes for expect assertions
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 120000,
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU ?? '1',
      AUTOTUBE_API_KEY: apiKey,
      VITE_AUTOTUBE_API_KEY: apiKey,
    },
  },
});
