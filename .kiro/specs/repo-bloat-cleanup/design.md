# Repo Bloat Cleanup Bugfix Design

## Overview

The repository currently violates its size budget: `du -sh .` at the repository
root reports a total greater than 10 GiB. This design treats "repo size > 10 GiB"
as the bug condition and operationalizes the requirements from `bugfix.md` into a
concrete, evidence-driven audit and cleanup pipeline.

The shape of the fix is **audit first, delete last**:

1. Phase 1 — Storage audit (read-only): measure and classify.
2. Phase 2 — Dead code audit (read-only): find unreferenced code.
3. Phase 3 — Refactor and compactness review (read-only): find oversized/dup/heavy.
4. Phase 4 — Cleanup plan (read-only): merge findings into a reviewable plan.
5. Approved Batches → Execution → Verification: deletions happen in small,
   independently revertable batches, each verified against build + tests +
   preservation set before moving on.

No phase except the Execution batches mutates the working tree. Every deletion is
traceable to a classified finding with cited evidence.

### Non-goals

- **No `.git` history rewrites** (e.g. `git filter-repo`, BFG) unless the user
  explicitly opts in via a dedicated approval gate (clause 2.28, 3.7). If Phase 1
  shows `.git` dominates size, this design proposes a rewrite *batch plan* but
  does not execute it without opt-in.
- **No removal of `.kiro/specs/` folders** without explicit user confirmation
  that a given spec is stale (clause 3.8). By default every spec folder is in
  the preservation set.
- **No production-code refactoring** beyond what Phase 3 surfaces as safe,
  compactness-only wins. Behavior-preserving splits only; feature changes are
  out of scope.
- **No bulk mono-diff deletions.** Execution is batched (E3).

## Glossary

- **Bug_Condition (C)** — `totalDiskUsageBytes(R) > 10 * 1024^3`. The repository
  state `R` exceeds the 10 GiB budget.
- **Property (P)** — the desired behavior when C(R) holds: a cleaned state `R'`
  where size is strictly smaller, ideally within 10 GiB, runtime/build/tests are
  unchanged, and the preservation set is intact.
- **Preservation** — the invariant that every file in `preservationSet(R)`
  survives cleanup byte-for-byte, `npm run build` still exits 0, and no new test
  failures are introduced.
- **`R`** — pre-cleanup repository state (working tree + `.git`).
- **`R'`** — post-cleanup repository state.
- **Cleanup Plan** — the Phase 4 artifact: a markdown table + JSON sidecar
  enumerating every candidate file with classification, risk, bucket, projected
  savings, and evidence.
- **Preservation Set** — the set of files that must survive cleanup unchanged,
  computed per "Preservation set construction" below.
- **Batch** — an independently revertable unit of execution (one git commit or
  one stash) applied as a group and verified against P2 + P3 before the next
  batch begins.
- **`du -sb`** — byte-exact disk usage used for the size-shrink property; `du -sh`
  is used for human-readable reporting.
- **Regenerable artifact** — a file that can be reproduced by running a build,
  test, or install step (e.g. `dist/`, `coverage/`, `node_modules/`).

## Bug Details

### Bug Condition

The bug manifests when the repository's total disk usage exceeds 10 GiB. The
repository is accumulating files that do not belong in version control —
regenerable build artifacts, test recordings, caches, or a bloated `.git`
history — but because no classification exists, contributors cannot safely
decide what to delete.

**Formal Specification:**

```
FUNCTION isBugCondition(R)
  INPUT: R of type RepositoryState  // working tree + .git
  OUTPUT: boolean

  RETURN totalDiskUsageBytes(R) > 10 * 1024 * 1024 * 1024  // 10 GiB
END FUNCTION
```

### Examples

- `du -sh .` reports `11G` at the repo root → C(R) = true.
- `coverage/` is tracked in the working tree despite being a Vitest output that
  is conventionally `.gitignore`d → evidence of bloat category "generated build
  output".
- `test-recordings/` contains ~125 `.webm`/`.mp4` files produced by Playwright →
  evidence of bloat category "generated test output".
- `.git` reported at multiple GiB by `du -sh .git` → history itself contributes
  to clone size and may require a separate opt-in rewrite.
- `dist/` is `.gitignore`d today but was tracked historically → evidence that
  past build output is still in `.git` packs.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors (from bugfix.md clauses 3.1–3.8):**

- `npm run build` continues to exit 0 with no new errors (3.1).
- `npm test`, `npm run test:unit`, and Playwright suites pass every test that
  passed pre-cleanup (3.2).
- End-to-end AutoTube pipeline behavior (topic → script → media → narration →
  assembly → preview) is unchanged (3.3).
- Referenced runtime assets under `public/audio/` and `public/images/` continue
  to be served unchanged (3.4).
- Every file under `src/`, `server/`, `server-render/`, `powers/` that is
  referenced by build/test/runtime remains unchanged (3.5).
- Secret-bearing files (`.env*`, `*.pem`, credential stores) are never echoed
  into findings, logs, or commits and are never deleted (3.6).
- `.git` history integrity is preserved unless the user explicitly opts into a
  dedicated rewrite batch (3.7).
- `.kiro/specs/` folders are preserved unless explicitly confirmed stale (3.8).

**Scope:**

All inputs that do NOT involve bloat files — i.e. every file in
`preservationSet(R)` — must be completely unaffected by this fix. This includes:

- All referenced source files under `src/`, `server/`, `server-render/`, `powers/`.
- `package.json`, `package-lock.json`, `vite.config*`, `playwright.config.ts`,
  `tsconfig*.json`, `.gitignore`, `.env.example`, `index.html`, and any other
  tracked project configuration.
- Every runtime asset under `public/` that is referenced from source, HTML, or
  config.
