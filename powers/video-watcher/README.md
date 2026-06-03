# Video Watcher (Cursor MCP)

Lets Cursor agents **actually inspect** exported MP4s: ffmpeg frame grabs (including 0–3s hook zone), contact sheet, technical checks, and optional OpenRouter vision via `aiReviewer.mjs`.

## Enable in Cursor

1. Open **Cursor Settings → MCP** (or use project `.cursor/mcp.json` — already wired).
2. Ensure **video-watcher** is enabled.
3. Set `OPENROUTER_API_KEY` in the MCP server env (leave blank for frame-only mode; agent reads JPGs).

Restart Cursor after changing MCP config.

## Tools

| Tool | Purpose |
|------|---------|
| `watch_video` | Full analysis + `WATCH_REPORT.md` with numbered findings |
| `list_default_videos` | Which canonical artifact paths exist |

## CLI

```bash
npm run watch:video
npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-full.mp4
```

## Output layout

```
test-recordings/video-watch-<timestamp>/
  WATCH_REPORT.md
  contact-sheet.jpg
  frame-0000s.jpg …
```
