import { describe, it, expect } from 'vitest';

describe('All 90 Tasks Integration Test', () => {
  describe('Wave 1: Source Providers', () => {
    it('Giphy provider exports correctly', async () => {
      const mod = await import('../sourceProviders/giphy');
      expect(mod.GiphyProvider).toBeDefined();
      const provider = new mod.GiphyProvider();
      expect(provider.name).toBe('Giphy');
      expect(provider.requiresKey).toBe(false);
    });

    it('Unsplash provider exports correctly', async () => {
      const mod = await import('../sourceProviders/unsplash');
      expect(mod.UnsplashProvider).toBeDefined();
      const provider = new mod.UnsplashProvider();
      expect(provider.name).toBe('Unsplash');
    });

    it('Archive.org provider exports correctly', async () => {
      const mod = await import('../sourceProviders/archiveOrg');
      expect(mod.ArchiveOrgProvider).toBeDefined();
      const provider = new mod.ArchiveOrgProvider();
      expect(provider.name).toBe('Archive.org');
    });

    it('NASA provider exports correctly', async () => {
      const mod = await import('../sourceProviders/nasa');
      expect(mod.NasaProvider).toBeDefined();
      const provider = new mod.NasaProvider();
      expect(provider.name).toBe('NASA');
    });

    it('Vimeo provider exports correctly', async () => {
      const mod = await import('../sourceProviders/vimeo');
      expect(mod.VimeoProvider).toBeDefined();
      const provider = new mod.VimeoProvider();
      expect(provider.name).toBe('Vimeo');
    });

    it('Dailymotion provider exports correctly', async () => {
      const mod = await import('../sourceProviders/dailymotion');
      expect(mod.DailymotionProvider).toBeDefined();
      const provider = new mod.DailymotionProvider();
      expect(provider.name).toBe('Dailymotion');
    });

    it('Wikimedia resolver exports correctly', async () => {
      const mod = await import('../sourceProviders/wikimediaResolver');
      expect(mod.resolveWikimediaUrl).toBeDefined();
      expect(mod.resolveWikimediaFromPage).toBeDefined();
    });

    it('Hybrid scraper exports correctly', async () => {
      const mod = await import('../sourceProviders/hybridScraper');
      expect(mod.HybridScraperProvider).toBeDefined();
      const provider = new mod.HybridScraperProvider();
      expect(provider.name).toBe('HybridScraper');
    });

    it('Watermark filter exports correctly', async () => {
      const mod = await import('../sourceProviders/watermarkFilter');
      expect(mod.WATERMARK_DOMAINS).toBeDefined();
      expect(mod.isWatermarked).toBeDefined();
      expect(mod.filterWatermarked).toBeDefined();
      expect(Array.isArray(mod.WATERMARK_DOMAINS)).toBe(true);
      expect(mod.WATERMARK_DOMAINS.length).toBeGreaterThan(20);
    });
  });

  describe('Wave 3: HTML/JS Parsers', () => {
    it('JSON-LD parser exports correctly', async () => {
      const mod = await import('../parsers/jsonLdParser');
      expect(mod.extractJsonLd).toBeDefined();
      expect(mod.extractVideoFromJsonLd).toBeDefined();
      const html = '<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"test.mp4"}</script>';
      const result = mod.extractJsonLd(html);
      expect(result.length).toBe(1);
    });

    it('Srcset parser exports correctly', async () => {
      const mod = await import('../parsers/srcsetParser');
      expect(mod.parseSrcset).toBeDefined();
      expect(mod.getLargestFromSrcset).toBeDefined();
      const result = mod.parseSrcset('img-400.jpg 400w, img-800.jpg 800w, img-1200.jpg 1200w');
      expect(result.length).toBe(3);
    });

    it('OG video parser exports correctly', async () => {
      const mod = await import('../parsers/ogVideoParser');
      expect(mod.extractOgVideo).toBeDefined();
      expect(mod.extractOgImage).toBeDefined();
      const html = '<meta property="og:video:secure_url" content="https://example.com/video.mp4">';
      const result = mod.extractOgVideo(html);
      expect(result.length).toBe(1);
    });

    it('HTML5 source parser exports correctly', async () => {
      const mod = await import('../parsers/html5SourceParser');
      expect(mod.extractVideoSources).toBeDefined();
      expect(mod.selectBestSource).toBeDefined();
    });

    it('Inline config parser exports correctly', async () => {
      const mod = await import('../parsers/inlineConfigParser');
      expect(mod.extractInlineConfigs).toBeDefined();
      expect(mod.extractNextData).toBeDefined();
    });

    it('CSS bg parser exports correctly', async () => {
      const mod = await import('../parsers/cssBgParser');
      expect(mod.extractCssBgImages).toBeDefined();
      expect(mod.resolveCssUrl).toBeDefined();
    });

    it('Lazy-load parser exports correctly', async () => {
      const mod = await import('../parsers/lazyLoadParser');
      expect(mod.LAZY_LOAD_ATTRIBUTES).toBeDefined();
      expect(mod.extractLazyLoadUrls).toBeDefined();
      expect(mod.LAZY_LOAD_ATTRIBUTES.length).toBeGreaterThan(5);
    });

    it('Base64 parser exports correctly', async () => {
      const mod = await import('../parsers/base64Parser');
      expect(mod.extractBase64Images).toBeDefined();
      expect(mod.isValidBase64Image).toBeDefined();
    });

    it('Href file parser exports correctly', async () => {
      const mod = await import('../parsers/hrefFileParser');
      expect(mod.MEDIA_EXTENSIONS).toBeDefined();
      expect(mod.extractMediaHrefs).toBeDefined();
      expect(mod.isMediaUrl).toBeDefined();
      const result = mod.isMediaUrl('https://example.com/video.mp4');
      expect(result.isMedia).toBe(true);
    });
  });

  // Waves 4-7 (visualFx, audioFx, hookFx, growth) were removed: those TS
  // modules were unwired duplicates of deploy/server-render/*.mjs and have
  // been deleted (see src/components/_unused/README.md).

  describe('Wave 8: Quality Validation', () => {
    it('Content length check exports correctly', async () => {
      const mod = await import('../qualityValidation/contentLengthCheck');
      expect(mod.checkContentLength).toBeDefined();
    });

    it('MIME type check exports correctly', async () => {
      const mod = await import('../qualityValidation/mimeTypeCheck');
      expect(mod.VALID_IMAGE_TYPES).toBeDefined();
      expect(mod.VALID_VIDEO_TYPES).toBeDefined();
      expect(mod.validateMimeTypeFromUrl).toBeDefined();
      const result = mod.validateMimeTypeFromUrl('https://example.com/image.jpg', 'image');
      expect(result.isValid).toBe(true);
    });

    it('Watermark heatmap exports correctly', async () => {
      const mod = await import('../qualityValidation/watermarkHeatmap');
      expect(mod.detectWatermarkRegions).toBeDefined();
      expect(mod.computeWatermarkScore).toBeDefined();
    });

    it('Contrast analyzer exports correctly', async () => {
      const mod = await import('../qualityValidation/contrastAnalyzer');
      expect(mod.analyzeContrast).toBeDefined();
    });

    it('Text density check exports correctly', async () => {
      const mod = await import('../qualityValidation/textDensityCheck');
      expect(mod.computeTextDensity).toBeDefined();
    });

    it('Reverse image search exports correctly', async () => {
      const mod = await import('../qualityValidation/reverseImageSearch');
      expect(mod.searchTinEye).toBeDefined();
      expect(mod.verifyImageOriginality).toBeDefined();
    });

    it('Redirect trace exports correctly', async () => {
      const mod = await import('../qualityValidation/redirectTrace');
      expect(mod.traceRedirects).toBeDefined();
      expect(mod.isDomainBlocked).toBeDefined();
      const blocked = mod.isDomainBlocked('https://www.shutterstock.com/img.jpg', ['shutterstock']);
      expect(typeof blocked).toBe('boolean');
    });

    it('Color palette exports correctly', async () => {
      const mod = await import('../qualityValidation/colorPalette');
      expect(mod.extractPalette).toBeDefined();
      expect(mod.computePaletteBonus).toBeDefined();
    });

    it('pHash duplicate exports correctly', async () => {
      const mod = await import('../qualityValidation/phashDuplicate');
      expect(mod.computePHash).toBeDefined();
      expect(mod.hammingDistance).toBeDefined();
      expect(mod.PhashRegistry).toBeDefined();
      const registry = new mod.PhashRegistry();
      registry.register('abc123', 'http://example.com/img.jpg');
      expect(registry.size()).toBe(1);
    });
  });

  // Waves 9-10 (advancedRender, pipelineIntegration) were removed for the
  // same reason as Waves 4-7 above.
});
