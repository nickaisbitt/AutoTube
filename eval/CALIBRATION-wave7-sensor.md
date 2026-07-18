# Wave 7 sensor — post variety/pacing fix (`faac029`+)

**Protocol:** cold `dev×2`, independent judge `google/gemini-2.5-flash`  
**Dir:** `test-recordings/eval-dev-2026-07-18T13-32-52-491Z`

## Results

| Metric | Value |
|--------|-------|
| Generate | **100%** (2/2) |
| Upload-ready | **0%** |
| Critical | **0%** |
| Raw median | **6.4** (max 6.8) |

| Topic | raw | dims (h/v/c/p/y) | uniq videos | median cut |
|-------|-----|------------------|-------------|------------|
| dev-01 | 6.8 | 8/8/7/8/7 | 22 | **0.7s** |
| dev-02 | 6.0 | 8/7/7/6/6 | 15 | **0.7s** |

## Signal
- Cut-widen trap is fixed: median cut stays **0.7s** (was 1.25s in Wave 6).
- denser scenes on near-miss (97 scenes, longest 1.6s) → pacing **8**.
- Remaining blockers on 6.8: **small captions** + “generic stock feel”.
- Follow-up on tip: larger karaoke (6.8% height) + yellow outline; release×24 chain running.
