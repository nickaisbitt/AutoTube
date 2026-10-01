import type { IncomingMessage, ServerResponse } from "http";
import { getRecentErrors, getRecentMessages } from "../../src/services/monitoring.js";

export async function handleErrors(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const errors = getRecentErrors();
  const messages = getRecentMessages();

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      errors,
      messages,
      total: errors.length + messages.length,
    }),
  );
}
