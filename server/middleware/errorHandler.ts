import type { IncomingMessage, ServerResponse } from "http";

/**
 * Global error handler — catches unhandled errors from route handlers
 * and returns a structured JSON response.
 *
 * Connect-style error middleware (4 arguments: err, req, res, next).
 */
export function errorHandler(
  err: Error & { statusCode?: number },
  _req: IncomingMessage,
  res: ServerResponse,
  _next: () => void,
): void {
  console.error("[API Error]", err);

  let statusCode = err.statusCode;
  if (!statusCode) {
    const message = err.message?.toLowerCase() || "";
    if (err.name === "ValidationError" || message.includes("validation") || message.includes("bad request")) {
      statusCode = 400;
    } else if (message.includes("not found")) {
      statusCode = 404;
    } else if (message.includes("unauthorized")) {
      statusCode = 401;
    } else {
      statusCode = 500;
    }
  }

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: err.message || "Internal server error" }));
}
