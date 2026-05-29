import type { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";

/**
 * Global error handler — catches unhandled errors from route handlers,
 * assigns trace IDs, and prevents stack traces or internal messages from leaking in production.
 */
export function errorHandler(
  err: Error & { statusCode?: number },
  _req: IncomingMessage,
  res: ServerResponse,
  _next: () => void,
): void {
  const requestId = crypto.randomUUID();
  console.error(`[API Error] [Request ID: ${requestId}]`, err);

  if (res.headersSent) {
    // Response already started — cannot send structured error; just close the connection
    res.end();
    return;
  }

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
  res.setHeader("X-Request-ID", requestId);

  const isProduction = process.env.NODE_ENV === "production";

  if (statusCode === 500) {
    res.end(
      JSON.stringify({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        requestId,
        ...(!isProduction && { details: err.message, stack: err.stack }),
      }),
    );
  } else {
    res.end(
      JSON.stringify({
        error: err.message || "Bad request",
        requestId,
      }),
    );
  }
}
