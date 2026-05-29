import type { IncomingMessage, ServerResponse } from "http";

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:5173",
  "http://localhost:3000",
];

/**
 * CORS middleware — sets safe headers for development and restricts origins in production.
 */
export function cors(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const origin = req.headers.origin;

  if (process.env.NODE_ENV === "production") {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  } else {
    // Dev environment - allow all
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
}
