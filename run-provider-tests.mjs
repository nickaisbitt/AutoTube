import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Opening test page...');
  await page.goto('http://localhost:5173/test-providers.html');
  
  console.log('Waiting for tests to complete (up to 2 minutes)...');
  await page.waitForSelector('.summary', { timeout: 120000 });
  await page.waitForTimeout(3000);
  
  const results = await page.evaluate(() => {
    const summary = document.querySelector('.summary')?.textContent || '';
    const sources = Array.from(document.querySelectorAll('.source')).map(el => {
      const name = el.querySelector('.name')?.textContent?.trim() || '';
      const meta = el.querySelector('.meta')?.textContent?.trim() || '';
      const error = el.querySelector('.error')?.textContent?.trim() || '';
      const emptyMsg = el.querySelector('.empty-msg')?.textContent?.trim() || '';
      const assets = Array.from(el.querySelectorAll('.asset')).map(a => {
        const num = a.querySelector('.asset-num')?.textContent?.trim() || '';
        const url = a.querySelector('.asset-url')?.textContent?.trim() || '';
        const metaText = a.querySelector('.asset-meta')?.textContent?.trim() || '';
        const alt = a.querySelector('.asset-alt')?.textContent?.trim() || '';
        return { num, url, meta: metaText, alt };
      });
      const status = el.classList.contains('pass') ? 'pass' : 
                     el.classList.contains('empty') ? 'empty' :
                     el.classList.contains('skip') ? 'skip' : 'fail';
      return { name, meta, error, emptyMsg, assets, status };
    });
    return { summary, sources };
  });
  
  console.log('\n' + '='.repeat(100));
  console.log(results.summary.trim());
  console.log('='.repeat(100) + '\n');
  
  for (const src of results.sources) {
    const icon = src.status === 'pass' ? '✓' : src.status === 'empty' ? '⊘' : src.status === 'skip' ? '⊘' : '✗';
    console.log(`${icon} ${src.name}  [${src.meta}]`);
    
    if (src.error) {
      console.log(`  Error: ${src.error}`);
    } else if (src.emptyMsg) {
      console.log(`  ${src.emptyMsg}`);
    } else {
      for (const asset of src.assets) {
        console.log(`  ${asset.num} ${asset.url}`);
        if (asset.meta) console.log(`     ${asset.meta}`);
        if (asset.alt) console.log(`     alt: ${asset.alt}`);
      }
    }
    console.log('');
  }
  
  await browser.close();
})();
