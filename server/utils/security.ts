import dns from "dns";
import net from "net";
import type { LookupFunction } from "net";
import {
  Agent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type URLValidationResult =
  | {
      valid: true;
      url: string;
      addresses: readonly ResolvedAddress[];
    }
  | {
      valid: false;
      error: string;
    };

export type PinnedFetchInit = {
  headers?: HeadersInit;
  method?: "GET" | "HEAD";
  redirect?: "manual";
  signal?: AbortSignal | null;
};

export class ResponseSizeLimitError extends Error {
  readonly maxBytes: number;
  readonly receivedBytes: number;

  constructor(maxBytes: number, receivedBytes: number) {
    super(`Response exceeds the ${maxBytes} byte limit`);
    this.name = "ResponseSizeLimitError";
    this.maxBytes = maxBytes;
    this.receivedBytes = receivedBytes;
  }
}

/**
 * Checks if an IP address is loopback, private, multicast, link-local, or unique-local.
 * Supports IPv4, IPv6, and IPv4-mapped IPv6 addresses.
 */
export function isPrivateIP(ip: string): boolean {
  // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return true; // Malformed IPv4, treat as private/unsafe
    const [p0, p1] = parts;
    
    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return true;
    // 10.0.0.0/8 (Private-Use)
    if (p0 === 10) return true;
    // 172.16.0.0/12 (Private-Use)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16 (Private-Use)
    if (p0 === 192 && p1 === 168) return true;
    // 169.254.0.0/16 (Link-Local)
    if (p0 === 169 && p1 === 254) return true;
    // 100.64.0.0/10 (Carrier-grade NAT / Shared Address Space)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    // 0.0.0.0/8 (Current network/Local)
    if (p0 === 0) return true;
    // 224.0.0.0/4 (Multicast) or 240.0.0.0/4 (Reserved)
    if (p0 >= 224) return true;
    
    return false;
  }

  if (net.isIPv6(ip)) {
    // Normalise loopback
    if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
    // Unspecified address
    if (ip === "::" || ip === "0:0:0:0:0:0:0:0") return true;
    const firstWord = Number.parseInt(ip.split(":")[0] || "0", 16);
    // Link-local: fe80::/10
    if ((firstWord & 0xffc0) === 0xfe80) return true;
    // Unique local: fc00::/7
    if ((firstWord & 0xfe00) === 0xfc00) return true;
    // Multicast: ff00::/8
    if ((firstWord & 0xff00) === 0xff00) return true;
    
    return false;
  }

  return true; // If not valid IPv4/IPv6, treat as unsafe/private
}

/**
 * Validates URL safety to prevent SSRF attacks.
 * Resolves the domain using DNS and verifies that all resolved IP addresses are
 * safe/public. The returned addresses must be passed to fetchPinnedURL so the
 * socket cannot perform a second, attacker-controlled DNS lookup.
 */
export async function validateURL(urlString: string): Promise<URLValidationResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow http/https protocols
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { valid: false, error: `Unsupported protocol: ${parsedUrl.protocol}` };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { valid: false, error: "URLs containing credentials are forbidden" };
  }

  const hostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  
  // Fast path for loopback and local strings
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return { valid: false, error: "Access to loopback hosts is forbidden" };
  }

  // Check known cloud/internal host suffixes
  const blockedSuffixes = [
    ".internal",
    ".local",
    "metadata.google.internal",
    "metadata.azure.com",
    "instance-data",
  ];
  if (blockedSuffixes.some(
    (suffix) =>
      hostname === suffix.replace(/^\./, "") || hostname.endsWith(suffix),
  )) {
    return { valid: false, error: "Access to internal/metadata hosts is forbidden" };
  }

  if (net.isIP(hostname)) {
    return isPrivateIP(hostname)
      ? { valid: false, error: `Access to private/internal IP is forbidden (${hostname})` }
      : {
          valid: true,
          url: parsedUrl.toString(),
          addresses: [{
            address: hostname,
            family: net.isIP(hostname) as 4 | 6,
          }],
        };
  }

  // Resolve hostname and check all IPs
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve({ valid: false, error: "DNS resolution failed or returned no addresses" });
        return;
      }

      const resolvedAddresses: ResolvedAddress[] = [];
      for (const addr of addresses) {
        if (isPrivateIP(addr.address)) {
          resolve({ valid: false, error: `Access to private/internal IP is forbidden (${addr.address})` });
          return;
        }
        resolvedAddresses.push({
          address: addr.address,
          family: net.isIP(addr.address) as 4 | 6,
        });
      }
      
      resolve({
        valid: true,
        url: parsedUrl.toString(),
        addresses: resolvedAddresses,
      });
    });
  });
}

