# Bugfix Requirements Document

## Introduction

The AutoTube repository has grown past 10GB of on-disk storage. A repository of this
size is slow to clone, slow to back up, expensive to host, and strongly suggests that
content which does not belong in version control (build output, coverage reports,
test recordings, caches, uploaded media, or a bloated `.git` history) has been
committed over time.

This bugfix treats "repository size exceeds 10GB" as a defect and applies the bug
condition methodology to fix it safely. The cleanup is framed as a **forensic audit
first, deletion last** workflow: evidence must be gathered and classified before any
bytes are removed, runtime and build behavior must be preserved, and every deletion
must be traceable to a classified finding.

The scope of this requirements document is strictly:

- Define the bug condition (what makes the repo "too big").
- Define the expected audit and cleanup behavior across four phases.
- Define the preservation invariants that any fix must not violate.
- Define the correctness properties that validate the fix.

The implementation details (which `du`/`find`/grep invocations, which classification
rubric, which batch structure) belong to `design.md`. The concrete step-by-step work
belongs to `tasks.md`. This document only specifies **what correct looks like**.

## Bug Analysis

### Current Behavior (Defect)

The repository currently violates the size budget and exhibits several observable
symptoms that indicate the root causes are mixed together and cannot be diagnosed
without a structured audit.

1.1 WHEN `du -sh .` is run at the repository root THEN the system reports a total
    size greater than 10G (the defined threshold)

1.2 WHEN a fresh clone is attempted THEN the system transfers more than 10G of data,
    making onboarding, CI, and backup operations slow and expensive

1.3 WHEN a contributor inspects the working tree THEN the system exposes directories
    that should not be tracked in version control (for example `coverage/` and
    `dist/` are present in the working tree despite being standard build artifacts)

1.4 WHEN a contributor attempts to identify which files cause the bloat THEN the
    system provides no classification, no evidence trail, and no reviewable audit,
    so cleanup decisions cannot be made safely

1.5 WHEN the repository is audited ad hoc THEN the system mixes required runtime
    assets (for example `public/audio/*.aac`, `public/images/og-preview.jpg`) with
    disposable artifacts (build output, coverage reports, test recordings, caches)
    without any rubric to tell them apart, creating a high risk of accidental
    deletion of required assets

### Expected Behavior (Correct)

After the fix, the repository size SHALL be below the 10G threshold, and the path
to that state SHALL follow a four-phase evidence-first workflow. Each phase produces
a reviewable artifact. No phase deletes anything until the user has approved
classified findings.

#### Overall outcome

2.1 WHEN `du -sh .` is run at the repository root after cleanup THEN the system
    SHALL report a total size less than or equal to 10G, and SHALL report a total
    size strictly less than the pre-cleanup size

2.2 WHEN any file is proposed for deletion THEN the system SHALL cite the file
    path, its measured size, its classification, and the evidence that supports
    that classification

2.3 WHEN a finding is uncertain THEN the system SHALL flag it as "needs
    confirmation" and SHALL NOT delete it without explicit user approval

#### Phase 1 — Storage audit (evidence gathering, no deletions)

2.4 WHEN Phase 1 runs THEN the system SHALL measure total repository size using
    `du -sh .` at the repository root

2.5 WHEN Phase 1 runs THEN the system SHALL identify the largest top-level
    directories by disk usage (equivalent to `du -sh */ | sort -h`)

2.6 WHEN Phase 1 runs THEN the system SHALL enumerate individual files larger than
    10M, excluding `.git/` and `node_modules/` (equivalent to
    `find . -type f -not -path './.git/*' -not -path './node_modules/*' -size +10M`)
    and SHALL report each with its human-readable size

2.7 WHEN Phase 1 runs THEN the system SHALL measure the size of `.git/` separately
    from the working tree

2.8 WHEN Phase 1 runs THEN the system SHALL measure the size of `node_modules/`
    separately from the rest of the working tree

2.9 WHEN Phase 1 runs THEN the system SHALL classify every large item it reports
    into exactly one of the following categories: required source, dependency
    artifact, generated build output, cache or temporary file, log, local database
    or blob store, uploaded media, dead or legacy code, accidental duplicate

2.10 WHEN Phase 1 completes THEN the system SHALL emit a findings table with
     columns: path, size, classification, evidence, and SHALL NOT delete any file
     during this phase

#### Phase 2 — Dead code audit

2.11 WHEN Phase 2 runs THEN the system SHALL identify files under `src/`,
     `server/`, `server-render/`, and `powers/` that have no import reference from
     any other non-deleted file and no reference from `package.json`, `vite.config`,
     `playwright.config.ts`, or other project configuration

2.12 WHEN Phase 2 runs THEN the system SHALL identify stale folders, backup files,
     and experimental directories using name heuristics including but not limited
     to `*.bak`, `*.old`, `*.orig`, `*_old*`, `*_backup*`, `experimental/`, and
     similar patterns

2.13 WHEN Phase 2 runs THEN the system SHALL identify duplicate utilities and
     components using both content similarity and name similarity signals

