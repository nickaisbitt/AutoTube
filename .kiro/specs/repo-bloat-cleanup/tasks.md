# Implementation Plan

This task list operationalizes `design.md` one-to-one against its four-phase
audit pipeline (Phase 1 → 2 → 3 → 4) and its batched execution plan
(Batches A → B → C → D, plus optional Batch E). Every task is scoped so a
reviewer can audit it in a single pass. Every deletion task is an independently
revertable commit on a dedicated cleanup branch, and every batch ends with the
same P2 + P3 + P5 + P4 verification gate defined in design.md.

Clause references follow `bugfix.md` (for example `Requirements: 2.4`) and the
execution-discipline codes `E1–E5`. Design references point to named sections
in `design.md`.

Optional tasks are marked with a trailing `*`.

---

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Repository Exceeds 10 GiB Size Budget
  - **CRITICAL**: This test MUST FAIL on the unfixed repo - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after cleanup
  - **GOAL**: Surface the concrete over-budget byte count as the counterexample demonstrating the bug
  - **Scoped PBT Approach**: The bug is deterministic at the repository level (one input: the current working tree plus `.git`), so scope the property to that single concrete case rather than generating arbitrary inputs
  - Test is placed at `src/__tests__/repo-bloat-cleanup.bug.test.ts` so it is picked up by `npm run test:unit` (Vitest)
  - Test shells out to `du -sb .` at the repository root, parses the leading byte count, and asserts `bytes <= 10 * 1024 ** 3` (10 GiB)
  - Assertion matches the Bug Condition pseudocode in `design.md` ("Bug Details → Bug Condition"): `totalDiskUsageBytes(R) > 10 * 1024^3`
  - Run test on the UNFIXED repo; record the exact failing byte count
  - **EXPECTED OUTCOME**: Test FAILS with a concrete `bytes > 10 GiB` counterexample - this is correct and proves the bug exists
  - Mark task complete when the test is written, run, failure documented, and committed on the cleanup branch
  - _Design: "Correctness Properties → Property 1: Bug Condition — Size Budget Met"; "Property-Based Testing Plan → Phase 1 bug-condition exploration test"_
  - _Requirements: 1.1, 1.2, 2.1, P4 (Correctness Properties)_

  - [x] 1.1 Write the Vitest exploration test file
    - Create `src/__tests__/repo-bloat-cleanup.bug.test.ts`
    - Import `execSync` from `node:child_process` and `describe`/`it`/`expect` from `vitest`
    - Define `const TEN_GIB = 10 * 1024 ** 3`
    - Run `du -sb .` via `execSync`, parse the leading integer byte field, assert `bytes <= TEN_GIB`
    - Do not add a retry loop, sampling, or any fallback branch - a single deterministic assertion
    - _Design: "Property-Based Testing Plan → Phase 1 bug-condition exploration test"_
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Run the test on the unfixed repo and capture the counterexample
    - Execute `npm run test:unit -- src/__tests__/repo-bloat-cleanup.bug.test.ts`
    - Confirm the test FAILS (expected)
    - Record the observed byte count from `du -sb .` as the counterexample
    - Also record the top-level breakdown from `du -sh ./*/ .[!.]*/ 2>/dev/null | sort -h` alongside it, so the dominant contributor is visible next to the over-budget total
    - Write both into `.kiro/specs/repo-bloat-cleanup/findings/verification/pre-cleanup-snapshot.md` under a "Bug Condition Counterexample" heading (path-only, no file contents)
    - _Design: "Observability & rollback → Manifests and snapshots"_
    - _Requirements: 1.1, 2.4, 2.5, E1_

  - [ ] 1.3 Commit the failing test on the dedicated cleanup branch
    - Create (or switch to) a dedicated cleanup branch before committing - execution discipline requires all cleanup work on an isolated branch (design "Execution plan" + E3)
    - Stage only `src/__tests__/repo-bloat-cleanup.bug.test.ts` and the newly created `findings/verification/pre-cleanup-snapshot.md` stub
    - Commit message: `test(repo-bloat-cleanup): add failing bug-condition size test`
    - The failing test is now part of the branch; Task 12.1 will turn it green, confirming the fix
    - _Design: "Testing Strategy → Exploratory Bug Condition Checking"_
    - _Requirements: 2.1, E3_

---