- Every `.kiro/specs/` folder without explicit stale confirmation.
- Every secret-bearing file, regardless of reference.

## Hypothesized Root Cause

Based on the bugfix.md context ("Known Repository Context" section) and the
working tree layout, the most likely contributors are:

1. **Tracked test output (`test-recordings/`)**: ~125 `.webm`/`.mp4` files from
   Playwright. Video formats are large; this directory is almost certainly the
   single largest working-tree contributor.

2. **Tracked coverage output (`coverage/`)**: Vitest lcov HTML report is in the
   working tree and is not in `.gitignore` today. Smaller than test recordings
   but clearly regenerable.

3. **Historical `dist/` in `.git`**: `.gitignore` excludes `dist/` today, but
   previous commits likely added it. `.git` packs may still carry it.

4. **Oversized or duplicated `public/` media**: `public/audio/*.aac` beds are
   required runtime assets; duplicated or uncompressed variants would be bloat.
   `public/images/og-preview.jpg` is a single file but can be inspected.

5. **`.git` pack bloat**: independent of working tree. Large blobs added once
   and later deleted still live in packs. If `.git` dominates total size,
   history rewrite becomes the dominant lever — but is gated behind explicit
   user opt-in.

6. **Dead code / backup files**: `*.bak`, `*.old`, `*_old*`, experimental
   directories that were never removed. Usually small in bytes but high in
   cognitive bloat.

7. **Heavy or unused dependencies**: dependencies declared in `package.json`
   but not imported, or present with a lighter equivalent already in use.
   Affects `node_modules/` (local disk) but also first-install time.

Phase 1 evidence confirms or refutes each hypothesis before any bytes are
removed.

## Correctness Properties

Property 1: Bug Condition — Size Budget Met

