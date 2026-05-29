import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Scraper') || text.includes('Provider') || text.includes('Search')) {
      console.log(`[BROWSER] ${text}`);
    }
  });
  
  await page.goto('http://localhost:5173');
  
  const results = await page.evaluate(async () => {
    const tests = [
      { name: 'Unsplash', fn: async () => {
        const { UnsplashProvider } = await import('/src/services/sourceProviders/unsplash.ts');
        return new UnsplashProvider().search('Silicon Valley Bank', { signal: AbortSignal.timeout(10000) });
      }},
      { name: 'Vimeo', fn: async () => {
        const { VimeoProvider } = await import('/src/services/sourceProviders/vimeo.ts');
        return new VimeoProvider().search('Silicon Valley Bank', { signal: AbortSignal.timeout(10000) });
      }},
      { name: 'Giphy', fn: async () => {
        const { GiphyProvider } = await import('/src/services/sourceProviders/giphy.ts');
        return new GiphyProvider().search('Silicon Valley Bank', { signal: AbortSignal.timeout(10000) });
      }},
      { name: 'Archive.org', fn: async () => {
        const { ArchiveOrgProvider } = await import('/src/services/sourceProviders/archiveOrg.ts');
        return new ArchiveOrgProvider().search('Silicon Valley Bank', { signal: AbortSignal.timeout(10000) });
      }},
    ];
    
    const results = {};
    for (const test of tests) {
      try {
        const candidates = await test.fn();
        results[test.name] = { count: candidates.length, error: null };
      } catch (err) {
        results[test.name] = { count: 0, error: err.message };
      }
    }
    return results;
  });
  
  console.log('\nResults:');
  for (const [name, result] of Object.entries(results)) {
    const status = result.count > 0 ? '✓' : '✗';
    console.log(`${status} ${name}: ${result.count} items${result.error ? ` - ${result.error}` : ''}`);
  }
  
  await browser.close();
})();
