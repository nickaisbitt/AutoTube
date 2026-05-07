import type { IncomingMessage, ServerResponse } from "http";

/**
 * Global error handler — catches unhandled errors from route handlers
 * and returns a structured JSON response.
 *
 * Connect-style error middleware (4 arguments: err, req, res, next).
 */
export function errorHandler(
  err: Error,
  _req: IncomingMessage,
  res: ServerResponse,
  _next: () => void,
): void {
  console.error("[API Error]", err);
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: err.message || "Internal server error" }));
}