_For any_ repository state `R` where the bug condition holds
(`isBugCondition(R) = true`, i.e. `totalDiskUsageBytes(R) > 10 GiB`), the fixed
state `R' = applyCleanup(R)` SHALL satisfy
`totalDiskUsageBytes(R') < totalDiskUsageBytes(R)` and ideally
`totalDiskUsageBytes(R') <= 10 GiB`, while respecting every Preservation
Requirement.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4–2.25 (audit outputs feed the plan
that produces R'), 2.26, 2.27, 2.28**

Property 2: Preservation — Build, Tests, Runtime, and Preservation Set Intact

_For any_ repository state `R` where the bug condition holds, after applying
cleanup to obtain `R'`, the fixed code SHALL produce the same observable
behavior as the original for every input outside the bloat set. Specifically,
every file in `preservationSet(R)` exists in `R'` with identical content,
`buildExitCode(R') = 0`, `testFailureCount(R') <= testFailureCount(R)`, and
`gitHistoryDigest(R') = gitHistoryDigest(R)` unless the user explicitly opted
into a history rewrite.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Architecture

The cleanup is a pipeline of read-only analyzers that each produce a findings
artifact, followed by a single plan-construction step, followed by a batched
execution loop with verification gates.

```
         ┌─────────────────────┐
R ──────▶│ Phase 1: Size audit │────▶ size-findings.md + size-findings.json
         └─────────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │ Phase 2: Dead code  │────▶ dead-code-findings.md + dead-code-findings.json
         └─────────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │ Phase 3: Refactor   │────▶ refactor-findings.md
         └─────────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │ Phase 4: Plan       │────▶ cleanup-plan.md + cleanup-plan.json
         └─────────────────────┘     + gitignore-proposal.md
                    │                + executive-summary.md
                    ▼
       ┌────────────────────────────────┐
       │ Approved Batches (A, B, C, D,  │
       │ optional E) → Execution →      │
       │ Verification (P2+P3+P5) after  │
       │ each batch                     │
       └────────────────────────────────┘
                    │
                    ▼
                    R'
```

### Stage contracts

Every Phase N is a pure function from repo state to a findings artifact. No
phase mutates the working tree. Each artifact is a markdown document intended
for human review, plus a machine-checkable JSON sidecar where the downstream
plan or PBT harness needs structured data.

**Artifact shapes** (stored under `.kiro/specs/repo-bloat-cleanup/findings/`):

- `size-findings.md` — tables for total size, top-level breakdown, `.git` size,
  `node_modules` size, files > 10M, `.git` large blobs, plus a per-row
  classification (Phase 1 rubric).
- `size-findings.json` — array of `{ path, sizeBytes, sizeHuman, classification,
  evidence, phase: 1 }` records.
- `dead-code-findings.md` — table for unreferenced files, backup/legacy files,
  duplicate candidates, each with confidence (HIGH/MEDIUM/LOW).
- `dead-code-findings.json` — array of `{ path, reason, confidence,
  referencesChecked, phase: 2 }` records.
- `refactor-findings.md` — oversized files (> 500 lines), repeated code
  candidates, unused/heavy deps, duplicate/uncompressed assets.
- `cleanup-plan.md` — the unified, risk-tiered plan (see "Cleanup plan format").
- `cleanup-plan.json` — machine-checkable plan used by P1, P4, P5 PBT checks.
- `gitignore-proposal.md` — proposed additions to `.gitignore`.
- `executive-summary.md` — narrative answering "why did it grow past 10G, and
  what is the fastest low-risk path to fix it?" (clause 2.25).

All artifacts are read-only once emitted; corrections are appended, not edited
in place, so the evidence trail is preserved (E1, E3).

## Investigation tooling (concrete commands)

Every command in this section is strictly read-only. Each command is mapped to
one or more acceptance-criteria clauses from `bugfix.md`.

### Phase 1 — Size audit commands

| Command | Purpose | Clauses |
|---------|---------|---------|
| `du -sh .` | Total repository size (human-readable) | 2.4, 1.1 |
| `du -sb .` | Total repository size in bytes (exact, for P4) | 2.4 |
| `du -sh ./*/ .[!.]*/ 2>/dev/null \| sort -h` | Top-level directory breakdown sorted ascending | 2.5 |
| `du -sh .git` | `.git` size measured separately | 2.7 |
| `du -sh node_modules 2>/dev/null` | `node_modules` size measured separately | 2.8 |
| `find . -type f -not -path './.git/*' -not -path './node_modules/*' -size +10M -exec ls -lh {} +` | Files > 10 MB in the working tree, excluding `.git` and `node_modules` | 2.6 |
| `git count-objects -vH` | `.git` pack stats (in-pack size, size-pack) | 2.7 |
| `git rev-list --objects --all \| git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \| sort -k3 -n \| tail -n 50` | Top 50 largest objects in `.git` history, to identify blobs a rewrite would target | 2.7, 2.28 |
| `find test-recordings -type f \( -name '*.webm' -o -name '*.mp4' -o -name '*.jpg' -o -name '*.png' \) -exec du -sh {} + \| sort -h \| tail -n 50` | Size distribution of Playwright recordings | 2.5, 2.6, 2.9 |
| `find coverage -type f -exec du -sh {} + \| sort -h \| tail -n 20` | Size breakdown of `coverage/` output | 2.5, 2.9 |
| `find dist -type f 2>/dev/null -exec du -sh {} + \| sort -h \| tail -n 20` | Size breakdown of any present `dist/` | 2.5, 2.9 |

### Phase 2 — Dead code audit commands

| Command | Purpose | Clauses |
|---------|---------|---------|
| For each candidate file, `rg --fixed-strings "<basename_without_ext>" src server server-render powers package.json vite.config*.* playwright.config.ts index.html tsconfig*.json` | Check for any reference by basename across source and config | 2.11 |
| For each candidate file, `rg --fixed-strings "<path_without_src_prefix>" src server server-render powers` | Check for explicit relative-import references | 2.11 |
| `find src server server-render powers -type f \( -name '*.bak' -o -name '*.old' -o -name '*.orig' -o -name '*_old*' -o -name '*_backup*' \)` | Backup/legacy filename heuristic | 2.12 |
| `find . -type d \( -name 'experimental' -o -name '_archive' -o -name 'legacy' -o -name 'old' \) -not -path './node_modules/*'` | Stale directory heuristic | 2.12 |
| For each `.ts`/`.tsx` module, compare by exported symbol names (`rg '^export (default |const |function |class )' -N`) to surface name-similar duplicates; then byte-hash compare top candidates with `md5 -q <file>` on macOS (`md5sum` on Linux) | Duplicate utility/component detection | 2.13 |
| For every candidate found above, record in `dead-code-findings.json` with a confidence level (HIGH/MEDIUM/LOW) per the scoring rubric below | Confidence labeling | 2.14, 2.15 |

### Phase 3 — Refactor and compactness commands

| Command | Purpose | Clauses |
|---------|---------|---------|
| `find src server server-render powers -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' \) -exec wc -l {} + \| sort -n \| tail -n 30` | Largest 30 source files by line count | 2.16 |
| `jscpd --min-lines 30 --min-tokens 80 --reporters console src server server-render powers` (run only if already present in `node_modules`; otherwise manual review of the top-30 wc -l output) | Repeated code block detection | 2.17 |
| For each `dep` in `package.json` dependencies + devDependencies: `rg "from ['\"]${dep}" src server server-render powers` and `rg "require\(['\"]${dep}" src server server-render powers` | Dependency usage check | 2.18 |
| `find public -type f -exec md5 -q {} \; -print \| paste - - \| sort` (macOS) or `find public -type f -exec md5sum {} + \| sort` (Linux) then group by hash | Duplicate asset detection by content hash | 2.19 |
| `find public -type f \( -name '*.wav' -o -name '*.png' -o -name '*.bmp' -o -name '*.tiff' \) -exec du -sh {} +` | Uncompressed asset candidates (have smaller `.aac`/`.webp`/`.jpg` equivalents) | 2.19 |

### Phase 4 — Plan construction (read-only)

No new commands; Phase 4 joins the JSON sidecars from Phases 1–3 into
`cleanup-plan.json`, applies the risk tier rubric below, and renders
`cleanup-plan.md`, `gitignore-proposal.md`, and `executive-summary.md`.

## Classification rubric (Phase 1)

Every item reported by Phase 1 is classified into exactly one of the nine
categories from clause 2.9 using this decision tree. Ties resolve top-down
(first match wins). If no rule matches, the item falls through to **needs
confirmation**.

```
is the path inside .git/ ?                                 → dependency artifact (history)
is the path inside node_modules/ ?                         → dependency artifact
is the path inside coverage/ ?                             → generated build output
is the path inside dist/ or build/ or out/ or .vite/ ?     → generated build output
is the path inside test-recordings/, playwright-report/,
    or test-results/ ?                                     → generated build output (test)
does the basename match *.log or *.tmp ?                   → log / cache or temporary file
does the basename match *.cache, .DS_Store, Thumbs.db,
    .eslintcache, .tsbuildinfo ?                           → cache or temporary file
does the path match .env*, *.pem, id_rsa*, *credentials* ? → NEEDS CONFIRMATION (secret; never delete)
is the path inside .kiro/specs/ ?                          → NEEDS CONFIRMATION (spec; preservation default)
is the path inside public/ AND referenced from source,
    HTML, or config (ripgrep hit) ?                        → required source (runtime asset)
is the path inside public/ AND NOT referenced anywhere ?   → uploaded media (candidate)
is the path under src/, server/, server-render/, powers/
    AND referenced by build/test/runtime ?                 → required source
is the path under src/, server/, server-render/, powers/
    AND unreferenced ?                                     → dead or legacy code (Phase 2 confirms)
does the basename match *.bak, *.old, *.orig, *_old*,
    *_backup* ?                                            → dead or legacy code
does content hash collide with another tracked file ?      → accidental duplicate
is the extension .sqlite, .db, .blob, .leveldb ?           → local database or blob store
fallthrough                                                → NEEDS CONFIRMATION
```

**Tie-breakers:**

- Secret patterns always win over every other rule.
- `.kiro/specs/` always wins over dead-code heuristics.
- A `public/` asset only classifies as "uploaded media" after the reference
  check fails; otherwise it is "required source".
- An accidental duplicate flag requires *both* content-hash match and at least
  one of the duplicates being outside its expected canonical location.

## Dead-code confidence scoring (Phase 2)

Each Phase 2 candidate is assigned a confidence level. Only HIGH-confidence
candidates are eligible for Batch C (and still require approval per 2.27).

- **HIGH** — Zero hits from ripgrep across `src/`, `server/`, `server-render/`,
  `powers/`, `package.json`, `vite.config*`, `playwright.config.ts`,
  `index.html`, `tsconfig*.json`, *and* one of:
  - basename matches backup/experimental heuristic (`*.bak`, `*.old`, `*.orig`,
    `*_old*`, `*_backup*`, inside `experimental/`, `_archive/`, `legacy/`,
    `old/`), **or**
  - file is inside a directory whose only siblings are also all unreferenced.
- **MEDIUM** — Zero import hits in *non-test* source but at least one hit in a
  test file, OR the file appears only in a dynamic import / string-concat path.
  MEDIUM candidates are always "needs confirmation" per 2.14.
- **LOW** — Name similarity or content-hash similarity with another file but
  hashes do not match exactly, OR only a partial reference hit (e.g. same
  basename, different directory). LOW candidates never enter Batch C; they are
  recorded for discussion only.

Any candidate that does not reach HIGH is labeled "needs confirmation" (clause
2.14). Confidence levels are recorded in `dead-code-findings.json`.

## Refactor heuristics (Phase 3)

- **Oversized files** — every file under `src/`, `server/`, `server-render/`,
  `powers/` with line count > 500 (clause 2.16). Output columns:
  `path | lineCount | proposedSplit` where `proposedSplit` is a brief
  human-authored suggestion (e.g. "split by `export` boundary into N files").
  Phase 3 does not execute splits.
- **Repeated code** — prefer `jscpd` if installed (`--min-lines 30
  --min-tokens 80`); otherwise manual inspection of the top-30 `wc -l` output
  for obviously duplicated helpers, recorded as `{ paths[], summary }`.
- **Heavy / redundant deps** — cross-reference every entry in `package.json`
  (dependencies + devDependencies) with its ripgrep import/require signature.
  Output columns: `dep | used | alternative | notes`, flagging deps with
  lighter equivalents already present (for example, if both `clsx` and
  `classnames` are present, `classnames` is redundant; if both `moment` and
  a native `Intl` usage coexist, `moment` is a heavy candidate).
- **Uncompressed / duplicated assets** — hash-based duplicate detection under
  `public/` (md5/md5sum); extension-based compression candidates (`.wav` →
  `.aac`/`.opus`, `.png` → `.webp`, `.bmp`/`.tiff` → anything). Output
  columns: `path | sizeHuman | duplicateOf | compressionCandidate | referenced`.

Phase 3 is read-only; it proposes, does not rewrite (clause 2.20).

## Cleanup plan format (Phase 4)

`cleanup-plan.md` contains one unified table joining Phase 1–3 findings:

| path | size | classification | risk | bucket | projected_savings | evidence |
|------|------|----------------|------|--------|-------------------|----------|

Where:

- `path` — repository-relative path.
- `size` — human-readable (from `du -sh`) plus bytes in the JSON sidecar.
- `classification` — one of the nine Phase 1 categories.
- `risk` — `safe` | `medium` | `high` per the Risk Tiers rubric.
- `bucket` — `delete_now` (only for `safe` risk) | `needs_approval`.
- `projected_savings` — bytes freed if this item is deleted.
- `evidence` — short reason string plus a link/reference to the finding row in
  `size-findings.md`, `dead-code-findings.md`, or `refactor-findings.md`.

`cleanup-plan.json` has the same rows as typed objects so the PBT harness can
iterate them programmatically.

`gitignore-proposal.md` contains a proposed diff against `.gitignore`, grouped
by rationale:

```
# Generated build/test output (regenerable)
coverage/
test-recordings/
playwright-report/
test-results/
.vite/

# Caches
.eslintcache
*.tsbuildinfo

# Logs (already present for *.log, re-stated for completeness)
*.log

# OS cruft
.DS_Store
Thumbs.db
```

`executive-summary.md` structure (clause 2.25):

1. **Headline** — current size, target size, projected post-cleanup size.
2. **Primary contributors** — top 3–5 bloat categories by bytes saved.
3. **Fastest low-risk path** — enumerate the SAFE batches and their total
   savings; show whether that alone meets the 10 GiB budget.
4. **If SAFE is insufficient** — describe the MEDIUM batches and the
   incremental approval gates needed.
5. **`.git` history** — whether a rewrite is required to meet budget; if yes,
   frame as a separate opt-in proposal.
6. **Prevention** — the `.gitignore` proposal summary.

## Risk tiers

Objective criteria, evaluated top-down (first match wins):

- **SAFE**
  - Classification is `generated build output`, `cache or temporary file`, or
    `log`, **and**
  - Path is either already matched by `.gitignore` intent (e.g. `dist/` which
    is `.gitignore`d) or will be covered by the `gitignore-proposal.md`, **and**
  - Ripgrep across `src server server-render powers package.json vite.config*
    playwright.config.ts index.html tsconfig*.json` finds zero runtime
    references to the path or basename.
- **MEDIUM**
  - Dead-code candidate with HIGH confidence from Phase 2, **or**
  - Asset under `public/` that Phase 3 flags as duplicate or compressible AND
    has zero runtime references, **or**
  - Large file > 10 MB outside `public/`, `src/`, `server/`, `server-render/`,
    `powers/`, `.kiro/`, and `.git/` that classification flagged as `accidental
    duplicate` or `uploaded media`.
- **HIGH**
  - Any file under `public/audio/`, `public/images/`, or `.kiro/specs/`, **or**
  - Any file matching a secret pattern (`.env*`, `*.pem`, `id_rsa*`,
    `*credentials*`), **or**
  - Any modification to `.git/` history (always HIGH, opt-in only), **or**
  - Any item that classification resolved to "needs confirmation" via
    fallthrough.

SAFE items go in `bucket = delete_now`. MEDIUM and HIGH go in
`bucket = needs_approval`.

## Preservation set construction

`preservationSet(R)` is computed *before* Phase 4 so that the plan cannot
propose deleting anything in it. Construction is a deterministic static trace:

1. **Entry points** — parse `package.json`:
   - `main`, `module`, `type`, `scripts` (every command string is scanned for
     file path arguments; `.mjs`/`.ts` files referenced by scripts are added
     as entry points — e.g. `run-pipeline.mjs`, `server-render.mjs`,
     `server/index.ts`).
2. **HTML entry** — parse `index.html` for `<script src>`, `<link href>`,
   `<img src>`, `<source src>`. Every referenced path is added.
3. **Static import trace** — starting from each entry, walk imports using
   ripgrep-driven matching (`rg "from ['\"]\./|from ['\"]\\.\\./|import\\(['\"]"`).
   Resolve relative paths; every resolved file is added. Continue transitively
   until fixed point.
4. **Dynamic imports & runtime strings** — any `import(<expr>)`, `require(<expr>)`,
   `new Worker(<expr>)`, or `fetch('/<path>')` is recorded. Resolved literal
   paths are added. Non-literal expressions cause every candidate file in the
   matched directory to be labeled "needs confirmation" instead of deletable.
5. **Config preservation** — unconditionally added: `package.json`,
   `package-lock.json`, `tsconfig*.json`, `vite.config*.{ts,js,mts,mjs}`,
   `playwright.config.ts`, `.gitignore`, `.env.example`, `index.html`,
   `README.md`, `tailwind.config.*` if present.
6. **Secret-shape allowlist** — every file whose basename matches `.env*`,
   `*.pem`, `id_rsa*`, `*credentials*`, `*secret*`, `*.key` is added
   unconditionally regardless of reference (3.6).
7. **Referenced `public/` assets** — for every file under `public/`, ripgrep
   its basename against source + HTML + config. Any hit adds the asset to the
   preservation set. Misses are candidates only, not deletions.
8. **Spec folders** — every directory under `.kiro/specs/` is added
   unconditionally unless the user has explicitly confirmed it stale (3.8).
9. **Test fixtures referenced by tests** — any file path mentioned by a
   `__tests__` directory via ripgrep is added.

The union of 1–9 is `preservationSet(R)`, serialized to
`findings/preservation-set.json` as `{ path, sha256, sizeBytes }[]`. Every
later batch is checked against it.

## Property-Based Testing Plan

Every property from `bugfix.md` gets an executable check. Properties operate
on the `cleanup-plan.json` and on pre/post repo snapshots. We use `fast-check`
(already in `devDependencies`) where property-based generation is valuable, and
plain shell-driven check scripts where the "property" is really a one-shot
assertion over the whole plan.

### Phase 1 bug-condition exploration test (MUST FAIL before the fix)

**File**: `src/__tests__/repo-bloat-cleanup.bug.test.ts` (Vitest, run with
`npm run test:unit`).

**Goal**: Prove the bug exists. This test is expected to FAIL on the unfixed
repo and PASS after cleanup. Standard bugfix pattern.

```ts
// Pseudocode
import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";

const TEN_GIB = 10 * 1024 ** 3;

describe("Bug condition: repo size budget", () => {
  it("repository total disk usage is <= 10 GiB", () => {
    const out = execSync("du -sb .", { encoding: "utf8" });
    const bytes = Number(out.trim().split(/\s+/)[0]);
    expect(bytes).toBeLessThanOrEqual(TEN_GIB);
  });
});
```

Running this on `R` (unfixed) produces a failing counterexample with a
concrete `bytes > TEN_GIB`. Running it on `R'` (post-cleanup) passes.
This is the Task 1 "exploration test" in tasks.md.

### P1 — No referenced file is deleted

**Generator**: enumerate every row in `cleanup-plan.json` where
`bucket === "delete_now"`.

**Check** (fast-check `fc.assert(fc.property(...))`):

```ts
fc.assert(
  fc.property(arbFromPlanDeleteNowRows, (row) => {
    const basenameHits = rg(`${basename(row.path)}`, SCAN_ROOTS);
    const pathHits = rg(`${row.path}`, SCAN_ROOTS);
    return (basenameHits + pathHits) === 0;
  })
);
```

Where `SCAN_ROOTS = ["src", "server", "server-render", "powers",
"package.json", "vite.config*", "playwright.config.ts", "index.html",
"tsconfig*.json"]`.

Any hit fails the property; the offending row must be demoted to
`needs_approval`.

### P2 — Build still succeeds (exploration + post-cleanup)

**Runner**: shell-driven check.

```
npm install --no-audit --no-fund
npm run build
```

Assert exit code `0`. Run on a staging clone of `R'` so the working tree is
not polluted if the assertion fails. Recorded as
`findings/verification/p2-build.log`. Run after every executed batch
(Batch A, B, C, D, E) — this is the per-batch verification gate.

### P3 — No new test failures

**Generator**: the set of tests known to be green on `R` pre-cleanup, captured
once as `findings/verification/baseline-tests.json`:

```json
{ "unit": { "passed": <n>, "failed": <m> }, "e2e": { "passed": <n>, "failed": <m> } }
```

**Check**:

```
npm run test:unit -- --reporter=json > post-unit.json
npm test -- --reporter=json > post-e2e.json   # Playwright; only on staging
```

Assert `post.failed <= baseline.failed` for each suite. Any test that was
green pre-cleanup and is red post-cleanup fails the property.

### P4 — Size strictly shrinks (ideally ≤ 10 GiB)

**Check**:

```
pre=$(du -sb . | cut -f1)          # captured on R
post=$(du -sb . | cut -f1)         # captured on R'
[ "$post" -lt "$pre" ]             # P4 mandatory
[ "$post" -le $((10*1024*1024*1024)) ]  # P4 aspirational
```

Both comparisons recorded in `findings/verification/p4-size.log`. The strict
shrink assertion is mandatory per clause 2.1; the ≤ 10 GiB target is the
acceptance goal and drives whether additional batches are needed.

### P5 — Preservation set is intact

**Generator**: enumerate every `{ path, sha256 }` in
`findings/preservation-set.json`.

**Check** (fast-check, one property per row):

```ts
fc.assert(
  fc.property(arbFromPreservationSet, ({ path, sha256 }) => {
    if (!fs.existsSync(path)) return false;
    return sha256File(path) === sha256;
  })
);
```

Fails on first missing/modified file, naming the offending path as the
counterexample. Must pass after every executed batch, not just at the end
(preservation is per-batch, per clause 2.26 + E3).

### PBT runner summary

| Property | Runner | Phase |
|----------|--------|-------|
| Bug condition (size ≤ 10 GiB) | Vitest (`src/__tests__/repo-bloat-cleanup.bug.test.ts`) | Exploration (must fail on R) |
| P1 (no referenced file deleted) | fast-check + ripgrep | Before each execution batch |
| P2 (build succeeds) | shell (`npm install && npm run build`) on staging | After each execution batch |
| P3 (no new test failures) | shell (`vitest run`, optionally Playwright) on staging | After each execution batch |
| P4 (size strictly shrinks) | shell (`du -sb .` pre/post) | After each execution batch |
| P5 (preservation set intact) | fast-check + sha256 | After each execution batch |

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct and Phase 1 confirms the expected
contributors (regenerable artifacts + possible `.git` blob bloat), the fix
makes the following categories of changes:

**Files / directories targeted (exact contents determined by findings):**

1. **Regenerable artifact removal (working tree)**
   - Delete `coverage/` from the working tree.
   - Delete `test-recordings/` from the working tree (subject to staging
     verification that Playwright recreates it on next run).
   - Delete any residual `dist/`, `playwright-report/`, `test-results/`,
     `.vite/` directories.
   - Delete any `*.log`, `.eslintcache`, `*.tsbuildinfo` at the repo root.

2. **`.gitignore` hardening**
   - File: `.gitignore`
   - Add entries per `gitignore-proposal.md` (coverage, test-recordings,
     playwright-report, test-results, .vite, .eslintcache, *.tsbuildinfo,
     .DS_Store, Thumbs.db). Preserve existing entries verbatim.

3. **Dead code removal (HIGH confidence only)**
   - File(s): individual entries under `src/`, `server/`, `server-render/`,
     `powers/` flagged HIGH by Phase 2. Each requires approval (2.27).
   - Batch C is strictly opt-in per item.

4. **Asset compaction**
   - File(s): duplicates under `public/` (Phase 3 findings). Each requires
     approval; each removal verified against referenced-assets list.

5. **Dependency pruning** *(optional, opt-in)*
   - File: `package.json`
   - Remove entries flagged unused by Phase 3 (`dep | used = false`).
   - Regenerate `package-lock.json` via `npm install`.

6. **`.git` history rewrite** *(optional, opt-in, separate batch)*
   - Only if Phase 1 shows `.git` dominates size AND user opts in.
   - Proposed tooling: `git filter-repo --strip-blobs-bigger-than 10M`
     targeting blobs identified by `git rev-list ... cat-file --batch-check`.
   - Requires force-push coordination (out of scope for automatic execution).

## Testing Strategy

### Validation Approach

Two-phase validation: first, surface counterexamples that demonstrate the bug
on the unfixed repo (exploration); then verify the fix preserves build, tests,
runtime, and the preservation set (fix + preservation checking), batch by
batch.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing
the fix. Confirm or refute the root cause analysis. If we refute, re-hypothesize.

**Test Plan**: Write the `repo-bloat-cleanup.bug.test.ts` Vitest property that
asserts `du -sb . <= 10 GiB`, plus shell snapshots that measure `.git`,
`node_modules`, `test-recordings`, `coverage`, and files > 10 MB. Run on the
UNFIXED repo to observe failures and identify dominant contributors.

**Test Cases**:

1. **Size budget test** (will fail on unfixed code): `du -sb .` > 10 GiB
   produces a concrete over-budget byte count.
2. **Top-level breakdown** (informational, will not "fail" but exposes the
   root cause distribution): `du -sh ./*/` reveals which directory dominates.
3. **`.git` vs working tree split** (informational): `du -sh .git` separates
   history contribution from working-tree contribution (clause 2.7).
4. **Files > 10 MB census** (informational): `find ... -size +10M` lists the
   fattest files (clause 2.6).
5. **Tracked-vs-ignored mismatch** (may fail on unfixed code): `coverage/`
   exists in working tree AND is not in `.gitignore` — classifies as
   "generated build output" with bucket = `delete_now` and a `.gitignore`
   amendment.

**Expected Counterexamples**:

- `du -sb .` returns a byte count strictly greater than 10 GiB.
- Possible dominant causes: (a) `test-recordings/` as tracked Playwright
  output, (b) `coverage/` as tracked Vitest output, (c) `.git` blob bloat from
  historical `dist/` or media commits, (d) uncompressed duplicate assets.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
function (the full cleanup pipeline applied to `R`) produces the expected
behavior.

**Pseudocode:**

```
FOR ALL R WHERE isBugCondition(R) DO
  R' := applyCleanup(R)
  ASSERT totalDiskUsageBytes(R') < totalDiskUsageBytes(R)       // P4 mandatory
  ASSERT totalDiskUsageBytes(R') <= 10 * 1024^3                 // P4 aspirational
  ASSERT everyDeletedFileHasClassifiedEvidence(plan)            // 2.2, E1
  ASSERT everyDeletedFileIsNotInPreservationSet(plan, R)        // P1, P5
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold —
i.e. every file and behavior outside the bloat set — the fixed repo produces
the same result as the original.

**Pseudocode:**

```
FOR ALL R WHERE isBugCondition(R) DO
  R' := applyCleanup(R)

  FOR ALL f IN preservationSet(R) DO
    ASSERT existsIn(f, R')
    ASSERT contentOf(f, R') = contentOf(f, R)                   // P5
  END FOR

  ASSERT buildExitCode(R') = 0                                  // P2, 3.1
  ASSERT testFailureCount(R') <= testFailureCount(R)            // P3, 3.2
  ASSERT gitHistoryDigest(R') = gitHistoryDigest(R)
         OR userOptedInToHistoryRewrite                         // 3.7, 2.28
END FOR
```

**Testing Approach**: Property-based testing (fast-check) is used for P1 and
P5 because they iterate over generated rows. P2, P3, P4 are shell-driven
one-shot assertions. Every batch is verified against P2 + P3 + P5 before the
next batch executes; P4 is checked at the end of each batch for progress
reporting.

**Test Plan**: Snapshot preservation-set hashes and the baseline test-failure
count on `R` first. Run each batch, then run the five-property verification
suite on a staging checkout. Roll back if any property fails.

**Test Cases**:

1. **Build preservation**: `npm install && npm run build` exits 0 on `R'`.
2. **Unit test preservation**: `npm run test:unit` failure count ≤ baseline.
3. **E2E test preservation** (optional per batch, mandatory before final
   report): Playwright suite failure count ≤ baseline.
4. **Runtime asset preservation**: every `public/` file in the preservation
   set exists in `R'` with identical sha256.
5. **Spec preservation**: every `.kiro/specs/*` folder exists in `R'`.
6. **Secret file preservation**: no `.env*`, `*.pem`, credential-shaped file
   is in any `delete_now` or `needs_approval` bucket.

### Unit Tests

- `repo-bloat-cleanup.bug.test.ts` — the bug condition property.
- `preservation-set.test.ts` — validates that `preservationSet(R)`
  construction is deterministic and includes the unconditional items
  (package.json, index.html, all `.kiro/specs/*`, all secret-shaped files).
- `classification.test.ts` — unit tests for the Phase 1 rubric decision tree
  with synthetic paths exercising each branch including tie-breakers.
- `confidence.test.ts` — unit tests for the Phase 2 HIGH/MEDIUM/LOW rubric
  on synthetic reference maps.
- `risk-tier.test.ts` — unit tests for the risk tier rubric on synthetic
  classification rows.

### Property-Based Tests

- **P1** — `fast-check` over every `delete_now` row: basename + path ripgrep
  returns zero hits across SCAN_ROOTS.
- **P5** — `fast-check` over every preservation-set row: path exists and
  sha256 matches pre-cleanup snapshot.
- **Classification invariants** — `fast-check` property: any path matching
  a secret pattern always classifies as "needs confirmation" regardless of
  other attributes (tie-breaker correctness).
- **Preservation-set invariants** — `fast-check` property: adding any entry
  to a `delete_now` bucket whose path is in `preservationSet(R)` fails plan
  validation.

### Integration Tests

- **End-to-end build after Batch A** — staging checkout, run `npm install &&
  npm run build`, assert exit 0 and no new error lines.
- **End-to-end unit tests after Batch A/B/C** — `npm run test:unit`,
  assert failure count ≤ baseline.
- **End-to-end Playwright smoke** — run a representative subset
  (`npm run test:app`) after Batch A and at the end of the full cleanup,
  assert failure count ≤ baseline.
- **Rollback drill** — verify that reverting the most recent batch
  (`git restore` or `git reset` to the pre-batch commit) returns `R` to
  byte-identical state for the affected paths.

## Execution plan

Execution proceeds in independently revertable batches. Each batch is one
commit (or one stash if the user prefers a non-committed preview). After each
batch, P2 + P3 + P5 are checked on a staging checkout; P4 is reported. Failing
any check halts the pipeline and triggers rollback.

### Batch A — SAFE, `delete_now`: regenerable artifacts

Deletes only files classified as `generated build output`, `cache or temporary
file`, or `log`, all with `bucket = delete_now`.

Concretely (exact list driven by Phase 1 findings, but expected set):

- `coverage/` (entire directory)
- `test-recordings/` (entire directory)
- `dist/` if present in working tree
- `playwright-report/`, `test-results/`, `.vite/` if present
- Any root-level `*.log`, `.eslintcache`, `*.tsbuildinfo`

Commit message: `chore(cleanup): remove regenerable artifacts from working tree`.

### Batch B — SAFE, `.gitignore`-only

Adds `gitignore-proposal.md` entries to `.gitignore`. Zero deletions. Goal:
prevent recurrence (clause 2.23). Independently revertable.

Commit message: `chore(gitignore): ignore regenerable build/test artifacts`.

### Batch C — MEDIUM, `needs_approval`: dead code (HIGH confidence)

Deletes only Phase 2 candidates labeled HIGH confidence, and only after
explicit per-item approval (clause 2.27). MEDIUM and LOW confidence candidates
are never in Batch C.

Verified against P1 (no referenced file) and P5 (preservation set intact)
before deletion; P2 + P3 after.

Commit message: `chore(cleanup): remove dead code — <short item list>`.

### Batch D — MEDIUM, `needs_approval`: duplicate/uncompressed assets

Deletes only `public/` assets that:

- have zero runtime references (ripgrep), **and**
- are duplicates (same content hash as a kept sibling) or uncompressed with a
  kept compressed equivalent, **and**
- received explicit per-item approval.

Audio beds under `public/audio/*.aac` are HIGH risk and are *not* eligible
for this batch unless Phase 3 proves a specific file is a duplicate AND the
user explicitly approves.

Commit message: `chore(assets): remove duplicate/uncompressed public assets`.

### Batch E — HIGH, `needs_approval`, optional: `.git` history rewrite

Applies only if Phase 1 shows `.git` dominates and the user explicitly opts in.
Executed via `git filter-repo --strip-blobs-bigger-than 10M` (or a targeted
blob list from Phase 1's top-50 pack objects). Requires:

- Separate branch and repository backup before execution.
- User-coordinated force-push.
- Re-run of all verification properties, plus an explicit audit that
  `gitHistoryDigest(R') ≠ gitHistoryDigest(R)` is expected and opted-in.

Never auto-executed.

### Batch gating

Between every pair of batches:

```
npm install --no-audit --no-fund          # only after Batch B or C if deps change
npm run build                              # P2
npm run test:unit                          # P3 (unit)
# P5: sha256 every path in preservation-set.json, compare to snapshot
du -sb .                                   # P4 reporting
```

If any fails, the batch is rolled back (`git reset --hard <pre-batch-sha>` on
the cleanup branch) before the next batch is considered.

## Observability & rollback

### Manifests and snapshots

Before any execution, capture and commit under
`.kiro/specs/repo-bloat-cleanup/findings/verification/`:

- `pre-cleanup-snapshot.md` — output of `git status`, `du -sb .`, `du -sh .`,
  and `git count-objects -vH`.
- `baseline-tests.json` — failure counts per suite, from a dry run of
  `npm run test:unit` and (optionally) `npm test`.
- `preservation-set.json` — `{ path, sha256, sizeBytes }[]` for every entry
  in the preservation set.

After each executed batch, produce:

- `batch-<letter>-manifest.md` — one row per deleted path:
  `{ path, sizeBytes, classification, risk, evidenceRef, commitSha }`.
- `batch-<letter>-verification.md` — the P2/P3/P4/P5 run results and
  the staging `du -sb .` delta.

### Rollback procedures

- **Working-tree-only deletions (Batches A, B, C, D)**: `git restore
  --source=<pre-batch-sha> -- <paths>` restores the deleted files byte-for-byte,
  since they are still in `.git`. Alternatively `git reset --hard <pre-batch-sha>`
  on the dedicated cleanup branch. Deleted files are only *in the working
  tree*; `.git` objects are intact. P5 is therefore trivially satisfiable
  by rollback.
- **`.gitignore` edits (Batch B)**: revert the commit.
- **History rewrite (Batch E)**: rollback requires restoring from the
  pre-batch repository backup (mandatory before executing Batch E). Refuse to
  start Batch E without that backup on disk.
- **Refuse `.git` rewrites** outside Batch E. No other batch modifies `.git`
  in any way.

## Security / Secret handling

- **Never echo file contents** into findings, manifests, verification logs, or
  commit messages. All tooling operates on paths and hashes only (E5, 3.6).
- **`.env*`, `*.pem`, `id_rsa*`, `*credentials*`, `*secret*`, `*.key`** files
  are in the preservation set unconditionally and classification always
  routes them to "needs confirmation" via the tie-breaker. They can never
  appear in `bucket = delete_now`.
- **Local database / blob store files** (`.sqlite`, `.db`, `.blob`,
  `.leveldb`) always classify as "needs confirmation" regardless of size or
  reference status. Even a zero-reference `.sqlite` is user-approval-only,
  because its content may be local state the user has not re-created
  elsewhere.
- **Cleanup plan review** redacts any line that would include a secret path
  to its parent directory plus `<redacted>` filename; the full path is
  written only to `preservation-set.json` (not to findings markdown).

## Out-of-scope explicitly

- **Rewriting `.git` history** outside Batch E's dedicated opt-in approval
  gate (clause 2.28, 3.7).
- **Removing any `.kiro/specs/` folder** without explicit user confirmation
  that the specific folder is stale (clause 3.8).
- **Refactoring production code** beyond compactness-only wins surfaced by
  Phase 3. Feature changes, API changes, and behavior changes are not part
  of this bugfix.
- **Auto-pruning `node_modules/` dependencies** without the user opting into
  the Phase 3 dependency findings. Dependency removal is proposed, not
  executed automatically.
- **Running the fix on any environment other than a clean working tree on a
  dedicated cleanup branch**. The pipeline refuses to operate if
  `git status` reports unstaged changes outside the cleanup branch.
