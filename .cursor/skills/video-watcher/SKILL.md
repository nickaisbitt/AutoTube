# Video Watcher (AutoTube)

Use when the user says a rendered video looks bad, wants review, retention audit, or "watch this MP4".

## MCP tools (preferred)

1. Call **`watch_video`** on the `video-watcher` MCP server.
2. If no path given, it uses the latest `docs/artifacts/FINAL-VIDEO-youtube-full.mp4` or review export.
3. Read **`CONTACT_SHEET`** and hook frames (`frame-0000s.jpg` … `frame-0003s.jpg`) with the Read tool when vision API is unavailable.
4. Reply using **numbered lists only** (user preference) — reference report item numbers.

### Parameters

| Param | Use |
|-------|-----|
| `interval_sec: 2` | Stricter cut/pacing audit |
| `max_duration_sec: 90` | Hook + first-minute only |
| `skip_vision: true` | Frames only; you analyze JPGs manually |
| `video_path` | Explicit MP4 |

Set `OPENROUTER_API_KEY` in Cursor → Settings → MCP → video-watcher → env for automated vision scores.

## CLI fallback

```bash
npm run watch:video
npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-full.mp4 --interval 3 --max 90
```

Output: `test-recordings/video-watch-<id>/WATCH_REPORT.md` + frames + contact sheet.

## What "good" means here

Brutal YouTube bar: shock hook 0–3s, visual change every 1–2s, ≤4 word captions, voice-over-music, human B-roll, end CTA. Scores ≤6/10 mean not upload-ready.
