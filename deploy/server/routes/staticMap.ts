import type { IncomingMessage, ServerResponse } from "http";
import { geocodePlace, buildMapCandidates } from "../utils/maps.js";

/**
 * GET /api/static-map?q=...&zoom=...
 * Generates a static map for a given place name using OpenStreetMap tiles.
 * Free, no API key required.
 */
export async function handleStaticMap(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  if (!qParam) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: 'Missing query parameter "q"' }));
    return;
  }

  if (qParam.length > 200) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Query too long (maximum 200 characters)" }));
    return;
  }

  const query = qParam.replace(/[^a-zA-Z0-9\s\-_."']/g, "").trim();
  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Query contains no valid search characters" }));
    return;
  }

  try {
    console.log(`[Static Map] Geocoding: "${query}"`);
    const geo = await geocodePlace(query);

    if (!geo) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    const candidates = buildMapCandidates(query, geo);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results: candidates, geo }));
  } catch (error) {
    console.error("[Static Map] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Static map generation failed",
        details: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
