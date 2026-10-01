# A3 — TTS setup for server render

Server-side narration lives in `deploy/server-render/narration.mjs`. At least **one** provider must be available or render fails fast (no silent narration segments).

## Fallback chain

1. **Kokoro-82M** — local Python or `KOKORO_SERVER_URL` HTTP service  
2. **MeloTTS** — Cloudflare Workers AI (optional)  
3. **edge-tts** — Microsoft Edge voices via CLI or `python3 -m edge_tts`

## Quick start (edge-tts only)

Minimum setup for reliable server render:

```bash
pip install --break-system-packages edge-tts
python3 -m edge_tts --help   # should print usage
```

Deploy image (`deploy/nixpacks.toml`) installs edge-tts during build.

## Kokoro (optional, higher quality)

### Local Python

```bash
python3 -m venv /tmp/tts-env
/tmp/tts-env/bin/pip install kokoro torch
export KOKORO_PYTHON=/tmp/tts-env/bin/python3
$KOKORO_PYTHON -c "from kokoro import KPipeline; print('ok')"
```

`narration.mjs` auto-detects `/tmp/tts-env/bin/python3` when `KOKORO_PYTHON` is unset.

### HTTP service (docker-compose)

```bash
docker compose up tts -d
export KOKORO_SERVER_URL=http://localhost:5000
```

See `tts-service/` and root `docker-compose.yml`.

## MeloTTS (optional Cloudflare fallback)

```bash
export CF_ACCOUNT_ID=your_account_id
export CF_API_TOKEN=your_api_token
```

Both variables are required. Melo runs only when Kokoro fails.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `KOKORO_PYTHON` | Python executable with `kokoro` installed (venv path) |
| `KOKORO_SERVER_URL` | Base URL of self-hosted Kokoro HTTP API |
| `CF_ACCOUNT_ID` | Cloudflare account for MeloTTS |
| `CF_API_TOKEN` | Cloudflare API token with Workers AI access |

## Verify providers

```bash
node --input-type=module -e "
  import { detectTtsProviders } from './deploy/server-render/narration.mjs';
  console.log(detectTtsProviders());
"
```

## End-to-end narration test

```bash
rm -rf test-audio-dir
node test-audio-concat.mjs
ls -la test-audio-dir/narration-*.wav
ffprobe -v error -show_entries format=duration test-audio-dir/narration-0.wav
```

Expect non-zero duration and mean volume around -30 to -15 dB (not silence).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No TTS engine available` | Install edge-tts or configure Kokoro/Melo per above |
| `KOKORO_PYTHON ... not found` | Fix path or unset and use system `python3` |
| Kokoro fails, edge-tts works | Normal when Kokoro not installed; edge-tts is the reliable fallback |
| `edge-tts probe: No module named edge_tts` | `pip install edge-tts` in the Python used by render |
| Segment error after all engines tried | Check network (Melo), disk space, and ffmpeg/ffprobe on PATH |
