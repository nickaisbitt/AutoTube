# Video Watcher (AutoTube)

Use when the user says a rendered video looks bad, wants review, retention audit, or "watch this MP4".

## MCP tools (preferred)

1. Call **`watch_video`** on the `video-watcher` MCP server (`mode: "quick"` default).
2. If no path given, it uses the latest `docs/artifacts/FINAL-VIDEO-youtube-full.mp4` or review export.
3. Read **`WATCH_REPORT.md`** top fixes (numbered) and **`contact-sheet.jpg`** for visual proof.
4. Reply using **numbered lists only** — reference report item numbers.

### Parameters

| Param | Use |
|-------|-----|
| `mode: "quick"` | First 90s + brutal + hook vision (default) |
| `mode: "full"` | Entire video + repetition scan |
| `skip_vision: true` | Frames only; you analyze JPGs manually |
| `video_path` | Explicit MP4 |

Set `OPENROUTER_API_KEY` in Cursor → Settings → MCP → video-watcher → env for automated vision scores.

## Frame-by-frame forensic review (preferred for NSFW / random pads)

When the user asks to **pull the video apart**, review **frame by frame**, or catch unsafe/off-topic stills:

```bash
npm run review:frames -- path/to/final-video-final.mp4
# optional: --interval 0.5 --project path/to/project.json --vision
```

Then open `test-recordings/frame-review-*/index.html`, press **`f`** for flagged-only, step with ←/→.

See `docs/FRAME_REVIEW.md`. Outputs: `REVIEW.md`, `FRAMES.jsonl`, `SUMMARY.json`, dense `frames/`.

## Improvement loop (generate + review + repeat)

```bash
npm run loop:video              # random topic each iteration, forever
npm run loop:video:once         # single cycle
npm run loop:video -- --max 5 --delay 60
```

See `docs/VIDEO_IMPROVEMENT_LOOP.md`.

## CLI fallback

```bash
npm run watch:video
npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-full.mp4 --interval 3 --max 90
```

Output: `test-recordings/video-watch-<id>/WATCH_REPORT.md` + frames + contact sheet.

## What "good" means here

Brutal YouTube bar: shock hook 0–3s, visual change every 1–2s, ≤4 word captions, voice-over-music, human B-roll, end CTA. Scores ≤6/10 mean not upload-ready.
