import { describe, expect, it } from 'vitest';
import {
  buildVisualBeatSheetFromScript,
  validateVisualBeatSheet,
  queriesFromBeatSheet,
  visualBeatsEnabled,
} from '../visualBeatSheet';
import type { ScriptSegment } from '../../types/script';

function seg(partial: Partial<ScriptSegment> & { id: string; narration: string }): ScriptSegment {
  return {
    type: 'section',
    title: 'Section',
    visualNote: '',
    duration: 12,
    ...partial,
  } as ScriptSegment;
}

describe('visualBeatSheet', () => {
  it('builds a bounded beat sheet with evidence and roles', () => {
    const script: ScriptSegment[] = [
      seg({
        id: 's1',
        type: 'intro',
        title: 'Hook',
        narration:
          'Parents in Oakridge got a midnight email. Their children’s counseling notes were already for sale.',
        visualNote: 'Parent reading phone at kitchen table at night',
      }),
      seg({
        id: 's2',
        title: 'Evidence',
        narration:
          'The ransomware gang posted sample records from three school districts. Superintendents denied the breach for a week.',
        visualNote: 'School district office corridor with locked records room',
      }),
      seg({
        id: 's3',
        title: 'Mechanism',
        narration:
          'Attackers entered through a forgotten VPN appliance. Student mental-health portals shared one password store.',
      }),
      seg({
        id: 's4',
        type: 'outro',
        title: 'Action',
        narration:
          'Ask your district whether counseling files sit behind multi-factor access. Demand a written incident timeline.',
      }),
    ];

    const sheet = buildVisualBeatSheetFromScript(
      'How school districts lost student mental-health records to ransomware',
      script,
    );
    expect(sheet.beats.length).toBeGreaterThanOrEqual(4);
    expect(sheet.beats.length).toBeLessThanOrEqual(24);
    expect(sheet.budget.used).toBe(sheet.beats.length);
    const v = validateVisualBeatSheet(sheet);
    expect(v.ok).toBe(true);
    expect(sheet.beats.some((b) => b.evidence.startsWith('visualNote:'))).toBe(true);
    expect(sheet.beats.some((b) => b.role === 'hook' || b.role === 'human_story')).toBe(true);
    expect(queriesFromBeatSheet(sheet, 's1').length).toBeGreaterThan(0);
  });

  it('feature flag defaults on (opt-out with =0)', () => {
    delete process.env.AUTOTUBE_VISUAL_BEATS;
    expect(visualBeatsEnabled()).toBe(true);
    process.env.AUTOTUBE_VISUAL_BEATS = '0';
    expect(visualBeatsEnabled()).toBe(false);
    process.env.AUTOTUBE_VISUAL_BEATS = '1';
    expect(visualBeatsEnabled()).toBe(true);
    delete process.env.AUTOTUBE_VISUAL_BEATS;
  });

  it('returns a validation failure instead of throwing for a missing sheet', () => {
    expect(validateVisualBeatSheet(undefined)).toEqual({ ok: false, errors: ['no-beats'] });
  });

  it('builds one valid beat when the maximum budget is one', () => {
    const sheet = buildVisualBeatSheetFromScript(
      'school ransomware',
      [
        seg({
          id: 's1',
          narration: 'Parents received a warning email. District servers failed overnight.',
        }),
      ],
      { min: 1, max: 1 },
    );

    expect(sheet.beats).toHaveLength(1);
    expect(sheet.beats[0].id).toBe('beat-1');
    expect(sheet.beats[0].searchableSubject).toBeTruthy();
    expect(validateVisualBeatSheet(sheet).ok).toBe(true);
  });

  describe('queriesFromBeatSheet — person-name filtering for housing/healthcare', () => {
    function makeSheet(topic: string, subjects: string[]): Parameters<typeof queriesFromBeatSheet>[0] {
      return {
        topic,
        budget: { min: 1, max: subjects.length, used: subjects.length },
        warnings: [],
        beats: subjects.map((s, i) => ({
          id: `beat-${i + 1}`,
          segmentId: 's1',
          role: 'evidence' as const,
          intent: 'show evidence',
          searchableSubject: s,
          narrationExcerpt: `excerpt ${i}`,
          evidence: 'narration',
          mustShow: false,
        })),
      };
    }

    it('replaces person-name-only subjects with topical fallbacks on housing topics', () => {
      const sheet = makeSheet(
        'The housing crash they said would never happen',
        ['Sarah Jenkins', 'Katherine Jenkins', 'apartment eviction notice'],
      );
      const queries = queriesFromBeatSheet(sheet);
      // Person names are replaced
      expect(queries.some((q) => /sarah jenkins/i.test(q))).toBe(false);
      expect(queries.some((q) => /katherine jenkins/i.test(q))).toBe(false);
      // Replacement is a housing-topical fallback
      expect(queries.some((q) => /eviction|tenant|apartment|foreclosure|rent/i.test(q))).toBe(true);
      // Non-name subject passes through unchanged
      expect(queries).toContain('apartment eviction notice');
    });

    it('replaces person-name-only subjects with topical fallbacks on healthcare topics', () => {
      const sheet = makeSheet(
        'Why AI will change healthcare forever',
        ['Robert Samadi', 'doctor patient face clinical'],
      );
      const queries = queriesFromBeatSheet(sheet);
      expect(queries.some((q) => /robert samadi/i.test(q))).toBe(false);
      expect(queries.some((q) => /doctor|radiolog|hospital|clinic|nurse|mri/i.test(q))).toBe(true);
      expect(queries).toContain('doctor patient face clinical');
    });

    it('does NOT replace person names on non-housing/non-healthcare topics', () => {
      const sheet = makeSheet(
        'How Elon Musk changed the space industry',
        ['Elon Musk', 'SpaceX rocket launch'],
      );
      const queries = queriesFromBeatSheet(sheet);
      expect(queries).toContain('Elon Musk');
    });

    it('does not replace 4+ word subjects even if they look like names', () => {
      const sheet = makeSheet(
        'The housing crash they said would never happen',
        ['Sarah Jenkins Real Estate Agent'],
      );
      const queries = queriesFromBeatSheet(sheet);
      // 4-word subject is not a bare name — passes through
      expect(queries).toContain('Sarah Jenkins Real Estate Agent');
    });
  });
});
