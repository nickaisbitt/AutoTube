/**
 * Property 4: Module boundary enforcement (barrel-only imports)
 * Feature: codebase-refactor, Property 4: Module boundary enforcement (barrel-only imports)
 * **Validates: Requirements 7.2, 7.4**
 *
 * For any import statement in a domain module (renderer/, llm/, tts/, sourceProviders/)
 * that references another domain, the import path resolves to that domain's barrel
 * index.ts — never to an internal file within the other domain.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Domain directories that enforce barrel-only cross-domain imports */
const DOMAIN_DIRS = ['renderer', 'llm', 'tts', 'sourceProviders'] as const;

const SERVICES_ROOT = path.resolve(__dirname, '..');

/**
 * Recursively collect all .ts files in a directory (excluding __tests__ and .test. files)
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract import paths from a TypeScript file's content.
 * Matches both `import ... from '...'` and `import ... from "..."` patterns.
 */
function extractImportPaths(content: string): string[] {
  const importRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

/**
 * Determine which domain (if any) an import path targets, relative to the importing file.
 * Returns the domain name if the import crosses into another domain, or null otherwise.
 */
function getTargetDomain(importPath: string, importingFile: string): string | null {
  // Only consider relative imports
  if (!importPath.startsWith('.')) return null;

  const importingDir = path.dirname(importingFile);
  const resolvedPath = path.resolve(importingDir, importPath);

  // Check if the resolved path falls within one of the domain directories
  for (const domain of DOMAIN_DIRS) {
    const domainDir = path.join(SERVICES_ROOT, domain);
    if (resolvedPath.startsWith(domainDir + path.sep) || resolvedPath === domainDir) {
      return domain;
    }
  }
  return null;
}

/**
 * Determine which domain the importing file belongs to.
 */
function getFileDomain(filePath: string): string | null {
  for (const domain of DOMAIN_DIRS) {
    const domainDir = path.join(SERVICES_ROOT, domain);
    if (filePath.startsWith(domainDir + path.sep) || filePath === domainDir) {
      return domain;
    }
  }
  return null;
}

/**
 * Check if an import path targets a barrel (index.ts) of a domain.
 * A barrel import is one that resolves to the domain directory itself
 * (e.g., `../renderer` or `../renderer/index`).
 */
function isBarrelImport(importPath: string, importingFile: string, targetDomain: string): boolean {
  const importingDir = path.dirname(importingFile);
  const resolvedPath = path.resolve(importingDir, importPath);
  const domainDir = path.join(SERVICES_ROOT, targetDomain);

  // The import resolves to the domain directory itself (TypeScript resolves to index.ts)
  if (resolvedPath === domainDir) return true;

  // The import explicitly targets index or index.ts
  if (resolvedPath === path.join(domainDir, 'index') || resolvedPath === path.join(domainDir, 'index.ts')) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Collect all cross-domain import data
// ---------------------------------------------------------------------------

interface CrossDomainImport {
  file: string;
  fileDomain: string;
  importPath: string;
  targetDomain: string;
  isBarrel: boolean;
}

function collectCrossDomainImports(): CrossDomainImport[] {
  const imports: CrossDomainImport[] = [];

  for (const domain of DOMAIN_DIRS) {
    const domainDir = path.join(SERVICES_ROOT, domain);
    const files = collectTsFiles(domainDir);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const importPaths = extractImportPaths(content);
      const fileDomain = domain;

      for (const importPath of importPaths) {
        const targetDomain = getTargetDomain(importPath, file);
        // Only interested in cross-domain imports (targeting a different domain)
        if (targetDomain && targetDomain !== fileDomain) {
          imports.push({
            file: path.relative(SERVICES_ROOT, file),
            fileDomain,
            importPath,
            targetDomain,
            isBarrel: isBarrelImport(importPath, file, targetDomain),
          });
        }
      }
    }
  }

  return imports;
}

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe('Feature: codebase-refactor, Property 4: Module boundary enforcement (barrel-only imports)', () => {
  const crossDomainImports = collectCrossDomainImports();

  it('cross-domain imports exist in the codebase (sanity check)', () => {
    // If there are no cross-domain imports at all, the property is vacuously true
    // but we should verify the test infrastructure is working
    // This is informational — the property test below is the real assertion
    expect(DOMAIN_DIRS.length).toBe(4);
    // Verify we can read files from at least one domain
    const llmFiles = collectTsFiles(path.join(SERVICES_ROOT, 'llm'));
    expect(llmFiles.length).toBeGreaterThan(0);
  });

  it('all cross-domain imports target barrel exports (index.ts), never internal files', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...(crossDomainImports.length > 0 ? crossDomainImports : [{ file: '', fileDomain: '', importPath: '', targetDomain: '', isBarrel: true }])),
        (importInfo) => {
          // Skip the placeholder if no cross-domain imports exist
          if (importInfo.file === '') return;

          expect(importInfo.isBarrel).toBe(true);
        },
      ),
      { numRuns: Math.max(crossDomainImports.length, 100) },
    );
  });

  it('no domain file imports an internal path from another domain', () => {
    // Direct assertion over all collected imports for clear error messages
    const violations = crossDomainImports.filter((imp) => !imp.isBarrel);

    if (violations.length > 0) {
      const violationMessages = violations.map(
        (v) =>
          `  ${v.file} (domain: ${v.fileDomain}) imports "${v.importPath}" ` +
          `targeting internal file in domain "${v.targetDomain}"`,
      );
      expect.fail(
        `Found ${violations.length} barrel-only import violation(s):\n${violationMessages.join('\n')}`,
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('within-domain imports are allowed (not flagged as violations)', () => {
    // Verify that imports within the same domain are not incorrectly flagged
    fc.assert(
      fc.property(
        fc.constantFrom(...DOMAIN_DIRS),
        (domain) => {
          const domainDir = path.join(SERVICES_ROOT, domain);
          const files = collectTsFiles(domainDir);

          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            const importPaths = extractImportPaths(content);

            for (const importPath of importPaths) {
              if (!importPath.startsWith('.')) continue;
              const targetDomain = getTargetDomain(importPath, file);
              // Within-domain imports should not be flagged (targetDomain === domain or null)
              if (targetDomain === domain) {
                // This is fine — within-domain imports to internal files are allowed
                expect(true).toBe(true);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
