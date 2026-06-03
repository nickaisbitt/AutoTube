#!/usr/bin/env node
/**
 * CLI wrapper — see scripts/lib/generate-full-video.mjs
 */
import { generateFullVideo, checkDevServer } from './lib/generate-full-video.mjs';

const topic = process.argv[2] || 'Why AI will change healthcare';
const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';

if (!(await checkDevServer(devServer))) {
  console.error(`❌ Dev server not reachable at ${devServer}`);
  console.error('   Start it: npm run dev -- --port 5173 --host 0.0.0.0');
  process.exit(1);
}

const result = await generateFullVideo({ topic, youtubeMode: true, realHarvest: true });
if (!result.ok) {
  console.error(`\n❌ ${result.error}`);
  process.exit(1);
}

console.log(`\n✅ FINAL VIDEO: ${result.canonicalPath}`);
console.log(`   Size: ${result.sizeMb} MB`);
if (Number.isFinite(result.durationSec)) console.log(`   Duration: ${result.durationSec.toFixed(1)}s`);
process.exit(0);
