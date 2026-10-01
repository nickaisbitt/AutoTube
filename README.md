# AutoTube AI Video Generator

A fully automated YouTube video generator that creates professional-quality videos from a single topic prompt.

> 📚 **Documentation Map:** A comprehensive directory of all project markdown files, guides, and strategic handbooks is plainly laid out in [DOCUMENTATION.md](file:///Users/nickaisbitt/AutoTube/DOCUMENTATION.md).

## Features

- **AI Script Generation** - Uses OpenRouter (GPT-5.4-nano) to generate engaging, rapid-paced scripts
- **Smart Media Sourcing** - Automatically finds relevant images via DuckDuckGo with AI-powered visual planning
- **Text-to-Speech Narration** - Generates professional voiceover using OpenAI TTS
- **Canvas Video Rendering** - Renders videos with Ken Burns effects, gradient overlays, and text captions
- **Pipeline UI** - Step-by-step workflow with progress tracking and debug logging

## Pipeline

1. **Topic** → Enter your topic, style, and target duration
2. **Script** → AI generates a structured script with segments
3. **Media** → AI plans visuals and sources images automatically
4. **Narration** → Generates audio clips for each segment
5. **Assembly** → Renders the final video with effects
6. **Preview** → Preview and download your video

## Setup

### Prerequisites

- Node.js 18+
- OpenRouter API key (for script generation)
- OpenAI API key (for TTS narration)

### Installation

```bash
npm install
npm run dev
```

### Generate a full test video (topic → MP4)

End-to-end pipeline without real API keys: Playwright drives the UI with mocked OpenRouter/media, then `server-render.mjs` produces the final MP4 with narration and background music.

**Terminal 1 — dev server:**

```bash
npm run dev -- --port 5173 --host 0.0.0.0
```

**Terminal 2 — full pipeline:**

```bash
npm run generate:video
# or with a custom topic:
npm run generate:video -- "Why quantum computing matters in 2026"
```

**Requirements:** Node 18+, Playwright Chromium (`npx playwright install chromium`), `ffmpeg` on PATH. Optional: `edge-tts` for faster narration synthesis on the server.

**Output:**

| Path | Description |
|------|-------------|
| `test-recordings/full-<timestamp>/final-video-final.mp4` | Run-specific final video with muxed audio |
| `test-recordings/FINAL-OUTPUT.mp4` | Copy of the latest successful render |

Screenshots for each pipeline step are saved alongside the MP4 in the same `full-<timestamp>/` folder.

**Fixture-only render** (no browser, no LLM):

```bash
npm run render:fixture
```

### Real Pass verification (R7 merge gate)

Seven-point checklist enforced by `scripts/verify-real-pass.mjs`:

```bash
npm run verify:real-pass
```

**Fixture / short CI run** (30s minimum instead of 180s):

```bash
REAL_PASS_FIXTURE=1 MIN_DURATION_SEC=30 npm run verify:real-pass
```

Key env vars: `MIN_DURATION_SEC`, `MIN_SIZE_BYTES`, `FORCE_CPU` / `AUTOTUBE_FORCE_CPU`, `SKIP_GATE_TEST`, `RENDER_LOG`. Full checklist and example output: [`scripts/squad/R7-real-pass.md`](scripts/squad/R7-real-pass.md).


1. Open the app in your browser
2. Click the ⚙️ Settings button
3. Enter your API keys:
   - **OpenRouter API Key** - Get from https://openrouter.ai
   - **OpenAI API Key** - Get from https://platform.openai.com

## Tech Stack

- **React 19** + TypeScript
- **Vite** for bundling
- **Tailwind CSS 4** for styling
- **Canvas 2D** for video rendering

## Architecture

```
src/
├── components/          # React UI components
│   ├── TopicStep.tsx
│   ├── ScriptStep.tsx
│   ├── MediaStep.tsx
│   ├── NarrationStep.tsx
│   ├── AssemblyStep.tsx
│   ├── PreviewStep.tsx
│   └── ...
├── services/            # Core business logic
│   ├── llm.ts           # Script generation via OpenRouter
│   ├── llmVisualDirector.ts  # AI visual planning
│   ├── media.ts         # Image sourcing & scoring
│   ├── tts.ts           # OpenAI TTS integration
│   ├── videoRenderer.ts # Canvas-based video rendering
│   └── visualPlanner.ts # Topic context resolution
├── utils/               # Utilities
├── store.ts             # React state management
└── types.ts             # TypeScript types
```

## Production vs Development

The Vite dev server (`npm run dev`) runs a local proxy at `/api/search` and `/api/proxy-image` that enables:
- DuckDuckGo image search (free, no API key)
- CORS-free image loading into the Canvas renderer (prevents blank video output)

**In production** (the static `dist/index.html` from `npm run build`) these proxy routes are unavailable. The app automatically falls back to Wikimedia Commons, Unsplash, and Picsum for media sourcing, and uses external CORS proxies (weserv.nl, allorigins.win) for canvas-safe image loading. For best results in production, provide a Pexels API key in Settings.

## 🚀 Deployment to Railway

Production deploy is **push to `master` → Railway GitHub autodeploy** (no GitHub Actions).

1. **One-time:** Railway dashboard → connect this repo → branch **`master`**, root directory **`.`** (repo root).
2. **Every release:** `git push origin master` — Railway runs `nixpacks.toml` (`npm run build`, native deps) and starts via `railway.toml` (`npx tsx server.mjs`).
3. **Health:** `https://autotube-production.up.railway.app/api/health`

Set service variables in Railway: `OPENROUTER_API_KEY`, `VITE_OPENROUTER_KEY`, `TRUST_PROXY`, `ALLOWED_ORIGINS`.

Optional emergency CLI (not the normal path): `./scripts/deploy.sh` with `RAILWAY_TOKEN` set. Full checklist: [`docs/SHIP_PLAN_MASTER.md`](docs/SHIP_PLAN_MASTER.md).

## Security

API keys are stored in your browser's `localStorage`. Only use the app on a device you trust and never share your browser profile with others.

## License

MIT