- [ ] 2. Phase 1 - Storage audit (read-only, no deletions)
  - Execute every Phase 1 command defined in design.md "Investigation tooling → Phase 1 - Size audit commands" and emit classified findings
  - No file is deleted, moved, or rewritten in this task (E2)
  - Produces `findings/size-findings.md` (human review) and `findings/size-findings.json` (machine-checkable sidecar for Phase 4)
  - _Design: "Investigation tooling → Phase 1 - Size audit commands"; "Classification rubric (Phase 1)"_
  - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, E1, E2_

  - [ ] 2.1 Capture total repository size
    - Run `du -sh .` at the repository root (human-readable)
    - Run `du -sb .` at the repository root (byte-exact - feeds P4 comparisons)
    - Record both outputs verbatim in `size-findings.md` under "Total size"
    - _Requirements: 2.4, 1.1_

  - [ ] 2.2 Capture top-level directory breakdown
    - Run `du -sh ./*/ .[!.]*/ 2>/dev/null | sort -h`
    - Record the full sorted listing in `size-findings.md` under "Top-level breakdown"
    - _Requirements: 2.5_

  - [ ] 2.3 Measure `.git` separately
    - Run `du -sh .git`
    - Run `git count-objects -vH`
    - Run `git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sort -k3 -n | tail -n 50` to enumerate the top 50 pack blobs (names + sizes only; this is what a future Batch E would target)
    - Record all three outputs in `size-findings.md` under ".git size and pack composition"
    - _Design: "Investigation tooling → Phase 1"; "Non-goals" (history rewrite is opt-in)_
    - _Requirements: 2.7, 2.28_

  - [ ] 2.4 Measure `node_modules` separately
    - Run `du -sh node_modules 2>/dev/null`
    - Record in `size-findings.md` under "node_modules size"
    - _Requirements: 2.8_

  - [ ] 2.5 Enumerate working-tree files larger than 10 MB
    - Run `find . -type f -not -path './.git/*' -not -path './node_modules/*' -size +10M -exec ls -lh {} +`
    - Record each file with its human-readable size in `size-findings.md` under "Files > 10M (working tree)"
    - _Requirements: 2.6_

  - [ ] 2.6 Break down known high-volume directories
    - Run `find test-recordings -type f \( -name '*.webm' -o -name '*.mp4' -o -name '*.jpg' -o -name '*.png' \) -exec du -sh {} + | sort -h | tail -n 50`
    - Run `find coverage -type f -exec du -sh {} + | sort -h | tail -n 20`
    - Run `find dist -type f 2>/dev/null -exec du -sh {} + | sort -h | tail -n 20`
    - Record each breakdown in `size-findings.md` under "test-recordings / coverage / dist detail"
    - _Design: "Hypothesized Root Cause" items 1, 2, 3_
    - _Requirements: 2.5, 2.6_

  - [ ] 2.7 Classify every reported item using the Phase 1 rubric
    - For every path reported by sub-tasks 2.1-2.6, walk the nine-category decision tree from design.md "Classification rubric (Phase 1)" top-down (first match wins)
    - Apply the four tie-breakers verbatim: secrets always win, `.kiro/specs/` always wins over dead-code heuristics, `public/` assets only classify as "uploaded media" after a failed reference check, duplicate requires hash match AND non-canonical location
    - Any path that reaches fallthrough is labeled "needs confirmation" (E4)
    - _Design: "Classification rubric (Phase 1)"_
    - _Requirements: 2.9, E1, E4_

  - [ ] 2.8 Emit the Phase 1 findings artifacts
    - Write `findings/size-findings.md` with the tables from 2.1-2.7, columns: `path | size | classification | evidence`
    - Write `findings/size-findings.json` as an array of `{ path, sizeBytes, sizeHuman, classification, evidence, phase: 1 }` records
    - Do NOT include file contents, only paths and sizes (E5, 3.6)
    - Do NOT delete or move any file during this task (E2)
    - _Design: "Stage contracts → Artifact shapes"_
    - _Requirements: 2.10, E1, E2, E5_

---

- [ ] 3. Phase 2 - Dead code audit (read-only, no deletions)
  - Execute every Phase 2 command from design.md "Investigation tooling → Phase 2 - Dead code audit commands"
  - Assign HIGH / MEDIUM / LOW confidence per the "Dead-code confidence scoring (Phase 2)" rubric
  - No file is deleted, moved, or rewritten (E2)
  - Produces `findings/dead-code-findings.md` and `findings/dead-code-findings.json`
  - _Design: "Investigation tooling → Phase 2"; "Dead-code confidence scoring (Phase 2)"_
  - _Requirements: 2.11, 2.12, 2.13, 2.14, 2.15, E1, E2, E4_

  - [ ] 3.1 Enumerate candidate files under source roots
    - Produce the candidate set: every tracked file under `src/`, `server/`, `server-render/`, `powers/`
    - Record the candidate count in `dead-code-findings.md`
    - _Requirements: 2.11_

  - [ ] 3.2 Run reference checks across SCAN_ROOTS for each candidate
    - For each candidate, run `rg --fixed-strings "<basename_without_ext>" src server server-render powers package.json vite.config*.* playwright.config.ts index.html tsconfig*.json`
    - For each candidate, run `rg --fixed-strings "<path_without_src_prefix>" src server server-render powers`
    - A candidate with zero hits from both ripgrep searches is unreferenced and proceeds to confidence scoring
    - Record the reference-hit count per candidate (the evidence column)
    - _Design: "Investigation tooling → Phase 2"_
    - _Requirements: 2.11, E1_

  - [ ] 3.3 Apply backup, experimental, and legacy heuristics
    - Run `find src server server-render powers -type f \( -name '*.bak' -o -name '*.old' -o -name '*.orig' -o -name '*_old*' -o -name '*_backup*' \)`
    - Run `find . -type d \( -name 'experimental' -o -name '_archive' -o -name 'legacy' -o -name 'old' \) -not -path './node_modules/*'`
    - Merge the resulting paths into the candidate set; these contribute to HIGH confidence per the rubric when also unreferenced
    - _Requirements: 2.12_

  - [ ] 3.4 Detect duplicate utilities and components
    - Enumerate export names across source files with `rg '^export (default |const |function |class )' -N`
    - Group candidates with matching export names
    - For each group, compute md5 hashes (`md5 -q <file>` on macOS, `md5sum` on Linux) and group by hash
    - Exact hash matches are duplicate candidates (HIGH is gated further by directory-canonicality per the rubric)
    - Name-only matches without hash equality are LOW confidence
    - _Design: "Investigation tooling → Phase 2"; tie-breaker on accidental duplicate_
    - _Requirements: 2.13_

  - [ ] 3.5 Assign confidence and emit findings
    - Apply the HIGH / MEDIUM / LOW rubric from design.md "Dead-code confidence scoring (Phase 2)" verbatim
    - Any candidate not reaching HIGH is labeled "needs confirmation" (E4, 2.14)
    - Write `findings/dead-code-findings.md` with columns: `path | reason flagged | confidence level | references checked`
    - Write `findings/dead-code-findings.json` as `{ path, reason, confidence, referencesChecked, phase: 2 }[]`
    - Do NOT delete any file (E2)
    - _Design: "Dead-code confidence scoring (Phase 2)"_
    - _Requirements: 2.14, 2.15, E1, E2, E4_

