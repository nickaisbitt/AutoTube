import dns from "dns";
import { Readable } from "stream";
import type { IncomingMessage, ServerResponse } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";

const undiciMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("undici", () => ({
  Agent: class {
    close = vi.fn().mockResolvedValue(undefined);
  },
  fetch: undiciMocks.fetch,
}));

import { rateLimitMiddleware } from "../middleware/rateLimiter.js";
import { handleLlmProxy } from "../routes/llmProxy.js";
import { handleProxyImage } from "../routes/proxyImage.js";
import { handleRenderVideo } from "../routes/renderVideo.js";

type MockResponse = ServerResponse & {
  body: string | Buffer;
  headers: Record<string, string | number>;
};

function mockRes(onEnd?: () => void): MockResponse {
  const response = {
    statusCode: 200,
    headersSent: false,
    body: "",
    headers: {} as Record<string, string | number>,
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string | Buffer) {
      this.body = chunk || "";
      onEnd?.();
    },
  };
  return response as unknown as MockResponse;
}

function streamReq(
  body: string,
  overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
  const request = Readable.from([Buffer.from(body)]) as IncomingMessage;
  request.method = "POST";
  request.url = "/api/llm";
  request.headers = {};
  Object.assign(request, overrides);
  return request;
}

const previousEnv = {
  nodeEnv: process.env.NODE_ENV,
  openRouterKey: process.env.OPENROUTER_API_KEY,
  viteOpenRouterKey: process.env.VITE_OPENROUTER_KEY,
  allowedModels: process.env.AUTOTUBE_ALLOWED_LLM_MODELS,
  openRouterModel: process.env.OPENROUTER_MODEL,
};

afterEach(() => {
  vi.restoreAllMocks();
  undiciMocks.fetch.mockReset();
  for (const [name, value] of [
    ["NODE_ENV", previousEnv.nodeEnv],
    ["OPENROUTER_API_KEY", previousEnv.openRouterKey],
    ["VITE_OPENROUTER_KEY", previousEnv.viteOpenRouterKey],
    ["AUTOTUBE_ALLOWED_LLM_MODELS", previousEnv.allowedModels],
    ["OPENROUTER_MODEL", previousEnv.openRouterModel],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("security-sensitive route hardening", () => {
  it("rate-limits the exact /api/search path with a query string", () => {
    process.env.NODE_ENV = "production";
    const req = {
      url: "/api/search?q=test",
      headers: {},
      socket: { remoteAddress: "203.0.113.77" },
    } as IncomingMessage;

    for (let i = 0; i < 50; i++) {
      expect(rateLimitMiddleware(req, mockRes(), () => undefined)).toBe(false);
    }
    const res = mockRes();
    expect(rateLimitMiddleware(req, res, () => undefined)).toBe(true);
    expect(res.statusCode).toBe(429);
  });

  it("rejects unallowlisted models when spending the server key", async () => {
    process.env.OPENROUTER_API_KEY = "server-secret";
    delete process.env.VITE_OPENROUTER_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const req = streamReq(
      JSON.stringify({ model: "attacker/expensive-model", messages: [] }),
    );
    const res = mockRes();

    await handleLlmProxy(req, res);

    expect(res.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults and caps server-funded LLM requests", async () => {
    process.env.OPENROUTER_API_KEY = "server-secret";
    delete process.env.VITE_OPENROUTER_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const req = streamReq(JSON.stringify({ messages: [] }));
    const res = mockRes();

    await handleLlmProxy(req, res);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "xiaomi/mimo-v2.5",
      max_tokens: 8192,
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects an oversized image from Content-Length before buffering", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(dns, "lookup").mockImplementation((_hostname, options, callback) => {
      const cb = typeof options === "function" ? options : callback as any;
      cb(null, [{ address: "8.8.8.8", family: 4 }] as any);
    });
    undiciMocks.fetch.mockResolvedValue(
      new Response("not consumed", {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(50 * 1024 * 1024 + 1),
        },
      }),
    );
    const req = {
      url: `/api/proxy-image?url=${encodeURIComponent("https://images.example/test.png")}`,
      headers: {},
    } as IncomingMessage;
    const res = mockRes();

    await handleProxyImage(req, res);

    expect(res.statusCode).toBe(413);
  });

  it("rejects absurd frame counts before starting ffmpeg", async () => {
    const frames = Array.from(
      { length: 12_001 },
      () => "data:image/png;base64,A",
    );
    let finish!: () => void;
    const ended = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const res = mockRes(finish);
    const req = streamReq(
      JSON.stringify({ frames, fps: 30, format: "mp4" }),
      { url: "/api/render-video" },
    );

    await handleRenderVideo(req, res);
    await ended;

    expect(res.statusCode).toBe(413);
  });
});
