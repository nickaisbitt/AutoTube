# AGENTS.md

## Cursor Cloud specific instructions

### Product

**AutoTube** — AI YouTube video generator (React 19 + Vite 7 + TypeScript). The main dev entrypoint is the repo root; optional folders include `tts-service/` (Kokoro TTS Docker), `remotion/` (alternate renderer), and `deploy/` (Railway production bundle).

### Required services (local dev)

| Service | Command | Port |
|---------|---------|------|
| Vite dev server + API middleware | `npm run dev` | 5173 |

Playwright E2E and `npm test` start this automatically via `playwright.config.ts`.

### Environment variables

Copy `.env.example` to `.env.local`. At minimum set `VITE_OPENROUTER_KEY` for script generation. Without it, the **onboarding modal** (`z-[200]`) blocks the UI and Playwright/manual tests cannot click the topic field.

Cloud VMs often inject `OPENROUTER_API_KEY`; map it in `.env.local` as `VITE_OPENROUTER_KEY` before starting Vite (restart dev server after creating or changing `.env.local`).

### Server-render modules

`server-render.mjs` imports from `./server-render/*.mjs`, but those files live under `deploy/server-render/` in this checkout (not at repo root). For server-side render APIs and Vitest suites that import `server-render.mjs`, create a local symlink once per VM:

```bash
ln -sf deploy/server-render server-render
```

Do not commit the symlink; it is a workspace convenience.

### System dependencies

- **ffmpeg** — required for assembly / full pipeline tests (`tests/user-journey.spec.ts`).
- **node-canvas** — needs Cairo/Pango dev libraries on fresh Ubuntu hosts (`libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev`, `libgif-dev`, `librsvg2-dev`, `pkg-config`). See `nixpacks.toml` for the full list used in production builds.
- **Playwright Chromium** — run `npx playwright install chromium` once per VM (not in the update script).
- **Video improvement loop (optional)** — `npm run loop:preflight` probes `scenedetect` and `faster-whisper` for scene QA and word-level captions; both are optional and preflight still passes without them. On Debian/Ubuntu VMs: `pip install --break-system-packages scenedetect faster-whisper`. Railway `build:railway` installs them automatically.

### Commands (see `package.json`)

| Task | Command |
|------|---------|
| Lint / typecheck | `npm run lint` |
| Unit tests | `npm run test:unit` |
| Default E2E | `npm test` (mocks OpenRouter; needs `.env.local` or onboarding dismissed) |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Prod-like server | `npm run build && npm start` |

### Gotchas

- **Lint and unit tests** may report failures on a clean checkout (missing `server-render/` at root, pre-existing `tsc` errors in `server/`). CI expects `npm run lint` and `npm run test:unit` to pass on `master`; align with upstream if your branch differs.
- **Onboarding modal** blocks clicks when `openRouterKey` is empty; set `VITE_OPENROUTER_KEY` or `localStorage.autotube_onboarding_seen` + config before E2E.
- **`npm run docker:dev`** is referenced in docs but is not defined in `package.json`; use `docker compose up --build` for the optional TTS stack.
- Dev server hot reload does not always pick up new native modules after `npm install`; restart `npm run dev` if canvas or server middleware misbehaves.
