/**
 * AI-only production policy.
 *
 * This gate is deliberately fail-closed: a documentary is not labelled
 * "100% AI-generated" unless every creative media asset carries generation
 * provenance. Stock footage, web images, archive clips and untracked audio
 * are rejected rather than silently mixed into an AI-only film.
 */

const CREATIVE_ROLES = new Set(["visual", "narration", "music", "sound_effect"]);

function fail(message, details = {}) {
  return { ok: false, message, ...details };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validGeneration(asset) {
  const g = asset?.generation;
  return Boolean(
    asset?.origin === "ai_generated" &&
    g && hasText(g.provider) &&
    hasText(g.model) &&
    hasText(g.prompt) &&
    hasText(g.createdAt) &&
    hasText(g.sha256)
  );
}

/**
 * Validate a project against the strict AI-only contract.
 *
 * Accepted project shape:
 * {
 *   title, media: [{ role, origin, generation, ... }],
 *   audio: [{ role: "narration"|"music"|"sound_effect", origin, generation, ... }]
 * }
 */
export function validateAiOnlyProject(project) {
  if (!project || typeof project !== "object") return fail("Project must be an object.");
  const assets = [
    ...(Array.isArray(project.media) ? project.media : []),
    ...(Array.isArray(project.audio) ? project.audio : []),
  ];

  if (!assets.length) return fail("No creative assets found; an empty project cannot pass AI-only validation.");

  const findings = [];
  for (const [index, asset] of assets.entries()) {
    const role = asset?.role || "visual";
    if (!CREATIVE_ROLES.has(role)) {
      findings.push({ index, role, reason: "unknown creative role" });
      continue;
    }
    if (!validGeneration(asset)) {
      findings.push({
        index,
        role,
        reason: asset?.origin === "stock" || asset?.origin === "web"
          ? "externally sourced media is prohibited in AI-only mode"
          : "missing complete AI-generation provenance",
      });
    }
    if (role === "narration" && asset?.voiceClone && asset?.voiceConsent !== true) {
      findings.push({ index, role, reason: "voice clone lacks recorded consent" });
    }
  }

  if (findings.length) return fail("AI-only policy failed.", { findings });
  return {
    ok: true,
    assetCount: assets.length,
    roles: [...new Set(assets.map((a) => a.role || "visual"))],
    policy: "ai-only-v1",
  };
}

/** Throwing variant for render pipelines that must stop before export. */
export function assertAiOnlyProject(project) {
  const result = validateAiOnlyProject(project);
  if (!result.ok) {
    const error = new Error(result.message);
    error.code = "AI_ONLY_POLICY_FAILED";
    error.findings = result.findings || [];
    throw error;
  }
  return result;
}
