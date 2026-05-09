import { createHash, gzip } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

const BUDGETS = {
  maxGzippedBundleKB: 500,
  maxChunkKB: 200,
  maxDependencies: 100,
};

function getGzippedSize(filePath: string): Promise<number> {
  return new Promise((res, rej) => {
    const data = readFileSync(filePath);
    createGzip().once('data', chunk => {
      res(chunk.length);
    }).once('error', rej).end(data);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

async function checkBudgets(): Promise<boolean> {
  let passed = true;
  const issues: string[] = [];

  if (!readdirSync(distDir, { withFileTypes: true }).length) {
    console.error('\n[perf-budget] dist/ is empty. Run `npm run build` first.\n');
    process.exit(1);
  }

  // Check individual JS chunks
  const jsFiles: { name: string; size: number; gzipped: number }[] = [];
  let totalSize = 0;

  function walkDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const stat = statSync(fullPath);
        jsFiles.push({ name: entry.name, size: stat.size, gzipped: 0 });
        totalSize += stat.size;
      }
    }
  }

  walkDir(distDir);

  // Compute gzipped sizes
  for (const file of jsFiles) {
    const fullPath = join(distDir, file.name);
    try {
      const gzipped = await getGzippedSize(fullPath);
      file.gzipped = gzipped;
    } catch {
      file.gzipped = file.size;
    }
  }

  // Budget: largest JS chunk
  const largestChunk = jsFiles.reduce((max, f) => Math.max(max, f.size), 0);
  if (largestChunk > BUDGETS.maxChunkKB * 1024) {
    issues.push(
      `LARGEST CHUNK: ${formatBytes(largestChunk)} exceeds budget of ${BUDGETS.maxChunkKB}KB`
    );
    passed = false;
  }

  // Budget: total gzipped bundle
  const totalGzipped = jsFiles.reduce((sum, f) => sum + f.gzipped, 0);
  if (totalGzipped > BUDGETS.maxGzippedBundleKB * 1024) {
    issues.push(
      `TOTAL GZIPPED: ${formatBytes(totalGzipped)} exceeds budget of ${BUDGETS.maxGzippedBundleKB}KB`
    );
    passed = false;
  }

  // Budget: dependency count
  const pkgPath = resolve(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const depCount = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length;
  if (depCount > BUDGETS.maxDependencies) {
    issues.push(
      `DEPENDENCIES: ${depCount} exceeds budget of ${BUDGETS.maxDependencies}`
    );
    passed = false;
  }

  // Print report
  console.log('\n=== Performance Budget Report ===\n');
  console.log(`Total JS files: ${jsFiles.length}`);
  console.log(`Total raw size: ${formatBytes(totalSize)}`);
  console.log(`Total gzipped:  ${formatBytes(totalGzipped)} / ${BUDGETS.maxGzippedBundleKB}KB budget`);
  console.log(`Largest chunk:  ${formatBytes(largestChunk)} / ${BUDGETS.maxChunkKB}KB budget`);
  console.log(`Dependencies:   ${depCount} / ${BUDGETS.maxDependencies} budget`);

  if (jsFiles.length > 0) {
    console.log('\nTop 5 largest chunks:');
    jsFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .forEach(f => {
        console.log(`  ${f.name}: ${formatBytes(f.size)} (${formatBytes(f.gzipped)} gzipped)`);
      });
  }

  if (issues.length > 0) {
    console.log('\nBUDGET VIOLATIONS:');
    for (const issue of issues) {
      console.log(`  FAIL: ${issue}`);
    }
    console.log('');
  } else {
    console.log('\nAll budgets passed.\n');
  }

  return passed;
}

checkBudgets()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(err => {
    console.error('[perf-budget] Error:', err);
    process.exit(1);
  });
