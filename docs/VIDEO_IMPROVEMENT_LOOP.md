# Video improvement loop

Endless (or capped) **generate → watch → repeat** with a **new random topic every iteration**.

## Prerequisites

1. Dev server: `npm run dev -- --port 5173 --host 0.0.0.0`
2. Optional: `OPENROUTER_API_KEY` for brutal/hook vision in reviews
3. Long runs: use **tmux** (each full cycle is often 30–60+ minutes)

## Fix gate (important)

If Video Watcher says **upload-ready: NO**, the loop:

1. Applies fixes (hook rewrite, faster cuts, real stock, kinetic text, etc.)
2. Saves state to `test-recordings/improvement-loop/FIX_STATE.json`
3. **Re-runs the SAME topic** with fixes — does NOT pick a new topic until pass or `--max` retries (default 4)

## Commands

```bash
# Run forever (Ctrl+C to stop) — random topic each loop
npm run loop:video

# One full cycle only
npm run loop:video:once

# Stop when Video Watcher says upload-ready
npm run loop:video -- --until-pass

# Cap iterations
npm run loop:video -- --max 5

# Pause between loops (seconds)
npm run loop:video -- --delay 120

# Review existing MP4 only (no generate)
npm run loop:video -- --review-only --max 1
```

## Outputs

| Path | Purpose |
|------|---------|
| `test-recordings/improvement-loop/JOURNAL.md` | Human-readable numbered log |
| `test-recordings/improvement-loop/JOURNAL.jsonl` | Machine-readable log |
| `test-recordings/improvement-loop/run-NNNN-<ts>/` | Per-iteration video, report, contact sheet |

## tmux example

```bash
tmux new-session -s video-loop -c /workspace -- npm run loop:video
# detach: Ctrl+B then D
```

## Topic pool

Edit `scripts/lib/random-topics.mjs` to add or change random topics.
