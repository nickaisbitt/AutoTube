---
name: "autotube-tester"
displayName: "AutoTube Tester"
description: "Drive the AutoTube app through its full video pipeline using a real browser, record the session as a video, and compare the output against top YouTube videos on the same topic."
keywords: ["autotube", "playwright", "browser-testing", "video-pipeline", "youtube-comparison"]
author: "AutoTube"
---

# AutoTube Tester

## Overview

This power gives Kiro a set of tools to physically operate the AutoTube app like a human user would — entering a topic, generating a script, sourcing media, adding narration, and assembling the final video — all inside a real Chromium browser window that you can watch.

It also records the entire session as a `.webm` video file and produces a structured comparison report against high-view YouTube videos on the same topic, highlighting what top creators do differently and where AutoTube's output stands.

**What it does:**
- Starts the AutoTube Vite dev server
- Drives the full UI pipeline via Playwright (headed or headless)
- Records a video of the browser session to `test-recordings/`
- Takes screenshots at each pipeline step
- Generates a YouTube comparison report with patterns from top-performing videos

## Prerequisites

- Node.js 18+
- Playwright installed: `npx playwright install chrome` (already done if you ran `npm install` in the project)
- The AutoTube project at the workspace root

## MCP Config Placeholders

**IMPORTANT:** Before installing this power, replace the placeholder in `mcp.json`:

- **`PLACEHOLDER_POWER_PATH`**: The absolute path to this power's directory on your machine.
  - **How to get it:** Run `pwd` inside `powers/autotube-tester/` — copy the full path.
  - **On this machine the path is already set** — no replacement needed, the `mcp.json` already contains the correct absolute path.

Your `mcp.json` is pre-configured as:
```json
{
  "mcpServers": {
    "autotube-tester": {
      "command": "node",
      "args": ["/Users/nickaisbitt/automated-youtube-video-generator (1)/powers/autotube-tester/src/server.mjs"],
      "env": {}
    }
  }
}
```

## Available Tools

### `start_dev_server`
Starts `npm run dev` in the project root so AutoTube is accessible at `http://localhost:5173`.

**Parameters:** none

**Example usage:**
> "Start the AutoTube dev server"

---

### `stop_dev_server`
Stops the dev server started by `start_dev_server`.

**Parameters:** none

---

### `run_autotube_pipeline`
Drives the full AutoTube UI pipeline in a real browser and records the session.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `topic` | string | ✅ | — | Video topic (e.g. "The Rise of Nvidia") |
| `style` | string | ❌ | `business_insider` | Style preset: `business_insider`, `warfront`, `documentary`, `explainer` |
| `duration` | string | ❌ | `3` | Target duration in minutes: `3`, `5`, `10`, `15` |
| `headed` | boolean | ❌ | `true` | Show the browser window (`true`) or run headless (`false`) |

**Returns:** Step-by-step log of what happened + path to the recorded video file + path to screenshots directory.

**Example usage:**
> "Run the AutoTube pipeline for the topic 'The Fall of FTX' in business insider style"

---

### `get_recording_path`
Returns the file path of the most recently recorded pipeline video.

**Parameters:** none

---

### `review_recording`
Extracts key frames from the browser session recording using ffmpeg, detects dead/static frames (loading spinners, blank screens), and produces a quality report.

**Requires:** `ffmpeg` and `ffprobe` installed (`brew install ffmpeg` on macOS).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `video_path` | string | ❌ | Path to .webm file (uses last recording if omitted) |

**Returns:** Dead frame percentage, pipeline timings, issues found, path to extracted key frames directory.

---

### `rate_video`
Scores the AutoTube output on 5 dimensions (script quality, media quality, narration, video production, YouTube readiness) out of 50 total. Returns specific improvement recommendations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | string | ❌ | Topic (uses last run if omitted) |
| `style` | string | ❌ | Style used |

---

### `search_youtube_videos`
Returns a YouTube search URL for top videos on a topic sorted by view count.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | string | ✅ | Topic to search |

---

### `compare_with_youtube`
Generates a full comparison report between the AutoTube output and high-view YouTube videos on the same topic. Includes:
- Patterns from top-performing YouTube videos
- AutoTube's strengths
- Gaps vs top videos
- Actionable recommendations

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | string | ✅ | The video topic |
| `style` | string | ❌ | Style used in AutoTube |

---

## Typical Workflow

```
1. start_dev_server
2. run_autotube_pipeline(topic="The Rise of Nvidia", headed=true)
3. review_recording          ← dead frame analysis + key frames extracted
4. rate_video                ← score out of 50 + top 3 fixes
5. compare_with_youtube(topic="The Rise of Nvidia")
6. stop_dev_server
```

**NOTE:** The `.webm` recording is the **browser automation session** (Playwright clicking through the UI), not the rendered AutoTube video output. To see the actual generated video, use the Export button in the AutoTube Preview step.

## Output Files

All output is written to `test-recordings/run-<timestamp>/` in the project root:

| File | Description |
|------|-------------|
| `*.webm` | Full browser session recording |
| `01-loaded.png` | App loaded screenshot |
| `02-topic-filled.png` | Topic entered |
| `03-script-done.png` | Script generation complete |
| `04-media-sourcing.png` | Media sourcing in progress |
| `05-media-done.png` | Media sourcing complete |
| `06-narration-done.png` | Narration complete |
| `07-assembled.png` | Video assembled |

## Troubleshooting

### "Playwright is not installed"
Run: `npx playwright install chrome` in the project root.

### "Dev server timed out"
The dev server didn't print a localhost URL within 10 seconds. Try running `npm run dev` manually first to check for errors.

### "No video file found"
Playwright video recording requires a non-headless context. Make sure `headed: true` (the default) or that your system supports headless video capture.

### Port 5173 already in use
Either the dev server is already running (which is fine — `start_dev_server` will detect this) or another process is using the port. Run `lsof -i :5173` to check.
