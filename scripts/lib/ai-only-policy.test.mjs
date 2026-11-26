import test from "node:test";
import assert from "node:assert/strict";
import { validateAiOnlyProject, assertAiOnlyProject } from "./ai-only-policy.mjs";

const generated = (role = "visual") => ({
  role,
  origin: "ai_generated",
  generation: {
    provider: "local-diffusion",
    model: "test-model",
    prompt: "A cinematic reconstruction of ancient Rome",
    createdAt: "2026-11-26T00:00:00.000Z",
    sha256: "a".repeat(64),
  },
});

test("accepts a project when every creative asset has AI provenance", () => {
  const result = validateAiOnlyProject({
    media: [generated("visual")],
    audio: [generated("narration"), generated("music")],
  });
  assert.equal(result.ok, true);
  assert.equal(result.assetCount, 3);
});

test("rejects externally sourced stock or web media", () => {
  const result = validateAiOnlyProject({
    media: [{ role: "visual", origin: "stock", url: "https://example.test/clip.mp4" }],
  });
  assert.equal(result.ok, false);
  assert.match(result.findings[0].reason, /externally sourced/);
});

test("rejects assets with missing generation provenance", () => {
  const result = validateAiOnlyProject({
    media: [{ role: "visual", origin: "ai_generated", generation: { provider: "x" } }],
  });
  assert.equal(result.ok, false);
});

test("rejects unconsented voice cloning", () => {
  const voice = { ...generated("narration"), voiceClone: true, voiceConsent: false };
  const result = validateAiOnlyProject({ audio: [voice] });
  assert.equal(result.ok, false);
  assert.match(result.findings[0].reason, /consent/);
});

test("fails closed for empty projects", () => {
  assert.equal(validateAiOnlyProject({ media: [], audio: [] }).ok, false);
});

test("throwing gate exposes a stable error code", () => {
  assert.throws(() => assertAiOnlyProject({ media: [] }), (error) => {
    assert.equal(error.code, "AI_ONLY_POLICY_FAILED");
    return true;
  });
});
