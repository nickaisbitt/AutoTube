/**
 * OpenAI-compatible provider adapters for the AI documentary pipeline.
 *
 * Configure AI_API_BASE_URL, AI_API_KEY, AI_CHAT_MODEL and AI_IMAGE_MODEL.
 * The chat endpoint follows /v1/chat/completions; the image endpoint follows
 * /v1/images/generations and must return base64 image data (b64_json).
 *
 * No stock/web-media fallback exists here. Image generation failures are fatal.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const DEFAULT_BASE = "https://api.openai.com";

function required(value, name) {
  if (!value || !String(value).trim()) throw new Error(`Missing required configuration: ${name}`);
  return String(value).trim();
}

function parseJson(content, stage) {
  const raw = String(content || "").trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${stage} did not return a JSON object.`);
  try { return JSON.parse(raw.slice(start, end + 1)); }
  catch (error) { throw new Error(`${stage} returned invalid JSON: ${error.message}`); }
}

function config() {
  return {
    base: (process.env.AI_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, ""),
    key: required(process.env.AI_API_KEY || process.env.OPENAI_API_KEY, "AI_API_KEY"),
    chatModel: required(process.env.AI_CHAT_MODEL, "AI_CHAT_MODEL"),
    imageModel: required(process.env.AI_IMAGE_MODEL, "AI_IMAGE_MODEL"),
  };
}

async function postJson(url, key, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.AI_API_TIMEOUT_MS || 180000)),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    throw new Error(`AI provider request failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function chatJson(stage, system, input) {
  const c = config();
  const data = await postJson(`${c.base}/v1/chat/completions`, c.key, {
    model: c.chatModel,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  return parseJson(data?.choices?.[0]?.message?.content, stage);
}

function promptFor(stage, title, rules) {
  return `You are a rigorous documentary production specialist. Topic: ${title}.
Return only a JSON object matching the requested schema. Never invent sources, quotations,
dates, statistics, or certainty. Distinguish established facts from disputed interpretations.
${rules}`;
}

export function createAiProviderAdapters({ outputDir = "./documentary-output" } = {}) {
  const root = resolve(outputDir);
  return {
    research: async ({ targetMinutes }, { title }) => chatJson("research", promptFor(
      "research", title,
      'Schema: {"claims":[{"id":"c1","text":"fact","sources":[{"title":"source title","url":"https://...","publisher":"...","accessedAt":"ISO date"}],"confidence":"high|medium|low","notes":"..."}]}. Include enough sourced claims for a long-form documentary. Sources must be real, directly relevant, and independently checkable. Target runtime minutes: ' + targetMinutes
    ), { title, targetMinutes }),

    script: async ({ research, targetMinutes }, { title }) => chatJson("script", promptFor(
      "script", title,
      'Schema: {"segments":[{"id":"s1","heading":"...","narration":"...","claimIds":["c1"],"estimatedSeconds":60}]}. Write a compelling, balanced documentary script for the target runtime. Every factual assertion must map to research claimIds. Target minutes: ' + targetMinutes
    ), { title, research, targetMinutes }),

    visual_bible: async ({ research, script }, { title }) => chatJson("visual bible", promptFor(
      "visual bible", title,
      'Schema: {"style":"...","palette":["..."],"cameraLanguage":"...","periodAccuracyRules":["..."],"recurringMotifs":["..."],"continuityRules":["..."]}. Define a coherent original visual language and prohibit anachronisms.'
    ), { title, research, script }),

    shot_plan: async ({ research, script, visualBible }, { title }) => chatJson("shot plan", promptFor(
      "shot plan", title,
      'Schema: {"shots":[{"id":"shot-1","segmentId":"s1","visualPrompt":"...","negativePrompt":"...","durationSeconds":8,"cameraMovement":"...","aspectRatio":"16:9"}]}. Cover every script segment with multiple varied shots. All visuals must be newly AI-generated.'
    ), { title, research, script, visualBible }),

    visual_generation: async ({ shotPlan, visualBible }, { title, outputDir: projectDir }) => {
      const c = config();
      const dir = join(projectDir, "generated-visuals");
      await mkdir(dir, { recursive: true });
      const assets = [];
      for (const shot of shotPlan.shots) {
        const data = await postJson(`${c.base}/v1/images/generations`, c.key, {
          model: c.imageModel,
          prompt: `${shot.visualPrompt}\nVisual bible: ${JSON.stringify(visualBible)}\nWide cinematic 16:9 documentary frame. No text, no watermark.`,
          n: 1,
          size: process.env.AI_IMAGE_SIZE || "1536x1024",
          response_format: "b64_json",
        });
        const encoded = data?.data?.[0]?.b64_json;
        if (!encoded) throw new Error(`Image provider returned no b64_json for ${shot.id}; refusing non-AI fallback.`);
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.length < 1024) throw new Error(`Generated image for ${shot.id} is unexpectedly small.`);
        const path = join(dir, `${String(shot.id).replace(/[^a-z0-9_-]/gi, "_")}.png`);
        await writeFile(path, bytes, { flag: "wx" });
        assets.push({
          id: shot.id,
          segmentId: shot.segmentId,
          role: "visual",
          path,
          origin: "ai_generated",
          provenance: {
            provider: c.base,
            model: c.imageModel,
            prompt: shot.visualPrompt,
            createdAt: new Date().toISOString(),
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        });
      }
      return { assets };
    },
  };
}
