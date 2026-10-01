/**
 * Project Format Versioning & Migration System
 *
 * Provides an extensible migration registry that brings older VideoProject
 * objects up to the current schema version. Each migration transforms from
 * version N to N+1. Adding a new migration just requires calling
 * `registerMigration(N, fn)` — existing migrations are never modified.
 */

import { logger } from './logger';

export const CURRENT_PROJECT_VERSION = 1;

type MigrationFn = (project: Record<string, unknown>) => Record<string, unknown>;

const migrations = new Map<number, MigrationFn>();

/**
 * Register a migration function that transforms a project from `fromVersion` to `fromVersion + 1`.
 */
export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  migrations.set(fromVersion, fn);
}

/**
 * Apply all necessary migrations to bring a project object up to CURRENT_PROJECT_VERSION.
 *
 * - If the project has no `version` field, it's treated as version 0.
 * - If the project's version is higher than current, a warning is logged and
 *   the project is returned as-is (forward compatibility).
 * - Each migration is applied sequentially: v0→v1, v1→v2, etc.
 * - If a migration function throws, the error is caught, a warning is logged,
 *   and the project is returned at its current version.
 */
export function migrateProject(project: Record<string, unknown>): Record<string, unknown> {
  let version = typeof project.version === 'number' ? project.version : 0;
  let current = { ...project };

  if (version > CURRENT_PROJECT_VERSION) {
    logger.warn(
      'ProjectMigrations',
      `Project version ${version} is newer than current ${CURRENT_PROJECT_VERSION} — loading as-is`,
    );
    return current;
  }

  while (version < CURRENT_PROJECT_VERSION) {
    const migrationFn = migrations.get(version);
    if (migrationFn) {
      try {
        current = migrationFn(current);
      } catch (err) {
        logger.warn(
          'ProjectMigrations',
          `Migration from v${version} to v${version + 1} failed — stopping at v${version}`,
          err,
        );
        return current;
      }
    }
    version++;
    current.version = version;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Initial migration: v0 → v1 (add version field — baseline schema)
// ---------------------------------------------------------------------------
registerMigration(0, (project) => ({
  ...project,
  version: 1,
}));
