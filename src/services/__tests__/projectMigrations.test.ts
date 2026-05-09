import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { migrateProject, CURRENT_PROJECT_VERSION, registerMigration } from '../projectMigrations';

describe('Property 4: Migration system brings any older version to current', () => {
  it('migrates version 0 projects to current version', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          title: fc.string(),
          topic: fc.string(),
        }),
        (projectData) => {
          const v0Project = { ...projectData };
          const migrated = migrateProject(v0Project);
          expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('preserves existing fields after migration', () => {
    const v0Project = {
      id: 'test-proj',
      title: 'Test Title',
      topic: 'Test Topic',
      style: 'business_insider',
    };
    const migrated = migrateProject(v0Project);
    expect(migrated.id).toBe('test-proj');
    expect(migrated.title).toBe('Test Title');
    expect(migrated.topic).toBe('Test Topic');
  });
});

describe('migrateProject unit tests', () => {
  it('v0 → v1 migration adds version field', () => {
    const v0 = { id: 'proj-1', title: 'Test' };
    const result = migrateProject(v0);
    expect(result.version).toBe(1);
  });

  it('project with no version field is treated as v0', () => {
    const project = { id: 'proj-2', title: 'Test' };
    const result = migrateProject(project);
    expect(result.version).toBe(1);
  });

  it('project with version > current logs warning and loads as-is', () => {
    const future = { version: 999, id: 'proj-3', title: 'Test' };
    const result = migrateProject(future);
    expect(result.version).toBe(999);
  });

  it('migration preserves all existing fields', () => {
    const v0 = {
      id: 'proj-4',
      title: 'Test Project',
      topic: 'Test Topic',
      style: 'business_insider',
      script: [{ id: 'seg-1', type: 'intro', title: 'Intro', narration: 'Hello', visualNote: 'Show this', duration: 10 }],
    };
    const result = migrateProject(v0);
    expect(result.id).toBe('proj-4');
    expect(result.title).toBe('Test Project');
    expect(result.script).toEqual(v0.script);
  });
});