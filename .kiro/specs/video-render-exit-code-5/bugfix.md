# Bugfix Requirements Document

## Introduction

Server-side video rendering always fails with a non-zero exit code (reported as "error code 5") because the output file path uses a `.webm` extension while the ffmpeg process is configured with the H.264 (`libx264`) codec. The WebM container format only supports VP8/VP9/AV1 codecs, so ffmpeg rejects the codec/container mismatch and exits immediately. This makes server-side rendering completely non-functional — every render attempt fails.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a server-side render is triggered THEN the system creates an output path with a `.webm` extension (`server-render-{timestamp}.webm`) in `vite.config.ts` and passes it to the render subprocess

1.2 WHEN ffmpeg is spawned with `-c:v libx264` and an output file ending in `.webm` THEN ffmpeg exits with a non-zero code because the H.264 codec is incompatible with the WebM container format

1.3 WHEN the render subprocess exits with a non-zero code THEN the system reports "server-render.mjs exited with code N" to the client as a render failure

1.4 WHEN the render fails THEN the post-render file detection logic attempts a `.webm` → `.mp4` fallback path lookup that never succeeds because no file was produced

### Expected Behavior (Correct)

2.1 WHEN a server-side render is triggered THEN the system SHALL create an output path with a `.mp4` extension (`server-render-{timestamp}.mp4`) matching the H.264 codec used by ffmpeg

2.2 WHEN ffmpeg is spawned with `-c:v libx264` and an output file ending in `.mp4` THEN ffmpeg SHALL accept the codec/container combination and produce a valid MP4 file

2.3 WHEN the render subprocess completes successfully THEN the system SHALL report completion with the correct file path to the client

2.4 WHEN the render completes THEN the post-render file detection logic SHALL directly reference the `.mp4` output path without needing a fallback dance

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the render subprocess produces a valid output file THEN the system SHALL CONTINUE TO stream SSE progress events to the client during rendering

3.2 WHEN the render completes successfully THEN the system SHALL CONTINUE TO serve the output file via the `/api/render-output/` endpoint with the correct MIME type

3.3 WHEN the client disconnects during rendering THEN the system SHALL CONTINUE TO kill the child process with SIGTERM

3.4 WHEN no project is saved before rendering THEN the system SHALL CONTINUE TO return a 400 error indicating the project must be saved first

3.5 WHEN `server-render.mjs` is invoked directly from the CLI without an explicit output path THEN the system SHALL CONTINUE TO use its default `.mp4` output path in the `test-recordings` directory

---

## Bug Condition

### Deriving the Bug Condition

**Bug Condition Function** — Identifies inputs that trigger the bug:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type RenderRequest
  OUTPUT: boolean
  
  // The bug triggers whenever the output file path has a .webm extension
  // while the ffmpeg codec is set to libx264 (H.264)
  RETURN X.outputFilePath ENDS WITH ".webm" AND X.codec = "libx264"
END FUNCTION
```

**Property Specification** — Defines correct behavior for buggy inputs:

```pascal
// Property: Fix Checking — Codec/Container Compatibility
FOR ALL X WHERE isBugCondition(X) DO
  result ← serverRender'(X)
  ASSERT result.outputFilePath ENDS WITH ".mp4"
  ASSERT result.exitCode = 0
  ASSERT fileExists(result.outputFilePath)
END FOR
```

**Preservation Goal** — Existing behavior unchanged for non-buggy inputs:

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT serverRender(X) = serverRender'(X)
END FOR
```

This ensures that CLI invocations (which already default to `.mp4`), progress streaming, error handling, and file serving all continue to work identically after the fix.
