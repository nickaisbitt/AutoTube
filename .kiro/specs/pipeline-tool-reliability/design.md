# Pipeline Tool Reliability Bugfix Design

## Overview

The AutoTube pipeline suffers from three categories of reliability failures: (1) the MCP tester tool's `pollUntil` timeouts are too short for real-world LLM/TTS latency and the pipeline crashes without writing diagnostic artifacts, (2) the `validateVisualPlan` function in `llmVisualDirector.ts` fails to extract shots from valid LLM responses due to JSON parsing issues in the cleaning step, and (3) the `visionCheck.ts` and `focalCropper.ts` services fail to parse JSON responses wrapped in markdown fences or prose because their extraction logic is too brittle.

The fix strategy is:
- Increase `pollUntil` timeouts and move manifest/console.log writes into the `finally` block unconditionally
- Fix the JSON cleaning in `generateAIPlan` so `validateVisualPlan` receives properly parsed objects
- Create a shared `extractJson` utility that robustly handles fences, prose wrapping, and truncation, then use it across all three LLM-consuming services

## Glossary

- **Bug_Condition (C)**: The set of inputs/conditions that trigger one of the three failure modes — timeout too short, shot parsing failure, or JSON extraction failure
- **Property (P)**: The desired correct behavior — pipeline completes with artifacts written, shots are parsed from valid responses, JSON is extracted from wrapped responses
- **Preservation**: Existing behavior that must remain unchanged — fast pipelines still proceed immediately, clean JSON still parses directly, unparseable responses still return null/fallback gracefully
- **`pollUntil`**: The polling function in `server.mjs` that waits for a Playwright condition to become true, with a configurable `maxSecs` timeout
- **`validateVisualPlan`**: The function in `llmVisualDirector.ts` that validates and normalizes LLM visual plan responses into `LlmVisualPlan` objects
- **`validateShot`**: The function in `llmVisualDirector.ts` that validates individual shot objects from LLM responses
- **`repairTruncatedJson`**: The existing utility in `src/utils/jsonRepair.ts` that closes unclosed brackets/braces and strips fences
- **`extractJson`**: The new utility to be created that robustly extracts JSON from LLM responses containing fences, prose, or truncation

## Bug Details

### Bug Condition

The bugs manifest in three distinct scenarios:

1. **Timeout failures**: When narration takes >60s or assembly takes >180s, `pollUntil` returns false and the pipeline continues into error states. If the pipeline crashes (e.g., during download), the `finally` block closes the browser but never writes `manifest.json` or `console.log` because those writes are inside the `try` block after the assembly step.

2. **Shot parsing failures**: In `generateAIPlan`, the raw LLM content is cleaned with `.replace(/```json/g, '').replace(/```/g, '').trim()` then parsed. However, when the LLM returns content with leading/trailing prose or partial fences, this cleaning is insufficient. The parsed object is then passed to `validateVisualPlan` which works correctly — the bug is in the JSON extraction step before validation, not in `validateVisualPlan` itself.

3. **JSON extraction failures**: In `visionCheck.ts` and `focalCropper.ts`, the fence-stripping regex `^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$` requires the fences to be at the very start and end of the string. When the LLM returns `"Here is the result:\n```json\n{...}\n```"` or `"{...}\nLet me know if you need more"`, the regex doesn't match and `JSON.parse` fails on the full string.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PipelineInput { 
    narrationDurationSecs: number,
    assemblyDurationSecs: number,
    llmContent: string 
  }
  OUTPUT: boolean
  
  // Timeout bug
  timeoutBug := input.narrationDurationSecs > 60 OR input.assemblyDurationSecs > 180
  
  // JSON extraction bug  
  jsonContent := extractJsonSubstring(input.llmContent)
  extractionBug := jsonContent IS NOT NULL 
                   AND JSON.parse(jsonContent) succeeds
                   AND JSON.parse(input.llmContent) fails
  
  RETURN timeoutBug OR extractionBug
