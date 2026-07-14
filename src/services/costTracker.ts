import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COSTS_FILE = join(__dirname, '..', '..', 'costs.json');

export interface CostEntry {
  timestamp: string;
  api: string;
  model?: string;
  tokens?: { prompt: number; completion: number; total: number };
  credits?: number;
  estimatedCostUsd: number;
  label?: string;
}

interface CostsLog {
  entries: CostEntry[];
  totals: { [api: string]: number };
  grandTotal: number;
}

// Rates = OpenRouter $/token (from /api/v1/models pricing, Jul 2026)
const MODEL_COSTS_PER_TOKEN: Record<string, { prompt: number; completion: number }> = {
  'xiaomi/mimo-v2.5': { prompt: 0.000000105, completion: 0.00000028 },
  'deepseek/deepseek-v4-flash': { prompt: 0.00000009, completion: 0.00000018 },
  'google/gemma-4-31b-it': { prompt: 0.00000006, completion: 0.00000035 },
  'google/gemini-2.5-flash': { prompt: 0.0000003, completion: 0.0000025 },
  'google/gemini-2.5-flash-lite': { prompt: 0.0000001, completion: 0.0000004 },
  'anthropic/claude-3-haiku': { prompt: 0.00000025, completion: 0.00000125 },
  'openai/gpt-4o-mini': { prompt: 0.00000015, completion: 0.0000006 },
  'openai/gpt-4o': { prompt: 0.0000025, completion: 0.00001 },
  'openai/gpt-5.4-nano': { prompt: 0.0000002, completion: 0.00000125 },
  'openai/gpt-5.4-mini': { prompt: 0.00000075, completion: 0.0000045 },
  'openai/gpt-5-nano': { prompt: 0.00000005, completion: 0.0000004 },
  'rekaai/reka-edge': { prompt: 0.0000001, completion: 0.0000001 },
};

function loadLog(): CostsLog {
  if (existsSync(COSTS_FILE)) {
    try {
      return JSON.parse(readFileSync(COSTS_FILE, 'utf8'));
    } catch {
      // corrupted — start fresh
    }
  }
  return { entries: [], totals: {}, grandTotal: 0 };
}

function saveLog(log: CostsLog) {
  try {
    mkdirSync(dirname(COSTS_FILE), { recursive: true });
    writeFileSync(COSTS_FILE, JSON.stringify(log, null, 2));
  } catch {
    // best-effort — never block the main flow
  }
}

export function trackCost(entry: Omit<CostEntry, 'timestamp' | 'estimatedCostUsd'> & { estimatedCostUsd?: number }): CostEntry {
  const log = loadLog();

  let costUsd = entry.estimatedCostUsd ?? 0;
  if (costUsd === 0 && entry.tokens && entry.model) {
    const rates = MODEL_COSTS_PER_TOKEN[entry.model];
    if (rates) {
      costUsd = entry.tokens.prompt * rates.prompt + entry.tokens.completion * rates.completion;
    }
  }

  const full: CostEntry = {
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

export function trackOpenRouterCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  label?: string,
): CostEntry {
  return trackCost({
    api: 'openrouter',
    model,
    tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
    label,
  });
}

export function getCostSummary(): CostsLog {
  return loadLog();
}

export function estimateRenderCost(project: {
  script: Array<{ duration: number }>;
  exportSettings?: { resolution?: string };
  media?: Array<unknown>;
}): { apiCostEstimate: number; computeCostEstimate: number; storageCostEstimate: number; totalEstimate: number } {
  const totalDuration = project.script.reduce((s, seg) => s + seg.duration, 0);
  const resMultiplier: Record<string, number> = { '720p': 0.5, '1080p': 1, '1080p30': 1, '1080p60': 1.5, '4K': 4 };
  const res = project.exportSettings?.resolution || '1080p';
  const mult = resMultiplier[res] || 1;

  // Estimate API costs: ~500 tokens per segment for LLM calls
  const apiTokens = project.script.length * 500;
  const apiCostEstimate = apiTokens * 0.0000003; // ~$0.0003 per 500 tokens avg

  // Estimate compute: CPU-seconds for rendering
  const computeSeconds = totalDuration * mult * 2; // rough: 2x real-time at 1080p
  const computeCostEstimate = (computeSeconds / 3600) * 0.02; // ~$0.02/hr for CPU

  // Storage: output file ~10MB/min at 1080p
  const storageMB = (totalDuration / 60) * 10 * mult;
  const storageCostEstimate = (storageMB / 1000) * 0.023; // S3 pricing

  return {
    apiCostEstimate: Math.round(apiCostEstimate * 10000) / 10000,
    computeCostEstimate: Math.round(computeCostEstimate * 10000) / 10000,
    storageCostEstimate: Math.round(storageCostEstimate * 10000) / 10000,
    totalEstimate: Math.round((apiCostEstimate + computeCostEstimate + storageCostEstimate) * 10000) / 10000,
  };
}
