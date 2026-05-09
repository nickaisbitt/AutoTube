import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getProjectTempPath } from '../projectPaths';

describe('Property 3: Project-ID-scoped temp paths are unique and well-formed', () => {
  it('distinct project IDs produce distinct paths', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id1, id2) => {
          if (id1 !== id2) {
            expect(getProjectTempPath(id1)).not.toBe(getProjectTempPath(id2));
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('paths match the expected pattern', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (id) => {
        const path = getProjectTempPath(id);
        expect(path).toBe(`/tmp/autotube-project-${id}.json`);
      }),
      { numRuns: 50 },
    );
  });

  it('handles project IDs with special characters', () => {
    expect(getProjectTempPath('abc-123-xyz')).toBe('/tmp/autotube-project-abc-123-xyz.json');
    expect(getProjectTempPath('proj_42')).toBe('/tmp/autotube-project-proj_42.json');
  });
});