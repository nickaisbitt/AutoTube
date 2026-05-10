import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";

/**
 * POST /api/render-video
 * Frame-based video renderer — accepts newline-separated base64 frames 
 * POSTed from the browser, assembles with ffmpeg.
 */
export async function handleRenderVideo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const fps = Number(url.searchParams.get("fps") || 30);
  const format = url.searchParams.get("format") || "webm";

  const tmpDir = join(tmpdir(), `autotube-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  let frameCount = 0;
  let buffer = "";

  try {
    for await (const chunk of req) {
      buffer += chunk.toString("utf8");
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const b64 = line.replace(/^data:image\/(png|jpeg);base64,/, "");
          writeFileSync(
            join(tmpDir, `frame-${String(frameCount).padStart(6, "0")}.png`),
            Buffer.from(b64, "base64"),
          );
          frameCount++;
        }
      }
    }

    if (buffer.trim()) {
      const line = buffer.trim();
      const b64 = line.replace(/^data:image\/(png|jpeg);base64,/, "");
      writeFileSync(
        join(tmpDir, `frame-${String(frameCount).padStart(6, "0")}.png`),
        Buffer.from(b64, "base64"),
      );
      frameCount++;
    }

    // Assemble with ffmpeg
    const outFile = join(tmpDir, `output.${format}`);
    const codec = format === "mp4" ? "libx264" : "libvpx-vp9";
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      join(tmpDir, "frame-%06d.png"),
      "-c:v",
      codec,
      "-b:v",
      "5M",
      "-pix_fmt",
      "yuv420p",
      outFile,
    ]);

    await new Promise<void>((resolve, reject) => {
      ffmpeg.on("close", (code: number) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
      );
    });

    const videoBuffer = readFileSync(outFile);
    const mimeType = format === "mp4" ? "video/mp4" : "video/webm";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Length", videoBuffer.length);
    res.end(videoBuffer);

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    console.error("[Frame Renderer]", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(err) }));
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
