import { generateNarration } from './server-render/narration.mjs';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const outputDir = join(process.cwd(), 'test-audio-dir');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

async function concatenateAudio(audioFiles, outputFile) {
  if (audioFiles.length === 0) return false;
  if (audioFiles.length === 1) {
    const result = spawnSync('ffmpeg', ['-y', '-i', audioFiles[0].file, '-c:a', 'aac', '-b:a', '128k', outputFile], { encoding: 'utf8', timeout: 60000 });
    return result.status === 0;
  }

  const inputs = [];
  const filterInputs = [];
  for (let i = 0; i < audioFiles.length; i++) {
    inputs.push('-i', audioFiles[i].file);
    filterInputs.push(`[${i}:a]`);
  }
  const filterComplex = `${filterInputs.join('')}concat=n=${audioFiles.length}:v=0:a=1[out]`;

  console.log("Running ffmpeg with filter:", filterComplex);
  const result = spawnSync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '128k',
    outputFile,
  ], { encoding: 'utf8', timeout: 60000 });

  if (result.status !== 0) {
    console.warn(`  ⚠ Audio concat failed:`, result.stderr);
  } else {
    console.log(`  ✓ Audio concat succeeded`);
  }
  return result.status === 0;
}

const mockSegments = [
  { title: "Segment 1", narration: "Hello world this is a test.", duration: 2 },
  { title: "Segment 2", narration: "Another segment for the test.", duration: 3 }
];

async function run() {
  const audioFiles = await generateNarration(mockSegments, outputDir, {});
  const combined = join(outputDir, 'combined.aac');
  await concatenateAudio(audioFiles, combined);
  
  if (existsSync(combined)) {
    console.log("Success! combined.aac created.");
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', combined], { encoding: 'utf8' });
    console.log("Duration:", probe.stdout.trim());
  } else {
    console.log("Failed to create combined.aac.");
  }
}

run();
