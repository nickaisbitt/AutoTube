import type { IncomingMessage, ServerResponse } from "http";
import { searchPressReleases, scrapePressRelease, extractKeyFacts } from "../utils/pressRelease.js";

/**
 * GET /api/press-release?q=...
 * Searches for and optionally scrapes press releases about a topic.
 */
export async function handlePressRelease(
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
    console.log(`[PressRelease] Searching for: "${query}"`);

    // Find press releases
    const releases = await searchPressReleases(query);

    // Try to scrape the top result for full text
    let fullText: string | null = null;
    let keyFacts: string[] = [];

    if (releases.length > 0) {
      const topUrl = releases[0].url;
      fullText = await scrapePressRelease(topUrl);
      if (fullText) {
        keyFacts = extractKeyFacts(fullText);
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({
      releases,
      fullText,
      keyFacts,
    }));
  } catch (error) {
    console.error("[PressRelease] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      error: "Press release search failed",
      details: error instanceof Error ? error.message : String(error),
    }));
  }
}
