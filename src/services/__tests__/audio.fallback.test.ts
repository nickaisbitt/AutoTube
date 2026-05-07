/**
 * Unit tests for resolveBackgroundMusicPath() in server-render/audio.mjs
 *
 * Tests the background music fallback logic:
 * - Known styles resolve to their specific file when it exists
 * - Missing style-specific files fall back to ambient-bg.aac
 * - Unknown styles fall back to ambient-bg.aac
 * - null is returned when neither style-specific nor fallback file exists
 *
 * Validates: Requirements 8.1, 8.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

// The PROJECT_ROOT in audio.mjs is computed as join(dirname(fileURLToPath(import.meta.url)), '..')
// which resolves to the workspace root
const PROJECT_ROOT = process.cwd();

// We need to mock fs at the module level and use dynamic imports with resetModules
// to ensure the mock is picked up by the .mjs module
let mockExistsSync: ReturnType<typeof vi.fn>;
let resolveBackgroundMusicPath: (style: string) => string | null;

describe('resolveBackgroundMusicPath', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockExistsSync = vi.fn().mockReturnValue(false);
    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      default: {
        existsSync: mockExistsSync,
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn(),
      },
    }));
    const audioModule = await import('../../../server-render/audio.mjs');
    resolveBackgroundMusicPath = audioModule.resolveBackgroundMusicPath;
  });

  afterEach(() => {
    vi.doUnmock('fs');
  });

  describe('known styles resolve to their specific file when it exists', () => {
    it('returns style-specific path for business_insider when file exists', () => {
      const stylePath = join(PROJECT_ROOT, 'public', 'audio', 'bg-business-insider.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === stylePath);

      const result = resolveBackgroundMusicPath('business_insider');
      expect(result).toBe(stylePath);
    });

    it('returns style-specific path for warfront when file exists', () => {
      const stylePath = join(PROJECT_ROOT, 'public', 'audio', 'bg-warfront.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === stylePath);

      const result = resolveBackgroundMusicPath('warfront');
      expect(result).toBe(stylePath);
    });

    it('returns style-specific path for documentary when file exists', () => {
      const stylePath = join(PROJECT_ROOT, 'public', 'audio', 'bg-documentary.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === stylePath);

      const result = resolveBackgroundMusicPath('documentary');
      expect(result).toBe(stylePath);
    });

    it('returns style-specific path for explainer when file exists', () => {
      const stylePath = join(PROJECT_ROOT, 'public', 'audio', 'bg-explainer.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === stylePath);

      const result = resolveBackgroundMusicPath('explainer');
      expect(result).toBe(stylePath);
    });
  });

  describe('missing style-specific files fall back to ambient-bg.aac', () => {
    it('falls back to ambient-bg.aac when business_insider file is missing', () => {
      const fallbackPath = join(PROJECT_ROOT, 'public', 'audio', 'ambient-bg.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === fallbackPath);

      const result = resolveBackgroundMusicPath('business_insider');
      expect(result).toBe(fallbackPath);
    });

    it('falls back to ambient-bg.aac when warfront file is missing', () => {
      const fallbackPath = join(PROJECT_ROOT, 'public', 'audio', 'ambient-bg.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === fallbackPath);

      const result = resolveBackgroundMusicPath('warfront');
      expect(result).toBe(fallbackPath);
    });
  });

  describe('unknown styles fall back to ambient-bg.aac', () => {
    it('falls back to ambient-bg.aac for an unknown style', () => {
      const fallbackPath = join(PROJECT_ROOT, 'public', 'audio', 'ambient-bg.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === fallbackPath);

      const result = resolveBackgroundMusicPath('unknown_style');
      expect(result).toBe(fallbackPath);
    });

    it('falls back to ambient-bg.aac for empty string style', () => {
      const fallbackPath = join(PROJECT_ROOT, 'public', 'audio', 'ambient-bg.aac');
      mockExistsSync.mockImplementation((p: unknown) => String(p) === fallbackPath);

      const result = resolveBackgroundMusicPath('');
      expect(result).toBe(fallbackPath);
    });
  });

  describe('null is returned when neither style-specific nor fallback file exists', () => {
    it('returns null when no files exist for a known style', () => {
      mockExistsSync.mockReturnValue(false);

      const result = resolveBackgroundMusicPath('business_insider');
      expect(result).toBeNull();
    });

    it('returns null when no files exist for an unknown style', () => {
      mockExistsSync.mockReturnValue(false);

      const result = resolveBackgroundMusicPath('nonexistent');
      expect(result).toBeNull();
    });
  });
});
