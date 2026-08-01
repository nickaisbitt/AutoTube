#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';

const [script, ...args] = process.argv.slice(2);

if (!script) {
  console.error('Usage: node scripts/run-with-status.mjs <node-script> [...args]');
  process.exitCode = 2;
} else {
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', (error) => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  if (result.error) {
    console.error(`Failed to start ${script}: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.code !== null) {
    process.exitCode = result.code;
  } else {
    const signalNumber = osConstants.signals[result.signal] ?? 0;
    process.exitCode = signalNumber > 0 ? 128 + signalNumber : 1;
  }
}
