#!/usr/bin/env node
/**
 * AutoTube Test Render - RBC Amphitheatre Summer Lineup
 * 
 * Creates a minimal test project and renders it server-side.
 * Usage: node scripts/test-render.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Create a minimal test project with hardcoded content
const project = {
  version: 1,
  id: 'test-rbc-amphitheatre',
  title: 'RBC Amphitheatre Summer Lineup 2026',
  topic: 'RBC Amphitheatre Summer Lineup',
  style: 'modern_minimal',
  targetDuration: 60,
  script: [
    {
      id: 'seg-1',
      type: 'intro',
      title: 'Summer at the RBC',
      narration: 'The RBC Amphitheatre is back with an incredible summer lineup. From indie rock to hip-hop, this season has something for everyone.',
      duration: 8,
      pacingScore: 3,
      visualNote: 'SUMMER CONCERTS ARE BACK',
    },
    {
      id: 'seg-2',
      type: 'section',
      title: 'Headline Acts',
      narration: 'This year features some massive headliners. The amphitheatre has booked artists that sold out arenas across the country.',
      duration: 10,
      pacingScore: 4,
      visualNote: 'MASSIVE CROWD SHOT',
    },
    {
      id: 'seg-3',
      type: 'section',
      title: 'Indie Discoveries',
      narration: 'But the real gems might be the opening acts. Several indie bands on this roster are about to break through to mainstream success.',
      duration: 10,
      pacingScore: 3,
      visualNote: 'INDIE BAND PERFORMING',
    },
    {
      id: 'seg-4',
      type: 'section',
      title: 'The Venue Experience',
      narration: 'The RBC Amphitheatre itself is a draw. With stunning sightlines and great acoustics, every seat feels like the front row.',
      duration: 10,
      pacingScore: 2,
      visualNote: 'AMPHITHEATRE AERIAL VIEW',
    },
    {
      id: 'seg-5',
      type: 'section',
      title: 'Tickets and Dates',
      narration: 'Shows run from June through September. Tickets start at thirty dollars for general admission, with VIP packages available.',
      duration: 10,
      pacingScore: 3,
      visualNote: 'TICKET PRICES GRAPHIC',
    },
    {
      id: 'seg-6',
      type: 'outro',
      title: 'Don\'t Miss Out',
      narration: 'Summer concerts at the RBC Amphitheatre are always a highlight of the season. Get your tickets before they sell out.',
      duration: 8,
      pacingScore: 4,
      visualNote: 'SUNSET CONCERT SCENE',
    },
  ],
  media: [
    {
      id: 'media-1',
      segmentId: 'seg-1',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920',
      alt: 'concert stage lights',
      source: 'unsplash',
      concept: 'concert stage',
      score: 0.9,
    },
    {
      id: 'media-2',
      segmentId: 'seg-2',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1920',
      alt: 'large concert crowd',
      source: 'unsplash',
      concept: 'crowd shot',
      score: 0.85,
    },
    {
      id: 'media-3',
      segmentId: 'seg-3',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1920',
      alt: 'indie band performing',
      source: 'unsplash',
      concept: 'indie band',
      score: 0.8,
    },
    {
      id: 'media-4',
      segmentId: 'seg-4',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920',
      alt: 'amphitheatre venue',
      source: 'unsplash',
      concept: 'amphitheatre',
      score: 0.9,
    },
    {
      id: 'media-5',
      segmentId: 'seg-5',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1920',
      alt: 'concert tickets',
      source: 'unsplash',
      concept: 'tickets',
      score: 0.75,
    },
    {
      id: 'media-6',
      segmentId: 'seg-6',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1920',
      alt: 'sunset concert',
      source: 'unsplash',
      concept: 'sunset concert',
      score: 0.85,
    },
  ],
  narration: [],
  exportSettings: {
    resolution: '720p',
    quality: 'draft',
    backgroundMusic: true,
    musicPreset: 'ambient',
    aspectRatio: '16:9',
  },
  status: 'ready',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  console.log('🎬 AutoTube Test Render: "RBC Amphitheatre Summer Lineup"\n');

  // Save project to temp file
  const projectPath = join(tmpdir(), 'autotube-project.json');
  writeFileSync(projectPath, JSON.stringify(project, null, 2));
  console.log(`📝 Project saved to ${projectPath}`);
  console.log(`   ${project.script.length} segments, ${project.media.length} media assets\n`);

  // Trigger server render via API
  const DEV_SERVER = process.env.DEV_SERVER_URL || 'http://localhost:5173';
  
  console.log('🎥 Starting server-side render...');
  console.log(`   Connecting to ${DEV_SERVER}\n`);

  try {
    const renderRes = await fetch(`${DEV_SERVER}/api/server-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!renderRes.ok) {
      const err = await renderRes.text();
      console.error(`❌ Render failed to start: ${renderRes.status}`);
      console.error(err);
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
            process.stdout.write(`\r  ${event.pct}% — ${event.message}`);
          } else if (event.type === 'complete') {
            filePath = event.filePath;
            console.log(`\n  ✓ Render complete!\n`);
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
      console.log(`📹 Video: ${filePath}`);
      const outputPath = join(PROJECT_ROOT, 'test-recordings', 'rbc-amphitheatre-test.mp4');
      
      // Copy to a known location
      const { execSync } = await import('child_process');
      try {
        execSync(`cp "${filePath}" "${outputPath}"`);
        console.log(`📁 Also saved to: ${outputPath}`);
      } catch {
        // copy failed, original path still valid
      }
      
      console.log(`\n✅ Done! Open the file to watch your video.`);
    } else {
      console.error('\n❌ Render completed but no file path received');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Connection failed: ${err.message}`);
    console.error('\nMake sure the dev server is running:');
    console.error('  npm run dev');
    process.exit(1);
  }
}

main();
