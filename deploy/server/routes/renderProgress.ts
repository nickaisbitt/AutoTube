import type { IncomingMessage, ServerResponse } from "http";

// In-memory render progress store
let renderProgress: any = {
  currentFrame: 0,
  totalFrames: 0,
  fps: '0',
  etaSeconds: 0,
  memoryMB: '0',
  status: 'idle',
  segmentIndex: undefined,
  segmentTitle: undefined,
  errorMessage: undefined,
};

/**
 * Update render progress (called by server-render.mjs)
 */
export function updateRenderProgress(progress: any) {
  renderProgress = { ...renderProgress, ...progress };
}

/**
 * Get current render progress
 */
export function getRenderProgress() {
  return renderProgress;
}

/**
 * Reset render progress
 */
export function resetRenderProgress() {
  renderProgress = {
    currentFrame: 0,
    totalFrames: 0,
    fps: '0',
    etaSeconds: 0,
    memoryMB: '0',
    status: 'idle',
    segmentIndex: undefined,
    segmentTitle: undefined,
    errorMessage: undefined,
  };
}

/**
 * GET /api/render-progress
 * Return current render progress as JSON
 */
export async function handleRenderProgress(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Support POST requests to update progress
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    try {
      const progressData = JSON.parse(body);
      updateRenderProgress(progressData);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    return;
  }

  // GET request - return current progress
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.statusCode = 200;
  res.end(JSON.stringify(renderProgress));
}
