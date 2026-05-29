#!/usr/bin/env node

const BASE_URL = 'http://localhost:5173';
const TEST_QUERY = 'Silicon Valley Bank collapse';

const results = [];

async function testSource(name, fn) {
  const start = Date.now();
  try {
    const data = await fn();
    const duration = Date.now() - start;
    const count = Array.isArray(data) ? data.length : (data?.images?.length || 0);
    const sample = Array.isArray(data) ? data[0] : data?.images?.[0];
    
    results.push({
      name,
      status: '✓',
      count,
      duration,
      sample: sample ? {
        url: sample.url?.substring(0, 80),
        width: sample.width,
        height: sample.height,
        source: sample.source,
      } : null,
    });
  } catch (err) {
    const duration = Date.now() - start;
    results.push({
      name,
      status: '✗',
      count: 0,
      duration,
      error: err.message,
    });
  }
}

async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

console.log('Testing all media sources...\n');

// Server-side API endpoints
await testSource('DDG Local (/api/search)', async () => {
  return fetchJSON(`${BASE_URL}/api/search?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('DDG Videos (/api/search-videos)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-videos?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Bing Images (/api/search-bing-images)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-bing-images?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Google Images (/api/search-google-images)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-google-images?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('DDG Images (/api/search-duckduckgo-images)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-duckduckgo-images?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Bing Videos (/api/search-bing-videos)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-bing-videos?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Google Videos (/api/search-google-videos)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-google-videos?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Bing News (/api/search-bing-news)', async () => {
  return fetchJSON(`${BASE_URL}/api/search-bing-news?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Static Map (/api/static-map)', async () => {
  return fetchJSON(`${BASE_URL}/api/static-map?q=${encodeURIComponent('Wall Street New York')}`);
});

await testSource('Press Release (/api/press-release)', async () => {
  return fetchJSON(`${BASE_URL}/api/press-release?q=${encodeURIComponent(TEST_QUERY)}`);
});

await testSource('Proxy Page (/api/proxy-page)', async () => {
  const res = await fetch(`${BASE_URL}/api/proxy-page?url=${encodeURIComponent('https://en.wikipedia.org/wiki/Silicon_Valley_Bank')}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return { html: text.substring(0, 200) };
});

await testSource('Deep Harvest (/api/deep-harvest)', async () => {
  return fetchJSON(`${BASE_URL}/api/deep-harvest?q=${encodeURIComponent(TEST_QUERY)}`);
});

// Print results
console.log('\n' + '='.repeat(120));
console.log('RESULTS');
console.log('='.repeat(120));

const passed = results.filter(r => r.status === '✓');
const failed = results.filter(r => r.status === '✗');

console.log(`\n✓ PASSED: ${passed.length}/${results.length}`);
console.log(`✗ FAILED: ${failed.length}/${results.length}\n`);

for (const r of results) {
  const status = r.status === '✓' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const count = r.count > 0 ? `${r.count} items` : '';
  const time = `${r.duration}ms`;
  
  console.log(`${status} ${r.name.padEnd(45)} ${count.padEnd(12)} ${time.padEnd(8)}`);
  
  if (r.error) {
    console.log(`  \x1b[31mError: ${r.error}\x1b[0m`);
  } else if (r.sample) {
    console.log(`  \x1b[90mSample: ${r.sample.url || 'N/A'}\x1b[0m`);
    if (r.sample.width && r.sample.height) {
      console.log(`  \x1b[90mSize: ${r.sample.width}x${r.sample.height}\x1b[0m`);
    }
  }
}

console.log('\n' + '='.repeat(120));
