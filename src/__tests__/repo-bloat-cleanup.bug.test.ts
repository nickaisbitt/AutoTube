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

describe("Bug condition: repo size budget", () => {
  it("repository total disk usage is <= 10 GiB", () => {
    const out = execSync("du -sb .", { encoding: "utf8" });
    const bytes = Number(out.trim().split(/\s+/)[0]);
    expect(bytes).toBeLessThanOrEqual(TEN_GIB);
  });
});
