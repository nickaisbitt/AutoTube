#!/usr/bin/env node
/**
 * AutoTube Remotion Renderer
 * Usage: node remotion/render.mjs <project.json> <output.mp4>
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const projectPath = process.argv[2] || '/tmp/autotube-project.json';
  const outputPath = process.argv[3] || '/tmp/remotion-output.mp4';

  if (!existsSync(projectPath)) {
    console.error(`Project file not found: ${projectPath}`);
    process.exit(1);
  }

  console.log('Reading project...');
  const project = JSON.parse(readFileSync(projectPath, 'utf8'));

  // Transform VideoProject → ProjectProps
  const fps = 24;
  const width = 1920;
  const height = 1080;

  const segments = (project.script || []).map((seg, i) => {
    const media = (project.media || []).find(m => m.segmentId === seg.id);
    const narration = (project.narration || []).find(n => n.segmentId === seg.id);

    return {
      id: seg.id,
      title: seg.title || `Segment ${i + 1}`,
      narration: seg.narration || '',
      type: seg.type || 'section',
      duration: seg.duration || 5,
      pacingScore: seg.pacingScore || 3,
      purposeTag: seg.purposeTag || '',
      sceneLayout: seg.sceneLayout || null,
      visualNote: seg.visualNote || '',
      media: media ? {
        id: media.id,
        url: media.url,
        type: media.type || 'image',
        alt: media.alt || '',
        source: media.source || '',
        thumbnailUrl: media.thumbnailUrl || undefined,
        duration: media.duration || undefined,
      } : undefined,
      narrationAudioUrl: narration?.audioUrl || undefined,
      narrationWordTimings: undefined,
    };
  });

  const totalDurationFrames = Math.round(
    segments.reduce((sum, s) => sum + s.duration, 0) * fps
  );

  const projectProps = {
    title: project.title || 'Untitled',
    topic: project.topic || '',
    style: project.style || 'documentary',
    segments,
    brand: {
      accentColor: '#3498db',
      channelName: project.exportSettings?.channelName || 'AutoTube',
      fontFamily: 'Inter, system-ui, sans-serif',
      particleStyle: project.style || 'documentary',
    },
    editPlan: [],
    retentionBeats: [],
    totalDurationFrames,
    fps,
    width,
    height,
  };

  console.log(`Rendering ${segments.length} segments, ${totalDurationFrames} frames at ${fps}fps...`);

  // Bundle the Remotion project
  console.log('Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: join(__dirname, 'src', 'index.ts'),
    onProgress: (progress) => {
      if (progress % 10 === 0) process.stdout.write(`\r  Bundle: ${progress}%`);
    },
  });
  console.log('\nBundle complete.');

  // Select composition
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'FullVideo',
    inputProps: projectProps,
  });

  // Render
  console.log('Rendering video...');
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: projectProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 5 === 0) process.stdout.write(`\r  Render: ${pct}%`);
    },
  });

  console.log(`\nDone! Output: ${outputPath}`);
}

main().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
