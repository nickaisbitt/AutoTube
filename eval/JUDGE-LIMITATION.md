# Independent / blind judge (Phase C9)

## Current limitation
A same-model judge — where the brutal watcher (`powers/video-watcher`) uses the
same OpenRouter model family as generation (`xiaomi/mimo-v2.5` via
`OPENROUTER_MODEL` / `OPENROUTER_VISION_MODEL`) — **inflates confidence**. A model
grading its own output is not an independent auditor.

## Fix shipped
Model selection is centralized in `resolveWatchModel()`
(`powers/video-watcher/src/vision-brutal.mjs`):

1. **`AUTOTUBE_WATCH_MODEL`** (explicit independent judge) always wins.
2. **Cold eval** (`AUTOTUBE_EVAL_COLD=1`): when `AUTOTUBE_WATCH_MODEL` is unset,
   the watcher now defaults to an **independent** vision model
   (`google/gemini-2.5-flash`, `COLD_EVAL_DEFAULT_WATCH_MODEL`) that is distinct
   from generation — so cold scores are not self-graded out of the box.
3. Otherwise it falls back to the generation vision/LLM model (same-model
   limitation applies; label it).

Override the judge explicitly with any distinct vision-capable model, e.g.:

```bash
export AUTOTUBE_WATCH_MODEL='google/gemini-2.5-flash'
# or google/gemma-4-31b-it, or another OpenRouter vision model distinct from OPENROUTER_MODEL
```

`EVAL_META.json` records `models.watch`, `models.watchIndependent`,
`models.watchDefaultedForColdEval`, `models.watchModelSource`, and
`sameModelJudgeLimitation` so every run states whether the judge was independent.

## Recommended model
`google/gemini-2.5-flash` — strong, cheap, reliable vision model, different family
from `xiaomi/mimo-v2.5`, and already priced in `costTracker`. Set it via
`AUTOTUBE_WATCH_MODEL` (it is also the cold-eval default).

## Policy
- Dev calibration may use same-model (cheaper) but must label the limitation.
- Release-candidate claims require an independent judge — either
  `AUTOTUBE_WATCH_MODEL` set to a different model, or the cold-eval independent
  default active (`models.watchIndependent: true`), or an explicit waiver in the report.
