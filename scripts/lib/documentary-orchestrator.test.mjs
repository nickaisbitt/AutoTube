import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { produceDocumentary } from "./documentary-orchestrator.mjs";

function generated(role) {
  return {
    role, origin: "ai_generated",
    generation: {
      provider: "test-provider", model: "test-model", prompt: "test prompt",
      createdAt: "2026-11-26T00:00:00.000Z", sha256: "b".repeat(64),
    },
  };
}
function adapters({ reviewPass = true, unsupportedResearch = false } = {}) {
  const calls = [];
  const base = {
    research: async () => ({ claims: unsupportedResearch
      ? [{ text: "Unsupported claim", sources: [] }]
      : [{ text: "Rome was founded in antiquity", sources: ["https://example.test/source"] }] }),
    script: async () => ({ segments: [{ id: "s1", narration: Array(140).fill("Rome").join(" ") }] }),
    visual_bible: async () => ({ style: "cinematic reconstruction" }),
    shot_plan: async () => ({ shots: [{ segmentId: "s1", visualPrompt: "Ancient Rome at dawn" }] }),
    visual_generation: async () => ({ assets: [generated("visual")] }),
    audio_generation: async () => ({ assets: [generated("narration"), generated("music")] }),
    assembly: async () => ({
      mp4Path: "/tmp/test-documentary.mp4",
      project: { media: [generated("visual")], audio: [generated("narration"), generated("music")] },
    }),
    quality_review: async () => ({ passed: reviewPass }),
    repair: async () => ({
      mp4Path: "/tmp/repaired-documentary.mp4",
      project: { media: [generated("visual")], audio: [generated("narration"), generated("music")] },
    }),
    release: async () => ({ packagePath: "/tmp/release" }),
  };
  for (const [name, fn] of Object.entries(base)) {
    base[name] = async (...args) => { calls.push(name); return fn(...args); };
  }
  return { adapters: base, calls };
}

test("runs the title-only workflow in the required order and checkpoints completion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doc-engine-"));
  try {
    const { adapters: a, calls } = adapters();
    const result = await produceDocumentary("The Rise of Rome", {
      adapters: a, outputDir: dir, targetMinutes: 1, minScriptWords: 100,
    });
    assert.equal(result.status, "complete");
    assert.deepEqual(calls, ["research", "script", "visual_bible", "shot_plan",
      "visual_generation", "audio_generation", "assembly", "quality_review", "release"]);
    const saved = JSON.parse(await readFile(join(dir, "the-rise-of-rome", "production-manifest.json"), "utf8"));
    assert.equal(saved.status, "complete");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("blocks release when research contains unsupported claims", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doc-engine-"));
  try {
    const { adapters: a, calls } = adapters({ unsupportedResearch: true });
    await assert.rejects(() => produceDocumentary("The Rise of Rome", {
      adapters: a, outputDir: dir, targetMinutes: 1, minScriptWords: 1,
    }), /unsupported factual claim/);
    assert.equal(calls.includes("release"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("repairs failed quality review before release", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doc-engine-"));
  try {
    const { adapters: a, calls } = adapters();
    let reviews = 0;
    a.quality_review = async () => ({ passed: ++reviews >= 2 });
    const result = await produceDocumentary("The Rise of Rome", {
      adapters: a, outputDir: dir, targetMinutes: 1, minScriptWords: 100,
    });
    assert.equal(result.artifacts.repairAttempts, 1);
    assert.ok(calls.includes("repair"));
    assert.equal(result.status, "complete");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("blocks release if quality still fails after repair budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doc-engine-"));
  try {
    const { adapters: a } = adapters();
    a.quality_review = async () => ({ passed: false });
    await assert.rejects(() => produceDocumentary("The Rise of Rome", {
      adapters: a, outputDir: dir, targetMinutes: 1, minScriptWords: 100,
      maxRepairAttempts: 1,
    }), /Quality review did not pass/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
