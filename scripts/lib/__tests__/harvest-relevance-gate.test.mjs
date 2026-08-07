import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRelevanceUserText,
  judgeHarvestRelevance,
  parseRelevanceDecision,
  relevanceGateBudget,
  relevanceGateEnabled,
  relevanceModelId,
  shouldRejectRelevanceDecision,
  DEFAULT_RELEVANCE_MODEL,
  RELEVANCE_SYSTEM_PROMPT,
} from '../harvest-relevance-gate.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('harvest-relevance-gate helpers', () => {
  it('defaults to enabled and qwen flash', () => {
    expect(relevanceGateEnabled({})).toBe(true);
    expect(relevanceGateEnabled({ HARVEST_RELEVANCE_GATE: '0' })).toBe(false);
    expect(relevanceModelId({})).toBe(DEFAULT_RELEVANCE_MODEL);
    expect(relevanceModelId({ OPENROUTER_RELEVANCE_MODEL: 'qwen/custom' })).toBe('qwen/custom');
    expect(relevanceGateBudget({})).toBe(48);
    expect(relevanceGateBudget({ HARVEST_RELEVANCE_BUDGET: '12' })).toBe(12);
  });

  it('rejects WEAK only on intro', () => {
    expect(shouldRejectRelevanceDecision('REJECT', { isIntro: false })).toBe(true);
    expect(shouldRejectRelevanceDecision('WEAK', { isIntro: true })).toBe(true);
    expect(shouldRejectRelevanceDecision('WEAK', { isIntro: false })).toBe(false);
    expect(shouldRejectRelevanceDecision('KEEP', { isIntro: true })).toBe(false);
  });

  it('parses KEEP/WEAK/REJECT JSON', () => {
    expect(parseRelevanceDecision('{"decision":"keep","reason":"cabin"}')).toEqual({
      decision: 'KEEP',
      reason: 'cabin',
    });
    expect(parseRelevanceDecision('noise {"decision":"WEAK","reason":"logo"} trailing')).toEqual({
      decision: 'WEAK',
      reason: 'logo',
    });
    expect(parseRelevanceDecision('{"decision":"REJECT","reason":"music video"}')).toEqual({
      decision: 'REJECT',
      reason: 'music video',
    });
    expect(parseRelevanceDecision('not json').decision).toBeNull();
  });

  it('system prompt keeps same-beat aviation even when airline differs', () => {
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/wrong airline name is OK/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/oxygen masks/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/cabin/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/KEEP = real footage matching the beat family/i);
  });

  it('system prompt rejects fiction music trailers and chyron-only', () => {
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/fiction\/music video\/movie trailer/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/chyron\/logo\/title-card only/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/meme\/cartoon/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/REJECT =/i);
  });

  it('system prompt marks historic establishing as WEAK not REJECT', () => {
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/WEAK = vaguely airport\/hangar establishing/i);
    expect(RELEVANCE_SYSTEM_PROMPT).toMatch(/historic WWII\/1970s training film/i);
  });

  it('builds a compact user prompt', () => {
    const text = buildRelevanceUserText({
      topic: 'airline cabin pressure',
      segmentTitle: 'oxygen masks drop',
      segmentType: 'intro',
      clipTitle: 'CNN chyron',
      query: 'airplane cabin',
    });
    expect(text).toContain('Topic: airline cabin pressure');
    expect(text).toContain('Segment beat: oxygen masks drop');
    expect(text).toContain('Clip title: CNN chyron');
  });
});

describe('judgeHarvestRelevance', () => {
  it('reports missing API key as not run', async () => {
    await expect(judgeHarvestRelevance({ topic: 'airline' })).resolves.toMatchObject({
      ran: false,
      decision: null,
      reason: 'missing-key',
    });
  });

  it('reports HTTP failures as not verified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    await expect(
      judgeHarvestRelevance({ apiKey: 'key', topic: 'airline', clipTitle: 'boarding' }),
    ).resolves.toMatchObject({
      ran: false,
      decision: null,
      reason: 'http-429',
    });
  });

  it('sends reasoning effort none and parses KEEP', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.reasoning).toEqual({ effort: 'none' });
      expect(body.model).toBe(DEFAULT_RELEVANCE_MODEL);
      expect(body.messages[0].content).toBe(RELEVANCE_SYSTEM_PROMPT);
      expect(body.messages[0].content).toMatch(/wrong airline name is OK/i);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"decision":"KEEP","reason":"cabin aisle"}' } }],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      judgeHarvestRelevance({
        apiKey: 'key',
        topic: 'airline',
        segmentTitle: 'cabin',
        clipTitle: 'passengers seated',
      }),
    ).resolves.toEqual({
      ran: true,
      decision: 'KEEP',
      reason: 'cabin aisle',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not treat reasoning-only replies as JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: null, reasoning: 'Thinking... {"decision":"KEEP"}' } }],
      }),
    })));

    await expect(
      judgeHarvestRelevance({ apiKey: 'key', topic: 'airline', clipTitle: 'x' }),
    ).resolves.toMatchObject({
      ran: false,
      decision: null,
      reason: 'empty',
    });
  });
});
