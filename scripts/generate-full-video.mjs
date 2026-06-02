#!/usr/bin/env node
/**
 * Full pipeline: topic → script → media → narration → assembly → server-render MP4.
 * Uses Playwright with mocked OpenRouter + media APIs (no paid API key required).
 *
 * Usage:
 *   npm run dev   # in another terminal
 *   node scripts/generate-full-video.mjs
 *   node scripts/generate-full-video.mjs "Why AI changes healthcare"
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const topic = process.argv[2] || 'Why AI will change healthcare';
const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const outDir = join(process.cwd(), 'test-recordings', `full-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

const MOCK_SEGMENTS = [
  {
    type: 'intro',
    title: 'Hook',
    narration:
      'Your bank account could be drained in seconds by one wrong click. Today we explain how artificial intelligence is reshaping healthcare — and what that means for your identity, your files, and your family.',
    visualNote: 'Person at laptop, urgent hospital lighting',
    duration: 12,
  },
  {
    type: 'section',
    title: 'The Stakes',
    narration:
      'Hospitals face ransomware attacks that lock patient records overnight. AI can detect threats faster than humans, but it also gives criminals new tools to target your medical data at scale.',
    visualNote: 'Hospital server room, security alert on screen',
    duration: 14,
  },
  {
    type: 'outro',
    title: 'Your Action Plan',
    narration:
      'Protect yourself in three steps: turn on two-factor authentication for health portals, review app permissions quarterly, and ask your doctor which AI tools access your records.',
    visualNote: 'Checklist graphic, calm resolution shot',
    duration: 10,
  },
];

function openRouterBody(content) {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content } }],
  });
}

async function checkServer() {
  try {
    const r = await fetch(devServer, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

if (!(await checkServer())) {
  console.error(`❌ Dev server not reachable at ${devServer}`);
  console.error('   Start it: npm run dev -- --port 5173 --host 0.0.0.0');
  process.exit(1);
}

console.log(`\n🎬 Full video pipeline`);
console.log(`   Topic: ${topic}`);
console.log(`   Output dir: ${outDir}\n`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.addInitScript(() => {
  localStorage.setItem('autotube_onboarding_seen', 'true');
  sessionStorage.setItem(
    'autotube_config_session',
    JSON.stringify({
      openRouterKey: 'sk-or-v1-e2e-full-pipeline',
      sourceType: 'stock',
      flickrKey: '',
      ttsVoice: 'Leo',
    }),
  );
});

await page.route('**/openrouter.ai/**', async (route) => {
  const post = route.request().postDataJSON()?.messages?.map((m) => m.content).join(' ')?.toLowerCase() ?? '';
  let content = JSON.stringify({ segments: MOCK_SEGMENTS });
  if (post.includes('youtube title optimization') || post.includes('curiositygap')) {
    content = JSON.stringify({
      direct: 'AI in Healthcare Explained',
      curiosityGap: 'The AI Risk Hospitals Are Hiding',
      emotionalUrgent: 'Your Medical Records Are Exposed',
    });
  } else if (post.includes('blind') || (post.includes('score') && post.includes('production'))) {
    content = JSON.stringify({
      scores: {
        visualQuality: 8,
        pacing: 8,
        narrativeClarity: 8,
        thumbnailEffectiveness: 8,
        overallProductionValue: 8,
      },
      feedback: {
        visualQuality: 'ok',
        pacing: 'ok',
        narrativeClarity: 'ok',
        thumbnailEffectiveness: 'ok',
        overallProductionValue: 'ok',
      },
      letterGrade: 'B+',
      summary: 'Good',
    });
  } else if (
    post.includes('json array of segments') ||
    post.includes('quality checklist') ||
    post.includes('polish this script') ||
    post.includes('video script')
  ) {
    content = JSON.stringify(MOCK_SEGMENTS);
  } else if (post.includes('visual') || post.includes('concept')) {
    content = JSON.stringify({
      beat: 'hook',
      concepts: [{ description: 'Healthcare cybersecurity', searchTerms: ['hospital security'] }],
      classification: 'personal',
    });
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: openRouterBody(content) });
});

await page.route(/\/api\/(?:search|search-bing|search-google|search-videos|static-map|proxy-page).*/, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results: [
        {
          url: 'https://picsum.photos/id/28/1920/1080',
          image: 'https://picsum.photos/id/28/1920/1080',
          thumbnailUrl: 'https://picsum.photos/id/28/200/150',
          source: 'Mock',
          title: 'Healthcare tech',
          alt: 'Healthcare technology',
          width: 1920,
          height: 1080,
        },
      ],
    }),
  });
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
await page.route(/.*picsum\.photos.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
await page.route(/.*wikipedia\.org.*|.*wikimedia\.org.*/, (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ query: { pages: { '1': { title: 'Health', extract: 'Health topic.' } } } }),
  }),
);

