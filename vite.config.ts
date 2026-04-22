import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to scrape DDG images manually (Zero-Cost / Pro Results)
async function fetchDDGImages(query: string) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/437.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  // 1. Get the VQD token
  const initialRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': userAgent }
  });
  const text = await initialRes.text();
  const vqdMatch = text.match(/vqd=([^&'"]+)/);
  if (!vqdMatch) throw new Error('Could not extract VQD token from DuckDuckGo');
  const vqd = vqdMatch[1];

  // 2. Fetch image results from the internal API
  const searchUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}&f=,,,`;
  const apiRes = await fetch(searchUrl, {
    headers: { 'User-Agent': userAgent, 'Referer': 'https://duckduckgo.com/' }
  });
  
  if (!apiRes.ok) throw new Error(`DDG Image API failed: ${apiRes.status}`);
  return await apiRes.json();
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(), 
    viteSingleFile(),
    {
      name: 'local-search-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // Image proxy for CORS-free image loading
          if (req.url?.startsWith('/api/proxy-image')) {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
              res.statusCode = 400;
              res.end('Missing url parameter');
              return;
            }
            try {
              const imgRes = await fetch(decodeURIComponent(targetUrl), {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
              });
              res.setHeader('Content-Type', imgRes.headers.get('Content-Type') || 'image/jpeg');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              res.end(buffer);
            } catch (err) {
              res.statusCode = 500;
              res.end('Image proxy failed');
            }
            return;
          }

          if (req.url?.startsWith('/api/search')) {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const query = url.searchParams.get('q');
            
            if (!query) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing query parameter "q"' }));
              return;
            }

            try {
              console.log(`[Local Search] Scraping DDG for: "${query}"`);
              const results = await fetchDDGImages(query);
              
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify(results));
            } catch (error) {
              console.error('[Local Search] Error:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Search failed', details: error instanceof Error ? error.message : String(error) }));
            }
            return;
          }
          next();
        });
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      '/api/serper': {
        target: 'https://google.serper.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/serper/, ''),
        headers: {
          'Content-Type': 'application/json',
        }
      }
    }
  },
  define: {
    'process.env': {}
  }
});
