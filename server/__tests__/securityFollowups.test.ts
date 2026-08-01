import dns from "dns";
import { EventEmitter } from "node:events";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    default: { ...(actual as { default?: object }).default, spawn: spawnMock },
    spawn: spawnMock,
  };
});

import { errorHandler } from "../middleware/errorHandler.js";
import { handleDownloadClip } from "../routes/downloadClip.js";
import { handleExportProject } from "../routes/exportProject.js";
import { handleQualityCheck } from "../routes/qualityCheck.js";
import { handleSaveProject } from "../routes/saveProject.js";

type MockResponse = ServerResponse & {
  body: string;
  chunks: string[];
};

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

function mockRes(): MockResponse {
  const response = {
    statusCode: 200,
    headersSent: false,
    body: "",
    chunks: [] as string[],
    setHeader: vi.fn(),
    write(chunk: string | Buffer) {
      this.chunks.push(String(chunk));
      return true;
    },
    end(chunk?: string | Buffer) {
      if (chunk) this.body = String(chunk);
    },
  };
  return response as unknown as MockResponse;
}

function streamReq(url: string, body = ""): IncomingMessage {
  const req = Readable.from(body ? [Buffer.from(body)] : []) as IncomingMessage;
  req.url = url;
  req.headers = { host: "localhost:5173" };
  return req;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn();
  return child;
}

const previousNodeEnv = process.env.NODE_ENV;
const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  spawnMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
});

describe("security audit follow-ups", () => {
  it("blocks a download-clip redirect to a private host before spawning yt-dlp", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(dns, "lookup").mockImplementation((_hostname, options, callback) => {
      const cb = typeof options === "function" ? options : callback as any;
      cb(null, [{ address: "8.8.8.8", family: 4 }] as any);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/private.mp4" },
      }),
    );
    const req = streamReq(
      `/api/download-clip?url=${encodeURIComponent("https://videos.example/watch")}`,
    );
    const res = mockRes();

    await handleDownloadClip(req, res);

    expect(res.statusCode).toBe(403);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://10.0.0.1/video.mp4",
    "https://youtube.com.attacker.example/watch",
  ])("rejects private or lookalike yt-dlp host %s", async (targetUrl) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(dns, "lookup").mockImplementation((_hostname, options, callback) => {
      const cb = typeof options === "function" ? options : callback as any;
      cb(null, [{ address: "8.8.8.8", family: 4 }] as any);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const req = streamReq(
      `/api/download-clip?url=${encodeURIComponent(targetUrl)}`,
    );
    const res = mockRes();

    await handleDownloadClip(req, res);

    expect(res.statusCode).toBe(403);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([handleSaveProject, handleExportProject])(
    "rejects project IDs that would collide after sanitization",
    async (handler) => {
      const req = streamReq("/api/project?id=a!");
      const res = mockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toContain("Invalid project id");
    },
  );

  it("passes the quality-check API key through env and never argv", async () => {
    const videoPath = join(process.cwd(), "test-recordings", "security-followup.mp4");
    writeFileSync(videoPath, "");
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    process.env.OPENROUTER_API_KEY = "quality-secret";
    const req = streamReq(
      "/api/quality-check",
      JSON.stringify({ videoPath, includeVision: true }),
    );
    const res = mockRes();

    try {
      await handleQualityCheck(req, res);
      const [, args, options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env: Record<string, string | undefined> },
      ];
      expect(args).not.toContain("--api-key");
      expect(args).not.toContain("quality-secret");
      expect(options.env.OPENROUTER_API_KEY).toBe("quality-secret");
      req.emit("close");
    } finally {
      if (existsSync(videoPath)) unlinkSync(videoPath);
    }
  });

  it("masks non-500 internal errors in production", () => {
    process.env.NODE_ENV = "production";
    const err = Object.assign(new Error("database connection details"), {
      statusCode: 503,
    });
    const res = mockRes();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    errorHandler(err, {} as IncomingMessage, res, () => undefined);

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("database connection details");
    expect(JSON.parse(res.body).error).toBe("Internal server error");
  });
});
