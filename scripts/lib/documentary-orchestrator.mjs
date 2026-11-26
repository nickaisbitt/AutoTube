/**
 * Title-only AI documentary production orchestrator.
 *
 * Provider adapters are injected so the engine can use local models or
 * configured AI services without hard-coding a vendor. This module owns
 * stage ordering, checkpoints, validation and repair/release gates.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertAiOnlyProject } from "./ai-only-policy.mjs";

export const DOCUMENTARY_STAGES = Object.freeze([
  "research",
  "script",
  "visual_bible",
  "shot_plan",
  "visual_generation",
  "audio_generation",
  "assembly",
  "quality_review",
  "repair",
  "release",
]);

const REQUIRED_ADAPTERS = DOCUMENTARY_STAGES.filter((s) => s !== "repair");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}

function assertAdapterSet(adapters) {
  const missing = REQUIRED_ADAPTERS.filter((stage) => typeof adapters?.[stage] !== "function");
  if (missing.length) throw new Error(`Missing production adapters: ${missing.join(", ")}`);
}

function validateResearch(result) {
  if (!result || !Array.isArray(result.claims) || result.claims.length === 0) {
    throw new Error("Research must return a non-empty claims array.");
  }
  const unsupported = result.claims.filter((claim) =>
    !claim.text || !Array.isArray(claim.sources) || claim.sources.length === 0
  );
  if (unsupported.length) {
    throw new Error(`Research contains ${unsupported.length} unsupported factual claim(s).`);
  }
}

function validateScript(result, minWords) {
  const script = result?.segments;
  if (!Array.isArray(script) || !script.length) throw new Error("Script must contain segments.");
  const words = script.map((s) => s.narration || "").join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (words < minWords) throw new Error(`Script too short: ${words} words; minimum is ${minWords}.`);
  return { words, segments: script.length };
}

function validateShotPlan(result, segmentCount) {
  if (!Array.isArray(result?.shots) || result.shots.length < segmentCount) {
    throw new Error("Shot plan must cover every script segment.");
  }
  const covered = new Set(result.shots.map((s) => s.segmentId));
  if (result.shots.some((s) => !s.segmentId || !s.visualPrompt)) {
    throw new Error("Every shot needs a segmentId and visualPrompt.");
  }
  const missing = Array.from({ length: segmentCount }, (_, index) => index)
    .filter((index) => !covered.has(index) && !covered.has(`s${index + 1}`));
  if (missing.length && covered.size < segmentCount) {
    throw new Error("Shot plan does not cover every script segment.");
  }
  return covered.size;
}

/**
 * @param {string} title User-supplied title (only required user input).
 * @param {object} options
 * @param {Record<string, Function>} options.adapters
 * @param {string} options.outputDir
 * @param {number} [options.targetMinutes=25]
 * @param {number} [options.minScriptWords]
 * @param {number} [options.maxRepairAttempts=2]
 * @param {(event: object) => void} [options.onProgress]
 */
export async function produceDocumentary(title, {
  adapters,
  outputDir = "./documentary-output",
  targetMinutes = 25,
  minScriptWords = Math.round(targetMinutes * 130),
  maxRepairAttempts = 2,
  onProgress = () => {},
} = {}) {
  if (typeof title !== "string" || title.trim().length < 4) {
    throw new Error("Provide a documentary title of at least four characters.");
  }
  assertAdapterSet(adapters);
  const topic = title.trim();
  const root = resolve(outputDir, topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  await mkdir(root, { recursive: true });

  const state = {
    schemaVersion: 1,
    title: topic,
    createdAt: new Date().toISOString(),
    status: "running",
    stages: {},
    artifacts: {},
  };
  const checkpoint = resolve(root, "production-manifest.json");

  async function runStage(name, input) {
    const startedAt = new Date().toISOString();
    onProgress({ stage: name, status: "started", title: topic });
    const output = await adapters[name](input, { title: topic, outputDir: root, state });
    if (output == null) throw new Error(`Stage ${name} returned no result.`);
    state.stages[name] = {
      status: "complete",
      startedAt,
      completedAt: new Date().toISOString(),
      outputHash: sha256(JSON.stringify(output)),
    };
    await atomicJson(checkpoint, state);
    onProgress({ stage: name, status: "complete", title: topic });
    return output;
  }

  try {
    const research = await runStage("research", { targetMinutes });
    validateResearch(research);

    const script = await runStage("script", { research, targetMinutes });
    const scriptMetrics = validateScript(script, minScriptWords);

    const visualBible = await runStage("visual_bible", { research, script });
    const shotPlan = await runStage("shot_plan", { research, script, visualBible });
    const shotCount = validateShotPlan(shotPlan, script.segments.length);

    const visuals = await runStage("visual_generation", { shotPlan, visualBible });
    const audio = await runStage("audio_generation", { script, targetMinutes });
    const assembled = await runStage("assembly", { research, script, visualBible, shotPlan, visuals, audio });

    if (!assembled.project || !assembled.mp4Path) {
      throw new Error("Assembly must return project metadata and an MP4 path.");
    }
    const policy = assertAiOnlyProject(assembled.project);

    let review = await runStage("quality_review", {
      mp4Path: assembled.mp4Path, project: assembled.project, research, script, shotPlan,
    });

    let attempt = 0;
    while (review?.passed !== true && attempt < maxRepairAttempts) {
      attempt += 1;
      const repaired = await adapters.repair({
        review, mp4Path: assembled.mp4Path, project: assembled.project,
        research, script, shotPlan, visuals, audio, attempt,
      }, { title: topic, outputDir: root, state });
      if (!repaired?.project || !repaired?.mp4Path) {
        throw new Error("Repair must return a replacement project and MP4 path.");
      }
      assembled.project = repaired.project;
      assembled.mp4Path = repaired.mp4Path;
      assertAiOnlyProject(assembled.project);
      review = await adapters.quality_review({
        mp4Path: assembled.mp4Path, project: assembled.project,
        research, script, shotPlan, repairAttempt: attempt,
      }, { title: topic, outputDir: root, state });
    }
    if (review?.passed !== true) throw new Error("Quality review did not pass; release blocked.");

    const release = await runStage("release", {
      title: topic, mp4Path: assembled.mp4Path, project: assembled.project,
      research, script, review, policy,
    });
    state.status = "complete";
    state.completedAt = new Date().toISOString();
    state.artifacts = {
      mp4Path: assembled.mp4Path,
      release,
      scriptWords: scriptMetrics.words,
      segmentCount: scriptMetrics.segments,
      shotCount,
      aiPolicy: policy,
      repairAttempts: attempt,
      review,
    };
    await atomicJson(checkpoint, state);
    return state;
  } catch (error) {
    state.status = "failed";
    state.failedAt = new Date().toISOString();
    state.error = { message: error.message, code: error.code || null };
    await atomicJson(checkpoint, state);
    onProgress({ stage: "production", status: "failed", error: error.message });
    throw error;
  }
}
