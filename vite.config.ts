import pathModule from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { apiMiddleware } from "./server/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);

/**
 * Vite only exposes VITE_* vars to the client bundle; the API middleware runs
 * in this process and reads process.env directly (AUTOTUBE_API_KEY, provider
 * keys, ...). Mirror .env / .env.local into process.env so `npm run dev` is not
 * locked out of its own fail-closed /api/* routes. Real env vars win.
 */
function loadServerEnv(mode: string): void {
  const fileEnv = loadEnv(mode, __dirname, "");
  for (const [key, value] of Object.entries(fileEnv)) {
    if (value && !process.env[key]?.trim()) process.env[key] = value;
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadServerEnv(mode);

  return {
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile(),
      {
        name: "local-search-proxy",
        configureServer(server) {
          server.middlewares.use(apiMiddleware);
        },
      },
    ],
    resolve: {
      alias: {
        "@": pathModule.resolve(__dirname, "src"),
      },
    },
    server: {
      proxy: {
        "/api/serper": {
          target: "https://google.serper.dev",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/serper/, ""),
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": process.env.SERPER_API_KEY || "",
          },
        },
      },
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || 'development'),
      "process.env.DEV_SERVER_URL": JSON.stringify(process.env.DEV_SERVER_URL || ''),
      "import.meta.env.SKIP_QUALITY_BLOCK": JSON.stringify(process.env.SKIP_QUALITY_BLOCK || ''),
      "import.meta.env.VITE_SKIP_QUALITY_BLOCK": JSON.stringify(
        process.env.VITE_SKIP_QUALITY_BLOCK || process.env.SKIP_QUALITY_BLOCK || '',
      ),
      "import.meta.env.VITE_DISABLED_PROVIDERS": JSON.stringify(
        process.env.AUTOTUBE_DISABLED_PROVIDERS || 'Picsum',
      ),
      "import.meta.env.VITE_STOCK_AS_SECONDARY": JSON.stringify(
        process.env.AUTOTUBE_STOCK_AS_SECONDARY ?? '1',
      ),
      // Do NOT inject OpenRouter / Pexels / Pixabay secrets into the client bundle.
      // Use server env (OPENROUTER_API_KEY, etc.) + /api/llm proxy, or BYOK via Settings.
    },
  };
});
