# AutoTube Viral Growth Strategies - 90 Task Blueprint

## Wave 1: Source Provider Upgrades (Tasks 1-9)
1. **Giphy MP4 CDN Sourcing** - Scrape Giphy search HTML, extract GIF IDs, rewrite to `media.giphy.com/media/{id}/giphy.mp4` CDN URLs
2. **Unsplash Original CDN Rewrites** - Parse Unsplash search results, rewrite `images.unsplash.com` URLs to `?w=3840&q=90` for max resolution
3. **Archive.org Video Scraper** - Query `archive.org/advancedsearch.php` API for CC video assets, extract direct download URLs
4. **NASA Public Asset Crawler** - Scrape `images.nasa.gov/search` API for public domain space/science imagery
5. **Vimeo Config Parser** - Parse Vimeo page `__NEXT_DATA__` JSON config to extract progressive download MP4 URLs
6. **Dailymotion Config Parser** - Parse Dailymotion `/player/metadata/` API for direct video stream URLs
7. **Wikimedia Hashed URL Resolver** - Resolve Wikimedia Commons MD5-hashed file paths from page HTML to direct `upload.wikimedia.org` URLs
8. **Multi-Source Hybrid Scraper** - Orchestrate parallel queries across 3+ sources with score-weighted deduplication
9. **Stock Watermark Exclusion List** - Expand domain blocklist with pattern-based watermark detection in URL/alt text

## Wave 2: Stealth/Scraper Infrastructure (Tasks 10-18)
10. **Rotating User-Agent Pool** - Pool of 20+ desktop/mobile UAs with per-request random selection
11. **Proxy Tunneling Configuration** - HTTP/HTTPS proxy rotation with health checking and failover
12. **Randomized Human Sleep Patterns** - Gaussian-distributed delays (1-4s mean, 0.5s stddev) between requests
13. **Stateful Cookie Jar Recycling** - Persistent cookie storage per domain with TTL-based expiration
14. **DNS-over-HTTPS Rotation** - Rotate between Cloudflare, Google, Quad9 DoH endpoints for DNS resolution
15. **CF Clear Cookie Harvesting** - Detect Cloudflare challenges, solve via headless browser, cache cf_clearance
16. **Headless Chrome TLS Fingerprint Spoofing** - Match Chrome TLS JA3 fingerprint via puppeteer-extra-stealth
17. **Organic Referrer Header Pools** - Rotate Referer headers between Google, Bing, DuckDuckGo, direct
18. **Network Response Interception** - MITM proxy listener to capture dynamically loaded media URLs

## Wave 3: HTML/JS Parser Utilities (Tasks 19-27)
19. **JSON-LD Schema Extractor** - Parse `<script type="application/ld+json">` for VideoObject/ImageObject schemas
20. **Srcset Largest Width Parser** - Parse `srcset` attributes, select highest width descriptor URL
21. **OpenGraph Video Secure URL Sniffer** - Extract `og:video:secure_url` and `og:video:url` meta tags
22. **HTML5 Source Tag Resolver** - Iterate `<source>` elements within `<video>/<audio>`, select best quality
23. **Inline JS Config Extractor** - Parse `<script>` blocks for `window.__config`, `playerConfig`, etc.
24. **CSS Background Image URL Parser** - Extract `background-image: url(...)` from inline styles and `<style>` blocks
25. **Lazy-Load Alternative Attribute Sniffer** - Check `data-src`, `data-lazy`, `data-original`, `data-bg` attributes
26. **Inline Base64 Image Buffer Sniffer** - Detect `data:image/` URIs, decode to buffers, validate dimensions
27. **Href File Signature Sniffer** - Detect direct file links by extension (.mp4, .webm, .jpg, .png) in href attributes

## Wave 4: Visual FX Upgrades (Tasks 28-36)
28. **2.5D Layer Parallax Depth** - Split images into foreground/background via contrast masks, pan at offset speeds
29. **Chromatic Aberration Accents** - RGB channel offset on scene transitions (3-frame burst)
30. **Anamorphic Letterbox Dynamic Sizing** - Variable-height letterbox bars that pulse with pacing score
31. **Double-Speed Flash Frame Injections** - 2-frame white/color flash inserts at dramatic beats
32. **Rule-of-Thirds Face-Centric Zoom** - Detect face region, center Ken Burns zoom on upper-third intersection
33. **Cinematic Title Depth Masking** - Layered title with foreground particles behind text, background particles in front
34. **Enhanced Particle Systems** - Style-specific particles: sparks (warfront), data streams (cyber), embers (documentary)
35. **Dynamic Vignette Pulse** - Vignette intensity modulated by pacing score (tighter on high tension)
36. **Zoom-In Tension Ramping** - Progressive zoom acceleration across escalation wave phases

