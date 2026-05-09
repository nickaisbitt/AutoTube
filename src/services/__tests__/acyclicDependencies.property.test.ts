/**
 * Property 5: Acyclic domain dependency graph
 * Feature: codebase-refactor, Property 5: Acyclic domain dependency graph
 * **Validates: Requirements 7.3**
 *
 * For any pair of domain directories (A, B), if A imports from B (directly or
 * transitively), then B SHALL NOT import from A (directly or transitively).
 * In other words, the dependency graph between domains is a DAG.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Domain directories that must form an acyclic dependency graph */
const DOMAIN_DIRS = ['renderer', 'llm', 'tts', 'sourceProviders'] as const;
type DomainName = (typeof DOMAIN_DIRS)[number];

const SERVICES_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .ts/.tsx files in a directory
 * (excluding __tests__ and .test. files)
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
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.test.')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract import paths from a TypeScript file's content.
 * Matches `import ... from '...'` and `export ... from '...'` patterns.
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
 * Determine which domain (if any) an import path targets, relative to the
 * importing file. Returns the domain name if the import resolves into a
 * domain directory, or null otherwise.
 */
function getTargetDomain(importPath: string, importingFile: string): DomainName | null {
  // Only consider relative imports
  if (!importPath.startsWith('.')) return null;

  const importingDir = path.dirname(importingFile);
  const resolvedPath = path.resolve(importingDir, importPath);

  for (const domain of DOMAIN_DIRS) {
    const domainDir = path.join(SERVICES_ROOT, domain);
    if (resolvedPath.startsWith(domainDir + path.sep) || resolvedPath === domainDir) {
      return domain;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build the domain dependency graph
// ---------------------------------------------------------------------------

type DependencyGraph = Map<DomainName, Set<DomainName>>;

/**
 * Build a directed graph of domain dependencies by scanning all source files
 * in each domain directory and extracting cross-domain imports.
 *
 * An edge A → B means "domain A imports from domain B".
 */
function buildDomainDependencyGraph(): DependencyGraph {
  const graph: DependencyGraph = new Map();

  // Initialize all domains with empty dependency sets
  for (const domain of DOMAIN_DIRS) {
    graph.set(domain, new Set());
  }

  for (const domain of DOMAIN_DIRS) {
    const domainDir = path.join(SERVICES_ROOT, domain);
    const files = collectTsFiles(domainDir);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const importPaths = extractImportPaths(content);

      for (const importPath of importPaths) {
        const targetDomain = getTargetDomain(importPath, file);
        // Only record cross-domain dependencies (not self-imports)
        if (targetDomain && targetDomain !== domain) {
          graph.get(domain)!.add(targetDomain);
        }
      }
    }
  }

  return graph;
}

/**
 * Check if domain `from` can reach domain `to` via transitive dependencies.
 * Uses depth-first search on the dependency graph.
 */
function canReach(graph: DependencyGraph, from: DomainName, to: DomainName): boolean {
  const visited = new Set<DomainName>();
  const stack: DomainName[] = [from];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = graph.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          stack.push(dep);
        }
      }
    }
  }

  return false;
}

/**
 * Detect all cycles in the dependency graph using DFS.
 * Returns an array of cycle descriptions (empty if acyclic).
 */
function detectCycles(graph: DependencyGraph): string[] {
  const cycles: string[] = [];

  for (const domainA of DOMAIN_DIRS) {
    const depsA = graph.get(domainA);
    if (!depsA) continue;

    for (const domainB of depsA) {
      // If A depends on B, check if B can reach A (which would form a cycle)
      if (canReach(graph, domainB, domainA)) {
        cycles.push(`${domainA} → ${domainB} → ... → ${domainA}`);
      }
    }
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe('Feature: codebase-refactor, Property 5: Acyclic domain dependency graph', () => {
  const graph = buildDomainDependencyGraph();

  it('domain dependency graph is built correctly (sanity check)', () => {
    // Verify we have entries for all domains
    expect(graph.size).toBe(DOMAIN_DIRS.length);
    for (const domain of DOMAIN_DIRS) {
      expect(graph.has(domain)).toBe(true);
    }
  });

  it('for any pair of domains (A, B), if A depends on B then B does not depend on A', () => {
    // Generate all possible ordered pairs of distinct domains
    const domainPairs: Array<[DomainName, DomainName]> = [];
    for (const a of DOMAIN_DIRS) {
      for (const b of DOMAIN_DIRS) {
        if (a !== b) {
          domainPairs.push([a, b]);
        }
      }
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...domainPairs),
        ([domainA, domainB]) => {
          // If A can reach B (directly or transitively), then B must NOT reach A
          if (canReach(graph, domainA, domainB)) {
            const bReachesA = canReach(graph, domainB, domainA);
            expect(bReachesA).toBe(false);
          }
          // Property holds vacuously if A does not depend on B
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no cycles exist in the domain dependency graph (DFS verification)', () => {
    const cycles = detectCycles(graph);

    if (cycles.length > 0) {
      expect.fail(
        `Found ${cycles.length} cycle(s) in domain dependency graph:\n` +
          cycles.map((c) => `  ${c}`).join('\n'),
      );
    }

    expect(cycles).toHaveLength(0);
  });

  it('dependency graph is a valid DAG (topological sort succeeds)', () => {
    // Kahn's algorithm for topological sort — if it processes all nodes,
    // the graph is acyclic
    const inDegree = new Map<DomainName, number>();
    for (const domain of DOMAIN_DIRS) {
      inDegree.set(domain, 0);
    }

    // Count in-degrees
    for (const [_domain, deps] of graph) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // Start with nodes that have no incoming edges
    const queue: DomainName[] = [];
    for (const [domain, degree] of inDegree) {
      if (degree === 0) {
        queue.push(domain);
      }
    }

    const sorted: DomainName[] = [];
    const workingInDegree = new Map(inDegree);

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const deps = graph.get(current);
      if (deps) {
        for (const dep of deps) {
          const newDegree = workingInDegree.get(dep)! - 1;
          workingInDegree.set(dep, newDegree);
          if (newDegree === 0) {
            queue.push(dep);
          }
        }
      }
    }

    // If topological sort processed all nodes, the graph is acyclic
    expect(sorted.length).toBe(DOMAIN_DIRS.length);
  });

  it('random domain pair property: no bidirectional transitive dependency', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: DOMAIN_DIRS.length - 1 }),
        fc.integer({ min: 0, max: DOMAIN_DIRS.length - 1 }),
        (indexA, indexB) => {
          // Skip same-domain pairs
          if (indexA === indexB) return;

          const domainA = DOMAIN_DIRS[indexA];
          const domainB = DOMAIN_DIRS[indexB];

          const aReachesB = canReach(graph, domainA, domainB);
          const bReachesA = canReach(graph, domainB, domainA);

          // Both cannot be true simultaneously (that would be a cycle)
          expect(aReachesB && bReachesA).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