function createPinnedLookup(
  addresses: readonly ResolvedAddress[],
): LookupFunction {
  return (_hostname, options, callback) => {
    const requestedFamily = options.family;
    const candidates = requestedFamily === 4 || requestedFamily === 6
      ? addresses.filter(({ family }) => family === requestedFamily)
      : [...addresses];

    if (candidates.length === 0) {
      const error = new Error(
        `No validated address is available for IPv${requestedFamily}`,
      ) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
      return;
    }

    if (options.all) {
      callback(null, candidates);
      return;
    }

    const [selected] = candidates;
    callback(null, selected.address, selected.family);
  };
}

/**
 * Fetches a URL through a one-request dispatcher whose DNS lookup can only
 * return addresses from validateURL. Undici still uses the original URL as the
 * HTTP Host / HTTP/2 authority and TLS SNI, so certificate checks are preserved.
 *
 * Redirects are deliberately manual: every destination needs a new validation
 * result and dispatcher. Network-level egress filtering remains defense in depth
 * for non-Node clients and unusual routing configurations.
 */
export async function fetchPinnedURL(
  urlString: string,
  validation: Extract<URLValidationResult, { valid: true }>,
  init: PinnedFetchInit = {},
): Promise<Response> {
  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(urlString).toString();
  } catch {
    throw new Error("Cannot fetch an invalid URL");
  }

  if (normalizedUrl !== validation.url) {
    throw new Error("Pinned fetch validation does not match the requested URL");
  }
  const pinnedAddresses = validation.addresses.map(({ address, family }) => ({
    address,
    family,
  }));
  if (
    pinnedAddresses.length === 0 ||
    pinnedAddresses.some(
      ({ address, family }) =>
        isPrivateIP(address) || net.isIP(address) !== family,
    )
  ) {
    throw new Error("Pinned fetch requires validated public addresses");
  }

  const dispatcher = new Agent({
    autoSelectFamily: false,
    maxCachedSessions: 0,
    connect: {
      lookup: createPinnedLookup(pinnedAddresses),
    },
  });

  try {
    const response = await undiciFetch(normalizedUrl, {
      ...(init as UndiciRequestInit),
      dispatcher,
      redirect: "manual",
    });
    // close() waits for the active response body, then prevents socket reuse.
    void dispatcher.close().catch(() => undefined);
    return response as unknown as Response;
  } catch (error) {
    await dispatcher.close().catch(() => undefined);
    throw error;
  }
}

export type RedirectValidationResult = {
  valid: boolean;
  finalUrl?: string;
  error?: string;
};

/**
 * Resolves HTTP redirects manually and validates every destination before it
 * can be requested. The returned final URL should be used by the caller.
 */
export async function validateURLRedirects(
  urlString: string,
  maxRedirects = 5,
): Promise<RedirectValidationResult> {
  let currentUrl = urlString;
  let safety = await validateURL(currentUrl);
  if (!safety.valid) return safety;

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    let response: Response;
    try {
      response = await fetchPinnedURL(currentUrl, safety, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { valid: false, error: "Unable to verify URL redirects" };
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      return { valid: true, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) {
      return { valid: false, error: "Redirect response is missing a destination" };
    }
    if (redirects === maxRedirects) {
      return { valid: false, error: "Too many redirects" };
    }

    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      return { valid: false, error: "Invalid redirect destination" };
    }

    safety = await validateURL(currentUrl);
    if (!safety.valid) {
      return {
        valid: false,
        error: `Unsafe redirect destination: ${safety.error || "URL blocked"}`,
      };
    }
  }

  return { valid: false, error: "Too many redirects" };
}

/**
 * Reads an upstream response incrementally. Content-Length is rejected before
 * reading when possible, while the streaming check handles absent or false
 * headers and limits decompressed bytes.
 */
export async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength.trim())) {
    const declaredBytes = Number(contentLength);
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ResponseSizeLimitError(maxBytes, declaredBytes);
    }
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ResponseSizeLimitError(maxBytes, totalBytes);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}