await page.goto(devServer, { waitUntil: 'networkidle', timeout: 60000 });
await page.screenshot({ path: join(outDir, '01-loaded.png') });

if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 3000 }).catch(() => false)) {
  await page.getByTestId('onboarding-skip').click();
}

await page.getByTestId('topic-input').fill(topic);
await page.getByTestId('duration-select').selectOption('3').catch(() => {});
await page.getByTestId('generate-script-only').click();
console.log('⏳ Generating script...');
await page.waitForSelector('button:has-text("Source Media")', { timeout: 180000 });
console.log('✓ Script done');
await page.screenshot({ path: join(outDir, '02-script.png') });

await page.getByRole('button', { name: /Source Media/i }).click();
console.log('⏳ Sourcing media...');
await page.waitForSelector('button:has-text("Prepare Narration")', { timeout: 300000 });
console.log('✓ Media done');
await page.screenshot({ path: join(outDir, '03-media.png') });

await page.getByRole('button', { name: /Prepare Narration/i }).click();
console.log('⏳ Narration...');
await page.waitForSelector('button:has-text("Skip AI Edit"), button:has-text("Run AI Edit")', {
  timeout: 600000,
});
console.log('✓ Narration done');
await page.screenshot({ path: join(outDir, '04-narration.png') });

const skipEdit = page.getByRole('button', { name: /Skip AI Edit/i });
if (await skipEdit.isVisible({ timeout: 5000 }).catch(() => false)) {
  await skipEdit.click();
}
await page.waitForTimeout(1000);
await page.screenshot({ path: join(outDir, '05-ready-for-render.png') });

console.log('⏭ Skipping browser assembly — server-render CLI for final MP4');

const project = await page.evaluate(() => {
  const raw = localStorage.getItem('autotube_project');
  if (!raw) return null;
  return JSON.parse(raw).project ?? null;
});

await browser.close();

if (!project || !(project.media?.length > 0)) {
  console.error('❌ No project with media in localStorage — cannot server-render');
  process.exit(1);
}

const projectPath = '/tmp/autotube-project.json';
writeFileSync(projectPath, JSON.stringify(project, null, 2));
console.log(`\n📝 Saved project: ${project.media.length} media, ${project.narration?.length ?? 0} narration clips`);

const mp4Out = join(outDir, 'final-video.mp4');
console.log(`\n🎥 Server render → ${mp4Out}`);
const render = spawnSync(
  'node',
  ['server-render/index.mjs', projectPath, mp4Out],
  {
    cwd: process.cwd(),
    env: { ...process.env, DEV_SERVER_URL: devServer },
    encoding: 'utf8',
    timeout: 1_800_000,
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

if (render.stdout) console.log(render.stdout.slice(-2000));
if (render.stderr) console.error(render.stderr.slice(-1000));

const finalMp4 = mp4Out.replace('.mp4', '-final.mp4');
const artifactMp4 = join(process.cwd(), 'test-recordings', 'FINAL-OUTPUT.mp4');
let produced = null;

if (existsSync(finalMp4)) produced = finalMp4;
else if (existsSync(mp4Out)) produced = mp4Out;

if (produced) {
  copyFileSync(produced, artifactMp4);
  const stat = readFileSync(produced);
  console.log(`\n✅ FINAL VIDEO: ${produced}`);
  console.log(`   Size: ${(stat.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Copy: ${artifactMp4}`);
  process.exit(0);
}

console.error('\n❌ Server render failed');
process.exit(render.status ?? 1);
