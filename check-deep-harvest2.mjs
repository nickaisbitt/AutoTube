import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER] ${msg.text()}`);
  });
  
  await page.goto('http://localhost:5173');
  
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/deep-harvest?q=Silicon%20Valley%20Bank%20collapse');
    const data = await res.json();
    return {
      status: res.status,
      articlesSearched: data.articlesSearched,
      imagesFound: data.imagesFound,
      imageCount: data.images?.length || 0,
      firstImage: data.images?.[0]?.url
    };
  });
  
  console.log('API result:', JSON.stringify(result, null, 2));
  
  await browser.close();
})();