---

- [ ] 4. Phase 3 - Refactor and compactness review (read-only, no rewrites)
  - Execute every Phase 3 command from design.md "Investigation tooling → Phase 3 - Refactor and compactness commands"
  - Produces `findings/refactor-findings.md`
  - No file is rewritten or deleted (2.20, E2)
  - _Design: "Investigation tooling → Phase 3"; "Refactor heuristics (Phase 3)"_
  - _Requirements: 2.16, 2.17, 2.18, 2.19, 2.20, E1, E2_

  - [ ] 4.1 Identify oversized files under source roots
    - Run `find src server server-render powers -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' \) -exec wc -l {} + | sort -n | tail -n 30`
    - Filter to lines where count > 500
    - Record columns: `path | lineCount | proposedSplit` (the `proposedSplit` is a brief human-authored suggestion, e.g. "split by export boundary into N files"; the split is not executed)
    - _Design: "Refactor heuristics (Phase 3) → Oversized files"_
    - _Requirements: 2.16, 2.20_

  - [ ] 4.2 Detect repeated code candidates
    - Check whether `jscpd` is already present in `node_modules`; if yes, run `jscpd --min-lines 30 --min-tokens 80 --reporters console src server server-render powers`
    - If `jscpd` is not installed, do NOT install it - instead, manually review the top-30 `wc -l` output from 4.1 for obviously duplicated helpers
    - Record each repeat as `{ paths[], summary }` in `refactor-findings.md`
    - _Design: "Refactor heuristics (Phase 3) → Repeated code"_
    - _Requirements: 2.17, 2.20_

  - [ ] 4.3 Cross-reference every `package.json` dependency with its usage
    - For each entry in `dependencies` and `devDependencies`, run `rg "from ['\"]${dep}" src server server-render powers` and `rg "require\(['\"]${dep}" src server server-render powers`
    - Record columns: `dep | used (true/false) | alternative | notes`
    - Flag entries with `used = false` as "unused" candidates
    - Flag entries with lighter equivalents already in use as "redundant" (for example, if both `clsx` and `classnames` are present, `classnames` is redundant)
    - Flag large runtime dependencies with lighter alternatives as "heavy"
    - _Design: "Refactor heuristics (Phase 3) → Heavy / redundant deps"_
    - _Requirements: 2.18, 2.20_

  - [ ] 4.4 Hash-group `public/` for duplicates and extension-scan for uncompressed assets
    - Run `find public -type f -exec md5 -q {} \; -print | paste - -` (macOS) or `find public -type f -exec md5sum {} +` (Linux); sort and group by hash
    - Run `find public -type f \( -name '*.wav' -o -name '*.png' -o -name '*.bmp' -o -name '*.tiff' \) -exec du -sh {} +` to surface uncompressed candidates
    - Record columns: `path | sizeHuman | duplicateOf | compressionCandidate | referenced`
    - The `referenced` column comes from ripgrep across source + HTML + config; files with zero references feed the eventual Batch D proposal
    - Write all Phase 3 findings to `findings/refactor-findings.md`
    - _Design: "Refactor heuristics (Phase 3) → Uncompressed / duplicated assets"_
    - _Requirements: 2.19, 2.20_

---

