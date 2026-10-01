// ============================================================================
// JSON Repair — Shared utility for repairing truncated LLM JSON responses
// ============================================================================

/**
 * Attempt to repair truncated or malformed JSON from LLM responses.
 *
 * Handles common issues:
 * - Markdown code fences (```json ... ```)
 * - Trailing commas before closing brackets/braces
 * - Truncated decimals like `0.}` → `0.0}` and `0.,` → `0.0,`
 * - Unclosed strings, braces, and brackets
 */
export function repairTruncatedJson(json: string): string {
  let repaired = json.trim();

  // Strip markdown code fences if present
  const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = repaired.match(fenceRegex);
  if (match) {
    repaired = match[1].trim();
  }

  // Fix truncated decimals: 0.} → 0.0} and 0., → 0.0,  and 0.] → 0.0]
  repaired = repaired.replace(/(\d+)\.([\s,}\]])/g, '$1.0$2');

  // Remove trailing comma before we close brackets
  repaired = repaired.replace(/,\s*$/, '');

  // Count open/close brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of repaired) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  // Close unterminated string
  if (inString) repaired += '"';

  // Close open braces and brackets
  while (openBraces > 0) { repaired += '}'; openBraces--; }
  while (openBrackets > 0) { repaired += ']'; openBrackets--; }

  return repaired;
}
