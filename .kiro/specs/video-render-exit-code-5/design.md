# Video Render Exit Code 5 — Bugfix Design

## Overview

Server-side video rendering fails because `vite.config.ts` constructs an output file path with a `.webm` extension and passes it to `server-render.mjs`, which uses the H.264 (`libx264`) codec. FFmpeg rejects the codec/container mismatch (H.264 is not valid in WebM) and exits with a non-zero code. The fix changes the output extension to `.mp4` in `vite.config.ts` and removes the now-unnecessary `.webm` → `.mp4` fallback detection logic.

## Glossary

- **Bug_Condition (C)**: The output file path ends with `.webm` while the ffmpeg codec is `libx264` — an incompatible codec/container pairing
- **Property (P)**: The output file path ends with `.mp4`, ffmpeg exits with code 0, and a valid MP4 file is produced
- **Preservation**: All non-path-related behavior (SSE progress streaming, error handling, client disconnect cleanup, file serving, CLI default path) must remain unchanged
- **`vite.config.ts` server-render handler**: The Vite dev server middleware at `/api/server-render` that spawns the render subprocess and streams progress via SSE
- **`server-render.mjs`**: The standalone renderer that pipes raw frames to ffmpeg with `-c:v libx264`
- **`server-render/index.mjs`**: Thin orchestrator that forwards CLI arguments to `server-render.mjs`

## Bug Details

### Bug Condition

The bug manifests when the Vite dev server's `/api/server-render` endpoint is called. The handler constructs an output path with a `.webm` extension and passes it to the render subprocess. The subprocess uses `libx264` (H.264 codec) which requires an MP4 or MKV container — not WebM. FFmpeg detects the mismatch and exits immediately with a non-zero code.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RenderRequest
  OUTPUT: boolean
  
  RETURN input.outputFilePath ENDS WITH ".webm"
         AND input.codec = "libx264"
