# Independent / blind judge (Phase C9)

## Current limitation
Cold eval watcher (`powers/video-watcher`) defaults to the same OpenRouter model family as generation (`xiaomi/mimo-v2.5` via `OPENROUTER_MODEL` / `OPENROUTER_VISION_MODEL`). That **inflates confidence** — same-model judge is not an independent auditor.

## Fix shipped
Set `AUTOTUBE_WATCH_MODEL` to a **different** vision-capable model for the brutal watcher only, e.g.:

```bash
export AUTOTUBE_WATCH_MODEL='google/gemma-4-31b-it'
# or another OpenRouter vision model distinct from OPENROUTER_MODEL
```

`EVAL_META.json` records `models.watchIndependent` and `sameModelJudgeLimitation`.

## Policy
- Dev calibration may use same-model (cheaper) but must label the limitation.
- Release-candidate claims require `AUTOTUBE_WATCH_MODEL` set to a different model, or an explicit waiver in the report.