- [ ] 5. Build the preservation set (read-only)
  - Execute the 9-step algorithm from design.md "Preservation set construction" verbatim
  - Produces `findings/preservation-set.json` as `{ path, sha256, sizeBytes }[]`
  - Every entry in this set is immune to deletion - Phase 4 will refuse to place any preservation-set path into a `delete_now` bucket
  - _Design: "Preservation set construction"_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, P5 (Correctness Properties), E1_

  - [ ] 5.1 Parse `package.json` entry points and script paths
    - Extract `main`, `module`, `type` if present
    - Scan every command string in `scripts` for file path arguments (`.ts`, `.tsx`, `.mjs`, `.js`)
    - Add all resolved entry points (e.g. `run-pipeline.mjs`, `server-render.mjs`, `server/index.ts` per current `package.json`) to the preservation set
    - _Design: "Preservation set construction" step 1_
    - _Requirements: 3.5_

  - [ ] 5.2 Parse `index.html` for asset/script references
    - Extract every `<script src>`, `<link href>`, `<img src>`, `<source src>`
    - Add each resolved path to the preservation set
    - _Design: "Preservation set construction" step 2_
    - _Requirements: 3.4, 3.5_

  - [ ] 5.3 Transitive static-import trace from entry points
    - Starting from each entry in 5.1 and 5.2, walk imports using `rg "from ['\"]\./|from ['\"]\\.\\./|import\\(['\"]"`
    - Resolve every relative path; add resolved files to the preservation set
    - Continue transitively until fixed point (no new files added)
    - _Design: "Preservation set construction" step 3_
    - _Requirements: 3.5_

  - [ ] 5.4 Record dynamic imports and runtime string literals
    - Search for `import(<expr>)`, `require(<expr>)`, `new Worker(<expr>)`, `fetch('/<path>')`
    - For literal string paths, resolve and add to the preservation set
    - For non-literal expressions (e.g. `import(variable)`), label every candidate file in the matched directory as "needs confirmation" rather than deletable (E4)
    - _Design: "Preservation set construction" step 4_
    - _Requirements: 3.5, E4_

  - [ ] 5.5 Unconditionally add project config files
    - Add `package.json`, `package-lock.json`, every `tsconfig*.json`, every `vite.config*.{ts,js,mts,mjs}`, `playwright.config.ts`, `.gitignore`, `.env.example`, `index.html`, `README.md`, and `tailwind.config.*` if present
    - These are added regardless of whether anything imports them
    - _Design: "Preservation set construction" step 5_
    - _Requirements: 3.5_

  - [ ] 5.6 Unconditionally add secret-shaped files
    - Add every file whose basename matches `.env*`, `*.pem`, `id_rsa*`, `*credentials*`, `*secret*`, `*.key`
    - Add them regardless of reference status - secrets are preserved by shape alone (3.6)
    - Do NOT echo file contents into findings or logs; store only `{ path, sha256, sizeBytes }` (E5)
    - _Design: "Preservation set construction" step 6; "Security / Secret handling"_
    - _Requirements: 3.6, E5_

  - [ ] 5.7 Ripgrep referenced `public/` assets into the set
    - For every file under `public/`, ripgrep its basename against source + HTML + config
    - Any hit adds the asset to the preservation set
    - Misses are deletion candidates but NEVER auto-deletable - Batch D handles them with per-item approval
    - _Design: "Preservation set construction" step 7_
    - _Requirements: 3.4_

  - [ ] 5.8 Unconditionally add every `.kiro/specs/*` folder
    - Add every directory directly under `.kiro/specs/` to the preservation set
    - No spec folder may be removed without explicit user confirmation (3.8)
    - _Design: "Preservation set construction" step 8_
    - _Requirements: 3.8_

  - [ ] 5.9 Scan `__tests__` directories for referenced fixtures
    - Ripgrep every `__tests__` folder for file paths mentioned in source (string literals, imports, `readFile`/`readFileSync` arguments)
    - Add every referenced fixture to the preservation set
    - _Design: "Preservation set construction" step 9_
    - _Requirements: 3.5_

  - [ ] 5.10 Emit `preservation-set.json`
    - Serialize the union of 5.1-5.9 to `findings/preservation-set.json` as `{ path, sha256, sizeBytes }[]`
    - Sort by path for deterministic review
    - This file is the immutable baseline for P5 - each batch will re-hash these paths and diff against it
    - _Design: "Preservation set construction"; "Observability & rollback → Manifests and snapshots"_
    - _Requirements: P5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8_

---

- [ ] 6. Phase 4 - Cleanup plan (read-only, no deletions)
  - Join outputs from Phase 1, Phase 2, Phase 3, and the preservation set into the unified cleanup plan
  - No file is deleted in this task (2.22, E2)
  - Produces `cleanup-plan.md`, `cleanup-plan.json`, `gitignore-proposal.md`, `executive-summary.md`
  - _Design: "Cleanup plan format (Phase 4)"; "Risk tiers"_
  - _Requirements: 2.21, 2.22, 2.23, 2.24, 2.25, E1, E2, E3_

  - [ ] 6.1 Write the risk-tiered cleanup plan (markdown + JSON sidecar)
    - Write `findings/cleanup-plan.md` with the unified table: `path | size | classification | risk | bucket | projected_savings | evidence`
    - Write `findings/cleanup-plan.json` with the same rows as typed objects (machine-checkable for P1 and P5)
    - Every row must cite a finding in `size-findings.md`, `dead-code-findings.md`, or `refactor-findings.md` via `evidenceRef`
    - Every row must be checked against `preservation-set.json` - any preservation-set path that appears in the plan MUST have `bucket = needs_approval` and `risk = high` (never `delete_now`)
    - _Design: "Cleanup plan format (Phase 4)"_
    - _Requirements: 2.21, 2.22, 2.24, E1, P5_

  - [ ] 6.2 Apply the risk tier rubric top-down
    - Evaluate each row against the SAFE / MEDIUM / HIGH rubric from design.md "Risk tiers" - first match wins
    - SAFE: classification is `generated build output`, `cache or temporary file`, or `log`, AND is `.gitignore`d (actual or proposed), AND has zero ripgrep hits across SCAN_ROOTS
    - MEDIUM: HIGH-confidence Phase 2 dead code; or `public/` duplicate/compressible with zero references; or large non-preservation file flagged as accidental duplicate or uploaded media
    - HIGH: any file under `public/audio/`, `public/images/`, or `.kiro/specs/`; any secret-shape match; any `.git/` modification; any "needs confirmation" fallthrough
    - Set `bucket = delete_now` only for SAFE; MEDIUM and HIGH get `bucket = needs_approval` (2.22, 2.27)
    - _Design: "Risk tiers"_
    - _Requirements: 2.21, 2.22, 2.27_

  - [ ] 6.3 Compute projected savings per item and totals
    - Populate `projected_savings` (bytes) for every row using Phase 1 sizes
    - Compute total savings per bucket (`delete_now`, `needs_approval`) and per risk tier (SAFE, MEDIUM, HIGH)
    - Compute a "SAFE-only projected size" = `totalDiskUsageBytes(R) - sum(savings | risk=SAFE)` - this is the input to the executive summary's "fastest low-risk path" section
    - _Design: "Cleanup plan format (Phase 4)"_
    - _Requirements: 2.24_

  - [ ] 6.4 Write the `.gitignore` proposal
    - Write `findings/gitignore-proposal.md` as a proposed diff against `.gitignore`, preserving the existing entries verbatim
    - Grouped additions (per design.md "Cleanup plan format (Phase 4)"):
      - Generated build/test output: `coverage/`, `test-recordings/`, `playwright-report/`, `test-results/`, `.vite/`
      - Caches: `.eslintcache`, `*.tsbuildinfo`
      - OS cruft: `.DS_Store`, `Thumbs.db`
    - Note `*.log` is already present in `.gitignore`; do not duplicate, just reference
    - Note `dist/`, `node_modules`, `playwright-report`, `test-results` are already present; additions must not duplicate them
    - _Design: "Cleanup plan format (Phase 4)" → gitignore-proposal.md_
    - _Requirements: 2.23_

  - [ ] 6.5 Write the executive summary
    - Write `findings/executive-summary.md` with the structure from design.md:
      1. **Headline**: current `du -sb .` bytes, target (10 GiB), projected post-cleanup size from 6.3
      2. **Primary contributors**: top 3-5 bloat categories by bytes (Phase 1 breakdown)
      3. **Fastest low-risk path**: SAFE batches only, enumerate savings, state whether SAFE alone meets the 10 GiB budget
      4. **If SAFE is insufficient**: describe MEDIUM batches and approval gates required to close the gap
      5. **`.git` history**: whether a Batch E rewrite is required to meet budget; if yes, framed as a separate opt-in proposal (not auto-executed)
      6. **Prevention**: summary of the `.gitignore` proposal from 6.4
    - _Design: "Cleanup plan format (Phase 4)" → executive-summary.md_
    - _Requirements: 2.25_

