import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

let swaggerHtml: string | null = null;

async function getSwaggerHtml(): Promise<string> {
  if (swaggerHtml) return swaggerHtml;

  const specPath = join(PROJECT_ROOT, "server", "openapi.yaml");
  let spec: unknown;
  try {
    spec = yaml.load(readFileSync(specPath, "utf8"));
  } catch {
    return `<html><body><h1>API docs unavailable</h1><p>openapi.yaml not found.</p></body></html>`;
  }
  const specJson = JSON.stringify(spec);

  swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AutoTube API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      const spec = ${specJson};
      SwaggerUIBundle({
        spec: spec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
      });
    };
  </script>
</body>
</html>`;

  return swaggerHtml;
}

/**
 * GET /api/docs
 * Serves Swagger UI for the AutoTube API.
 */
export async function handleDocs(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(await getSwaggerHtml());
}
