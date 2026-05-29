// Cost tracker - estimates render costs
export function estimateRenderCost(options = {}) {
  const { segments = 1, duration = 60, hasTTS = true, hasAI = false } = options;
  let cost = 0;
  if (hasTTS) cost += segments * 0.001;
  if (hasAI) cost += 0.01;
  cost += (duration / 60) * 0.005;
  return { total: cost, breakdown: { tts: hasTTS ? segments * 0.001 : 0, ai: hasAI ? 0.01 : 0, compute: (duration / 60) * 0.005 } };
}
export function trackApiCall(api, tokens, model) { return { api, tokens, model, cost: tokens * 0.000001 }; }
export function trackOpenRouterCost(model, promptTokens, completionTokens, label) { return { api: 'openrouter', model, promptTokens, completionTokens, label, cost: (promptTokens + completionTokens) * 0.000001 }; }
