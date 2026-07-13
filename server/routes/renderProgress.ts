import type { IncomingMessage, ServerResponse } from "http";

type ProgressStatus = "idle" | "rendering" | "encoding" | "complete" | "error" | "failed";

interface RenderProgressState {
  currentFrame: number;
  totalFrames: number;
  fps: string;
  etaSeconds: number;
  memoryMB: string;
  status: ProgressStatus;
  segmentIndex?: number;
  segmentTitle?: string;
  errorMessage?: string;
}

const ALLOWED_KEYS = new Set([
  "currentFrame",
  "totalFrames",
  "fps",
  "etaSeconds",
  "memoryMB",
  "status",
  "segmentIndex",
  "segmentTitle",
  "errorMessage",
]);

const ALLOWED_STATUS = new Set<ProgressStatus>([
  "idle",
  "rendering",
  "encoding",
  "complete",
  "error",
  "failed",
]);

// In-memory render progress store
let renderProgress: RenderProgressState = {
  currentFrame: 0,
  totalFrames: 0,
  fps: "0",
  etaSeconds: 0,
  memoryMB: "0",
  status: "idle",
  segmentIndex: undefined,
  segmentTitle: undefined,
  errorMessage: undefined,
};

function sanitizeProgressUpdate(raw: unknown): Partial<RenderProgressState> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Partial<RenderProgressState> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    switch (key) {
      case "currentFrame":
      case "totalFrames":
      case "etaSeconds":
      case "segmentIndex":
        if (typeof value === "number" && Number.isFinite(value)) {
          (out as Record<string, unknown>)[key] = value;
        }
        break;
      case "fps":
      case "memoryMB":
      case "segmentTitle":
      case "errorMessage":
        if (typeof value === "string") {
          (out as Record<string, unknown>)[key] = value.slice(0, 500);
        }
        break;
      case "status":
        if (typeof value === "string" && ALLOWED_STATUS.has(value as ProgressStatus)) {
          out.status = value as ProgressStatus;
        }
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Update render progress (called by server-render.mjs)
 */
export function updateRenderProgress(progress: Partial<RenderProgressState>) {
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
    fps: "0",
    etaSeconds: 0,
    memoryMB: "0",
    status: "idle",
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
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    try {
      const progressData = JSON.parse(body);
      const sanitized = sanitizeProgressUpdate(progressData);
      if (!sanitized) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid progress payload" }));
        return;
      }
      updateRenderProgress(sanitized);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
    return;
  }

  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify(renderProgress));
}
