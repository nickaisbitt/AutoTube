import { afterEach, describe, it, expect, vi } from "vitest";
import dns from "dns";
import {
  isPrivateIP,
  readResponseBodyWithLimit,
  ResponseSizeLimitError,
  validateURL,
  validateURLRedirects,
} from "../utils/security.js";

describe("Security & SSRF Utilities", () => {
  afterEach(() => vi.restoreAllMocks());

  describe("isPrivateIP", () => {
    it("identifies private IPv4 addresses", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("10.0.0.1")).toBe(true);
      expect(isPrivateIP("172.16.0.1")).toBe(true);
      expect(isPrivateIP("172.31.255.255")).toBe(true);
      expect(isPrivateIP("192.168.1.100")).toBe(true);
      expect(isPrivateIP("169.254.169.254")).toBe(true);
      expect(isPrivateIP("0.0.0.0")).toBe(true);
      expect(isPrivateIP("100.64.0.1")).toBe(true);
    });

    it("identifies public IPv4 addresses", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("142.250.190.46")).toBe(false);
    });

    it("identifies private/loopback IPv6 addresses", () => {
      expect(isPrivateIP("::1")).toBe(true);
      expect(isPrivateIP("fe80::1")).toBe(true);
      expect(isPrivateIP("febf::1")).toBe(true);
      expect(isPrivateIP("fc00::")).toBe(true);
      expect(isPrivateIP("fdff::ffff")).toBe(true);
    });

    it("identifies public IPv6 addresses", () => {
      expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
    });

    it("handles IPv4-mapped IPv6 addresses", () => {
      expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
    });
  });

  describe("validateURL", () => {
    it("allows safe public URLs", async () => {
      // Mock dns.lookup to return a public IP
      const spy = vi.spyOn(dns, "lookup").mockImplementation((hostname, options, callback) => {
        const cb = typeof options === "function" ? options : callback as any;
        cb(null, [{ address: "8.8.8.8", family: 4 }] as any);
      });

      const result = await validateURL("https://google.com/search");
      expect(result.valid).toBe(true);
      spy.mockRestore();
    });

    it("blocks unsupported protocols", async () => {
      const result = await validateURL("ftp://example.com/file");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported protocol");
    });

    it("blocks loopback URLs directly", async () => {
      const result = await validateURL("http://localhost/image.png");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("loopback");
    });

    it("blocks internal metadata suffixes", async () => {
      const result = await validateURL("http://metadata.google.internal/latest");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("metadata");
    });

    it("blocks domains resolving to private IPs", async () => {
      // Mock dns.lookup to resolve to a private IP
      const spy = vi.spyOn(dns, "lookup").mockImplementation((hostname, options, callback) => {
        const cb = typeof options === "function" ? options : callback as any;
        cb(null, [{ address: "192.168.1.1", family: 4 }] as any);
      });

      const result = await validateURL("http://attacker-controlled.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("private/internal IP");
      spy.mockRestore();
    });
  });

  describe("validateURLRedirects", () => {
    it("follows redirects manually and returns the validated final URL", async () => {
      vi.spyOn(dns, "lookup").mockImplementation((_hostname, options, callback) => {
        const cb = typeof options === "function" ? options : callback as any;
        cb(null, [{ address: "8.8.8.8", family: 4 }] as any);
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, {
          status: 302,
          headers: { Location: "https://cdn.example/video.mp4" },
        }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      await expect(validateURLRedirects("https://videos.example/watch")).resolves.toEqual({
        valid: true,
        finalUrl: "https://cdn.example/video.mp4",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
      expect(fetchSpy.mock.calls[1][1]).toMatchObject({ redirect: "manual" });
    });

    it("rejects a redirect to a private destination before requesting it", async () => {
      vi.spyOn(dns, "lookup").mockImplementation((_hostname, options, callback) => {
        const cb = typeof options === "function" ? options : callback as any;
        cb(null, [{ address: "8.8.8.8", family: 4 }] as any);
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/admin" },
        }),
      );

      const result = await validateURLRedirects("https://videos.example/watch");

      expect(result).toMatchObject({ valid: false });
      expect(result.error).toContain("Unsafe redirect destination");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("readResponseBodyWithLimit", () => {
    it("rejects oversized Content-Length before buffering", async () => {
      const response = new Response("small", {
        headers: { "Content-Length": "100" },
      });
      await expect(readResponseBodyWithLimit(response, 10)).rejects.toBeInstanceOf(
        ResponseSizeLimitError,
      );
      expect(response.bodyUsed).toBe(true);
    });

    it("enforces the limit on chunked bodies", async () => {
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(8));
            controller.enqueue(new Uint8Array(8));
            controller.close();
          },
        }),
      );
      await expect(readResponseBodyWithLimit(response, 10)).rejects.toMatchObject({
        receivedBytes: 16,
      });
    });
  });
});