---

- [ ] 7. Pre-cleanup snapshot and preservation baseline
  - **Property 2: Preservation** - Baseline Capture for Build, Tests, and Preservation Set
  - **IMPORTANT**: Follow observation-first methodology from the bugfix workflow - observe behavior on the UNFIXED repo, then assert the same behavior is preserved after every batch
  - This task captures the baselines that P2 (build), P3 (test failure count), and P5 (preservation-set sha256) will be compared against in every subsequent batch
  - **EXPECTED OUTCOME**: `npm run test:unit` runs cleanly against unfixed code, the exploration test from Task 1 is the only expected failure, and every preservation-set path hashes identically on re-read (confirms baseline stability)
  - _Design: "Observability & rollback → Manifests and snapshots"; "Testing Strategy → Preservation Checking"_
  - _Requirements: 3.1, 3.2, 3.5, 3.8, P2, P3, P5, E1_

  - [ ] 7.1 Write the pre-cleanup snapshot
    - Write `findings/verification/pre-cleanup-snapshot.md` containing (in this order):
      - Output of `git status` (paths only, no diff bodies - E5)
      - Output of `du -sb .`
      - Output of `du -sh .`
      - Output of `git count-objects -vH`
    - Append to the "Bug Condition Counterexample" section from Task 1.2 rather than overwriting it
    - _Requirements: 2.4, 2.7, E1_

  - [ ] 7.2 Capture baseline test failure counts
    - Run `npm run test:unit` once against the UNFIXED repo
    - Record `{ "unit": { "passed": <n>, "failed": <m> } }` to `findings/verification/baseline-tests.json`
    - The Task 1 exploration test is expected to contribute exactly one failure to this baseline - document it explicitly in the JSON as `expectedFailures: ["repo-bloat-cleanup.bug.test.ts"]`
    - Optionally run `npm test` (Playwright) and add `{ "e2e": { "passed": <n>, "failed": <m> } }` to the same file; skip if the Playwright suite cannot run in the current environment (record that reason instead)
    - P3 after each batch will assert `post.failed <= baseline.failed` per suite
    - _Design: "Property-Based Testing Plan → P3"_
    - _Requirements: 3.2, P3_

  - [ ] 7.3 Verify `preservation-set.json` hashes are stable
    - Re-compute sha256 for every path in `findings/preservation-set.json`
    - Diff the newly computed hashes against the stored hashes - they must be identical (no working-tree drift)
    - Record the diff (expected: empty) in `findings/verification/preservation-baseline.md`
    - A non-empty diff at this step means the preservation set was constructed on a mutated working tree; halt and rebuild Task 5 before continuing
    - _Design: "Property-Based Testing Plan → P5"_
    - _Requirements: P5, 3.1, 3.4, 3.5, 3.8_

---

