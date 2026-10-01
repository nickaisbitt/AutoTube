import { describe, it, expect } from 'vitest';
import {
  MOCK_SCRIPT_SEGMENTS,
  OPENROUTER_MOCK_ROUTING_RULES,
  resolveOpenRouterMockKind,
  resolveOpenRouterMockContent,
} from './openRouterMock.mjs';

/** Minimal fragments copied from production system/user prompts. */
const PROMPTS = {
  scriptGenerate: {
    messages: [
      {
        role: 'system',
        content: `You are a world-class YouTube scriptwriter who creates viral, high-retention commentary videos.
Return ONLY a valid JSON array of segments. No markdown, no preamble.`,
      },
      {
        role: 'user',
        content: 'Write a 3-minute video script about: "AI in healthcare"',
      },
    ],
  },
  scriptPolish: {
    messages: [
      {
        role: 'system',
        content:
          "You are a ruthless YouTube script editor. Your job is to POLISH this script — tighten every sentence.",
      },
      { role: 'user', content: 'Here is the script for a video about "AI":\n[{"type":"intro","title":"Hook"}]' },
    ],
  },
  scriptTrim: {
    messages: [
      {
        role: 'system',
        content:
          'You are a ruthless script trimmer. Remove every sentence that does not advance the story.',
      },
      { role: 'user', content: 'TRIM this script.' },
    ],
  },
  scriptSpecificity: {
    messages: [
      {
        role: 'user',
        content:
          'The following script about "AI" has specificity issues that must be fixed:\n[]\nReturn ONLY a valid JSON array of the fixed segments.',
      },
    ],
  },
  titleVariants: {
    messages: [
      {
        role: 'system',
        content:
          'You are a YouTube title optimization expert. Generate exactly 3 title variants for the given video script. Return ONLY a JSON object with keys "direct", "curiosityGap", "emotionalUrgent".',
      },
      { role: 'user', content: 'Generate 3 YouTube-optimized title variants for this video.' },
    ],
  },
  titleArray: {
    messages: [
      {
        role: 'system',
        content:
          'You are a YouTube title optimization expert. Generate exactly 3 title options for the given video script. Return ONLY a JSON array of 3 strings.',
      },
      { role: 'user', content: 'Generate 3 YouTube-optimized title options.' },
    ],
  },
  pinnedComments: {
    messages: [
      {
        role: 'system',
        content:
          'You are a YouTube engagement strategist. Generate 3 pinned comment options. Return ONLY a JSON array.',
      },
      {
        role: 'user',
        content:
          'Generate exactly 3 pinned comment options with type "question_prompt", "controversial_take", "what_did_i_miss".',
      },
    ],
  },
  hashtags: {
    messages: [
      {
        role: 'system',
        content:
          'You are a YouTube SEO expert. Generate exactly 3-5 hashtags for a video. Return ONLY a JSON array of strings.',
      },
      { role: 'user', content: 'Generate 3-5 YouTube hashtags for a video about "AI".' },
    ],
  },
  seriesMetadata: {
    messages: [
      {
        role: 'system',
        content:
          'You are a YouTube playlist strategist. Generate series metadata for this video episode. Return ONLY a JSON object.',
      },
      { role: 'user', content: 'Generate series metadata for this episode.' },
    ],
  },
  blindReview: {
    messages: [
      {
        role: 'system',
        content: `You are a ruthlessly honest YouTube video quality reviewer with expertise in retention.
Return ONLY a JSON object:
{ "scores": { "visualQuality": N, "pacing": N, "narrativeClarity": N, "thumbnailEffectiveness": N, "overallProductionValue": N } }`,
      },
      { role: 'user', content: 'Here are key frames extracted from the video:\nScript:\nSample narration.' },
    ],
  },
  visualDirector: {
    messages: [
      {
        role: 'user',
        content: `You are a professional Creative Director and photo researcher.
Plan TWO DISTINCT SHOTS for this specific video segment.
Return JSON with primaryShot and secondaryShot.`,
      },
    ],
  },
};

