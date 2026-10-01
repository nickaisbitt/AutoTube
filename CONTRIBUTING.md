# Contributing to AutoTube

## Quick Start

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/anomalyco/autotube.git
   cd autotube
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and add your API keys.

4. Start the dev server:
   ```bash
   npm run dev
   ```

### Docker Development

One-command setup with Docker:

```bash
npm run docker:dev
```

Or directly:

```bash
docker compose up --build
```

## Prerequisites

- Node.js 20+
- npm
- ffmpeg (for video rendering)

## Testing

```bash
# Run unit tests
npm run test:unit

# Run unit tests in watch mode
npm run test:unit:watch

# Run unit tests with coverage
npm run test:unit:coverage

# Run E2E tests
npm run test
```

## Type Checking

```bash
npx tsc --noEmit
```

## Building

```bash
npm run build
```

## Project Structure

- `src/` — Frontend React application
- `server/` — Backend API routes (Connect middleware)
- `server-render.mjs` — Server-side video renderer
- `public/` — Static assets

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npx tsc --noEmit` passes
4. Ensure tests pass (`npm run test:unit`)
5. Submit a PR to `main`

CI will automatically run type checks and tests on your PR.
