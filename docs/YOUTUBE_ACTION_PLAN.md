# YouTube growth action plan (consolidated feedback)

Your goal: **profitable YouTube channel**, not just “a video that exports.”  
This merges reviewer feedback (content, retention, file/export) into one ordered list.

---

## Phase A — Urgent (file must work before anyone can review)

1. **Re-export a review-friendly MP4** — H.264 video, AAC audio, `yuv420p`, `faststart`, 30 fps, ≤50 Mbps (run `npm run export:review`).
2. **Confirm the file plays locally** start-to-finish (VLC or browser) before sharing.
3. **Use a fresh filename** each upload (e.g. `FINAL-VIDEO-youtube-v3-review.mp4`) so caches don’t serve an old corrupt copy.
4. **Match duration** — confirm export is ~90s (preview) or full length as intended; no truncated tail.
5. **Avoid broken wrappers** — export from pipeline or `ffmpeg` copy, not manual rename of half-finished files.

---

## Phase B — Top 5 (biggest $ impact per hour)

6. **Rewrite the first 3 seconds** — no “In 2024…” context; lead with shock/curiosity (“Hospitals paid **billions** after…” / “This hack exposed **millions** of records…”).
7. **Cut visuals every 1–2 seconds** — no clip held >3s unless it’s paying off; pattern interrupt every 5–8s (zoom, stat, new angle).
8. **Bigger captions** — max **4 words** on screen; huge type; yellow on the active word; readable muted.
9. **Thumbnail** — one face or one object, **2–5 words**, high contrast (often matters more than the edit).
10. **Title** — curiosity, not description (“The Hospital Hack Nobody Saw Coming” not “AI in Healthcare 2024”).

---

## Phase C — Content & retention (minute-by-minute quality)

11. **One idea per screen** — don’t put full sentences in overlays; narration carries detail, text carries punch.
12. **Human stakes first** — patients, doctors, ER, faces; not only phones and circuit boards.
13. **Numbers & stakes in every segment** — money, danger, records exposed, lawsuits, deaths, fines.
14. **Remove dead air** — tighten narration; no pauses >0.3s without purpose.
15. **Stronger cold open** — 3–5 visual beats in first 2.5s, hook text = best single line from script.
16. **End with CTA** — subscribe / next video / “Part 2” — don’t hard-stop on last fact.
17. **Study retention graph** after upload; fix exact drop-off seconds in the *next* video.

---

## Phase D — Channel strategy (you won’t get rich from one video)

18. **Pick a monetizable niche** — cybersecurity, AI, finance, B2B, health tech (CPM-friendly).
19. **Post consistently** — aim for volume + iteration (many creators learn from ~100 videos, not 1 perfect export).
20. **Series, not one-offs** — e.g. “Biggest Healthcare Hacks” / “AI Scandals” / “Data Breaches Explained.”
21. **A/B test titles & thumbnails** — same video concept, different packaging.
22. **Target metrics** — CTR 6–10%+; avg view duration 60%+ (short) / 70%+ retention on Shorts.

---

## Phase E — AutoTube pipeline (what we automate vs you)

| Action ID | Item | AutoTube status |
|-----------|------|-----------------|
| B6 | Shock hook line | `buildRetentionHook()` in YouTube mode |
| B7 | 1–2s visual cuts | YouTube mode forces ~1.0s asset alternation |
| B8 | Large captions | YouTube profile (~8% frame height) |
| C11 | Short on-screen text | 4-word caption window |
| C12 | Human B-roll | **You** — real media search / Visual Director (not 6 stock stills) |
| B9–B10 | Title / thumbnail | **You** — `thumbnail.ts` + title variants in app |
| A1–A5 | Compatible export | `npm run export:review` |

---

## Phase F — What reviewers couldn’t do (Feedback 2–3)

23. If tools report “parsing error,” send **`export:review`** file + **title + thumbnail text** + optional `.srt` captions.
24. For second-by-second audit, export **1 frame per second** as JPG zip or share transcript — easier than one heavy MP4.

---

## Honest expectation

Current fixture path = **proof the pipeline works**, not a viral video.  
**Rich** on YouTube usually means: **packaging (title/thumb) + retention editing + niche + volume** — we can automate editing defaults; you still need real topics, media, and uploads.
