import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";

const MAX_RENDER_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_FRAME_COUNT = 12_000;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_FRAME_BYTES = 100 * 1024 * 1024;

function sendRequestError(
  res: ServerResponse,
  statusCode: number,
  error: string,
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error }));
}

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
  let requestBytes = 0;
  let requestTooLarge = false;
  req.on("data", (chunk: Buffer) => {
    requestBytes += chunk.length;
    if (requestBytes > MAX_RENDER_REQUEST_BYTES) {
      requestTooLarge = true;
      chunks.length = 0;
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    if (requestTooLarge) {
      sendRequestError(res, 413, "Render payload exceeds 10MB");
      return;
    }

    let tmpDir: string | undefined;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { frames, fps = 30, format = "webm" } = body as {
        frames: string[];
        fps: number;
        format: string;
      };

      if (!Array.isArray(frames) || frames.length === 0) {
        sendRequestError(res, 400, "frames must be a non-empty array");
        return;
      }
      if (frames.length > MAX_FRAME_COUNT) {
        sendRequestError(
          res,
          413,
          `Too many frames (maximum ${MAX_FRAME_COUNT})`,
        );
        return;
      }
      if (
        typeof fps !== "number" ||
        !Number.isFinite(fps) ||
        fps < 1 ||
        fps > 60
      ) {
        sendRequestError(res, 400, "fps must be between 1 and 60");
        return;
      }
      if (format !== "mp4" && format !== "webm") {
        sendRequestError(res, 400, "format must be mp4 or webm");
        return;
      }

      let decodedBytes = 0;
      for (const frame of frames) {
        if (
          typeof frame !== "string" ||
          !/^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$/.test(
            frame,
          )
        ) {
          sendRequestError(
            res,
            400,
            "Frames must be PNG or JPEG base64 data URLs",
          );
          return;
        }
        const frameBytes = Buffer.byteLength(
          frame.slice(frame.indexOf(",") + 1),
          "base64",
        );
        if (frameBytes > MAX_FRAME_BYTES) {
          sendRequestError(res, 413, "An individual frame is too large");
          return;
        }
        decodedBytes += frameBytes;
        if (decodedBytes > MAX_TOTAL_FRAME_BYTES) {
          sendRequestError(res, 413, "Decoded frame data is too large");
          return;
        }
      }

      tmpDir = join(tmpdir(), `autotube-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true, mode: 0o700 });

      // Write each frame as image (JPEG from browser, but ffmpeg auto-detects format)
      for (let i = 0; i < frames.length; i++) {
        const b64 = frames[i].replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
        writeFileSync(
          join(tmpDir, `frame-${String(i).padStart(6, "0")}.png`),
          Buffer.from(b64, "base64"),
        );
      }

      // Assemble with ffmpeg
      const outFile = join(tmpDir, `output.${format}`);
      const isMp4 = format === "mp4";
      const codec = isMp4 ? "libx264" : "libvpx-vp9";
      const ffmpegArgs = [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        join(tmpDir, "frame-%06d.png"),
        "-c:v",
        codec,
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
      ];
      if (isMp4) {
        ffmpegArgs.push("-preset", "medium", "-bf", "3", "-tune", "film", "-movflags", "+faststart");
      } else {
        // VP9-specific tuning for faster encode at good quality
        ffmpegArgs.push("-deadline", "good", "-cpu-used", "2");
      }
      ffmpegArgs.push(outFile);
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);

      await new Promise<void>((resolve, reject) => {
        ffmpeg.on("close", (code: number) =>
          code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
        );
        ffmpeg.on("error", reject);
      });

      const videoBuffer = readFileSync(outFile);
      const mimeType = format === "mp4" ? "video/mp4" : "video/webm";
      res.setHeader("Content-Type", mimeType);

      res.setHeader("Content-Length", videoBuffer.length);
      res.end(videoBuffer);
    } catch (err) {
      console.error("[Frame Renderer]", err);
      if (!res.headersSent) {
        sendRequestError(
          res,
          err instanceof SyntaxError ? 400 : 500,
          err instanceof SyntaxError ? "Invalid JSON body" : "Video rendering failed",
        );
      } else {
        res.end();
      }
    } finally {
      if (tmpDir) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
}
