import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Flickr')) {
      console.log(`[BROWSER] ${text}`);
    }
  });
  
  await page.goto('http://localhost:5173');
  
  const result = await page.evaluate(async () => {
    const { FlickrProvider } = await import('/src/services/sourceProviders/flickr.ts');
    const provider = new FlickrProvider();
    const config = { signal: AbortSignal.timeout(15000) };
    
    try {
      const candidates = await provider.search('Silicon Valley Bank', config);
      return {
        count: candidates.length,
        first: candidates[0] ? {
          url: candidates[0].url,
          source: candidates[0].source,
          width: candidates[0].width,
          height: candidates[0].height
        } : null
      };
    } catch (err) {
      return { error: err.message };
    }
  });
  
  console.log('Flickr result:', JSON.stringify(result, null, 2));
  
  await browser.close();
})();