2.14 WHEN Phase 2 produces a finding that cannot be conclusively proven unreferenced
     THEN the system SHALL flag that finding as "needs confirmation" with an
     explicit confidence level

2.15 WHEN Phase 2 completes THEN the system SHALL emit a findings table with
     columns: path, reason flagged, confidence level, and SHALL NOT delete any
     file during this phase

#### Phase 3 — Refactor and compactness review

2.16 WHEN Phase 3 runs THEN the system SHALL identify source files whose size
     exceeds 500 lines as candidates for splitting, reporting each with its line
     count

2.17 WHEN Phase 3 runs THEN the system SHALL identify blocks of repeated code that
     are candidates for abstraction, with path and line references

2.18 WHEN Phase 3 runs THEN the system SHALL identify dependencies listed in
     `package.json` that are not imported anywhere in the source tree, and SHALL
     identify dependencies that are imported but are heavy, redundant, or have a
     lighter equivalent already in use

2.19 WHEN Phase 3 runs THEN the system SHALL identify duplicated or
     uncompressed assets under `public/` and any committed media directories

2.20 WHEN Phase 3 completes THEN the system SHALL emit a refactor findings
     document, and SHALL NOT delete or rewrite any file during this phase

#### Phase 4 — Cleanup plan

2.21 WHEN Phase 4 runs THEN the system SHALL produce a prioritized cleanup list
     in which every item is labeled with a risk tier of safe, medium risk, or
     high risk

2.22 WHEN Phase 4 runs THEN the system SHALL split the cleanup list into a
     "delete now" subset (safe items only) and a "needs approval" subset (medium
     and high risk items)

2.23 WHEN Phase 4 runs THEN the system SHALL propose additions to `.gitignore`
     that prevent the same bloat categories from being re-committed in the future

2.24 WHEN Phase 4 runs THEN the system SHALL estimate the storage savings of each
     cleanup item and the total projected savings

2.25 WHEN Phase 4 completes THEN the system SHALL emit an executive summary that
     explains why the repository grew past 10G and identifies the fastest low-risk
     path to bringing it below the threshold

#### Execution discipline

2.26 WHEN any cleanup item is marked "delete now" THEN the system SHALL execute
     the deletion in small reviewable batches, not as a single bulk operation

2.27 WHEN any cleanup item is marked "needs approval" THEN the system SHALL
     obtain explicit user approval before deleting the file

2.28 WHEN handling `.git/` history THEN the system SHALL NOT rewrite history
     unless the user has explicitly opted in, because history rewrites are
     destructive and affect every clone

### Unchanged Behavior (Regression Prevention)

The following behavior is not part of the defect. It MUST continue to work
identically after the fix. Any cleanup action that would violate one of these
clauses is by definition out of scope and requires separate approval.

3.1 WHEN `npm run build` is executed after cleanup THEN the system SHALL CONTINUE
    TO produce a successful build with no new errors introduced by the cleanup

3.2 WHEN the full test suite is executed after cleanup (covering `npm test`,
    `npm run test:unit`, and any Playwright suites) THEN the system SHALL CONTINUE
    TO pass every test that passed before cleanup (no new failures introduced)

3.3 WHEN the AutoTube pipeline is exercised end to end after cleanup THEN the
    system SHALL CONTINUE TO produce the same runtime behavior for topic entry,
    script generation, media sourcing, narration, assembly, and preview

3.4 WHEN the application loads runtime assets (for example audio beds under
    `public/audio/*.aac` and images under `public/images/` that are actually
    referenced from source, config, or HTML) THEN the system SHALL CONTINUE TO
    serve those assets unchanged

3.5 WHEN a contributor inspects files under `src/`, `server/`, `server-render/`,
    and `powers/` that are referenced from the build, the test suite, or runtime
    code paths THEN the system SHALL CONTINUE TO present those files unchanged

3.6 WHEN the cleanup process handles any file that may contain secrets or
    credentials (for example `.env*` files, API key stores, private keys) THEN
    the system SHALL CONTINUE TO treat those values as secret, SHALL NOT echo
    them into logs or findings tables, and SHALL NOT commit them

3.7 WHEN the cleanup process touches the `.git/` directory THEN the system SHALL
    CONTINUE TO preserve full `.git` history integrity, unless the user has
    explicitly opted into a history rewrite for that specific path

3.8 WHEN `.kiro/specs/` contains in-progress or referenced spec folders THEN the
    system SHALL CONTINUE TO preserve those specs, and SHALL NOT remove any spec
    folder without explicit user confirmation that it is stale

### Deriving the Bug Condition

The bug condition is defined over the repository state `R` (the set of tracked
and untracked files under the repository root, together with the `.git/`
directory). The fixed repository state is denoted `R'`.

```pascal
FUNCTION isBugCondition(R)
  INPUT: R of type RepositoryState
  OUTPUT: boolean

  // The bug is present when the repository exceeds the agreed storage budget.
  RETURN totalDiskUsageBytes(R) > 10 * 1024 * 1024 * 1024  // 10 GiB
END FUNCTION
```

The fix-checking property specifies what "correct" looks like for every
repository state that currently triggers the bug:

