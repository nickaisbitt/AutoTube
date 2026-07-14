/**
 * Cost tracker for server-render (.mjs). Mirrors src/services/costTracker.ts estimates
 * and best-effort OpenRouter tracking into costs.json.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COSTS_FILE = join(__dirname, '..', '..', 'costs.json');

const MODEL_COSTS_PER_TOKEN = {
  'xiaomi/mimo-v2.5': { prompt: 0.000000105, completion: 0.00000028 },
  'deepseek/deepseek-v4-flash': { prompt: 0.00000009, completion: 0.00000018 },
  'google/gemma-4-31b-it': { prompt: 0.00000006, completion: 0.00000035 },
  'google/gemini-2.5-flash': { prompt: 0.0000003, completion: 0.0000025 },
  'openai/gpt-4o-mini': { prompt: 0.00000015, completion: 0.0000006 },
  'openai/gpt-4o': { prompt: 0.0000025, completion: 0.00001 },
  'rekaai/reka-edge': { prompt: 0.0000001, completion: 0.0000001 },
};

function loadLog() {
  if (existsSync(COSTS_FILE)) {
    try {
      return JSON.parse(readFileSync(COSTS_FILE, 'utf8'));
    } catch {
      /* start fresh */
    }
  }
  return { entries: [], totals: {}, grandTotal: 0 };
}

function saveLog(log) {
  try {
    mkdirSync(dirname(COSTS_FILE), { recursive: true });
    writeFileSync(COSTS_FILE, JSON.stringify(log, null, 2));
  } catch {
    /* best-effort */
  }
}

export function trackCost(entry) {
  const log = loadLog();
  let costUsd = entry.estimatedCostUsd ?? 0;
  if (costUsd === 0 && entry.tokens && entry.model) {
    const rates = MODEL_COSTS_PER_TOKEN[entry.model];
    if (rates) {
      costUsd = entry.tokens.prompt * rates.prompt + entry.tokens.completion * rates.completion;
    } else {
      costUsd = (entry.tokens.total || 0) * 1e-6;
    }
  }
  const full = {
    timestamp: new Date().toISOString(),
    api: entry.api,
    model: entry.model,
    tokens: entry.tokens,
    credits: entry.credits,
    estimatedCostUsd: costUsd,
    label: entry.label,
  };
  log.entries.push(full);
  log.totals[entry.api] = (log.totals[entry.api] || 0) + costUsd;
  log.grandTotal += costUsd;
  saveLog(log);
  return full;
}

export function trackOpenRouterCost(model, promptTokens, completionTokens, label) {
  return trackCost({
    api: 'openrouter',
    model,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    },
    label,
  });
}

export function trackApiCall(api, tokens, model) {
  return trackCost({
    api,
    model,
    tokens: { prompt: 0, completion: 0, total: tokens || 0 },
    estimatedCostUsd: (tokens || 0) * 1e-6,
  });
}

export function getCostSummary() {
  return loadLog();
}

/**
 * @param {{ script?: Array<{ duration?: number }>, exportSettings?: { resolution?: string }, media?: unknown[], segments?: number, duration?: number, hasTTS?: boolean, hasAI?: boolean }} projectOrOptions
 */
export function estimateRenderCost(projectOrOptions = {}) {
  // Legacy stub shape: { segments, duration, hasTTS, hasAI }
  if (projectOrOptions.segments != null || (projectOrOptions.duration != null && !projectOrOptions.script)) {
    const { segments = 1, duration = 60, hasTTS = true, hasAI = false } = projectOrOptions;
    let cost = 0;
    if (hasTTS) cost += segments * 0.001;
    if (hasAI) cost += 0.01;
    cost += (duration / 60) * 0.005;
    return {
      apiCostEstimate: hasAI ? 0.01 : 0,
      computeCostEstimate: (duration / 60) * 0.005,
      storageCostEstimate: hasTTS ? segments * 0.001 : 0,
      totalEstimate: cost,
      total: cost,
      breakdown: {
        tts: hasTTS ? segments * 0.001 : 0,
        ai: hasAI ? 0.01 : 0,
        compute: (duration / 60) * 0.005,
      },
    };
  }

  const project = projectOrOptions;
  const script = project.script || [];
  const totalDuration = script.reduce((s, seg) => s + (seg.duration || 0), 0) || 60;
  const resMultiplier = { '720p': 0.5, '1080p': 1, '1080p30': 1, '1080p60': 1.5, '4K': 4 };
  const res = project.exportSettings?.resolution || '1080p';
  const mult = resMultiplier[res] || 1;
  const apiTokens = Math.max(script.length, 1) * 500;
  const apiCostEstimate = apiTokens * 0.0000003;
  const computeSeconds = totalDuration * mult * 2;
  const computeCostEstimate = (computeSeconds / 3600) * 0.02;
  const storageMB = (totalDuration / 60) * 10 * mult;
  const storageCostEstimate = (storageMB / 1000) * 0.023;
  return {
    apiCostEstimate: Math.round(apiCostEstimate * 10000) / 10000,
    computeCostEstimate: Math.round(computeCostEstimate * 10000) / 10000,
    storageCostEstimate: Math.round(storageCostEstimate * 10000) / 10000,
    totalEstimate: Math.round((apiCostEstimate + computeCostEstimate + storageCostEstimate) * 10000) / 10000,
  };
}
