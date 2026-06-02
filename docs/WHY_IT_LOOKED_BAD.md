# Why the previous videos looked bad (and what we fixed)

## Root cause (critical bug)

`server-render.mjs` treated **every Picsum URL as a failed asset** and **never drew the image**, even when download succeeded. All fixture/E2E/test renders used Picsum → **dark gradient + tiny text** instead of photos.

**Fix:** Only skip assets with `isFallback: true`. Fixtures now use real Unsplash URLs.

## Other issues

| Symptom | Cause |
|---------|--------|
| Can't hear story | Music too loud, voice delay, extra silence gaps |
| Tiny text | Fixed 30px captions, not scaled to 1080p |
| 2004 look | Letterbox bars, blue wash, procedural backgrounds, UI clutter |

## YouTube profile (v3)

- Full-bleed photos, no letterbox
- Large Impact-style captions (yellow highlight word)
- `quality: highest`, CRF 14
- Voice-first audio mix

## What still won't match top YouTubers

Fixtures use **6 stock photos** and a **mock script** — not your real pipeline with:

- Visual director + varied B-roll
- Real topic research and hooks
- Human title/thumbnail pass

For production: run the **app** with a real topic and OpenRouter key, `exportSettings.youtubeMode: true`, then render.
