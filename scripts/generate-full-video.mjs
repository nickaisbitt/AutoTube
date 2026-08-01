#!/usr/bin/env node
/**
 * CLI wrapper — see scripts/lib/generate-full-video.mjs
 */
import { generateFullVideo, checkDevServer } from './lib/generate-full-video.mjs';

/** process.exit() truncates piped stdout/stderr, so drain both before leaving. */
async function exitWith(code) {
  process.exitCode = code;
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) =>
        new Promise((resolve) => {
          if (stream.writableLength === 0) resolve();
          else stream.write('', () => resolve());
        }),
    ),
  );
  process.exit(code);
}

const topic = process.argv[2] || 'Why AI will change healthcare';
const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';

if (!(await checkDevServer(devServer))) {
  console.error(`❌ Dev server not reachable at ${devServer}`);
  console.error('   Start it: npm run dev -- --port 5173 --host 0.0.0.0');
  await exitWith(1);
}

let result;
try {
  result = await generateFullVideo({ topic, youtubeMode: true, realHarvest: true });
} catch (err) {
  console.error(`\n❌ ${err?.stack || err?.message || err}`);
  await exitWith(1);
}

if (!result?.ok) {
  console.error(`\n❌ ${result?.error || 'generateFullVideo returned no result'}`);
  await exitWith(1);
}

console.log(`\n✅ FINAL VIDEO: ${result.canonicalPath}`);
console.log(`   Size: ${result.sizeMb} MB`);
if (Number.isFinite(result.durationSec)) console.log(`   Duration: ${result.durationSec.toFixed(1)}s`);
await exitWith(0);
