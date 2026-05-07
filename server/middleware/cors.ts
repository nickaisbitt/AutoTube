import type { IncomingMessage, ServerResponse } from "http";

/**
 * CORS middleware — sets permissive headers for the dev-server API.
 * In production the single-file bundle is served statically, so this
 * middleware is only active during development.
 */
export function cors(
  _req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
}