```pascal
// Property: Fix Checking — repository size is within budget after cleanup
FOR ALL R WHERE isBugCondition(R) DO
  R' ← applyCleanup(R)
  ASSERT totalDiskUsageBytes(R') <= 10 * 1024 * 1024 * 1024
  ASSERT totalDiskUsageBytes(R') < totalDiskUsageBytes(R)
END FOR
```

The preservation-checking property specifies that the fix must not damage any
file or behavior that was not part of the defect:

```pascal
// Property: Preservation Checking — runtime, build, and tests unchanged
FOR ALL R WHERE isBugCondition(R) DO
  R' ← applyCleanup(R)

  // No referenced file is lost.
  FOR ALL f IN preservationSet(R) DO
    ASSERT f EXISTS IN R' AND contentOf(f, R') = contentOf(f, R)
  END FOR

  // Build continues to succeed.
  ASSERT buildExitCode(R') = 0

  // No new test failures are introduced.
  ASSERT testFailureCount(R') <= testFailureCount(R)

  // Git history is preserved unless explicitly opted in.
  ASSERT gitHistoryDigest(R') = gitHistoryDigest(R) OR userOptedInToHistoryRewrite
END FOR
```

Where `preservationSet(R)` is the union of:

- every file transitively imported from the application or server entry points
- every file referenced from `package.json` scripts, `vite.config`,
  `playwright.config.ts`, and other project configuration
- every runtime asset under `public/` that is referenced from source, config,
  or HTML
- every `.kiro/specs/` folder that has not been explicitly confirmed stale
- every file flagged "needs confirmation" that has not received explicit
  user approval to delete

### Correctness Properties (for PBT validation during the fix phase)

The following properties restate the fix and preservation conditions in a form
that is suitable for property-based test generation in `design.md`. They are
listed here because they define **what correctness means** for this bugfix, not
how to implement it.

- **P1 — No referenced file is deleted.** For every file `f` proposed for
  deletion, there exists no import, require, config reference, or script
  reference to `f` from any non-deleted file under `src/`, `server/`,
  `server-render/`, `powers/`, `package.json` scripts, or project config files.
- **P2 — Build still succeeds.** After cleanup, `npm install && npm run build`
  exits with code 0.
- **P3 — No new test failures.** After cleanup, the test suite introduces no
  failures that were not already present before cleanup. In pseudocode:
  `testFailureCount(R') <= testFailureCount(R)`.
- **P4 — Size budget is met.** After cleanup, `totalDiskUsageBytes(R') < totalDiskUsageBytes(R)`
  and, ideally, `totalDiskUsageBytes(R') <= 10 GiB`.
- **P5 — Preservation set is intact.** No file in `preservationSet(R)` is
  deleted or modified as a side effect of cleanup.

### Evidence Discipline Constraints

These non-functional constraints apply to every phase of the fix and are
enforceable as review checks:

- **E1 — Cited evidence.** Every finding cites file path, measured size, and
  classification reason.
- **E2 — No destructive changes during audit.** Phases 1, 2, and 3 are
  read-only. No file is deleted, moved, or rewritten during the audit.
- **E3 — Reviewable batches.** Findings and deletions are presented in small
  batches that a human reviewer can audit in a single pass, not as a single
  monolithic diff.
- **E4 — Explicit uncertainty.** Any item whose classification is not
  conclusively proven is labeled "needs confirmation" and is never
  auto-deleted.
- **E5 — Secret safety.** Files that may contain secrets are handled by
  reference, not by value: their contents are never echoed into findings,
  logs, or commit messages.

### Known Repository Context

The following context is inherited from the initial scan and is provided so the
design phase can prioritize investigation targets. It is not itself a
requirement; it is background that supports clauses 2.4 through 2.25.

- The project is AutoTube, a Vite + React + TypeScript video pipeline app.
- A `coverage/` directory is currently present in the working tree. `coverage/`
  is conventionally a generated artifact of the test runner and is usually
  `.gitignore`d. `.gitignore` does not currently exclude it.
- A `dist/` directory is currently present in the working tree. `dist/` is
  `.gitignore`d in the current `.gitignore`, which suggests prior build output
  may still be tracked in `.git` history even if not in the working tree diff.
- Audio assets under `public/audio/*.aac` are likely required runtime assets
  (background audio beds referenced by the renderer) and belong in
  `preservationSet(R)` unless proven otherwise.
- The repository contains roughly 20 spec folders under `.kiro/specs/`, some
  of which may be completed or stale. None may be removed without explicit
  user confirmation (see clause 3.8).
- `node_modules/` is expected to be large and is already `.gitignore`d. Its
  size contributes to local disk usage but not to clone size.
- `.git/` history size is unknown and may be a dominant contributor; Phase 1
  must measure it separately (clause 2.7) so that the design phase can decide
  whether history rewrites are in scope for this bugfix.
- A `test-recordings/` directory containing `.webm`, `.mp4`, and `.jpg`
  artifacts is present; these are candidate outputs of the Playwright suite
  and should be classified in Phase 1.
