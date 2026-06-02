#!/usr/bin/env node
/**
 * Full pipeline: topic → script → media → narration → server-render MP4.
 * Uses Playwright with mocked OpenRouter + media APIs (no paid API key required).
 *
 * Prerequisites:
 *   npm run dev -- --port 5173 --host 0.0.0.0   (in another terminal)
 *   ffmpeg on PATH; edge-tts optional (server render falls back to silence/TTS chain)
 *
 * Usage:
 *   npm run generate:video
 *   npm run generate:video -- "Why AI changes healthcare"
 *   node scripts/generate-full-video.mjs "The Future of Quantum Computing"
 *
 * Output:
 *   test-recordings/full-<timestamp>/final-video-final.mp4
 *   test-recordings/FINAL-OUTPUT.mp4  (latest copy)
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const topic = process.argv[2] || 'Why AI will change healthcare';
const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const runId = Date.now();
const outDir = join(process.cwd(), 'test-recordings', `full-${runId}`);
mkdirSync(outDir, { recursive: true });

const MOCK_SEGMENTS = [
  {
    type: 'intro',
    title: 'Hook',
    narration:
      'In 2024, hospitals paid $2.3 billion in ransomware settlements according to industry reports. Your bank account and medical records could be drained in seconds by one wrong click. Today we explain how artificial intelligence is reshaping healthcare — and what that means for your identity, your files, and your family at Mayo Clinic scale.',
    visualNote: 'Person at laptop, urgent hospital lighting',
    duration: 22,
  },
  {
    type: 'section',
    title: 'The Stakes',
    narration:
      'Epic Systems and UnitedHealth lost patient data access overnight during major cyber incidents. AI can detect threats 40% faster than human analysts, but criminals also use tools like ChatGPT to target your medical data at scale across 150 million exposed records.',
    visualNote: 'Hospital server room, security alert on screen',
    duration: 24,
  },
  {
    type: 'outro',
    title: 'Your Action Plan',
    narration:
      'Protect yourself in three steps starting today: turn on two-factor authentication for health portals, review app permissions quarterly, and ask your doctor which AI tools access your records. The FDA cleared 950 AI medical devices in 2025 — know which ones touch your data.',
    visualNote: 'Checklist graphic, calm resolution shot',
    duration: 20,
  },
];

function openRouterBody(content, model = 'openai/gpt-5.4-nano') {
  return JSON.stringify({
    id: `mock-${Date.now()}`,
    model,
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });
}

function mockOpenRouterContent(post) {
  const text = post.toLowerCase();

  if (text.includes('youtube title optimization expert')) {
    return JSON.stringify({
      direct: 'AI in Healthcare Explained',
      curiosityGap: 'The AI Risk Hospitals Are Hiding',
      emotionalUrgent: 'Your Medical Records Are Exposed',
    });
  }
  if (text.includes('pinned comment') && text.includes('json')) {
    return JSON.stringify({
      comments: [{ text: 'What surprised you most?', type: 'question_prompt' }],
    });
  }
  if (text.includes('hashtag') && (text.includes('generate') || text.includes('seo expert'))) {
    return JSON.stringify({ hashtags: ['#AI', '#Healthcare', '#CyberSecurity'] });
  }
  if (text.includes('playlist strategist') || text.includes('series metadata')) {
    return JSON.stringify({
      seriesName: 'Healthcare AI Deep Dive',
      episodeNumber: 1,
      playlistDescription: 'Exploring AI in modern healthcare.',
      episodeTitle: 'Ep. 1: AI Healthcare Risks',
    });
  }
  if (text.includes('blind review') && text.includes('thumbnaileffectiveness')) {
    return JSON.stringify({
      scores: {
        visualQuality: 8,
        pacing: 8,
        narrativeClarity: 8,
        thumbnailEffectiveness: 8,
        overallProductionValue: 8,
      },
      feedback: {
        visualQuality: 'Strong',
        pacing: 'Good',
        narrativeClarity: 'Clear',
        thumbnailEffectiveness: 'Effective',
        overallProductionValue: 'Professional',
      },
      letterGrade: 'B+',
      summary: 'Solid explainer with clear hook.',
    });
  }
  if (text.includes('visual director') || text.includes('segment visual plan')) {
    return JSON.stringify({
      beat: 'hook',
      concepts: [{ description: 'Hospital security breach', searchTerms: ['hospital cybersecurity'] }],
      classification: 'personal',
    });
  }
  if (
    text.includes('return only a valid json array') ||
    text.includes('json array of segments') ||
    text.includes('quality checklist') ||
    text.includes('polish this script') ||
    text.includes('trim this script') ||
    text.includes('specificity issues') ||
    text.includes('video script')
  ) {
    return JSON.stringify(MOCK_SEGMENTS);
  }
  if (text.includes('visual') || text.includes('concept')) {
    return JSON.stringify({
      beat: 'hook',
      concepts: [{ description: 'Healthcare cybersecurity', searchTerms: ['hospital security'] }],
      classification: 'personal',
    });
  }
  return JSON.stringify({ segments: MOCK_SEGMENTS });
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
  localStorage.removeItem('autotube_project');
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
  const post =
    route
      .request()
      .postDataJSON()
      ?.messages?.map((m) => m.content)
      .join('\n') ?? '';
  const model = route.request().postDataJSON()?.model ?? 'openai/gpt-5.4-nano';
  const content = mockOpenRouterContent(post);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: openRouterBody(content, model),
  });
});

await page.route(
  /\/api\/(?:search|search-bing-images|search-google-images|search-bing-videos|search-google-videos|search-videos|static-map|press-release|search-bing-news|proxy-page).*/,
  async (route) => {
    const url = route.request().url();
    if (url.includes('static-map')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://picsum.photos/id/20/1920/1080',
          thumbnailUrl: 'https://picsum.photos/id/20/200/150',
        }),
      });
      return;
    }
    if (url.includes('press-release') || url.includes('search-bing-news') || url.includes('proxy-page')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            url: 'https://picsum.photos/id/10/1920/1080',
            image: 'https://picsum.photos/id/10/1920/1080',
            thumbnailUrl: 'https://picsum.photos/id/10/200/150',
            source: 'Mock',
            title: 'Healthcare technology',
            alt: 'Healthcare technology',
            width: 1920,
            height: 1080,
            type: 'image',
          },
          {
            url: 'https://picsum.photos/id/11/1920/1080',
            image: 'https://picsum.photos/id/11/1920/1080',
            thumbnailUrl: 'https://picsum.photos/id/11/200/150',
            source: 'Mock',
            title: 'Medical data security',
            alt: 'Medical data security',
            width: 1920,
            height: 1080,
            type: 'image',
          },
        ],
      }),
    });
  },
);

