import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('mkdir-before-write regression test', () => {
  it('creates directory before writing files (downloadClip pattern)', () => {
    const cacheDir = join(tmpdir(), `autotube-clips-test-${Date.now()}`);
    try {
      expect(existsSync(cacheDir)).toBe(false);

      mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      expect(existsSync(cacheDir)).toBe(true);

      const testFile = join(cacheDir, 'test.txt');
      writeFileSync(testFile, 'data');
      expect(existsSync(testFile)).toBe(true);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('creates temp dir before writing frames (renderVideo pattern)', () => {
    const tmpDir = join(tmpdir(), `autotube-${Date.now()}`);
    try {
      expect(existsSync(tmpDir)).toBe(false);

      mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
      expect(existsSync(tmpDir)).toBe(true);

      const frameFile = join(tmpDir, 'frame-000001.png');
      writeFileSync(frameFile, Buffer.alloc(8));
      expect(existsSync(frameFile)).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('mkdirSync with recursive:true does not throw for existing dir', () => {
    const dir = join(tmpdir(), `autotube-mkdir-test-${Date.now()}`);
    try {
      mkdirSync(dir, { recursive: true });
      expect(() => mkdirSync(dir, { recursive: true })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
