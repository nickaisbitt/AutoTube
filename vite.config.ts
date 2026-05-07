import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { apiMiddleware } from "./server/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
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
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api/serper": {
        target: "https://google.serper.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/serper/, ""),
        headers: {
          "Content-Type": "application/json",
        },
      },
    },
  },
  define: {
    "process.env": {},
  },
});