END FUNCTION
```

### Examples

- **Timeout**: Grok TTS takes 90s for 8 narration segments → `pollUntil` returns false at 60s, pipeline logs "timed out" but continues → assembly also times out → crash in download step → no manifest.json written
- **Shot parsing**: LLM returns `"Here's the plan:\n```json\n{\"primaryShot\": {\"concept\": \"Tokyo skyline\", ...}}\n```"` → the simple `.replace(/```json/g, '')` leaves `"Here's the plan:\n\n{...}\n"` → `JSON.parse` fails → fallback plan returned with 0 shots
- **Vision check**: Reka Edge returns `"Based on my analysis:\n{\"pass\": true, \"confidence\": 85, ...}"` → fence regex doesn't match → `JSON.parse` fails on full string → `repairTruncatedJson` can't fix leading prose → returns null
- **Focal cropper**: Reka Edge returns `"```json\n{\"x\": 0.3, \"y\": 0.6}\n```\n"` (trailing newline after fence) → fence regex requires `$` at end → doesn't match → parse fails → returns null (center crop fallback)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When `pollUntil` detects the expected condition before the timeout, it returns `true` immediately without waiting
- When the LLM returns clean JSON without fences or prose, `JSON.parse` succeeds on the first attempt without invoking `extractJson`
- When the LLM returns completely unparseable content (no valid JSON anywhere), services return null or fallback plans gracefully
- Mouse/keyboard interactions in the Playwright pipeline continue to work identically
- The `validateVisualPlan` and `validateShot` functions continue to accept the same object shapes
- The `repairTruncatedJson` function continues to work for its existing callers

**Scope:**
All inputs where the LLM returns clean JSON (no fences, no prose wrapping) are completely unaffected. All pipeline runs where narration completes within 60s and assembly within 180s are unaffected by the timeout changes (they still proceed immediately on success).

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Insufficient timeout values**: The `pollUntil` calls use `maxSecs: 60` for narration and `maxSecs: 180` for assembly. Real-world Grok TTS regularly takes 90-120s for multi-segment narration. Assembly with vision checks and focal cropping can take 200-300s. The timeouts are based on optimistic estimates rather than observed P95 latencies.

2. **Manifest/console.log writes in wrong location**: The `writeFileSync` calls for `manifest.json` and `console.log` are inside the `try` block after the assembly/download steps. If any step after media sourcing throws an unhandled error, the `finally` block only closes the browser — it never writes the diagnostic files. These writes should be in the `finally` block.

3. **Naive JSON cleaning in `generateAIPlan`**: The cleaning logic `.replace(/```json/g, '').replace(/```/g, '').trim()` only handles the simplest case of fences. It doesn't handle: prose before/after fences, fences with language tags other than `json`, or responses where the JSON is embedded in explanatory text. This causes `JSON.parse` to fail, triggering the fallback path.

4. **Overly strict fence regex in visionCheck/focalCropper**: The regex `^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$` uses `^` and `$` anchors, requiring fences to be the entire string content. Any leading text ("Here is the result:") or trailing text (extra newlines, "Let me know...") causes the regex to not match. The code then falls through to `JSON.parse` on the raw string, which fails.

5. **No "find the JSON object" fallback**: Neither service has logic to find the first `{` and last `}` in the response and attempt to parse that substring. The `repairTruncatedJson` utility handles truncation (unclosed brackets) but not extraction from surrounding prose.

## Correctness Properties

Property 1: Bug Condition - Pipeline Artifacts Always Written

_For any_ pipeline run where the MCP `run_autotube_pipeline` tool is invoked and reaches the point of creating a `videoDir`, the tool SHALL always write `manifest.json` and `console.log` to that directory regardless of whether the pipeline succeeds, times out, or crashes at any step.

**Validates: Requirements 2.2**

Property 2: Bug Condition - Extended Timeouts Allow Completion

_For any_ pipeline run where narration takes between 60-180 seconds or assembly takes between 180-360 seconds, the `pollUntil` function SHALL wait long enough for the operation to complete rather than timing out prematurely.

**Validates: Requirements 2.1, 2.2**

Property 3: Bug Condition - JSON Extraction from Wrapped Responses

_For any_ LLM response string that contains valid JSON wrapped in markdown fences, surrounded by prose text, or with trailing whitespace, the `extractJson` utility SHALL successfully extract and return the parsed JSON object.

**Validates: Requirements 2.4, 2.5**

Property 4: Bug Condition - Visual Plan Shot Parsing

_For any_ LLM response containing valid `primaryShot` and/or `secondaryShot` fields (possibly wrapped in fences or prose), the `generateAIPlan` function SHALL return a plan with `shots.length > 0`.

**Validates: Requirements 2.3**

Property 5: Preservation - Immediate Completion on Success

_For any_ pipeline run where narration completes within 60 seconds and assembly completes within 180 seconds, the `pollUntil` function SHALL return `true` immediately upon detecting the success condition, preserving the existing fast-path behavior.

**Validates: Requirements 3.1, 3.2, 3.6**

Property 6: Preservation - Clean JSON Direct Parse

_For any_ LLM response that is already valid JSON (no fences, no prose), the services SHALL parse it directly with `JSON.parse` on the first attempt without invoking `extractJson`, preserving existing behavior and performance.

**Validates: Requirements 3.4**

Property 7: Preservation - Graceful Fallback for Unparseable Content

_For any_ LLM response that contains no valid JSON structure whatsoever, the services SHALL continue to return null (visionCheck, focalCropper) or fallback plans (llmVisualDirector) without crashing.

**Validates: Requirements 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `powers/autotube-tester/src/server.mjs`

**Function**: `runAutoTubePipeline`

**Specific Changes**:
1. **Increase narration timeout**: Change `pollUntil` for narration from `maxSecs: 60` to `maxSecs: 180`
2. **Increase assembly timeout**: Change `pollUntil` for assembly from `maxSecs: 180` to `maxSecs: 360`
3. **Move artifact writes to `finally` block**: Move the `writeFileSync` calls for `manifest.json` and `console.log` from the `try` block into the `finally` block, before `context.close()`. Guard with a check that `videoDir` exists. This ensures artifacts are always written even if the pipeline crashes.

---

**File**: `src/utils/extractJson.ts` (NEW FILE)

**Function**: `extractJson`

**Specific Changes**:
1. **Create a new utility** that attempts multiple strategies in order:
   - Try `JSON.parse` directly (fast path for clean JSON)
   - Strip markdown fences (handle ` ```json ... ``` ` with flexible anchoring — not requiring `^`/`$`)
   - Find first `{`/last `}` or first `[`/last `]` and try parsing that substring
   - Apply `repairTruncatedJson` to the extracted substring for truncation recovery
   - Return `null` if all strategies fail
2. **Export the function** for use across services

---

**File**: `src/services/llmVisualDirector.ts`

**Function**: `generateAIPlan`

**Specific Changes**:
1. **Replace naive cleaning** with `extractJson`: Replace the `.replace(/```json/g, '').replace(/```/g, '').trim()` + `JSON.parse` + `repairTruncatedJson` fallback chain with a single call to `extractJson(rawContent)`
2. **Preserve fallback behavior**: If `extractJson` returns null, return the existing fallback plan

---

**File**: `src/services/visionCheck.ts`

**Function**: `checkCandidateVision`

**Specific Changes**:
1. **Replace fence regex + JSON.parse chain** with `extractJson`: Replace the `fenceRegex` match, `JSON.parse`, and `repairTruncatedJson` fallback chain with a single call to `extractJson(content)`
2. **Preserve null return**: If `extractJson` returns null, continue to return null

---

**File**: `src/services/focalCropper.ts`

**Function**: `detectFocalPoint`

**Specific Changes**:
1. **Replace fence regex + JSON.parse chain** with `extractJson`: Replace the `fenceRegex` match, `JSON.parse`, and `repairTruncatedJson` fallback chain with a single call to `extractJson(cleanedContent)`
2. **Preserve null return**: If `extractJson` returns null, continue to return null

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that simulate the exact LLM response formats that trigger failures. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Fence-wrapped JSON test**: Pass `"```json\n{\"pass\": true, \"confidence\": 85}\n```"` to the visionCheck parsing logic (will fail on unfixed code — fence regex won't match if there's any extra whitespace)
2. **Prose-wrapped JSON test**: Pass `"Here is the result: {\"x\": 0.3, \"y\": 0.6}"` to the focalCropper parsing logic (will fail on unfixed code — no extraction logic exists)
3. **Visual plan with fences test**: Pass `"```json\n{\"primaryShot\": {\"concept\": \"Tokyo\", \"queries\": [\"Tokyo skyline\"], \"vibe\": \"dramatic\"}}\n```"` through the generateAIPlan cleaning logic (will fail on unfixed code — naive replace leaves artifacts)
4. **Manifest write on crash test**: Simulate a pipeline crash after media sourcing and verify manifest.json is NOT written (confirms bug on unfixed code)

**Expected Counterexamples**:
- `JSON.parse` throws SyntaxError on fence-wrapped and prose-wrapped inputs
- `validateVisualPlan` returns 0 shots when the JSON cleaning step corrupts the input
- No manifest.json exists in videoDir after a simulated crash

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := extractJson(input.llmContent)
  ASSERT result IS NOT NULL
  ASSERT JSON.parse(JSON.stringify(result)) succeeds
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT extractJson(input) = JSON.parse(input)  // clean JSON still parses directly
  ASSERT extractJson(garbage) = null              // unparseable still returns null
END FOR
```

**Testing Approach**: Property-based testing is recommended for the `extractJson` utility because:
- It can generate many variations of JSON wrapped in random prose/fences
- It catches edge cases like nested braces in strings, escaped quotes, etc.
- It provides strong guarantees that clean JSON passes through unchanged

**Test Plan**: Observe behavior on UNFIXED code first for clean JSON inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Clean JSON preservation**: Generate random valid JSON objects, verify `extractJson` returns identical parsed result to `JSON.parse`
2. **Fence wrapping**: Generate random valid JSON, wrap in ` ```json\n...\n``` `, verify `extractJson` extracts correctly
3. **Prose wrapping**: Generate random valid JSON, prepend/append random prose text, verify `extractJson` extracts correctly
4. **Truncated JSON**: Generate random valid JSON, truncate at random points, verify `extractJson` either repairs or returns null (never crashes)
5. **No JSON content**: Generate random strings with no JSON structure, verify `extractJson` returns null

### Unit Tests

- Test `extractJson` with clean JSON (object, array, nested)
- Test `extractJson` with markdown fences (```json, ```, ```javascript)
- Test `extractJson` with prose before/after JSON
- Test `extractJson` with truncated JSON (unclosed braces)
- Test `extractJson` with no valid JSON (returns null)
- Test `extractJson` with JSON containing braces in string values (edge case)
- Test that `generateAIPlan` returns shots when LLM wraps response in fences
- Test that `checkCandidateVision` parses prose-wrapped responses
- Test that `detectFocalPoint` parses fence-wrapped responses
- Test that manifest.json is written in the finally block (mock test)

### Property-Based Tests

- Generate random valid JSON objects, wrap in random combinations of fences/prose/whitespace, verify `extractJson` always recovers the original object
- Generate random valid `LlmVisualPlan` objects with shots, serialize to JSON with random wrapping, verify `validateVisualPlan` returns correct shot count
- Generate random strings with no JSON content, verify `extractJson` always returns null (never throws)
- Generate random valid JSON, verify `extractJson(json) === JSON.parse(json)` for the clean path (preservation)

### Integration Tests

- Run the full `generateAIPlan` function with a mocked LLM that returns fence-wrapped responses, verify shots are extracted
- Run `checkCandidateVision` with a mocked API that returns prose-wrapped JSON, verify VisionCheckResult is returned
- Run `detectFocalPoint` with a mocked API that returns fence-wrapped coordinates, verify FocalPoint is returned
- Simulate a pipeline run where narration takes 90s, verify it completes (with increased timeout)
