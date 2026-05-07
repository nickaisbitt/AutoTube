# AutoTube AI Video Generator

A fully automated YouTube video generator that creates professional-quality videos from a single topic prompt.

## Features

- **AI Script Generation** - Uses OpenRouter (Gemini 2.0 Flash) to generate engaging, rapid-paced scripts
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

### Configuration

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

## Security

API keys are stored in your browser's `localStorage`. Only use the app on a device you trust and never share your browser profile with others.

## License

MIT
