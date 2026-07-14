/**
 * Brutal vision hard-fail gate for the improvement loop.
 * Draft / skip_vision intentionally omits scores — that is not a hard fail.
 */
export function isBrutalHardFail(visionRequested, brutal) {
  if (!visionRequested) return false;
  return brutal?.success === false || !brutal?.report?.scores;
}
