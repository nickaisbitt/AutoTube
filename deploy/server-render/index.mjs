#!/usr/bin/env node
/**
 * AutoTube Server-Side Video Renderer — Main Orchestrator
 *
 * Renders a VideoProject to a .webm/.mp4 file using node-canvas + ffmpeg.
 * Imports drawing, narration, audio, and thumbnail modules.
 *
 * Usage:
 *   node server-render/index.mjs [output.webm]
 *
 * Requires:
 *   - npm install --save-dev canvas
 *   - ffmpeg installed (brew install ffmpeg)
 *   - AutoTube dev server running on http://localhost:5173
 *   - Pipeline run completed (media sourced)
 */

// Re-export the original monolithic renderer for now.
// The full module split (extracting drawing.mjs etc.) is a larger refactor
// that will be done incrementally. This file serves as the new entry point
// and delegates to the original server-render.mjs.

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const parentDir = join(__dirname, '..');

// Forward all CLI arguments to the original server-render.mjs
const args = process.argv.slice(2);
const child = spawn('node', [join(parentDir, 'server-render.mjs'), ...args], {
  cwd: parentDir,
  stdio: 'inherit',
  env: process.env, // Explicitly pass env vars (including VITE_* from parent)
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
