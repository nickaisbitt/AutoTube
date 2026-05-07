# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Codec/Container Mismatch (`.webm` + `libx264`)
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the codec/container mismatch causes ffmpeg to fail
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — the `/api/server-render` endpoint constructs a `.webm` output path while ffmpeg uses `libx264`
  - Test that invoking ffmpeg with `-c:v libx264` and a `.webm` output path results in a non-zero exit code (from Bug Condition in design: `isBugCondition(input) = input.outputFilePath ENDS WITH ".webm" AND input.codec = "libx264"`)
  - The test assertions should match the Expected Behavior Properties from design: output path ends in `.mp4`, exit code is 0, and file exists
  - Write a property-based test that for any timestamp value, the output path constructed by the server-render handler in `vite.config.ts` ends with `.mp4` (not `.webm`)
  - Additionally test that ffmpeg accepts `libx264` with an `.mp4` output (expected behavior after fix)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (the output path currently ends in `.webm`, confirming the bug exists)
  - Document counterexamples found: the handler produces paths like `server-render-1717000000000.webm` which are incompatible with `libx264`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Path Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: the handler returns 400 with `"No project saved. Call /api/save-project first."` when no project file exists
  - Observe on UNFIXED code: SSE headers are set correctly (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
  - Observe on UNFIXED code: the handler sends SIGTERM to the child process when the client disconnects
  - Observe on UNFIXED code: `server-render.mjs` CLI default output path is `.mp4` (line 27 of `server-render.mjs`)
  - Write property-based tests capturing these observed behaviors:
    - For all requests without a saved project, the handler returns status 400 with the correct error message
    - For all render requests, SSE headers are set before any events are emitted
    - For all client disconnects during rendering, SIGTERM is sent to the child process
    - For all CLI invocations of `server-render.mjs` without arguments, the default path ends in `.mp4`
  - Verify tests pass on UNFIXED code (these behaviors are not affected by the `.webm` extension bug)
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for codec/container mismatch in vite.config.ts server-render handler

  - [x] 3.1 Implement the fix
    - Change output file extension from `.webm` to `.mp4` on line 181: rename `outputWebm` to `outputMp4` and use `.mp4` extension
    - Update spawn argument on line 231: pass `outputMp4` instead of `outputWebm` to `server-render/index.mjs`
    - Simplify post-render file detection (lines 265-268): replace the `.webm` → `.mp4` fallback logic with direct `outputMp4` reference and hardcoded `"mp4"` format
    - _Bug_Condition: isBugCondition(input) where input.outputFilePath ENDS WITH ".webm" AND input.codec = "libx264"_
    - _Expected_Behavior: output path ends in ".mp4", ffmpeg exits with code 0, valid MP4 file is produced_
    - _Preservation: SSE streaming, error handling, client disconnect cleanup, project validation, file serving, CLI default path all unchanged_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Codec/Container Compatibility
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (output path ends in `.mp4`)
    - When this test passes, it confirms the codec/container mismatch is resolved
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — output path now ends in `.mp4`)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Path Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in SSE streaming, error handling, disconnect cleanup, project validation, file serving)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite to confirm no regressions
  - Verify the bug condition test (Property 1) passes
  - Verify the preservation tests (Property 2) pass
  - Ensure all other existing tests continue to pass
  - Ask the user if questions arise
