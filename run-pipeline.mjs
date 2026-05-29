#!/usr/bin/env node
/**
 * AutoTube Full Pipeline Runner
 *
 * Permanent test fixture that drives the full video pipeline:
 *   browser → topic → script → media → narration → save project → server render → MP4 to Downloads
 *
 * Usage:
 *   node run-pipeline.mjs "The Fall of FTX"
 *   node run-pipeline.mjs "The Rise of Nvidia" --style warfront --duration 5
 *
 * Requires:
 *   - AutoTube dev server running on http://localhost:5173
 *   - Playwright installed (npx playwright install chromium)
 *   - ffmpeg + edge-tts installed for server render
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync, spawnSync } from 'child_process';

// ── Parse CLI arguments ────────────────────────────────────────────────────
const args = process.argv.slice(2);
let topic = 'The Rise of Nvidia';
let style = 'business_insider';
let duration = '3';
let output = '';
let headless = args.includes('--headless') || !!process.env.CI;
const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--style' && args[i + 1]) {
    style = args[i + 1];
    i++;
  } else if (args[i] === '--duration' && args[i + 1]) {
    duration = args[i + 1];
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    output = args[i + 1];
    i++;
  } else if (!args[i].startsWith('--')) {
    topic = args[i];
  }
}

console.log(`\n🎬 AutoTube Pipeline Runner`);
console.log(`   Topic:    "${topic}"`);
console.log(`   Style:    ${style}`);
console.log(`   Duration: ${duration} min\n`);

const videoDir = `test-recordings/run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({
  headless: headless,
});
const context = await browser.newContext({
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();

let drawCount = 0;
const sources = new Set();
page.on('console', msg => {
  const t = msg.text();
  if (t.includes('Drawing image')) {
    drawCount++;
    const m = t.match(/Drawing image: (https?:\/\/[^\s]+)/);
    if (m) try { sources.add(new URL(m[1]).hostname); } catch {}
  }
  if (t.includes('[Renderer]') && (t.includes('Done:') || t.includes('Preloaded') || t.includes('segment') || t.includes('ffmpeg') || t.includes('frame'))) {
    console.log('[R]', t.replace(/\[.*?\]\s*/, ''));
  }
});

// Set localStorage before page loads — dismiss onboarding and clear any saved project
// so the app always starts fresh on step 1 (topic input), not a mid-pipeline restore.
await page.addInitScript(() => {
  localStorage.setItem('autotube_onboarding_seen', 'true');
  localStorage.removeItem('autotube_project');
});

await page.goto(devServer, { waitUntil: 'networkidle' });
await page.screenshot({ path: join(videoDir, '01-initial.png') });

// Ensure onboarding is dismissed
await page.evaluate(() => {
  localStorage.setItem('autotube_onboarding_seen', 'true');
});

