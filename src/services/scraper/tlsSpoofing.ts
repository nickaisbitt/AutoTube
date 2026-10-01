export interface TlsProfile {
  name: string;
  ja3Hash: string;
  cipherSuites: string[];
  extensions: string[];
  userAgent: string;
}

export const TLS_FINGERPRINTS: TlsProfile[] = [
  {
    name: 'Chrome 120',
    ja3Hash: 'cd08e31494b9531d9c351a7802d65f04',
    cipherSuites: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-RSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA',
      'AES256-SHA',
    ],
    extensions: [
      'server_name',
      'extended_master_secret',
      'renegotiation_info',
      'supported_groups',
      'ec_point_formats',
      'session_ticket',
      'alpn',
      'status_request',
      'signature_algorithms',
      'signed_certificate_timestamp',
      'key_share',
      'psk_key_exchange_modes',
      'supported_versions',
      'compress_certificate',
      'application_settings',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {
    name: 'Firefox 121',
    ja3Hash: '839bbe3ed680eb425fc7a384e2ab32a9',
    cipherSuites: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-AES256-SHA',
      'ECDHE-ECDSA-AES128-SHA',
      'ECDHE-RSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA',
      'AES256-SHA',
    ],
    extensions: [
      'server_name',
      'extended_master_secret',
      'renegotiation_info',
      'supported_groups',
      'ec_point_formats',
      'session_ticket',
      'alpn',
      'status_request',
      'delegated_credentials',
      'key_share',
      'supported_versions',
      'signature_algorithms',
      'psk_key_exchange_modes',
      'record_size_limit',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  },
  {
    name: 'Safari 17',
    ja3Hash: '72a589da586844d2f94d014f5b26c572',
    cipherSuites: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-ECDSA-AES256-SHA384',
      'ECDHE-ECDSA-AES128-SHA256',
      'ECDHE-RSA-AES256-SHA384',
      'ECDHE-RSA-AES128-SHA256',
      'ECDHE-ECDSA-AES256-SHA',
      'ECDHE-ECDSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'ECDHE-RSA-AES128-SHA',
    ],
    extensions: [
      'server_name',
      'extended_master_secret',
      'renegotiation_info',
      'supported_groups',
      'ec_point_formats',
      'alpn',
      'status_request',
      'signature_algorithms',
      'key_share',
      'psk_key_exchange_modes',
      'supported_versions',
      'grease',
    ],
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  },
  {
    name: 'Edge 120',
    ja3Hash: 'e7d705a3286e19ea42f587b344ee6865',
    cipherSuites: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-RSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA',
      'AES256-SHA',
    ],
    extensions: [
      'server_name',
      'extended_master_secret',
      'renegotiation_info',
      'supported_groups',
      'ec_point_formats',
      'session_ticket',
      'alpn',
      'status_request',
      'signature_algorithms',
      'signed_certificate_timestamp',
      'key_share',
      'psk_key_exchange_modes',
      'supported_versions',
      'compress_certificate',
      'application_settings',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  },
];

export function getRandomTlsProfile(): TlsProfile {
  const index = Math.floor(Math.random() * TLS_FINGERPRINTS.length);
  return TLS_FINGERPRINTS[index];
}

export function generateSecChUa(
  brand: 'chrome' | 'firefox' | 'safari' | 'edge',
  version: string,
): string {
  const majorVersion = version.split('.')[0];

  switch (brand) {
    case 'chrome':
      return `"Not_A Brand";v="8", "Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}"`;
    case 'firefox':
      return `"Not.A/Brand";v="8", "Firefox";v="${majorVersion}"`;
    case 'safari':
      return `"Not_A Brand";v="8", "Safari";v="${majorVersion}"`;
    case 'edge':
      return `"Not_A Brand";v="8", "Chromium";v="${majorVersion}", "Microsoft Edge";v="${majorVersion}"`;
  }
}

function extractVersion(profile: TlsProfile): string {
  const match = profile.userAgent.match(/(?:Chrome|Firefox|Version|Edg)\/(\d+[\d.]*)/);
  return match ? match[1] : '120';
}

function extractBrand(profile: TlsProfile): 'chrome' | 'firefox' | 'safari' | 'edge' {
  const name = profile.name.toLowerCase();
  if (name.includes('firefox')) return 'firefox';
  if (name.includes('safari')) return 'safari';
  if (name.includes('edge')) return 'edge';
  return 'chrome';
}

function getPlatformFromUa(userAgent: string): string {
  if (userAgent.includes('Macintosh')) return '"macOS"';
  if (userAgent.includes('Windows')) return '"Windows"';
  if (userAgent.includes('Linux')) return '"Linux"';
  return '"Unknown"';
}

function isMobileFromUa(userAgent: string): string {
  return userAgent.includes('Mobile') ? '?1' : '?0';
}

export function getFetchOptionsForProfile(profile: TlsProfile): Record<string, string> {
  const brand = extractBrand(profile);
  const version = extractVersion(profile);
  const secChUa = generateSecChUa(brand, version);
  const platform = getPlatformFromUa(profile.userAgent);
  const mobile = isMobileFromUa(profile.userAgent);

  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-CH-UA': secChUa,
    'Sec-CH-UA-Mobile': mobile,
    'Sec-CH-UA-Platform': platform,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  return headers;
}
