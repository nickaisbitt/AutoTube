import { chromium } from 'playwright';

async function run() {
  console.log('Starting Playwright debugging browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error('[BROWSER ERROR]', err);
  });

  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Navigation complete!');

    const html = await page.content();
    console.log('\n--- ROOT HTML CONTENT ---');
    console.log(html.substring(0, 2000));
    console.log('-------------------------\n');

    await page.screenshot({ path: 'test-recordings/debug-screenshot.png' });
    console.log('Screenshot saved to test-recordings/debug-screenshot.png');
  } catch (err) {
    console.error('Playwright execution failed:', err);
  } finally {
    await browser.close();
  }
}

run();
