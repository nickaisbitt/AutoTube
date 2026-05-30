import type { IncomingMessage, ServerResponse } from "http";

export async function handleNotify(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stub implementation — email notifications are not yet implemented.
  // Configure a provider (e.g., SendGrid, AWS SES) to enable this feature.
  res.statusCode = 501;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ 
    error: "Email notifications are not yet implemented. Configure a provider to enable this feature." 
  }));
}
