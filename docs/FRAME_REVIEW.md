# Frame-by-frame review workflow

Pull an AutoTube MP4 apart into timed JPEGs, link each frame to the `project.json` timeline asset when available, flag NSFW/off-topic/volume-still heuristics, and browse in an HTML gallery.

## Quick start

```bash
# Latest / explicit render
npm run review:frames -- test-recordings/full-XXXX/final-video-final.mp4

# Dense (every 0.5s) + sibling project.json auto-detected
npm run review:frames -- path/to/final-video-final.mp4 --interval 0.5

# Explicit project + optional vision triage on suspicious HTTP assets
npm run review:frames -- path/to.mp4 --project path/to/project.json --vision
```

## Outputs

```
test-recordings/frame-review-<ts>/
  index.html          ← open this (←/→ to step, f = flagged only)
  REVIEW.md           ← flagged table + checklist
  SUMMARY.json
  FRAMES.jsonl        ← one JSON object per frame
  contact-sheet.jpg
  frames/
    frame-00000d.jpg …
    contact-sheet.jpg
```

## What gets flagged

| Code | Severity | Meaning |
|------|----------|---------|
| `nsfw_url` | critical | Adult CDN / porn domain in asset URL (e.g. rdtcdn) |
| `volume_still` | high | Web “Search (volume top-up)” still on the timeline |
| `offtopic_url` | high | Known junk hosts (Niagara tourism, Discogs, celeb blogs, …) |
| `dead_frame` | high | Tiny JPEG (black/placeholder) |
| `no_aviation_meta` | medium | No aviation tokens in query/alt/url |
| `vision_reject` | high | Optional `--vision` OpenRouter reject |

## Agent / human workflow

1. After generate/eval, run `npm run review:frames -- <mp4>`.
2. Open `index.html` (Cursor Simple Browser or local browser).
3. Press **`f`** to show critical/high only; step with **←/→**.
4. For each flagged frame, confirm pixels match the URL/query in the detail panel.
5. Copy confirmed issues into harvest/timeline fixes (block adult CDNs, ban volume still pads on airline, etc.).
6. Re-generate → re-run `review:frames` → compare `SUMMARY.json` critical counts.

## Vs `npm run watch:video`

| Tool | Best for |
|------|----------|
| `watch:video` | Brutal score + hook/overall verdict |
| `review:frames` | Forensic teardown: every second, asset linkage, NSFW URL catch, HTML step-through |

Use both: watch for score, frames for proof.