## Wave 5: Audio Upgrades (Tasks 37-45)
37. **Stereo Panning on Visual Sweeps** - Apply ffmpeg `pan` filter for L/R sweep during Ken Burns pans
38. **Beat-Matched Cut Timing** - Align segment transitions to background music beat grid
39. **Environmental Reverb on Typographic Cards** - Add `aecho` filter reverb during title card segments
40. **High-Frequency Whisper ASMR Triggers** - Inject subtle white noise bursts at retention beat moments
41. **50Hz Sub-Bass Rumble on Stats** - Low-frequency sine wave accent under statistical callouts
42. **Dynamic Music Key/Pitch Ramping** - Gradual pitch shift via `asetrate` during tension escalation
43. **Transient Ducking on Action Words** - Micro-duck bg music (100ms) on single-syllable impact words
44. **Generative Ambient Sound Synthesis** - Procedural ambient beds using ffmpeg `sine`+`anoisesrc` generators
45. **Custom Audio Filter Chains** - Configurable per-segment ffmpeg filter graph builder

## Wave 6: Hook & Pacing Upgrades (Tasks 46-54)
46. **Cold Open Pattern Interrupts** - Visual glitch/static effect on cold open first frame
47. **Visual Contrast Hooks** - High-contrast color inversion on first 0.5s of dramatic segments
48. **Bass-Drop/Riser Sound Triggers** - Audio riser sweep before cold open, bass drop on reveal
49. **Cinematic Title Depth Masking** - Multi-layer title with parallax depth between particle layers
50. **Zoom-In Tension Ramp** - Exponential zoom curve across first 3 segments building to climax
51. **Kinetic Overlays** - Animated text overlays that slam/slide/fade at retention beat markers
52. **Rules of Three Metric Highlights** - Group stats in threes with staggered reveal animation
53. **LLM Open-Loop Cliffhanger Scripting** - Prompt LLM to end segments with unresolved questions
54. **Dynamic Pacing Word-Count Loops** - Alternate between short (5-word) and long (20-word) sentences

## Wave 7: Growth Features (Tasks 55-63)
55. **A/B Thumbnail Heatmap Simulation** - Generate 2 thumbnail variants, compute contrast/saliency scores
56. **50% Mark Comment Bait** - Inject "What do you think?" text overlay at video midpoint
57. **Auto-Embedded MP4 Chapters** - Write chapter metadata directly into MP4 container via ffmpeg
58. **Hidden Textual Easter Eggs** - Embed barely-visible text (alpha 0.05) for engaged viewers
59. **Dynamic Video Looping** - Speed-ramp short clips to fill segment duration
60. **Dynamic Re-Render Feedback Loops** - Parse AI reviewer comments, auto-adjust and re-render
61. **Style-Specific Particle Rendering** - Sparks for warfront, data streams for cyber, embers for documentary
62. **Attribution Emotional Transitions** - Smooth emotional tone shifts between cited sources
63. **Cliffhanger Cutdowns** - Trim last 10% of segments to create urgency

## Wave 8: Quality Validation (Tasks 64-72)
64. **Content-Length HEAD Validation** - Pre-download size check via HTTP HEAD requests
65. **MIME-Type Validation Checkpoints** - Verify Content-Type matches expected media type
66. **Watermark Contrast Heatmap** - Canvas-based detection of watermark patterns in corners/center
67. **Image Canvas Contrast Analyzer** - Compute dynamic range and flag low-contrast images
68. **Text-Density Edge Calculator** - Detect text-heavy images (screenshots, documents) vs photography
69. **Reverse Image Search Scraper** - Query TinEye/Google Lens for source verification
70. **Redirect Trace Guards** - Follow HTTP redirects, validate final URL domain against blocklist
71. **Color Palette Scheme Bonus** - Score images by color harmony with video accent colors
72. **Perceptual pHash Duplicate Checker** - Compute perceptual hash, penalize near-duplicates

## Wave 9: Advanced Rendering (Tasks 73-81)
73. **Procedural Kinetic Lower Thirds** - Animated lower-third overlays with globe/compass motifs
74. **Adaptive Canvas Text-Wrapping Grids** - Dynamic grid layout for fallback text cards
75. **Auto Aspect Ratio Crops** - Generate both 16:9 and 9:16 outputs from single render
76. **Voice Emotional State Alternates** - Switch TTS voice/emotion per segment purpose tag
77. **Enhanced Crossfade Transitions** - Dissolve, wipe, slide, zoom transitions between segments
78. **Chart/Graph Progressive Reveal** - Left-to-right clip animation for data visualization assets
79. **Name Card Lower Thirds** - Animated person-name overlays with role/title badges
80. **Source Citation Animations** - Fade-in/out source attribution badges
81. **Progress Timeline Enhancements** - Glowing segment notches with hover-preview concept

## Wave 10: Pipeline Integration (Tasks 82-90)
82. **Picsum Fallback Score Boost** - Improve last-resort Picsum seeding with topic-relevant image IDs
83. **Wikipedia Hero Image Resolver** - Extract lead image from Wikipedia API for topic fallback
84. **Segment Reorder for Hook Impact** - Move highest-drama segment to cold open position
85. **Visual Plan Beat-Type Integration** - Wire retention beats to actual rendering effects
86. **Sound Bed to Background Music Mapping** - Map selectSoundBed output to actual audio file selection
87. **Edit Plan Transition Rendering** - Implement all 10 transition types in server renderer
88. **Quality Gate Auto-Retry with Corrections** - Auto-apply AI reviewer suggestions on retry
89. **Draft Mode FX Selective Enable** - Allow specific FX in draft mode for quick preview
90. **Full Pipeline Integration Test** - End-to-end test: topic -> script -> media -> render -> review