- [ ] 8. Execute Batch A - SAFE, `delete_now`: regenerable artifacts
  - Working-tree deletions only; `.git` history is untouched (3.7)
  - Each sub-batch is its own commit on the cleanup branch, independently revertable by `git restore --source=<pre-batch-sha>` or `git reset --hard <pre-batch-sha>` (design "Rollback procedures")
  - Only paths with `risk = safe` and `bucket = delete_now` from `cleanup-plan.json` are eligible - if any path below is missing from the plan, re-run Task 6 before deleting
  - _Design: "Execution plan → Batch A"_
  - _Requirements: 2.10, 2.22, 2.26, E3, P1, P2, P3, P4, P5_

  - [ ] 8.1 Remove `coverage/`
    - Verify `coverage/` appears in `cleanup-plan.json` with `risk = safe`, `bucket = delete_now`
    - `git rm -r coverage/` (or `rm -rf coverage/ && git add -A` if untracked)
    - Commit: `chore(cleanup): remove coverage/ (regenerable by npm run test:unit:coverage)`
    - _Requirements: 2.10, 2.26_

  - [ ] 8.2 Remove `test-recordings/`
    - Verify `test-recordings/` appears in `cleanup-plan.json` with `risk = safe`, `bucket = delete_now`
    - `git rm -r test-recordings/`
    - Commit: `chore(cleanup): remove test-recordings/ (regenerable by npm test)`
    - _Requirements: 2.10, 2.26_

  - [ ] 8.3 Remove remaining regenerable directories if present
    - For each of `dist/`, `playwright-report/`, `test-results/`, `.vite/`: if present in the working tree AND listed in `cleanup-plan.json` with `risk = safe`, `bucket = delete_now`, run `git rm -r <dir>/`
    - Use a separate commit per directory: `chore(cleanup): remove <dir>/ (regenerable)`
    - If a directory is absent, skip silently and record "absent at cleanup time" in the batch manifest
    - _Requirements: 2.10, 2.26_

  - [ ] 8.4 Remove root-level regenerable files if present
    - For each of `*.log` at repo root, `.eslintcache`, `*.tsbuildinfo`: if present AND listed in `cleanup-plan.json` with `risk = safe`, `bucket = delete_now`, `git rm` each
    - Single commit: `chore(cleanup): remove root-level caches and logs`
    - _Requirements: 2.10, 2.26_

  - [ ] 8.5 Write `batch-A-manifest.md`
    - Write `findings/verification/batch-A-manifest.md` with one row per deleted path: `{ path, sizeBytes (from Phase 1), classification, risk, evidenceRef, commitSha }`
    - Record the total bytes freed by Batch A (sum of `sizeBytes`)
    - _Design: "Observability & rollback → Manifests and snapshots"_
    - _Requirements: 2.2, 2.26, E1_

  - [ ] 8.6 Run post-batch verification gate (P2 + P3 + P5 + P4)
    - On a staging checkout of the cleanup branch after Batch A:
      - **P2**: `npm install --no-audit --no-fund` then `npm run build` - assert exit 0
      - **P3**: `npm run test:unit` - assert `post.failed <= baseline.failed` per `baseline-tests.json`
      - **P5**: re-hash every path in `preservation-set.json` - assert all hashes match
      - **P4**: `du -sb .` post; assert `post < pre` (mandatory), record delta, note whether `post <= 10 GiB` (aspirational)
    - Record all four results in `findings/verification/batch-A-verification.md`
    - If any of P2/P3/P5 fails: roll back with `git reset --hard <pre-batch-A-sha>` on the cleanup branch and halt the pipeline; do not proceed to Batch B
    - _Design: "Property-Based Testing Plan → P2/P3/P4/P5"; "Execution plan → Batch gating"_
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.8, P2, P3, P4, P5, E3_

---

- [ ] 9. Execute Batch B - SAFE: `.gitignore` hardening (zero deletions)
  - Adds entries from `gitignore-proposal.md` to `.gitignore`; preserves existing lines verbatim
  - Independently revertable by reverting the single commit (design "Rollback procedures → `.gitignore` edits")
  - _Design: "Execution plan → Batch B"_
  - _Requirements: 2.23, 2.26, E3, P2, P3, P4, P5_

  - [ ] 9.1 Append proposed entries to `.gitignore`
    - Open `.gitignore` and append the grouped additions from `findings/gitignore-proposal.md` verbatim, with the group headers as comments
    - Do not reorder, re-case, or remove any existing line
    - Skip any entry already present in `.gitignore` (currently `node_modules`, `dist`, `playwright-report`, `test-results`, `.env`, `.env.local`, `.env*.local`, `*.log`)
    - Commit: `chore(gitignore): ignore regenerable build/test artifacts`
    - _Requirements: 2.23_

  - [ ] 9.2 Write `batch-B-manifest.md`
    - Write `findings/verification/batch-B-manifest.md` describing the `.gitignore` diff (single file, single commit)
    - Include the list of added patterns
    - _Requirements: 2.2, E1_

  - [ ] 9.3 Run post-batch verification gate (P2 + P3 + P5 + P4)
    - Same four checks as 8.6, run on a staging checkout after Batch B
    - P4 is expected to be neutral (ignore-only change does not free bytes in the working tree), but P2/P3/P5 must still pass
    - Record results in `findings/verification/batch-B-verification.md`
    - Roll back on any failure
    - _Requirements: 3.1, 3.2, P2, P3, P4, P5_

---

