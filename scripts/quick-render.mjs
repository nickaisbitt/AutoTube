#!/usr/bin/env node
/**
 * AutoTube Quick Test Render
 * 
 * Generates a short test video about a given topic using the full pipeline.
 * Usage: node scripts/quick-render.mjs "Topic Here"
 */

import { fetch } from 'undici';

const DEV_SERVER = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const TOPIC = process.argv[2] || 'RBC Amphitheatre Summer Lineup';

async function main() {
  console.log(`🎬 AutoTube Quick Render: "${TOPIC}"\n`);

  // Step 1: Generate full project via API
  console.log('📝 Step 1: Generating project...');
  const genRes = await fetch(`${DEV_SERVER}/api/generate-full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: TOPIC,
      style: 'modern_minimal',
      targetDuration: 60,
      exportSettings: {
        resolution: '720p',
        quality: 'draft',
        backgroundMusic: true,
        musicPreset: 'ambient',
      },
    }),
  });

  if (!genRes.ok) {
    const err = await genRes.text();
    console.error(`❌ Project generation failed: ${err}`);
    process.exit(1);
  }

  const project = await genRes.json();
  console.log(`  ✓ Project created: "${project.title}"`);
  console.log(`  ✓ ${project.script.length} segments, ${project.media.length} media assets\n`);

  // Step 2: Start server-side render
  console.log('🎥 Step 2: Starting server-side render...');
  const renderRes = await fetch(`${DEV_SERVER}/api/server-render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: project.id }),
  });

  if (!renderRes.ok || !renderRes.body) {
    console.error(`❌ Render failed to start: ${renderRes.status}`);
    process.exit(1);
  }

  // Read SSE progress
  const reader = renderRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let filePath = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'progress') {
          process.stdout.write(`\r  ${event.message} (${event.pct}%)`);
        } else if (event.type === 'complete') {
          filePath = event.filePath;
          console.log(`\n  ✓ Render complete!`);
        } else if (event.type === 'error') {
          console.error(`\n❌ Render error: ${event.message}`);
          process.exit(1);
        }
      } catch {
        // ignore malformed SSE
      }
    }
  }

  if (filePath) {
    console.log(`\n📹 Video saved to: ${filePath}`);
    console.log(`\n✅ Done! Open the file to watch your video about "${TOPIC}"`);
  } else {
    console.error('\n❌ Render completed but no file path received');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
