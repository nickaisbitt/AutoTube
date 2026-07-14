#!/usr/bin/env node
/**
 * Desktop-style walkthrough: dismiss onboarding, mock OpenRouter, generate script.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = '/tmp/autotube-desktop-test';
mkdirSync(OUT, { recursive: true });

const MOCK_SCRIPT = {
  segments: [
    {
      type: 'intro',
      title: 'Introduction',
      narration: 'Your bank account could be drained in seconds by a single phishing click.',
      visualNote: 'Close-up worried person at laptop',
      duration: 12,
    },
    {
      type: 'section',
      title: 'The Threat',
      narration: 'Hackers stole over four billion dollars from healthcare systems last year alone.',
      visualNote: 'Hospital data breach headline',
      duration: 15,
    },
    {
      type: 'outro',
      title: 'What You Can Do',
      narration: 'Here are three steps to protect your medical records starting today.',
      visualNote: 'Checklist on screen',
      duration: 10,
    },
  ],
};

function openRouterBody(model) {
  return JSON.stringify({
    id: 'mock',
    model: model || 'xiaomi/mimo-v2.5',
    choices: [{ message: { role: 'assistant', content: JSON.stringify(MOCK_SCRIPT) } }],
  });
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
  executablePath: process.env.CHROME_BIN || '/usr/bin/chromium-browser' || '/usr/bin/google-chrome',
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('openrouter.ai')) {
    req.respond({ status: 200, contentType: 'application/json', body: openRouterBody() });
    return;
  }
  req.continue();
});

await page.evaluateOnNewDocument(() => {
  localStorage.setItem('autotube_onboarding_seen', 'true');
  localStorage.setItem(
    'autotube_config_v2',
    JSON.stringify({ openRouterKey: 'sk-or-v1-desktop-test', xaiKey: '' }),
  );
});

const snap = async (name) => {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log('SCREENSHOT', path);
  return path;
};

const log = (msg) => console.log('STEP', msg);

try {
  log('Navigate to app');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
  await snap('01-after-onboarding-bypass');

  const modal = await page.$('text/Skip');
  if (modal) {
    log('Click Skip on modal (fallback)');
    await page.click('button:has-text("Skip")').catch(() => {});
    await page.waitForTimeout(500);
  }

  log('Fill topic');
  await page.waitForSelector('[data-testid="topic-input"]', { timeout: 15000 });
  await page.click('[data-testid="topic-input"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('[data-testid="topic-input"]', 'Why AI will change healthcare', { delay: 20 });
  await snap('02-topic-filled');

  const genBtn = await page.$('[data-testid="generate-script-only"]');
  const disabled = await page.$eval('[data-testid="generate-script-only"]', (el) => el.disabled);
  log(`Generate button disabled=${disabled}`);

  if (!disabled) {
    log('Click generate script');
    await page.click('[data-testid="generate-script-only"]');
    await snap('03-generating');

    await page.waitForFunction(
      () => document.body.innerText.includes('Step 2') || document.body.innerText.includes('Source Media'),
      { timeout: 120000 },
    );
    await snap('04-script-complete');

    const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    log('Body excerpt: ' + text.replace(/\s+/g, ' ').slice(0, 400));
  } else {
    log('FAIL: generate still disabled');
    await snap('03-generate-disabled');
  }

  log('Click media sidebar step');
  const mediaStep = await page.$('[data-testid="sidebar-step-media"]');
  if (mediaStep) {
    const mediaDisabled = await page.evaluate((el) => el.disabled, mediaStep);
    log(`Media step disabled=${mediaDisabled}`);
  }

  await snap('05-final');
} catch (err) {
  console.error('ERROR', err.message);
  await snap('error');
} finally {
  await browser.close();
}
