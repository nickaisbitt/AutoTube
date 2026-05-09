/**
 * Load tester for /api/server-render endpoint.
 * Spawns N concurrent render requests and reports latency percentiles.
 *
 * Usage:
 *   node scripts/load-test.mjs              # 100 concurrent, default URL
 *   node scripts/load-test.mjs --concurrency 50 --url http://localhost:3000
 */

const DEFAULT_CONCURRENCY = 100;
const DEFAULT_URL = "http://localhost:5173";

function parseArgs() {
  const args = process.argv.slice(2);
  let concurrency = DEFAULT_CONCURRENCY;
  let baseUrl = DEFAULT_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--url" && args[i + 1]) {
      baseUrl = args[i + 1];
      i++;
    }
  }

  return { concurrency, baseUrl };
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runLoadTest() {
  const { concurrency, baseUrl } = parseArgs();
  const url = `${baseUrl}/api/server-render`;

  console.log(`\n🚀 Load Test: ${concurrency} concurrent requests to ${url}\n`);

  const results = [];
  const startTime = Date.now();

  const promises = Array.from({ length: concurrency }, async (_, i) => {
    const reqStart = Date.now();
    let status = 0;
    let error = null;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
      });
      status = res.status;

      // Consume the body (SSE stream) — just drain it
      try {
        await res.text();
      } catch {
        // SSE stream may abort, that's fine
      }
    } catch (e) {
      error = e.message;
    }

    const duration = Date.now() - reqStart;
    results.push({ index: i, duration, status, error });
  });

  await Promise.allSettled(promises);

  const totalDuration = Date.now() - startTime;
  const durations = results.map((r) => r.duration).sort((a, b) => a - b);
  const successes = results.filter((r) => r.status >= 200 && r.status < 400);
  const failures = results.filter(
    (r) => r.status >= 400 || r.error !== null,
  );

  console.log("─".repeat(50));
  console.log("RESULTS");
  console.log("─".repeat(50));
  console.log(`Total requests:     ${results.length}`);
  console.log(`Successful:         ${successes.length}`);
  console.log(`Failed:             ${failures.length}`);
  console.log(`Success rate:       ${((successes.length / results.length) * 100).toFixed(1)}%`);
  console.log(`Total time:         ${totalDuration}ms`);
  console.log(`Requests/sec:       ${((results.length / totalDuration) * 1000).toFixed(1)}`);
  console.log("");
  console.log("Latency Percentiles:");
  console.log(`  P50:  ${percentile(durations, 50)}ms`);
  console.log(`  P95:  ${percentile(durations, 95)}ms`);
  console.log(`  P99:  ${percentile(durations, 99)}ms`);
  console.log(`  Min:  ${durations[0]}ms`);
  console.log(`  Max:  ${durations[durations.length - 1]}ms`);
  console.log(`  Avg:  ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0)}ms`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failure breakdown:");
    const statusCodes = {};
    const errorTypes = {};
    for (const f of failures) {
      if (f.error) {
        errorTypes[f.error] = (errorTypes[f.error] || 0) + 1;
      } else {
        statusCodes[f.status] = (statusCodes[f.status] || 0) + 1;
      }
    }
    for (const [code, count] of Object.entries(statusCodes)) {
      console.log(`  HTTP ${code}: ${count}`);
    }
    for (const [err, count] of Object.entries(errorTypes)) {
      console.log(`  ${err}: ${count}`);
    }
  }

  console.log("─".repeat(50));
  console.log("");

  // Exit with error code if > 10% failures
  const failureRate = failures.length / results.length;
  if (failureRate > 0.1) {
    console.error(`❌ Failure rate ${failureRate.toFixed(1)}% exceeds 10% threshold`);
    process.exit(1);
  } else {
    console.log("✅ Load test passed");
  }
}

runLoadTest().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
