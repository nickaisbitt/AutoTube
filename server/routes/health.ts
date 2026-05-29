import type { IncomingMessage, ServerResponse } from "http";

export async function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let mem: NodeJS.MemoryUsage;
  try {
    mem = process.memoryUsage();
  } catch {
    mem = { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
    }),
  );
}
