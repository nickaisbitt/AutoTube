import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";

/**
 * POST /api/render-video
 * Frame-based video renderer — accepts PNG frames POSTed from the browser,
 * assembles with ffmpeg. Bypasses canvas taint restrictions.
 */
export async function handleRenderVideo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { frames, fps = 30, format = "webm" } = body as {
        frames: string[];
        fps: number;
        format: string;
      };

      const tmpDir = join(tmpdir(), `autotube-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      // Write each frame as PNG
      for (let i = 0; i < frames.length; i++) {
        const b64 = frames[i].replace(/^data:image\/png;base64,/, "");
        writeFileSync(
          join(tmpDir, `frame-${String(i).padStart(6, "0")}.png`),
          Buffer.from(b64, "base64"),
        );
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
    }
  });
}
