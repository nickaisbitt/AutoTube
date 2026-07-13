import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import { apiAuthMiddleware } from "../middleware/apiAuth.js";
import { resolveSavedProjectPath } from "../utils/projectPaths.js";

function mockReq(overrides: Partial<IncomingMessage> & { url?: string } = {}): IncomingMessage {
  return {
    url: "/api/search?q=x",
    headers: {},
    method: "GET",
    ...overrides,
  } as IncomingMessage;
}

function mockRes(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk?: string) {
      this.body = chunk || "";
    },
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string };
}

describe("apiAuthMiddleware", () => {
  const prevKey = process.env.AUTOTUBE_API_KEY;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.AUTOTUBE_API_KEY;
    else process.env.AUTOTUBE_API_KEY = prevKey;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it("allows /api/health without a key", () => {
    process.env.AUTOTUBE_API_KEY = "secret";
    process.env.NODE_ENV = "production";
    const res = mockRes();
    const blocked = apiAuthMiddleware(mockReq({ url: "/api/health" }), res);
    expect(blocked).toBe(false);
  });

  it("rejects privileged routes without key in production", () => {
    process.env.AUTOTUBE_API_KEY = "secret";
    process.env.NODE_ENV = "production";
    const res = mockRes();
    const blocked = apiAuthMiddleware(mockReq({ url: "/api/search" }), res);
    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(401);
  });

  it("accepts X-API-Key matching AUTOTUBE_API_KEY", () => {
    process.env.AUTOTUBE_API_KEY = "secret";
    process.env.NODE_ENV = "production";
    const res = mockRes();
    const blocked = apiAuthMiddleware(
      mockReq({ url: "/api/search", headers: { "x-api-key": "secret" } }),
      res,
    );
    expect(blocked).toBe(false);
  });

  it("skips auth in development when AUTOTUBE_API_KEY unset", () => {
    delete process.env.AUTOTUBE_API_KEY;
    process.env.NODE_ENV = "development";
    const res = mockRes();
    expect(apiAuthMiddleware(mockReq({ url: "/api/search" }), res)).toBe(false);
  });
});

describe("resolveSavedProjectPath", () => {
  it("returns null without explicit path or id (no newest-/tmp fallback)", () => {
    expect(resolveSavedProjectPath({})).toBeNull();
    expect(resolveSavedProjectPath({ projectId: "" })).toBeNull();
  });
});
