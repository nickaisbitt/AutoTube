import dns from "dns";
import net from "net";

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
    // Link-local: fe80::/10
    if (ip.toLowerCase().startsWith("fe80:")) return true;
    // Unique local: fc00::/7
    const firstWord = ip.split(":")[0].toLowerCase();
    if (firstWord.startsWith("fc") || firstWord.startsWith("fd")) return true;
    // Multicast: ff00::/8
    if (firstWord.startsWith("ff")) return true;
    
    return false;
  }

  return true; // If not valid IPv4/IPv6, treat as unsafe/private
}

/**
 * Validates URL safety to prevent SSRF attacks.
 * Resolves the domain using DNS and verifies that all resolved IP addresses are safe/public.
 */
export async function validateURL(urlString: string): Promise<{ valid: boolean; error?: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch (err) {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow http/https protocols
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { valid: false, error: `Unsupported protocol: ${parsedUrl.protocol}` };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  
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
  if (blockedSuffixes.some(suffix => hostname === suffix || hostname.endsWith(suffix))) {
    return { valid: false, error: "Access to internal/metadata hosts is forbidden" };
  }

  // Resolve hostname and check all IPs
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve({ valid: false, error: "DNS resolution failed or returned no addresses" });
        return;
      }

      for (const addr of addresses) {
        if (isPrivateIP(addr.address)) {
          resolve({ valid: false, error: `Access to private/internal IP is forbidden (${addr.address})` });
          return;
        }
      }
      
      resolve({ valid: true });
    });
  });
}