- [ ] 10. Execute Batch C - MEDIUM, `needs_approval`: HIGH-confidence dead code
  - Only Phase 2 candidates with `confidence = HIGH` are eligible (design "Dead-code confidence scoring (Phase 2)")
  - Every item requires explicit per-item user approval (2.27)
  - Sub-batches of at most 10 files per commit for reviewability (E3)
  - _Design: "Execution plan → Batch C"_
  - _Requirements: 2.26, 2.27, E3, E4, P1, P2, P3, P4, P5_

  - [ ] 10.1 Present HIGH-confidence candidates and capture approvals
    - Present the HIGH-confidence rows from `dead-code-findings.json` to the user, grouped by sub-batch (≤10 files each)
    - For each row, show `path | reason | referencesChecked | sizeBytes | evidenceRef`
    - Capture explicit per-item approval (yes/no) - record approvals in `findings/verification/batch-C-approvals.md`
    - Any row without an explicit yes is SKIPPED (never deleted)
    - _Design: "Execution plan → Batch C"; E4_
    - _Requirements: 2.27, E4_

  - [ ] 10.2 Re-validate P1 immediately before each sub-batch deletes
    - For each approved item, re-run the ripgrep basename + path checks from Task 3.2 across SCAN_ROOTS
    - If ANY ripgrep hit is now present (e.g. a hit introduced since Phase 2 ran), the row is demoted and removed from the deletion set
    - This is the P1 property from design.md "Property-Based Testing Plan → P1" applied per sub-batch
    - Record any rejected rows in `batch-C-verification.md` with the new evidence
    - _Design: "Property-Based Testing Plan → P1"_
    - _Requirements: P1, 2.27, E4_

  - [ ] 10.3 Delete approved items in sub-batches of ≤10 files per commit
    - `git rm <path>` for each approved + P1-validated path
    - One commit per sub-batch: `chore(cleanup): remove dead code - <short list>`
    - After each sub-batch commit, proceed to 10.4 before starting the next sub-batch
    - _Design: "Execution plan → Batch C"_
    - _Requirements: 2.26, E3_

  - [ ] 10.4 Per-sub-batch manifest + verification gate (P2 + P3 + P5 + P4)
    - Append to `findings/verification/batch-C-manifest.md` a row per deleted path: `{ path, sizeBytes, classification, confidence, evidenceRef, commitSha }`
    - Run the four-property gate (P2/P3/P5/P4) on a staging checkout after each sub-batch commit
    - Record results in `findings/verification/batch-C-verification.md` (appending per sub-batch)
    - If any of P2/P3/P5 fails: `git reset --hard <pre-sub-batch-sha>`, halt the Batch C pipeline, and escalate to the user
    - _Requirements: 3.1, 3.2, 3.5, P2, P3, P4, P5, E3_

---

- [ ] 11. Execute Batch D - MEDIUM, `needs_approval`: duplicate/uncompressed `public/` assets
  - Only `public/` assets that satisfy ALL of: zero ripgrep references, proven duplicate OR uncompressed-with-kept-equivalent, explicit per-item user approval
  - Files under `public/audio/*.aac` are HIGH risk and eligible ONLY if Phase 3 proved a specific file is a duplicate AND the user explicitly approved it
  - Sub-batches of at most 10 files per commit (E3)
  - _Design: "Execution plan → Batch D"_
  - _Requirements: 2.26, 2.27, 3.4, E3, E4, P1, P2, P3, P4, P5_

  - [ ] 11.1 Present duplicate/compression candidates and capture approvals
    - Present the candidate rows from `refactor-findings.md` (hash-duplicate groups and uncompressed extensions) to the user, grouped by sub-batch (≤10 files each)
    - For each row, show `path | sizeHuman | duplicateOf | compressionCandidate | referenced (must be false)`
    - Capture explicit per-item approval (yes/no) in `findings/verification/batch-D-approvals.md`
    - `public/audio/*.aac` requires an additional "confirmed duplicate" proof from 4.4 AND an additional explicit approval - otherwise always skipped
    - Any row without explicit yes is SKIPPED
    - _Requirements: 2.27, 3.4, E4_

  - [ ] 11.2 Re-validate zero references immediately before each sub-batch deletes
    - For each approved item, re-run ripgrep of its basename across source + HTML + config
    - Any hit demotes the row and removes it from the deletion set
    - Record rejections in `batch-D-verification.md`
    - _Design: "Property-Based Testing Plan → P1"_
    - _Requirements: P1, 3.4, E4_

  - [ ] 11.3 Delete approved items per sub-batch
    - `git rm <path>` for each approved + P1-validated path
    - One commit per sub-batch: `chore(assets): remove duplicate/uncompressed public assets - <short list>`
    - _Requirements: 2.26, E3_

  - [ ] 11.4 Per-sub-batch manifest + verification gate (P2 + P3 + P5 + P4)
    - Append to `findings/verification/batch-D-manifest.md` one row per deleted path: `{ path, sizeBytes, duplicateOf, evidenceRef, commitSha }`
    - Run the four-property gate (P2/P3/P5/P4) on a staging checkout
    - Record results in `findings/verification/batch-D-verification.md`
    - If any check fails: `git reset --hard <pre-sub-batch-sha>` and halt
    - _Requirements: 3.1, 3.2, 3.4, P2, P3, P4, P5, E3_

---