END FUNCTION
```

### Examples

- **Typical render request**: `vite.config.ts` creates path `test-recordings/server-render-1717000000000.webm`, passes to subprocess → ffmpeg exits with non-zero code because libx264 cannot mux into WebM
- **CLI invocation without args**: `server-render.mjs` defaults to `.mp4` → works correctly (not affected by bug)
- **Post-render fallback**: After failure, `outputWebm.replace(".webm", ".mp4")` is checked but no file exists because ffmpeg never produced output
- **Expected after fix**: Path is `test-recordings/server-render-1717000000000.mp4` → ffmpeg accepts libx264 + MP4 container → file produced successfully

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- SSE progress events (heartbeat, segment progress, narration, muxing, completion) must continue streaming to the client during rendering
- The `/api/render-output/` endpoint must continue to serve rendered files with the correct MIME type
- Client disconnect handling must continue to kill the child process with SIGTERM
- The 400 error response when no project is saved must remain unchanged
- `server-render.mjs` CLI default path (already `.mp4`) must remain unchanged
- All ffmpeg arguments (codec, bitrate, CRF, pixel format, preset) must remain unchanged

**Scope:**
All inputs that do NOT involve the output file path extension are completely unaffected by this fix. This includes:
- The render subprocess spawning logic (stdio, env vars, cwd)
- Progress parsing from stdout
- Error reporting on non-zero exit codes
- File serving and MIME type detection
- Project save validation

## Hypothesized Root Cause

Based on the bug description, the root cause is clear and singular:

1. **Incorrect File Extension in `vite.config.ts`**: Line 181 constructs the output path as:
   ```typescript
   const outputWebm = pathJoin(__dir, "test-recordings", `server-render-${Date.now()}.webm`);
   ```
   This `.webm` extension is passed directly to `server-render.mjs` via CLI argument, which passes it to ffmpeg as the output file. FFmpeg infers the container format from the extension and rejects the H.264 codec for WebM.

2. **Vestigial Fallback Logic**: Lines 265-268 attempt to work around the mismatch:
   ```typescript
   const outputMp4 = outputWebm.replace(".webm", ".mp4");
   const outputPath = fsExists(outputMp4) ? outputMp4 : outputWebm;
   ```
   This suggests a previous attempt to handle the issue by checking for an `.mp4` file, but since ffmpeg fails outright (rather than silently renaming), no file is ever produced.

## Correctness Properties

Property 1: Bug Condition - Codec/Container Compatibility

_For any_ render request where the output file path is constructed by the Vite server-render handler, the fixed handler SHALL produce a path ending in `.mp4` that is compatible with the `libx264` codec, allowing ffmpeg to exit with code 0 and produce a valid output file.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Path Behavior Unchanged

_For any_ render request processed by the fixed handler, all behavior unrelated to the output file extension (SSE streaming, error handling, client disconnect cleanup, project validation, file serving) SHALL produce the same results as the original handler, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `vite.config.ts`

**Function**: `/api/server-render` POST handler

**Specific Changes**:

1. **Change output file extension** (line 181):
   - Before: `const outputWebm = pathJoin(__dir, "test-recordings", \`server-render-${Date.now()}.webm\`);`
   - After: `const outputMp4 = pathJoin(__dir, "test-recordings", \`server-render-${Date.now()}.mp4\`);`

2. **Update spawn argument** to use the new variable name:
   - Before: `const child = spawnChild("node", ["server-render/index.mjs", outputWebm], { ... });`
   - After: `const child = spawnChild("node", ["server-render/index.mjs", outputMp4], { ... });`

3. **Simplify post-render file detection** (lines 265-268):
   - Before:
     ```typescript
     const outputMp4 = outputWebm.replace(".webm", ".mp4");
     const outputPath = fsExists(outputMp4) ? outputMp4 : outputWebm;
     const format = outputPath.endsWith(".mp4") ? "mp4" : "webm";
     ```
   - After:
     ```typescript
     const outputPath = outputMp4;
     const format = "mp4";
     ```

4. **Update file-not-found check**: The `fsExists(outputPath)` check remains unchanged — it now simply checks for the `.mp4` file directly.

5. **Update relPath construction**: No change needed — the existing `outputPath.split("test-recordings/")[1]` logic works regardless of extension.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the codec/container mismatch is indeed the root cause.

**Test Plan**: Invoke the `/api/server-render` endpoint on the unfixed code and observe the ffmpeg exit code and stderr output. Verify that the error message references the codec/container incompatibility.

**Test Cases**:
1. **Direct ffmpeg invocation**: Run ffmpeg with `-c:v libx264` and a `.webm` output path — expect non-zero exit (will fail on unfixed code)
2. **API endpoint test**: POST to `/api/server-render` and observe SSE error event with non-zero exit code (will fail on unfixed code)
3. **File existence check**: After render attempt, verify no `.webm` or `.mp4` file was created (confirms total failure)

**Expected Counterexamples**:
- ffmpeg exits with non-zero code and stderr contains "Could not find tag for codec" or similar muxer error
- No output file is produced at all
- The SSE stream reports an error event with the exit code

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (output path now correctly uses `.mp4`), ffmpeg accepts the codec/container combination and produces a valid file.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := serverRender_fixed(input)
  ASSERT result.outputFilePath ENDS WITH ".mp4"
  ASSERT result.exitCode = 0
  ASSERT fileExists(result.outputFilePath)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT serverRender_original(input) = serverRender_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code for non-path-related operations (SSE streaming, error responses, disconnect handling), then write tests capturing that behavior and verify it remains identical after the fix.

**Test Cases**:
1. **SSE Progress Streaming Preservation**: Verify that progress events are still emitted during rendering with correct format and timing
2. **Error Response Preservation**: Verify that a 400 error is returned when no project is saved
3. **Client Disconnect Preservation**: Verify that SIGTERM is sent to the child process when the client disconnects
4. **File Serving Preservation**: Verify that `/api/render-output/mp4/{path}` serves the file with correct `Content-Type: video/mp4`
5. **CLI Default Path Preservation**: Verify that `server-render.mjs` without arguments still defaults to `.mp4`

### Unit Tests

- Test that the output path variable is constructed with `.mp4` extension
- Test that the spawn command passes the `.mp4` path to the subprocess
- Test that post-render detection directly uses the `.mp4` path without fallback logic
- Test edge case: timestamp-based filename uniqueness is preserved

### Property-Based Tests

- Generate random timestamps and verify the output path always ends in `.mp4`
- Generate random render scenarios (with/without saved project) and verify error handling is unchanged
- Test that the format variable is always `"mp4"` in the SSE complete event

### Integration Tests

- End-to-end render: trigger `/api/server-render`, verify ffmpeg completes with exit 0, verify `.mp4` file exists
- Verify the complete SSE event contains a valid `/api/render-output/mp4/...` path
- Verify the rendered file is servable via `/api/render-output/mp4/{path}`
