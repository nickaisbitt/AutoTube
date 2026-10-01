import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock canvas module
vi.mock('canvas', () => ({
  createCanvas: vi.fn((w: number, h: number) => ({
    getContext: vi.fn(() => ({})),
    toBuffer: vi.fn(() => Buffer.alloc(w * h * 4)),
    width: w,
    height: h,
  })),
  loadImage: vi.fn(() => Promise.resolve({ width: 1920, height: 1080 })),
}));

describe('Image Validation Functions', () => {
  let detectImageFormat: (buf: Buffer) => string;
  let isCanvasSupportedFormat: (format: string) => boolean;
  let validateContentType: (contentType: string | null, buf: Buffer) => { valid: boolean; error?: string };
  let validateImage: (img: any, url: string, contentLength: number | null, buf: Buffer | null) => { valid: boolean; error?: string };
  let validateUrlSafety: (urlString: string) => { valid: boolean; error?: string };

  beforeEach(async () => {
    vi.resetModules();

    // Mock fs and child_process for server-render.mjs
    const mockFs = {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
    };
    vi.doMock('fs', () => ({
      ...mockFs,
      default: mockFs,
    }));

    const mockChildProcess = {
      spawn: vi.fn(() => ({
        on: vi.fn(),
        once: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn(), once: vi.fn() },
        stdout: { on: vi.fn(), pipe: vi.fn() },
        stderr: { on: vi.fn(), pipe: vi.fn() },
        kill: vi.fn(),
      })),
      spawnSync: vi.fn(),
      execFileSync: vi.fn(),
    };
    vi.doMock('child_process', () => ({
      ...mockChildProcess,
      default: mockChildProcess,
    }));

    // @ts-expect-error .mjs module has no declaration file
    const mod = await import('../../server-render.mjs');
    detectImageFormat = mod.detectImageFormat;
    isCanvasSupportedFormat = mod.isCanvasSupportedFormat;
    validateContentType = mod.validateContentType;
    validateImage = mod.validateImage;
    validateUrlSafety = mod.validateUrlSafety;
  });

  describe('detectImageFormat', () => {
    it('detects JPEG format from magic bytes', () => {
      const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(detectImageFormat(jpegBuf)).toBe('jpeg');
    });

    it('detects PNG format from magic bytes', () => {
      const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(detectImageFormat(pngBuf)).toBe('png');
    });

    it('detects GIF format from magic bytes', () => {
      const gifBuf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectImageFormat(gifBuf)).toBe('gif');
    });

    it('detects WebP format from magic bytes', () => {
      const webpBuf = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50
      ]);
      expect(detectImageFormat(webpBuf)).toBe('webp');
    });

    it('detects BMP format from magic bytes', () => {
      const bmpBuf = Buffer.from([0x42, 0x4D, 0x00, 0x00]);
      expect(detectImageFormat(bmpBuf)).toBe('bmp');
    });

    it('detects TIFF format (little-endian)', () => {
      const tiffBuf = Buffer.from([0x49, 0x49, 0x2A, 0x00]);
      expect(detectImageFormat(tiffBuf)).toBe('tiff');
    });

    it('detects TIFF format (big-endian)', () => {
      const tiffBuf = Buffer.from([0x4D, 0x4D, 0x00, 0x2A]);
      expect(detectImageFormat(tiffBuf)).toBe('tiff');
    });

    it('detects SVG from content', () => {
      const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">...</svg>');
      expect(detectImageFormat(svgContent)).toBe('svg');
    });

    it('returns unknown for invalid buffer', () => {
      const invalidBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(detectImageFormat(invalidBuf)).toBe('unknown');
    });

    it('returns unknown for empty buffer', () => {
      expect(detectImageFormat(Buffer.alloc(0))).toBe('unknown');
    });

    it('returns unknown for null/undefined buffer', () => {
      expect(detectImageFormat(null as any)).toBe('unknown');
      expect(detectImageFormat(undefined as any)).toBe('unknown');
    });
  });

  describe('isCanvasSupportedFormat', () => {
    it('returns true for supported formats', () => {
      expect(isCanvasSupportedFormat('jpeg')).toBe(true);
      expect(isCanvasSupportedFormat('png')).toBe(true);
      expect(isCanvasSupportedFormat('gif')).toBe(true);
      expect(isCanvasSupportedFormat('bmp')).toBe(true);
    });

    it('returns false for unsupported formats', () => {
      expect(isCanvasSupportedFormat('webp')).toBe(false);
      expect(isCanvasSupportedFormat('tiff')).toBe(false);
      expect(isCanvasSupportedFormat('svg')).toBe(false);
      expect(isCanvasSupportedFormat('unknown')).toBe(false);
    });

    it('handles case-insensitive input', () => {
      expect(isCanvasSupportedFormat('JPEG')).toBe(true);
      expect(isCanvasSupportedFormat('PnG')).toBe(true);
    });
  });

  describe('validateContentType', () => {
    it('validates valid image content types', () => {
      expect(validateContentType('image/jpeg', Buffer.alloc(100)).valid).toBe(true);
      expect(validateContentType('image/png', Buffer.alloc(100)).valid).toBe(true);
      expect(validateContentType('image/gif', Buffer.alloc(100)).valid).toBe(true);
      expect(validateContentType('image/webp', Buffer.alloc(100)).valid).toBe(true);
    });

    it('rejects HTML content type', () => {
      const result = validateContentType('text/html', Buffer.alloc(100));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTML');
    });

    it('detects HTML content masquerading as image', () => {
      const htmlContent = Buffer.from('<!DOCTYPE html><html><body>Error</body></html>');
      const result = validateContentType('image/jpeg', htmlContent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTML');
    });

    it('rejects missing content type', () => {
      const result = validateContentType(null, Buffer.alloc(100));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('accepts application/octet-stream', () => {
      const result = validateContentType('application/octet-stream', Buffer.alloc(100));
      expect(result.valid).toBe(true);
    });
  });

  describe('validateImage', () => {
    it('validates good image dimensions', () => {
      const img = { width: 1920, height: 1080 };
      const buf = Buffer.alloc(100 * 1024); // 100KB
      const result = validateImage(img, 'https://example.com/img.jpg', buf.length, buf);
      expect(result.valid).toBe(true);
    });

    it('rejects null image', () => {
      const result = validateImage(null, 'https://example.com/img.jpg', null, null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('null');
    });

    it('rejects invalid dimension types', () => {
      const img = { width: 'invalid', height: 1080 };
      const result = validateImage(img as any, 'https://example.com/img.jpg', null, null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('types');
    });

    it('rejects zero or negative dimensions', () => {
      const img1 = { width: 0, height: 1080 };
      const img2 = { width: 1920, height: -100 };
      
      expect(validateImage(img1, 'url', null, null).valid).toBe(false);
      expect(validateImage(img2, 'url', null, null).valid).toBe(false);
    });

    it('rejects images that are too small', () => {
      const img = { width: 50, height: 50 };
      const result = validateImage(img, 'https://example.com/img.jpg', null, null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('rejects images that are too large', () => {
      const img = { width: 10000, height: 10000 };
      const result = validateImage(img, 'https://example.com/img.jpg', null, null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('rejects extreme aspect ratios', () => {
      const img = { width: 8000, height: 100 }; // 80:1 ratio
      const result = validateImage(img, 'https://example.com/img.jpg', null, null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('aspect ratio');
    });

    it('rejects files that are too small', () => {
      const img = { width: 1920, height: 1080 };
      const buf = Buffer.alloc(512); // 512 bytes
      const result = validateImage(img, 'https://example.com/img.jpg', 512, buf);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('rejects files that are too large', () => {
      const img = { width: 1920, height: 1080 };
      const buf = Buffer.alloc(60 * 1024 * 1024); // 60MB
      const result = validateImage(img, 'https://example.com/img.jpg', buf.length, buf);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('validateUrlSafety', () => {
    it('allows valid HTTPS URLs', () => {
      const result = validateUrlSafety('https://example.com/image.jpg');
      expect(result.valid).toBe(true);
    });

    it('allows valid HTTP URLs', () => {
      const result = validateUrlSafety('http://example.com/image.jpg');
      expect(result.valid).toBe(true);
    });

    it('blocks localhost URLs', () => {
      expect(validateUrlSafety('http://localhost/image.jpg').valid).toBe(false);
      expect(validateUrlSafety('http://127.0.0.1/image.jpg').valid).toBe(false);
    });

    it('blocks private IP addresses', () => {
      expect(validateUrlSafety('http://192.168.1.1/image.jpg').valid).toBe(false);
      expect(validateUrlSafety('http://10.0.0.1/image.jpg').valid).toBe(false);
      expect(validateUrlSafety('http://172.16.0.1/image.jpg').valid).toBe(false);
    });

    it('blocks link-local addresses', () => {
      expect(validateUrlSafety('http://169.254.169.254/latest/meta-data/').valid).toBe(false);
    });

    it('blocks cloud metadata endpoints', () => {
      expect(validateUrlSafety('http://metadata.google.internal/').valid).toBe(false);
      expect(validateUrlSafety('http://169.254.169.254/').valid).toBe(false);
    });

    it('blocks non-HTTP protocols', () => {
      expect(validateUrlSafety('file:///etc/passwd').valid).toBe(false);
      expect(validateUrlSafety('ftp://example.com/file.jpg').valid).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(validateUrlSafety('not-a-url').valid).toBe(false);
      expect(validateUrlSafety('').valid).toBe(false);
    });
  });
});
