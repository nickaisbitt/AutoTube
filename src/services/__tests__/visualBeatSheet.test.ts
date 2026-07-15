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

  it('feature flag defaults off', () => {
    delete process.env.AUTOTUBE_VISUAL_BEATS;
    expect(visualBeatsEnabled()).toBe(false);
    process.env.AUTOTUBE_VISUAL_BEATS = '1';
    expect(visualBeatsEnabled()).toBe(true);
    delete process.env.AUTOTUBE_VISUAL_BEATS;
  });
});
