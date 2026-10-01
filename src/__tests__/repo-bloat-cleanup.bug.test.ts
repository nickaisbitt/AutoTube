import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";

/**
 * Phase 1 bug-condition exploration test for the repo-bloat-cleanup bugfix.
 *
 * This test encodes the Bug Condition from design.md:
 *     totalDiskUsageBytes(R) > 10 * 1024^3
 *
 * It shells out to `du -sb .` at the repository root, parses the leading byte
 * count, and asserts the repo is within the 10 GiB budget. On the unfixed
 * repo this assertion MUST FAIL; the failing byte count is the counterexample
 * that confirms the bug exists. After the cleanup batches land, the same
 * assertion will pass and become the regression guard for the size budget.
 *
 * Scope is deliberately a single deterministic assertion against the current
 * working tree + `.git` - no retry loop, no sampling, no fallback branch.
 *
 * Validates: Requirements 1.1, 2.1 (bugfix.md); Property 1 (design.md).
 */

const TEN_GIB = 10 * 1024 ** 3;

/**
 * Measure total disk usage of the repo root in bytes using only POSIX-portable
 * `du` flags. `-k` is mandated by POSIX and returns 1024-byte blocks, so we
 * multiply back to bytes. GNU `du -sb` (the spec's original command) is not
 * portable to BSD `du` on macOS, so we avoid it.
 */
function repoBytes(): number {
  const out = execSync("du -sk .", { encoding: "utf8" });
  const kib = Number(out.trim().split(/\s+/)[0]);
  if (!Number.isFinite(kib)) {
    throw new Error(`du produced non-numeric size: ${JSON.stringify(out)}`);
  }
  return kib * 1024;
}

describe("Bug condition: repo size budget", () => {
  it("repository total disk usage is <= 10 GiB", () => {
    const bytes = repoBytes();
    expect(bytes).toBeLessThanOrEqual(TEN_GIB);
  });
});
