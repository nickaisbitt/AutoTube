const query = 'Silicon Valley Bank collapse';
const searchUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&FORM=HDRSC7`;

const res = await fetch(searchUrl, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.bing.com/"
  },
});

console.log('Status:', res.status);
const html = await res.text();
console.log('HTML length:', html.length);

// Check for title class
const titleMatches = html.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>/g);
console.log('Title matches:', titleMatches?.length || 0);
if (titleMatches?.length > 0) {
  console.log('First title:', titleMatches[0].substring(0, 200));
}

// Check for news card structure
const newsCardMatches = html.match(/news-card/gi);
console.log('news-card matches:', newsCardMatches?.length || 0);

// Check for caption class
const captionMatches = html.match(/caption/gi);
console.log('caption matches:', captionMatches?.length || 0);

// Save first 5000 chars for inspection
console.log('\nFirst 2000 chars of HTML:');
console.log(html.substring(0, 2000));