await page.route(/https:\/\/www\.youtube\.com\/.*/, (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }),
);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
await page.route(/.*picsum\.photos.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
await page.route(/.*wikipedia\.org.*|.*wikimedia\.org.*/, (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      extract: 'Healthcare technology and cybersecurity context.',
      description: 'Healthcare',
      query: { pages: { '1': { title: 'Health', extract: 'Health topic.' } } },
    }),
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
await page.getByTestId('sidebar-step-script').locator('.bg-emerald-500').waitFor({ timeout: 180000 });
console.log('✓ Script done');
await page.screenshot({ path: join(outDir, '02-script.png') });

await page.getByRole('button', { name: /Source Media Assets/i }).click();
console.log('⏳ Sourcing media...');
await page.getByRole('button', { name: /Prepare Narration/i }).waitFor({ timeout: 300000 });
console.log('✓ Media done');
await page.screenshot({ path: join(outDir, '03-media.png') });

await page.getByRole('button', { name: /Prepare Narration/i }).click();
console.log('⏳ Narration...');
await page.getByTestId('skip-ai-edit-button').waitFor({ timeout: 600000 });
console.log('✓ Narration done');
await page.screenshot({ path: join(outDir, '04-narration.png') });

await page.getByTestId('skip-ai-edit-button').click();
await page.waitForTimeout(500);
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

const projectPath = `/tmp/autotube-project-${runId}.json`;
writeFileSync(projectPath, JSON.stringify(project, null, 2));
console.log(
  `\n📝 Saved project: ${projectPath} (${project.media.length} media, ${project.narration?.length ?? 0} narration clips)`,
);

const mp4Out = join(outDir, 'final-video.mp4');
console.log(`\n🎥 Server render → ${mp4Out}`);
const render = spawnSync('node', ['server-render.mjs', mp4Out], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEV_SERVER_URL: devServer,
    AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU || '1',
  },
  encoding: 'utf8',
  timeout: 1_800_000,
  stdio: ['inherit', 'pipe', 'pipe'],
});

if (render.stdout) console.log(render.stdout.slice(-3000));
if (render.stderr) console.error(render.stderr.slice(-1500));

const finalMp4 = mp4Out.replace('.mp4', '-final.mp4');
const artifactMp4 = join(process.cwd(), 'test-recordings', 'FINAL-OUTPUT.mp4');
const produced = existsSync(finalMp4) ? finalMp4 : existsSync(mp4Out) ? mp4Out : null;

if (!produced) {
  console.error('\n❌ Server render failed — no output file');
  process.exit(render.status ?? 1);
}

const size = statSync(produced).size;
if (size < 50_000) {
  console.error(`\n❌ Output too small (${size} bytes) — render likely failed`);
  process.exit(1);
}

copyFileSync(produced, artifactMp4);
console.log(`\n✅ FINAL VIDEO: ${produced}`);
console.log(`   Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Copy: ${artifactMp4}`);
process.exit(render.status === 0 || render.status === null ? 0 : render.status);
