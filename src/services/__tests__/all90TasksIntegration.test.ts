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

  describe('Wave 2: Stealth Infrastructure', () => {
    it('User-Agent pool exports correctly', async () => {
      const mod = await import('../scraper/userAgentPool');
      expect(mod.USER_AGENTS).toBeDefined();
      expect(mod.getRandomUserAgent).toBeDefined();
      expect(mod.getStealthHeaders).toBeDefined();
      expect(mod.USER_AGENTS.length).toBeGreaterThan(20);
      const ua = mod.getRandomUserAgent();
      expect(typeof ua).toBe('string');
      expect(ua.length).toBeGreaterThan(10);
    });

    it('Proxy manager exports correctly', async () => {
      const mod = await import('../scraper/proxyManager');
      expect(mod.ProxyManager).toBeDefined();
      const pm = new mod.ProxyManager();
      expect(pm.getNextProxy()).toBeNull();
    });

    it('Human delay exports correctly', async () => {
      const mod = await import('../scraper/humanDelay');
      expect(mod.humanDelay).toBeDefined();
      expect(mod.humanDelaySync).toBeDefined();
      const ms = mod.humanDelaySync({ minMs: 100, maxMs: 200 });
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(200);
    });

    it('Cookie jar exports correctly', async () => {
      const mod = await import('../scraper/cookieJar');
      expect(mod.CookieJar).toBeDefined();
      expect(mod.globalCookieJar).toBeDefined();
      const jar = new mod.CookieJar();
      jar.setCookie({ name: 'test', value: 'val', domain: 'example.com', path: '/' });
      const cookies = jar.getCookies('example.com');
      expect(cookies.length).toBe(1);
    });

    it('DoH resolver exports correctly', async () => {
      const mod = await import('../scraper/dohResolver');
      expect(mod.DOH_PROVIDERS).toBeDefined();
      expect(mod.resolveDoh).toBeDefined();
      expect(mod.DOH_PROVIDERS.length).toBeGreaterThanOrEqual(3);
    });

    it('Cloudflare bypass exports correctly', async () => {
      const mod = await import('../scraper/cloudflareBypass');
      expect(mod.detectCloudflareChallenge).toBeDefined();
      expect(mod.extractCfClearance).toBeDefined();
      expect(mod.isCloudflareProtected).toBeDefined();
    });

    it('TLS spoofing exports correctly', async () => {
      const mod = await import('../scraper/tlsSpoofing');
      expect(mod.TLS_FINGERPRINTS).toBeDefined();
      expect(mod.getRandomTlsProfile).toBeDefined();
      expect(mod.TLS_FINGERPRINTS.length).toBeGreaterThanOrEqual(4);
    });

    it('Referrer pool exports correctly', async () => {
      const mod = await import('../scraper/referrerPool');
      expect(mod.REFERRER_SOURCES).toBeDefined();
      expect(mod.getRandomReferrer).toBeDefined();
      expect(mod.getSearchReferrer).toBeDefined();
      const ref = mod.getSearchReferrer('test query', 'google');
      expect(ref).toContain('google');
    });

    it('Response interceptor exports correctly', async () => {
      const mod = await import('../scraper/responseInterceptor');
      expect(mod.MEDIA_URL_PATTERNS).toBeDefined();
      expect(mod.extractMediaUrls).toBeDefined();
      expect(mod.MEDIA_URL_PATTERNS.length).toBeGreaterThan(15);
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

  describe('Wave 4: Visual FX', () => {
    it('2.5D parallax exports correctly', async () => {
      const mod = await import('../visualFx/parallax25d');
      expect(mod.computeParallaxOffset).toBeDefined();
      expect(mod.splitIntoLayers).toBeDefined();
      expect(mod.drawParallaxFrame).toBeDefined();
      const offset = mod.computeParallaxOffset(0.5, 0.5, 100);
      expect(offset.x).toBeGreaterThan(0);
    });

    it('Chromatic aberration exports correctly', async () => {
      const mod = await import('../visualFx/chromaticAberration');
      expect(mod.drawChromaticAberration).toBeDefined();
      expect(mod.drawChromaticTransition).toBeDefined();
    });

    it('Anamorphic letterbox exports correctly', async () => {
      const mod = await import('../visualFx/anamorphicLetterbox');
      expect(mod.drawDynamicLetterbox).toBeDefined();
      expect(mod.computeLetterboxHeight).toBeDefined();
    });

    it('Flash frames exports correctly', async () => {
      const mod = await import('../visualFx/flashFrames');
      expect(mod.drawFlashFrame).toBeDefined();
      expect(mod.shouldInjectFlash).toBeDefined();
      expect(mod.computeFlashIntensity).toBeDefined();
    });

    it('Face-centric zoom exports correctly', async () => {
      const mod = await import('../visualFx/faceCentricZoom');
      expect(mod.detectFaceRegion).toBeDefined();
      expect(mod.computeFaceCentricTransform).toBeDefined();
    });

    it('Title depth mask exports correctly', async () => {
      const mod = await import('../visualFx/titleDepthMask');
      expect(mod.drawDepthMaskedTitle).toBeDefined();
      expect(mod.drawCinematicTitle).toBeDefined();
    });

    it('Style particles exports correctly', async () => {
      const mod = await import('../visualFx/styleParticles');
      expect(mod.createParticles).toBeDefined();
      expect(mod.updateParticles).toBeDefined();
      expect(mod.drawParticles).toBeDefined();
      const particles = mod.createParticles('embers', 10, 1920, 1080);
      expect(particles.length).toBe(10);
    });

    it('Vignette pulse exports correctly', async () => {
      const mod = await import('../visualFx/vignettePulse');
      expect(mod.drawDynamicVignette).toBeDefined();
      expect(mod.computeVignetteIntensity).toBeDefined();
    });

    it('Tension zoom exports correctly', async () => {
      const mod = await import('../visualFx/tensionZoom');
      expect(mod.computeTensionZoom).toBeDefined();
      expect(mod.createEscalationRamp).toBeDefined();
    });
  });

  describe('Wave 5: Audio FX', () => {
    it('Stereo panning exports correctly', async () => {
      const mod = await import('../audioFx/stereoPanning');
      expect(mod.computePanFilter).toBeDefined();
      expect(mod.applyStereoPan).toBeDefined();
      const filter = mod.computePanFilter('left-to-right', 5);
      expect(typeof filter).toBe('string');
      expect(filter.length).toBeGreaterThan(0);
    });

    it('Beat matching exports correctly', async () => {
      const mod = await import('../audioFx/beatMatching');
      expect(mod.estimateBeatGrid).toBeDefined();
      expect(mod.alignCutToBeat).toBeDefined();
    });

    it('Reverb exports correctly', async () => {
      const mod = await import('../audioFx/reverb');
      expect(mod.REVERB_PRESETS).toBeDefined();
      expect(mod.computeReverbFilter).toBeDefined();
      const filter = mod.computeReverbFilter('hall');
      expect(filter).toContain('aecho');
    });

    it('ASMR triggers exports correctly', async () => {
      const mod = await import('../audioFx/asmrTriggers');
      expect(mod.generateWhisperTriggers).toBeDefined();
      expect(mod.computeAsmrFilter).toBeDefined();
      const triggers = mod.generateWhisperTriggers(5, 60);
      expect(triggers.length).toBeGreaterThan(0);
    });

    it('Sub-bass rumble exports correctly', async () => {
      const mod = await import('../audioFx/subBassRumble');
      expect(mod.generateRumbleEvents).toBeDefined();
      expect(mod.computeRumbleFilter).toBeDefined();
      const events = mod.generateRumbleEvents([5, 15, 25]);
      expect(events.length).toBe(3);
    });

    it('Pitch ramping exports correctly', async () => {
      const mod = await import('../audioFx/pitchRamping');
      expect(mod.createTensionRamp).toBeDefined();
      expect(mod.computePitchFilter).toBeDefined();
    });

    it('Transient ducking exports correctly', async () => {
      const mod = await import('../audioFx/transientDucking');
      expect(mod.generateTransientDucks).toBeDefined();
      expect(mod.computeTransientDuckFilter).toBeDefined();
    });

    it('Ambient synth exports correctly', async () => {
      const mod = await import('../audioFx/ambientSynth');
      expect(mod.AMBIENT_PRESETS).toBeDefined();
      expect(mod.generateAmbientCommand).toBeDefined();
      expect(Object.keys(mod.AMBIENT_PRESETS).length).toBeGreaterThanOrEqual(5);
    });

    it('Filter chain builder exports correctly', async () => {
      const mod = await import('../audioFx/filterChainBuilder');
      expect(mod.FilterChainBuilder).toBeDefined();
      const builder = new mod.FilterChainBuilder();
      builder.addFadeIn(0.5).addVolume(0.8);
      const filter = builder.build();
      expect(typeof filter).toBe('string');
    });
  });

  describe('Wave 6: Hook FX', () => {
    it('Cold open interrupt exports correctly', async () => {
      const mod = await import('../hookFx/coldOpenInterrupt');
      expect(mod.drawGlitchEffect).toBeDefined();
      expect(mod.drawStaticNoise).toBeDefined();
      expect(mod.selectInterruptType).toBeDefined();
    });

    it('Contrast hook exports correctly', async () => {
      const mod = await import('../hookFx/contrastHook');
      expect(mod.drawContrastInversion).toBeDefined();
      expect(mod.computeContrastScore).toBeDefined();
    });

    it('Bass drop riser exports correctly', async () => {
      const mod = await import('../hookFx/bassDropRiser');
      expect(mod.generateRiserFilter).toBeDefined();
      expect(mod.generateBassDropFilter).toBeDefined();
      expect(mod.generateImpactSequence).toBeDefined();
      const filter = mod.generateBassDropFilter(5);
      expect(typeof filter).toBe('string');
    });

    it('Cinematic title depth exports correctly', async () => {
      const mod = await import('../hookFx/cinematicTitleDepth');
      expect(mod.drawMultiLayerTitle).toBeDefined();
      expect(mod.computeTypewriterProgress).toBeDefined();
    });

    it('Tension ramp exports correctly', async () => {
      const mod = await import('../hookFx/tensionRamp');
      expect(mod.createTensionProfile).toBeDefined();
      expect(mod.getSegmentZoom).toBeDefined();
      expect(mod.computeTensionScore).toBeDefined();
      const profile = mod.createTensionProfile(10, 'high');
      expect(profile.segments.length).toBe(10);
    });

    it('Kinetic overlays exports correctly', async () => {
      const mod = await import('../hookFx/kineticOverlays');
      expect(mod.drawKineticOverlay).toBeDefined();
      expect(mod.generateRetentionOverlays).toBeDefined();
    });

    it('Rule of three exports correctly', async () => {
      const mod = await import('../hookFx/ruleOfThree');
      expect(mod.extractMetricsFromText).toBeDefined();
      expect(mod.groupMetricsByThree).toBeDefined();
      const metrics = mod.extractMetricsFromText('Revenue grew 300% to $50 billion with 10x ROI');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('Cliffhanger scripting exports correctly', async () => {
      const mod = await import('../hookFx/cliffhangerScripting');
      expect(mod.CLIFFHANGER_TEMPLATES).toBeDefined();
      expect(mod.generateCliffhangerPrompt).toBeDefined();
      expect(mod.detectCliffhangerOpportunity).toBeDefined();
    });

    it('Pacing loops exports correctly', async () => {
      const mod = await import('../hookFx/pacingLoops');
      expect(mod.analyzePacingPattern).toBeDefined();
      expect(mod.computePacingVarietyScore).toBeDefined();
      const analysis = mod.analyzePacingPattern('Short sentence. This is a much longer sentence that contains more words.');
      expect(analysis.sentenceLengths.length).toBe(2);
    });
  });

  describe('Wave 7: Growth Features', () => {
    it('Thumbnail heatmap exports correctly', async () => {
      const mod = await import('../growth/thumbnailHeatmap');
      expect(mod.computeContrastScore).toBeDefined();
      expect(mod.computeSaliencyScore).toBeDefined();
      expect(mod.predictCTR).toBeDefined();
    });

    it('Comment bait exports correctly', async () => {
      const mod = await import('../growth/commentBait');
      expect(mod.COMMENT_BAIT_TEMPLATES).toBeDefined();
      expect(mod.selectCommentBait).toBeDefined();
      expect(mod.computeMidpointTime).toBeDefined();
      expect(mod.COMMENT_BAIT_TEMPLATES.length).toBeGreaterThan(10);
    });

    it('MP4 chapters exports correctly', async () => {
      const mod = await import('../growth/mp4Chapters');
      expect(mod.generateFFmpegChapterMetadata).toBeDefined();
      expect(mod.embedChapters).toBeDefined();
      expect(mod.chaptersFromSegments).toBeDefined();
      const chapters = mod.chaptersFromSegments([
        { title: 'Intro', duration: 30 },
        { title: 'Main', duration: 120 },
      ]);
      expect(chapters.length).toBe(2);
    });

    it('Easter eggs exports correctly', async () => {
      const mod = await import('../growth/easterEggs');
      expect(mod.generateEasterEggs).toBeDefined();
      expect(mod.EASTER_EGG_MESSAGES).toBeDefined();
      expect(mod.EASTER_EGG_MESSAGES.length).toBeGreaterThan(15);
    });

    it('Speed ramp exports correctly', async () => {
      const mod = await import('../growth/speedRamp');
      expect(mod.computeSpeedRamp).toBeDefined();
      expect(mod.shouldLoopClip).toBeDefined();
    });

    it('Feedback loop exports correctly', async () => {
      const mod = await import('../growth/feedbackLoop');
      expect(mod.parseAIReviewFeedback).toBeDefined();
      expect(mod.applyFeedbackCorrections).toBeDefined();
    });

    it('Style particles config exports correctly', async () => {
      const mod = await import('../growth/styleParticlesConfig');
      expect(mod.STYLE_PARTICLE_PRESETS).toBeDefined();
      expect(mod.getParticleConfigForStyle).toBeDefined();
    });

    it('Emotional transitions exports correctly', async () => {
      const mod = await import('../growth/emotionalTransitions');
      expect(mod.detectEmotionalTone).toBeDefined();
      expect(mod.computeTransitionCurve).toBeDefined();
      expect(mod.EMOTIONAL_KEYWORDS).toBeDefined();
    });

    it('Cliffhanger cutdowns exports correctly', async () => {
      const mod = await import('../growth/cliffhangerCutdowns');
      expect(mod.computeCutdowns).toBeDefined();
      expect(mod.detectIncompleteEnding).toBeDefined();
      expect(mod.detectIncompleteEnding('But wait until you see...')).toBe(true);
    });
  });

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

  describe('Wave 9: Advanced Rendering', () => {
    it('Lower thirds exports correctly', async () => {
      const mod = await import('../advancedRender/lowerThirds');
      expect(mod.drawLowerThird).toBeDefined();
      expect(mod.createLowerThirdFromSource).toBeDefined();
    });

    it('Text grid exports correctly', async () => {
      const mod = await import('../advancedRender/textGrid');
      expect(mod.createTextGrid).toBeDefined();
      expect(mod.drawTextGrid).toBeDefined();
    });

    it('Aspect ratio exports correctly', async () => {
      const mod = await import('../advancedRender/aspectRatio');
      expect(mod.ASPECT_RATIO_DIMENSIONS).toBeDefined();
      expect(mod.computeCropForAspect).toBeDefined();
      const crop = mod.computeCropForAspect(1920, 1080, '9:16');
      expect(crop.w).toBeGreaterThan(0);
    });

    it('Voice emotion exports correctly', async () => {
      const mod = await import('../advancedRender/voiceEmotion');
      expect(mod.EMOTION_VOICE_MAP).toBeDefined();
      expect(mod.getVoiceForSegment).toBeDefined();
    });

    it('Transitions exports correctly', async () => {
      const mod = await import('../advancedRender/transitions');
      expect(mod.drawTransition).toBeDefined();
      expect(mod.getTransitionDuration).toBeDefined();
      expect(mod.selectTransitionForSegment).toBeDefined();
    });

    it('Chart reveal exports correctly', async () => {
      const mod = await import('../advancedRender/chartReveal');
      expect(mod.drawProgressiveReveal).toBeDefined();
      expect(mod.isChartAsset).toBeDefined();
      expect(mod.isChartAsset('chart.png', 'Revenue chart')).toBe(true);
    });

    it('Name card exports correctly', async () => {
      const mod = await import('../advancedRender/nameCard');
      expect(mod.extractNamesFromText).toBeDefined();
      expect(mod.drawNameCard).toBeDefined();
    });

    it('Source citation exports correctly', async () => {
      const mod = await import('../advancedRender/sourceCitation');
      expect(mod.drawCitationBadge).toBeDefined();
      expect(mod.extractCitationsFromSegments).toBeDefined();
    });

    it('Progress timeline exports correctly', async () => {
      const mod = await import('../advancedRender/progressTimeline');
      expect(mod.drawEnhancedTimeline).toBeDefined();
      expect(mod.computeNotchPositions).toBeDefined();
    });
  });

  describe('Wave 10: Pipeline Integration', () => {
    it('Picsum fallback exports correctly', async () => {
      const mod = await import('../pipelineIntegration/picsumFallback');
      expect(mod.TOPIC_SEED_MAP).toBeDefined();
      expect(mod.getTopicRelevantPicsumUrl).toBeDefined();
      const url = mod.getTopicRelevantPicsumUrl('technology');
      expect(url).toContain('picsum');
    });

    it('Wikipedia hero exports correctly', async () => {
      const mod = await import('../pipelineIntegration/wikipediaHero');
      expect(mod.resolveWikipediaHeroImage).toBeDefined();
      expect(mod.resolveWikipediaHeroFromEntity).toBeDefined();
    });

    it('Segment reorder exports correctly', async () => {
      const mod = await import('../pipelineIntegration/segmentReorder');
      expect(mod.computeDramaScore).toBeDefined();
      expect(mod.reorderSegments).toBeDefined();
      expect(mod.selectColdOpenSegment).toBeDefined();
    });

    it('Beat integration exports correctly', async () => {
      const mod = await import('../pipelineIntegration/beatIntegration');
      expect(mod.BEAT_EFFECT_MAP).toBeDefined();
      expect(mod.getEffectsForBeat).toBeDefined();
      expect(Object.keys(mod.BEAT_EFFECT_MAP).length).toBeGreaterThanOrEqual(8);
    });

    it('Sound bed mapping exports correctly', async () => {
      const mod = await import('../pipelineIntegration/soundBedMapping');
      expect(mod.SOUND_BED_PRESETS).toBeDefined();
      expect(mod.selectSoundBedForSegment).toBeDefined();
    });

    it('Transition rendering exports correctly', async () => {
      const mod = await import('../pipelineIntegration/transitionRendering');
      expect(mod.createTransitionPlan).toBeDefined();
      expect(mod.renderTransitionFrame).toBeDefined();
    });

    it('Quality retry exports correctly', async () => {
      const mod = await import('../pipelineIntegration/qualityRetry');
      expect(mod.analyzeReviewFailure).toBeDefined();
      expect(mod.applyRetryActions).toBeDefined();
    });

    it('Draft mode FX exports correctly', async () => {
      const mod = await import('../pipelineIntegration/draftModeFx');
      expect(mod.DRAFT_FX_PRESETS).toBeDefined();
      expect(mod.shouldRenderEffect).toBeDefined();
      expect(mod.shouldRenderEffect('subtitles', true)).toBe(true);
    });

    it('Integration test exports correctly', async () => {
      const mod = await import('../pipelineIntegration/integrationTest');
      expect(mod.runPipelineIntegrationTest).toBeDefined();
      const result = mod.runPipelineIntegrationTest();
      expect(result.modulesLoaded).toBeGreaterThan(0);
      console.log(`Integration test: ${result.modulesLoaded} modules loaded, ${result.modulesFailed.length} failed`);
      if (result.modulesFailed.length > 0) {
        console.log('Failed modules:', result.modulesFailed);
      }
    });
  });
});
