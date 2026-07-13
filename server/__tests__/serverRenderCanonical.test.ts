import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonical = join(root, 'server-render.mjs');
const deployCopy = join(root, 'deploy', 'server-render.mjs');
const entry = join(root, 'deploy', 'server-render', 'index.mjs');

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('canonical server-render for production', () => {
  it('root monolith exists and includes ffmpeg assembly gate', () => {
    expect(existsSync(canonical)).toBe(true);
    const src = readFileSync(canonical, 'utf8');
    expect(src).toContain('AUTOTUBE_RENDER_MODE');
    expect(src).toContain('runFfmpegAssemblyRender');
    expect(src).toContain('applyFfmpegYoutubeOverlays');
  });

  it('entrypoint spawns repo-root server-render.mjs, not deploy fork', () => {
    expect(existsSync(entry)).toBe(true);
    const src = readFileSync(entry, 'utf8');
    expect(src).toContain("join(__dirname, '..', '..')");
    expect(src).toContain('server-render.mjs');
    // Must not spawn ../server-render.mjs relative to deploy/ alone
    expect(src).not.toMatch(/parentDir\s*=\s*join\(__dirname,\s*'\.\.'\)/);
  });

  it('deploy/server-render.mjs matches root when present (no silent drift)', () => {
    if (!existsSync(deployCopy)) {
      // Allowed only if intentionally removed; GHCR uses root copy.
      return;
    }
    expect(sha256(canonical)).toBe(sha256(deployCopy));
  });
});
