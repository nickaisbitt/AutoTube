const query = 'Silicon Valley Bank collapse news article';
const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;

const res = await fetch(searchUrl, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

console.log('Status:', res.status);
const html = await res.text();
console.log('HTML length:', html.length);

// Check for href patterns
const hrefMatches = html.match(/href="https?:\/\/[^"]+"/g);
console.log('Total href matches:', hrefMatches?.length || 0);

if (hrefMatches?.length > 0) {
  console.log('\nFirst 10 hrefs:');
  hrefMatches.slice(0, 10).forEach(h => console.log('  ', h));
}

// Check for result class
const resultMatches = html.match(/result__url/g);
console.log('\nresult__url matches:', resultMatches?.length || 0);

// Save snippet
console.log('\nFirst 1000 chars:');
console.log(html.substring(0, 1000));
