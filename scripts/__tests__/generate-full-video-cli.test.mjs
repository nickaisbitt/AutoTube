import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../generate-full-video.mjs');

let stubDir;
let register;

/** Swap the CLI's lib import for a stub so the exit path runs without a real generate. */
function writeStubLib(body) {
  const stub = join(stubDir, `lib-stub-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(stub, body);
  return stub;
}

function runCli(stubPath, env = {}) {
  return spawnSync(
    process.execPath,
    ['--import', register, CLI, 'airline cabin pressure'],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, STUB_GENERATE_LIB: stubPath, ...env },
    },
  );
}

beforeAll(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'autotube-cli-'));
  const hooks = join(stubDir, 'hooks.mjs');
  writeFileSync(
    hooks,
    `import { pathToFileURL } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('lib/generate-full-video.mjs')) {
    return { url: pathToFileURL(process.env.STUB_GENERATE_LIB).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`,
  );
  register = join(stubDir, 'register.mjs');
  writeFileSync(
    register,
    `import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register(pathToFileURL(${JSON.stringify(hooks)}).href);
`,
  );
});

afterAll(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

describe('generate-full-video CLI exit status', () => {
  it('exits non-zero when the generate result is not ok', () => {
    const stub = writeStubLib(
      `export async function checkDevServer() { return true; }
export async function generateFullVideo() {
  return { ok: false, error: 'HARVEST_VOLUME_FAIL: 8/12 segments below 6 assets' };
}
`,
    );
    const res = runCli(stub);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('HARVEST_VOLUME_FAIL');
  });

  it('exits non-zero when generateFullVideo throws', () => {
    const stub = writeStubLib(
      `export async function checkDevServer() { return true; }
export async function generateFullVideo() { throw new Error('render crashed'); }
`,
    );
    const res = runCli(stub);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('render crashed');
  });

  it('exits non-zero when the dev server is unreachable', () => {
    const stub = writeStubLib(
      `export async function checkDevServer() { return false; }
export async function generateFullVideo() { throw new Error('should not run'); }
`,
    );
    const res = runCli(stub);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Dev server not reachable');
  });

  it('flushes piped stdout before exiting on failure', () => {
    const stub = writeStubLib(
      `export async function checkDevServer() { return true; }
export async function generateFullVideo() {
  process.stdout.write('L'.repeat(2_000_000) + '\\nTAIL_MARKER\\n');
  return { ok: false, error: 'HARVEST_VOLUME_FAIL: thin harvest' };
}
`,
    );
    const res = runCli(stub);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('TAIL_MARKER');
  });

  it('exits zero on a successful generate', () => {
    const stub = writeStubLib(
      `export async function checkDevServer() { return true; }
export async function generateFullVideo() {
  return { ok: true, canonicalPath: '/tmp/final.mp4', sizeMb: 12.3, durationSec: 61.2 };
}
`,
    );
    const res = runCli(stub);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('FINAL VIDEO: /tmp/final.mp4');
  });
});
