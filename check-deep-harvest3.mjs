import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER] ${msg.text()}`);
  });
  
  page.on('request', req => {
    if (req.url().includes('deep-harvest')) {
      console.log(`[REQUEST] ${req.url()}`);
    }
  });
  
  page.on('response', res => {
    if (res.url().includes('deep-harvest')) {
      console.log(`[RESPONSE] ${res.status()} ${res.url()}`);
    }
  });
  
  await page.goto('http://localhost:5173');
  
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/deep-harvest?q=Silicon%20Valley%20Bank%20collapse');
    const text = await res.text();
    return { status: res.status, body: text.substring(0, 500) };
  });
  
  console.log('Result:', result);
  
  await browser.close();
})();
