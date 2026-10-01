import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('DeepHarvest') || text.includes('deep-harvest')) {
      console.log(`[BROWSER] ${text}`);
    }
  });
  
  await page.goto('http://localhost:5173/test-providers.html');
  await page.waitForSelector('.summary', { timeout: 120000 });
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