- [ ] 12. Verify the fix - turn the exploration test green
  - Re-run the Task 1 exploration test and the full P1-P5 suite on the fully cleaned tree
  - _Design: "Correctness Properties → Property 1: Bug Condition"; "Testing Strategy → Fix Checking"_
  - _Requirements: 2.1, P1, P2, P3, P4, P5_

  - [ ] 12.1 Re-run the exploration test from Task 1
    - **Property 1: Expected Behavior** - Repository Exceeds 10 GiB Size Budget (now resolved)
    - **IMPORTANT**: Re-run the SAME test from Task 1 (`src/__tests__/repo-bloat-cleanup.bug.test.ts`) - do NOT write a new test
    - The test from Task 1 encodes the expected behavior; its passing confirms the Bug Condition no longer holds
    - **EXPECTED OUTCOME**: Test PASSES (post-cleanup `du -sb .` ≤ 10 GiB)
    - If the test still fails (size > 10 GiB): record the residual over-budget delta in `findings/executive-summary.md` and explicitly report whether optional Batch E (`.git` history rewrite, Task 13) is now required to meet the budget
    - _Design: "Property-Based Testing Plan → Phase 1 bug-condition exploration test"_
    - _Requirements: 2.1, P4_

  - [ ] 12.2 Update the executive summary with final numbers
    - Update `findings/executive-summary.md` with:
      - Final pre/post `du -sb .` bytes
      - Savings per batch (A, B, C, D) from each `batch-<X>-manifest.md`
      - Whether the 10 GiB target was met by Batches A-D alone
      - If not met, the recommendation on Batch E (required vs. optional)
    - _Requirements: 2.24, 2.25_

  - [ ] 12.3 Run the full P1+P2+P3+P4+P5 suite one final time
    - **Property 2: Preservation** - Full Preservation Suite on Cleaned Tree
    - P1: re-run ripgrep over every deleted path from every batch manifest, assert zero hits - confirms no surviving reference to any deleted file
    - P2: `npm install --no-audit --no-fund && npm run build` on staging, assert exit 0
    - P3: `npm run test:unit` (and Playwright if available), assert `post.failed <= baseline.failed` per suite
    - P4: record final `du -sb .`, final delta, and final GiB number
    - P5: re-hash every path in `preservation-set.json`, assert all hashes match
    - Write `findings/verification/final-report.md` with all five results
    - _Design: "Testing Strategy → Fix Checking" + "Preservation Checking"_
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, P1, P2, P3, P4, P5_

---

- [ ] 13.* *(Optional)* Execute Batch E - HIGH, `needs_approval`, opt-in: `.git` history rewrite
  - Applies ONLY if Task 12.1 shows `du -sb .` > 10 GiB after Batches A-D AND Phase 1 proved `.git` dominates AND the user has explicitly opted in
  - Destructive: rewrites commit SHAs and requires force-push coordination (2.28, 3.7)
  - Never auto-executed; every sub-task requires confirmation
  - _Design: "Execution plan → Batch E"; "Non-goals" (history rewrite is opt-in)_
  - _Requirements: 2.28, 3.7_

  - [ ] 13.1* Take a full repository backup (mandatory pre-condition)
    - Clone or `cp -r` the entire repository to a backup location the user can identify
    - Do NOT proceed to 13.2 without a backup on disk (design "Rollback procedures → History rewrite")
    - Record the backup location in `findings/verification/batch-E-approvals.md`
    - _Design: "Rollback procedures"_
    - _Requirements: 3.7_

  - [ ] 13.2* Run `git filter-repo --strip-blobs-bigger-than 10M`
    - Alternative: use the targeted blob list from the top-50 pack objects recorded in Task 2.3
    - Execute on the dedicated cleanup branch in a fresh clone of the backup
    - Record the `filter-repo` output in `findings/verification/batch-E-manifest.md`
    - _Design: "Execution plan → Batch E"_
    - _Requirements: 2.28_

  - [ ] 13.3* Coordinate force-push
    - Force-push is user-coordinated; do NOT force-push without explicit user go-ahead
    - Record the force-push plan (target remote, target branch, coordination notes) in `findings/verification/batch-E-manifest.md`
    - _Requirements: 2.28, 3.7_

  - [ ] 13.4* Re-run P1-P5 plus the explicit opt-in history-digest audit
    - Run the full P1+P2+P3+P4+P5 suite on the rewritten history (as in 12.3)
    - Explicitly assert `gitHistoryDigest(R') ≠ gitHistoryDigest(R)` AND record the user opt-in acknowledgement - this is the ONLY batch where the digest is allowed to differ (design "Correctness Properties → Property 2" and preservation clause)
    - Write `findings/verification/batch-E-verification.md`
    - _Design: "Correctness Properties → Property 2"_
    - _Requirements: 3.7, P1, P2, P3, P4, P5_

---

- [ ] 14.* *(Optional)* Dependency pruning
  - Applies ONLY if Phase 3 (Task 4.3) flagged one or more dependencies as unused AND the user opts in per-dependency
  - _Design: "Fix Implementation → Dependency pruning"; "Out-of-scope explicitly" (dependency removal is proposed, not automatic)_
  - _Requirements: 2.18, 2.27_

  - [ ] 14.1* Confirm each flagged dependency with the user and remove approved entries from `package.json`
    - For each `used = false` entry in Task 4.3 findings, confirm with the user (per-dependency yes/no)
    - Remove approved entries from `dependencies` or `devDependencies` in `package.json`
    - Do NOT touch entries the user did not explicitly approve
    - _Requirements: 2.18, 2.27_

  - [ ] 14.2* Regenerate `package-lock.json` and verify P2 + P3
    - Run `npm install --no-audit --no-fund` to regenerate `package-lock.json`
    - P2: `npm run build` must exit 0
    - P3: `npm run test:unit` failure count must be ≤ baseline
    - Write `findings/verification/dep-pruning-manifest.md` with the list of removed deps and the verification results
    - _Requirements: 3.1, 3.2, P2, P3_