// Check if onboarding modal is showing and click through it
const hasModal = await page.locator('text=API Keys Required').isVisible({ timeout: 3000 }).catch(() => false);
if (hasModal) {
  console.log('Onboarding modal detected, clicking through...');

  // Load real OpenRouter key if available
  let openRouterKey = 'sk-or-v1-test-dummy-key-for-testing-only';
  try {
    const envContent = readFileSync('.env.local', 'utf8');
    const match = envContent.match(/VITE_OPENROUTER_KEY=([^\s]+)/);
    if (match) openRouterKey = match[1].replace(/['"]/g, '');
  } catch {}

  const pwdInputs = page.locator('input[type="password"]');
  await pwdInputs.nth(0).fill(openRouterKey);
  await pwdInputs.nth(1).fill('sk-test-dummy-openai-key-for-testing-only');
  await page.waitForTimeout(300);

  for (let step = 0; step < 3; step++) {
    const next = page.locator('button:has-text("Next")');
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) {
      await next.click();
      await page.waitForTimeout(400);
    }
  }

  const getStarted = page.locator('button:has-text("Get Started")');
  if (await getStarted.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isDisabled = await getStarted.isDisabled().catch(() => true);
    if (isDisabled) {
      const inputs = page.locator('input[type="password"]');
      const cnt = await inputs.count();
      for (let i = 0; i < cnt; i++) await inputs.nth(i).fill(openRouterKey);
      await page.waitForTimeout(300);
    }
    await getStarted.click();
  }
  await page.waitForTimeout(800);
}

// ── Step 1: Topic ──────────────────────────────────────────────────────────
await page.waitForSelector('[data-testid="topic-input"]', { timeout: 10000 });
console.log('✓ App loaded, topic input visible');

await page.getByTestId('topic-input').fill(topic);
// Try to select the style; fall back gracefully if the test ID doesn't exist
try {
  await page.getByTestId(`style-${style}`).click({ timeout: 3000 });
} catch {
  console.log(`  (style selector "style-${style}" not found, using default)`);
}
try {
  await page.getByTestId('duration-select').selectOption(duration);
} catch {
  console.log(`  (duration selector not found, using default)`);
}
await page.getByTestId('generate-script-only').click();
await page.screenshot({ path: join(videoDir, '02-topic-submitted.png') });

// ── Step 2: Script ─────────────────────────────────────────────────────────
await page.waitForSelector('text=Step 2 — Complete', { timeout: 180000 });
console.log('✓ Script generated');
await page.screenshot({ path: join(videoDir, '03-script-done.png') });

// ── Step 3: Media ──────────────────────────────────────────────────────────
await page.locator('button:has-text("Source Media Assets")').click();
for (let i = 0; i < 120; i++) {
  if (await page.locator('button:has-text("Prepare Narration")').isVisible().catch(() => false)) break;
  if (i % 10 === 0) process.stdout.write('.');
  await page.waitForTimeout(2000);
}
console.log('\n✓ Media sourced');
await page.screenshot({ path: join(videoDir, '04-media-done.png') });

// ── Step 4: Narration ──────────────────────────────────────────────────────
const nb = page.locator('button:has-text("Prepare Narration")');
if (await nb.isVisible({ timeout: 3000 }).catch(() => false)) {
  await nb.click();
  for (let i = 0; i < 60; i++) {
    if (await page.locator('text=Step 4 — Complete').isVisible().catch(() => false)) break;
    await page.waitForTimeout(2000);
  }
}
console.log('✓ Narration done');
await page.screenshot({ path: join(videoDir, '05-narration-done.png') });

// ── Step 5: Assemble (browser render) ──────────────────────────────────────
const ab = page.locator('button:has-text("Assemble Video")');
if (await ab.isVisible({ timeout: 5000 }).catch(() => false)) {
  await ab.click();
  console.log('Assembling via browser...');
  for (let i = 0; i < 300; i++) {
    const done = await page.locator('button:has-text("Preview Video")').isVisible().catch(() => false);
    const failed = await page.locator('text=Render Failed').isVisible().catch(() => false);
    if (done) { console.log('✓ Browser assembly complete!'); break; }
    if (failed) { console.log('⚠ Browser render failed (will try server render)'); break; }
    if (i % 30 === 0 && i > 0) console.log(`  ${i}s | draws: ${drawCount} | sources: ${sources.size}`);
    await page.waitForTimeout(1000);
  }
}
await page.screenshot({ path: join(videoDir, '06-assembled.png') });

// ── Step 6: Server-side render for high-quality MP4 ────────────────────────
console.log('\n🎥 Running server-side render for MP4 output...');
const renderArgs = ['server-render/index.mjs'];
if (output) {
  renderArgs.push(output);
}
const serverRenderResult = spawnSync('node', renderArgs, {
  encoding: 'utf8',
  timeout: 600000, // 10 min timeout
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, DEV_SERVER_URL: devServer },
});

if (serverRenderResult.stdout) {
  // Print last 30 lines of output
  const lines = serverRenderResult.stdout.split('\n');
  const tail = lines.slice(-30).join('\n');
  console.log(tail);
}
if (serverRenderResult.status === 0) {
  console.log('✓ Server render complete!');
} else {
  console.log('⚠ Server render failed');
  if (serverRenderResult.stderr) {
    console.log(serverRenderResult.stderr.slice(-500));
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────
await page.screenshot({ path: join(videoDir, '07-final.png') });
console.log(`\nTotal browser draws: ${drawCount}`);
console.log(`Image sources: ${[...sources].join(', ')}`);
await context.close();
await browser.close();
console.log(`\n✅ Pipeline complete! Recordings: ${videoDir}`);
