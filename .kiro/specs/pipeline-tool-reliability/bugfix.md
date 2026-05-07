# Bugfix Requirements Document

## Introduction

The AutoTube pipeline and its MCP tester tool suffer from three reliability failures that cause pipeline crashes, degraded visual planning, and silent JSON parsing errors. These bugs result in lost progress data (no manifest.json or console.log written), fallback to generic visual plans for every segment, and null returns from vision/focal-cropper services. Together they make the pipeline unreliable for real-world video generation runs.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN narration generation takes longer than 60 seconds (common with Grok TTS) THEN the MCP `run_autotube_pipeline` tool's `pollUntil` call times out, the pipeline continues with a "timed out" warning, and if subsequent steps also exceed their limits the pipeline crashes without writing manifest.json or console.log, losing all progress data.

1.2 WHEN video assembly takes longer than 180 seconds THEN the MCP `run_autotube_pipeline` tool's `pollUntil` call times out and the pipeline crashes in the `finally` block before writing manifest.json or console.log, losing all run artifacts and timing data.

1.3 WHEN the LLM returns a valid JSON response containing `primaryShot` and `secondaryShot` fields with proper `concept`, `queries`, and `vibe` sub-fields THEN the `validateVisualPlan` function returns 0 shots because the `validateShot` function fails to extract shots from the parsed response, causing fallback to generic "Establish visual context" plans for all segments.

1.4 WHEN the LLM (Reka Edge) returns a JSON response wrapped in markdown code fences (e.g., `` ```json\n{...}\n``` ``) or with extra text before/after the JSON object THEN the `visionCheck.ts` and `focalCropper.ts` services fail to parse the response, logging "JSON repair failed, returning null" or "SyntaxError: Unexpected non-whitespace character after JSON", and return null instead of usable results.

1.5 WHEN the LLM returns a response containing JSON embedded within surrounding prose text (e.g., "Here is the result: {...} Let me know if you need more") THEN the fence-stripping regex in `visionCheck.ts` and `focalCropper.ts` does not match, `JSON.parse` fails on the full string, and `repairTruncatedJson` cannot fix it because the issue is leading/trailing non-JSON text rather than truncation.

### Expected Behavior (Correct)

2.1 WHEN narration generation takes longer than 60 seconds THEN the MCP `run_autotube_pipeline` tool SHALL wait up to 180 seconds for narration to complete before timing out, allowing Grok TTS sufficient time to generate all audio segments.

2.2 WHEN video assembly takes longer than 180 seconds THEN the MCP `run_autotube_pipeline` tool SHALL wait up to 360 seconds for assembly to complete, AND SHALL always write manifest.json and console.log in the `finally` block regardless of whether the pipeline succeeds or fails, preserving all progress data.

2.3 WHEN the LLM returns a valid JSON response containing shot fields (in any of the supported key patterns: `primaryShot`, `primary_shot`, `shot1`, `primary`, `secondaryShot`, `secondary_shot`, `shot2`, `secondary`, or a `shots` array) THEN the `validateVisualPlan` function SHALL correctly parse and return those shots with their `concept`, `queries`, and `vibe` fields populated.

2.4 WHEN the LLM returns a JSON response wrapped in markdown code fences or with extra whitespace/text around the JSON THEN the `visionCheck.ts` and `focalCropper.ts` services SHALL extract the JSON object from the response by stripping fences and isolating the JSON content, and SHALL successfully parse it into a usable result.

2.5 WHEN the LLM returns a response containing JSON embedded within surrounding prose text THEN the JSON extraction logic SHALL locate the first `{` and last `}` (or first `[` and last `]`) in the response, extract that substring, and attempt to parse it as JSON before falling back to null.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN narration generation completes within 60 seconds THEN the system SHALL CONTINUE TO proceed immediately to the next step without waiting the full timeout duration.

3.2 WHEN video assembly completes within 180 seconds THEN the system SHALL CONTINUE TO proceed immediately to the next step without waiting the full timeout duration.

3.3 WHEN the pipeline completes successfully THEN the system SHALL CONTINUE TO write manifest.json and console.log with full timing data and step logs.

3.4 WHEN the LLM returns a clean JSON response without markdown fences or surrounding text THEN the `visionCheck.ts`, `focalCropper.ts`, and `llmVisualDirector.ts` services SHALL CONTINUE TO parse it directly with `JSON.parse` without modification.

3.5 WHEN the LLM returns an unparseable response that contains no valid JSON structure THEN the services SHALL CONTINUE TO return null (for visionCheck/focalCropper) or fallback plans (for llmVisualDirector) gracefully without crashing.

3.6 WHEN `pollUntil` detects the expected condition before the timeout THEN it SHALL CONTINUE TO return `true` immediately without waiting for the full timeout duration.

---

## Bug Condition (Formal)

### Bug 1 & 2: MCP Pipeline Timeouts

```pascal
FUNCTION isBugCondition_Timeout(X)
  INPUT: X of type PipelineRun { narrationDurationSecs: number, assemblyDurationSecs: number }
  OUTPUT: boolean
  
  RETURN X.narrationDurationSecs > 60 OR X.assemblyDurationSecs > 180
END FUNCTION
```

```pascal
// Property: Fix Checking — Timeout Limits
FOR ALL X WHERE isBugCondition_Timeout(X) DO
  result ← runPipeline'(X)
  ASSERT result.manifestWritten = true
  ASSERT result.consoleLogWritten = true
  ASSERT (X.narrationDurationSecs <= 180 IMPLIES result.narrationCompleted = true)
  ASSERT (X.assemblyDurationSecs <= 360 IMPLIES result.assemblyCompleted = true)
END FOR
```

### Bug 3: VisualDirector Shot Parsing

```pascal
FUNCTION isBugCondition_ShotParsing(X)
  INPUT: X of type LlmResponse { content: string }
  OUTPUT: boolean
  
  parsed ← JSON.parse(X.content)
  RETURN parsed.primaryShot IS NOT NULL AND parsed.primaryShot.concept IS NOT NULL
END FUNCTION
```

```pascal
// Property: Fix Checking — Shot Parsing
FOR ALL X WHERE isBugCondition_ShotParsing(X) DO
  result ← validateVisualPlan'(JSON.parse(X.content), "fallback")
  ASSERT result.shots.length > 0
END FOR
```

### Bug 4 & 5: JSON Extraction from LLM Responses

```pascal
FUNCTION isBugCondition_JsonExtraction(X)
  INPUT: X of type LlmResponse { content: string }
  OUTPUT: boolean
  
  // Content contains valid JSON but wrapped in fences or prose
  stripped ← extractJsonSubstring(X.content)
  RETURN stripped IS NOT NULL AND JSON.parse(stripped) succeeds
    AND JSON.parse(X.content) fails
END FUNCTION
```

```pascal
// Property: Fix Checking — JSON Extraction
FOR ALL X WHERE isBugCondition_JsonExtraction(X) DO
  result ← parseVisionResponse'(X.content)
  ASSERT result IS NOT NULL
END FOR
```

### Preservation

```pascal
// Property: Preservation Checking — All Bugs
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```
