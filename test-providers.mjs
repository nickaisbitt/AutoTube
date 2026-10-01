#!/usr/bin/env node

// Test each provider class directly
import { FlickrProvider } from './src/services/sourceProviders/flickr.js';
import { GovPressProvider } from './src/services/sourceProviders/govPress.js';
import { PixabayProvider } from './src/services/sourceProviders/pixabay.js';
import { PexelsProvider } from './src/services/sourceProviders/pexels.js';
import { NasaProvider } from './src/services/sourceProviders/nasa.js';
import { VimeoProvider } from './src/services/sourceProviders/vimeo.js';
import { DailymotionProvider } from './src/services/sourceProviders/dailymotion.js';
import { GiphyProvider } from './src/services/sourceProviders/giphy.js';
import { UnsplashProvider } from './src/services/sourceProviders/unsplash.js';
import { ArchiveOrgProvider } from './src/services/sourceProviders/archiveOrg.js';
import { HybridScraperProvider } from './src/services/sourceProviders/hybridScraper.js';
import { PexelsVideoProvider } from './src/services/sourceProviders/pexelsVideo.js';
import { PixabayVideoProvider } from './src/services/sourceProviders/pixabayVideo.js';
import { DeepHarvestProvider } from './src/services/sourceProviders/deepHarvest.js';

const TEST_QUERY = 'Silicon Valley Bank collapse';
const config = { signal: AbortSignal.timeout(15000) };

const results = [];

async function testProvider(name, provider, requiresKey = false) {
  const start = Date.now();
  try {
    if (requiresKey && !provider.isAvailable(config)) {
      results.push({
        name,
        status: '⊘',
        count: 0,
        duration: Date.now() - start,
        error: 'Requires API key (not configured)',
      });
      return;
    }

    const candidates = await provider.search(TEST_QUERY, config);
    const duration = Date.now() - start;
    
    results.push({
      name,
      status: '✓',
      count: candidates.length,
      duration,
      sample: candidates[0] ? {
        url: candidates[0].url?.substring(0, 80),
        width: candidates[0].width,
        height: candidates[0].height,
        source: candidates[0].source,
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

console.log('Testing client-side providers...\n');

await testProvider('Flickr', new FlickrProvider());
await testProvider('GovPress', new GovPressProvider());
await testProvider('Pixabay', new PixabayProvider(), true);
await testProvider('Pexels', new PexelsProvider(), true);
await testProvider('NASA', new NasaProvider());
await testProvider('Vimeo', new VimeoProvider());
await testProvider('Dailymotion', new DailymotionProvider());
await testProvider('Giphy', new GiphyProvider());
await testProvider('Unsplash', new UnsplashProvider());
await testProvider('Archive.org', new ArchiveOrgProvider());
await testProvider('HybridScraper', new HybridScraperProvider());
await testProvider('Pexels Video', new PexelsVideoProvider(), true);
await testProvider('Pixabay Video', new PixabayVideoProvider(), true);
await testProvider('Deep Harvest', new DeepHarvestProvider());

console.log('\n' + '='.repeat(120));
console.log('CLIENT-SIDE PROVIDER RESULTS');
console.log('='.repeat(120));

const passed = results.filter(r => r.status === '✓');
const failed = results.filter(r => r.status === '✗');
const skipped = results.filter(r => r.status === '⊘');

console.log(`\n✓ PASSED: ${passed.length}/${results.length}`);
console.log(`✗ FAILED: ${failed.length}/${results.length}`);
console.log(`⊘ SKIPPED (no API key): ${skipped.length}/${results.length}\n`);

for (const r of results) {
  const status = r.status === '✓' ? '\x1b[32m✓\x1b[0m' : 
                 r.status === '⊘' ? '\x1b[33m⊘\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const count = r.count > 0 ? `${r.count} items` : '';
  const time = `${r.duration}ms`;
  
  console.log(`${status} ${r.name.padEnd(30)} ${count.padEnd(12)} ${time.padEnd(8)}`);
  
  if (r.error) {
    console.log(`  \x1b[${r.status === '⊘' ? '33' : '31'}m${r.error}\x1b[0m`);
  } else if (r.sample) {
    console.log(`  \x1b[90mSample: ${r.sample.url || 'N/A'}\x1b[0m`);
    if (r.sample.width && r.sample.height) {
      console.log(`  \x1b[90mSize: ${r.sample.width}x${r.sample.height} | Source: ${r.sample.source}\x1b[0m`);
    }
  }
}

console.log('\n' + '='.repeat(120));