describe('openRouterMock routing', () => {
  it('documents every routing kind', () => {
    const kinds = OPENROUTER_MOCK_ROUTING_RULES.map((r) => r.kind);
    expect(kinds).toContain('blind-review');
    expect(kinds).toContain('title-variants');
    expect(kinds).toContain('title-array');
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it.each([
    ['script-segments', PROMPTS.scriptGenerate],
    ['script-polish', PROMPTS.scriptPolish],
    ['script-trim', PROMPTS.scriptTrim],
    ['script-specificity', PROMPTS.scriptSpecificity],
    ['title-variants', PROMPTS.titleVariants],
    ['title-array', PROMPTS.titleArray],
    ['pinned-comments', PROMPTS.pinnedComments],
    ['hashtags', PROMPTS.hashtags],
    ['series-metadata', PROMPTS.seriesMetadata],
    ['blind-review', PROMPTS.blindReview],
    ['visual-director', PROMPTS.visualDirector],
  ])('routes %s prompts correctly', (expectedKind, prompt) => {
    expect(resolveOpenRouterMockKind(prompt.messages)).toBe(expectedKind);
  });

  it('does not route script generation to blind-review (no "blind review" substring required)', () => {
    expect(resolveOpenRouterMockKind(PROMPTS.scriptGenerate.messages)).not.toBe('blind-review');
  });

  it('does not route script generation to title variants despite segment title fields', () => {
    const withSegmentTitles = {
      messages: [
        ...PROMPTS.scriptGenerate.messages,
        {
          role: 'user',
          content: JSON.stringify(MOCK_SCRIPT_SEGMENTS),
        },
      ],
    };
    expect(resolveOpenRouterMockKind(withSegmentTitles.messages)).toBe('script-segments');
    expect(resolveOpenRouterMockKind(withSegmentTitles.messages)).not.toBe('title-variants');
    expect(resolveOpenRouterMockKind(withSegmentTitles.messages)).not.toBe('title-array');
  });

  it('does not route script generation to visual-director via visualNote/concept tokens', () => {
    const messages = [
      ...PROMPTS.scriptGenerate.messages,
      {
        role: 'user',
        content: `Segment visual notes and B-roll concepts: ${MOCK_SCRIPT_SEGMENTS.map((s) => s.visualNote).join('; ')}`,
      },
    ];
    const text = messages.map((m) => m.content).join('\n').toLowerCase();
    expect(text).toContain('visual');
    expect(text).toContain('concept');
    expect(resolveOpenRouterMockKind(messages)).not.toBe('visual-director');
  });

  it('does not route blind review when only thumbnailEffectiveness appears without reviewer prompt', () => {
    expect(
      resolveOpenRouterMockKind([
        { role: 'user', content: 'Score thumbnailEffectiveness for this draft script segment title.' },
      ]),
    ).not.toBe('blind-review');
  });

  it('returns distinct JSON shapes for title variants vs title array', () => {
    const variants = JSON.parse(resolveOpenRouterMockContent(PROMPTS.titleVariants.messages));
    const array = JSON.parse(resolveOpenRouterMockContent(PROMPTS.titleArray.messages));

    expect(variants).toHaveProperty('direct');
    expect(variants).toHaveProperty('curiosityGap');
    expect(Array.isArray(array)).toBe(true);
    expect(array.length).toBe(3);
  });

  it('returns blind-review scores object, not script segments', () => {
    const parsed = JSON.parse(resolveOpenRouterMockContent(PROMPTS.blindReview.messages));
    expect(parsed.scores.thumbnailEffectiveness).toBe(8);
    expect(Array.isArray(parsed)).toBe(false);
  });

  it('returns visual-director plan with primaryShot, not legacy beat/concepts shape', () => {
    const parsed = JSON.parse(resolveOpenRouterMockContent(PROMPTS.visualDirector.messages));
    expect(parsed.primaryShot).toBeDefined();
    expect(parsed.primaryShot.concept).toBeTruthy();
    expect(parsed.beat).toBeUndefined();
  });
});
