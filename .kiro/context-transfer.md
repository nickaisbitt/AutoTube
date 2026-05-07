# AutoTube Context Transfer — Session 2 → Session 3

## GOAL: Get video output from D-grade to A+ grade

## Current State (working end-to-end)
- Script generation via Gemini Flash with improved prompts (hook-first, data-driven, competitive context, source attribution)
- Media harvesting from DDG, Wikimedia, Flickr, GovPress with vision check + quality scoring
- Grok TTS narration (Leo voice) via xAI API with 3-tier fallback (Grok → MeloTTS → browser)
- Server-side rendering via node-canvas + ffmpeg producing MP4 with H.264 video + AAC audio
- Background music infrastructure ready (no audio files yet)
- YouTube SEO: title options, description generator, tag generator, chapter markers
- Thumbnail generation with hook-line overlay
- Resolution presets: 720p/1080p/4K selector
- Industrial UI theme with safety orange branding

## What's BROKEN (the D-grade issues)

### 1. VISUALS (biggest problem)
- Many images fail to load in server renderer → procedural gradient backgrounds instead of real photos
- Server renderer fetches via `http://localhost:5173/api/proxy-image?url=...` — many fail with CORS/timeouts
- Images that DO load are often low-res (free sources don't consistently return HD)
- Every segment looks the same: dark gradient + centered white text = "AI slideshow" feel
- Title text gets clipped ("AI Dominance: Can" cut off mid-word)
- No visual variety: no stat cards, no timeline graphics, no split layouts, no quote cards

### 2. SCRIPT CONTENT (improved but inconsistent)
- Gemini Flash follows the improved prompt inconsistently
- `reviewAndImproveScript()` function EXISTS but is NOT called in the pipeline
- Promise-payoff gaps: script teases depth but doesn't always deliver
- Still sometimes too surface-level on competitive analysis

### 3. PRODUCTION
- No background music (audio files don't exist in `public/audio/`)
- 6 FPS frame rate looks choppy (YouTube expects 24-30 FPS)
- Basic transitions only
- No pacing variation (every segment same energy level)

### 4. RESOLUTION
- 720p at 6 FPS with VP9 codec
- Should be 1080p at 24 FPS with H.264

## API Keys (in .env.local)
- `VITE_OPENROUTER_KEY` — OpenRouter (Gemini Flash + Reka Edge)
- `VITE_XAI_KEY` — xAI Grok TTS (Leo voice)
- `VITE_CF_ACCOUNT_ID` — Cloudflare (empty, needs setup for MeloTTS)
- `VITE_CF_API_TOKEN` — Cloudflare (empty, needs setup for MeloTTS)

## Key Files
- `server-render.mjs` — Main server renderer (1600+ lines)
- `server-render/index.mjs` — Entry point (delegates to server-render.mjs)
- `server-render/narration.mjs` — Narration module with 3-tier TTS fallback
- `server-render/audio.mjs` — Audio concatenation and background music mixing
- `src/services/llm.ts` — Script generation with improved prompts
- `src/services/videoRenderer.ts` — Browser-side renderer
- `src/services/renderingShared.ts` — Shared rendering functions
- `src/services/grokTts.ts` — xAI Grok TTS client
- `src/services/meloTts.ts` — Cloudflare MeloTTS client
- `vite.config.ts` — Dev server with API proxies and server-render endpoint
- `.env.local` — API keys

## Test Status
- 741 passing, 9 pre-existing failures (stale tests in blindReview, domainFilter, visionCheck)

---

## FEATURE ROADMAP (from ChatGPT Deep Research review)

### PRIORITY 1: Fix the D-grade issues NOW

#### Visual System Overhaul
- [ ] Increase server renderer FPS from 6 to 24
- [ ] Default resolution to 1080p instead of 720p
- [ ] Fix image loading reliability in server renderer (better retry, longer timeouts, preload ALL images before rendering)
- [ ] Title card integrity checker — prevent text clipping, auto-truncate to safe zones
- [ ] Scene-type taxonomy: stats → bold stat cards, history → timeline graphics, moat/tech → diagram overlays, risk → contrasting visuals
- [ ] Visual variety planner — enforce diversity of scene types, no 20 identical gradient cards
- [ ] Auto layout chooser per frame: centered text, left text + right B-roll, lower-third, quote card, stat overlay
- [ ] Contrast and readability checker for text vs background
- [ ] Safe-zone & margin validator for YouTube UI overlap

#### Script Quality Activation
- [ ] Activate `reviewAndImproveScript()` in the pipeline (it exists but isn't called)
- [ ] Promise-payoff validator — flag empty hype transitions
- [ ] Specificity/enrichment pass — replace generic claims with concrete examples
- [ ] Section purpose tags — auto-label segments as "stat hook", "history", "moat", "risk", etc.
- [ ] Rhetorical variety checker — detect overused constructs and rewrite

#### Production Quality
- [ ] Source/create 4 royalty-free ambient audio loops for `public/audio/`
- [ ] Switch ffmpeg encoding from VP9/WebM to H.264/MP4 with higher bitrate
- [ ] Pacing/energy scoring per segment
- [ ] Retention beat scheduler — ensure a hook every 15-25 seconds

### PRIORITY 2: Editorial QA Layer

- [ ] Hook strength scorer — evaluate opening tension, suggest punch-ups
- [ ] Title-script alignment checker — ensure title promise is fulfilled in content
- [ ] Claim hedging/precision filter — flag absolute statements
- [ ] Fact-source attachment — store source links for every stat
- [ ] Time-sensitivity wrapper — add "as of [quarter/year]" to financial claims
- [ ] Opinion vs fact labeling — tag sentences internally
- [ ] Balanced risk segment generator — auto-generate competition/risk analysis
- [ ] Competitor context module — auto-insert challenger profiles
- [ ] Bias/stance analyzer — flag one-sided scripts

### PRIORITY 3: Visual Production Features

- [ ] B-roll/visual cue generator — output suggested visuals per sentence
- [ ] Dynamic typography levels — hero line, subhead, supporting line hierarchy
- [ ] Scene length prediction — reading speed estimation per frame
- [ ] Branding theming engine — consistent palettes per channel
- [ ] Narrator notes / director's track — emphasis words, pause markers, tonal shifts
- [ ] Edit decision list (EDL) export — timeline plan with B-roll pairings

### PRIORITY 4: YouTube Optimization

- [ ] Thumbnail-title-hook coherence checker
- [ ] Risk-of-clickbait metric
- [ ] Call-back planner — tie ending to opening hook
- [ ] Multi-platform cutdown generator — auto-identify Shorts/Reels segments
- [ ] Auto-summary and description writer (enhanced)
- [ ] Episode-to-episode continuity tracker

### PRIORITY 5: Advanced Features

- [ ] Persona/tone presets — newsroom, documentary, creator-commentary, market-analysis
- [ ] Sentence length balancer — optimize rhythm
- [ ] Future-impact personalization — "what this means for you" lines
- [ ] Anti-templating filter — vary structure across episodes
- [ ] Localization-aware phrasing
- [ ] "Explainer density" control slider
- [ ] Auto-generated alt text and accessibility cues
- [ ] Performance feedback loop from YouTube analytics
- [ ] "Human review hot-spots" highlighter
- [ ] Style-guide enforcement per channel
- [ ] Script QA dashboard
- [ ] Visual QA dashboard

---

## INSTRUCTIONS FOR NEXT CONVERSATION

Start a new conversation and say:

"Read `.kiro/context-transfer.md` for full context. Fix the video output quality — target A+ grade. Start with Priority 1 items: visual system overhaul, script quality activation, and production quality. The server is running at localhost:5173."

The context file has everything needed. Read the key files listed above before making changes.
