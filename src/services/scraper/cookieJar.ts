export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
}

const MAX_COOKIES_PER_DOMAIN = 50;
const MAX_COOKIES_TOTAL = 500;

export class CookieJar {
  private cookies: Map<string, Cookie[]> = new Map();
  private totalSize: number = 0;

  private domainKey(domain: string): string {
    return domain.toLowerCase().replace(/^\./, '');
  }

  private isExpired(cookie: Cookie): boolean {
    return cookie.expires !== undefined && cookie.expires.getTime() <= Date.now();
  }

  private evictIfNeeded(domain: string): void {
    const key = this.domainKey(domain);
    const domainCookies = this.cookies.get(key);
    if (!domainCookies) return;

    while (domainCookies.length > MAX_COOKIES_PER_DOMAIN) {
      domainCookies.shift();
      this.totalSize--;
    }

    while (this.totalSize > MAX_COOKIES_TOTAL) {
      let evicted = false;
      for (const [k, list] of this.cookies) {
        if (list.length > 0) {
          list.shift();
          this.totalSize--;
          if (list.length === 0) this.cookies.delete(k);
          evicted = true;
          break;
        }
      }
      if (!evicted) break;
    }
  }

  setCookie(cookie: Cookie): void {
    const key = this.domainKey(cookie.domain);

    if (!this.cookies.has(key)) {
      this.cookies.set(key, []);
    }

    const domainCookies = this.cookies.get(key)!;
    const existingIndex = domainCookies.findIndex(
      (c) => c.name === cookie.name && c.path === cookie.path
    );

    if (existingIndex !== -1) {
      domainCookies[existingIndex] = cookie;
    } else {
      domainCookies.push(cookie);
      this.totalSize++;
    }

    this.evictIfNeeded(cookie.domain);
  }

  getCookies(domain: string, path?: string): Cookie[] {
    const key = this.domainKey(domain);
    const domainCookies = this.cookies.get(key);
    if (!domainCookies) return [];

    this.clearExpired();

    const current = this.cookies.get(key);
    if (!current) return [];

    return current.filter((c) => {
      if (this.isExpired(c)) return false;
      if (path && !path.startsWith(c.path)) return false;
      return true;
    });
  }

  getCookieHeader(domain: string, path?: string): string {
    return this.getCookies(domain, path)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  parseSetCookie(header: string, domain: string): Cookie[] {
    const cookies: Cookie[] = [];
    const parts = header.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);

    for (const part of parts) {
      const segments = part.split(';').map((s) => s.trim());
      if (segments.length === 0 || !segments[0].includes('=')) continue;

      const [name, ...valueParts] = segments[0].split('=');
      const value = valueParts.join('=');

      const cookie: Cookie = {
        name: name.trim(),
        value: value.trim(),
        domain,
        path: '/',
      };

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i].toLowerCase().trim();
        if (seg.startsWith('expires=')) {
          const dateStr = segments[i].substring('expires='.length).trim();
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) cookie.expires = date;
        } else if (seg.startsWith('max-age=')) {
          const seconds = parseInt(seg.substring('max-age='.length), 10);
          if (!isNaN(seconds)) {
            cookie.expires = new Date(Date.now() + seconds * 1000);
          }
        } else if (seg.startsWith('path=')) {
          cookie.path = segments[i].substring('path='.length).trim();
        } else if (seg.startsWith('domain=')) {
          cookie.domain = segments[i].substring('domain='.length).trim();
        } else if (seg === 'httponly') {
          cookie.httpOnly = true;
        } else if (seg === 'secure') {
          cookie.secure = true;
        }
      }

      cookies.push(cookie);
    }

    return cookies;
  }

  clearExpired(): void {
    for (const [key, domainCookies] of this.cookies) {
      const before = domainCookies.length;
      const filtered = domainCookies.filter((c) => !this.isExpired(c));
      this.totalSize -= before - filtered.length;

      if (filtered.length === 0) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, filtered);
      }
    }
  }

  clearDomain(domain: string): void {
    const key = this.domainKey(domain);
    const domainCookies = this.cookies.get(key);
    if (domainCookies) {
      this.totalSize -= domainCookies.length;
      this.cookies.delete(key);
    }
  }

  size(): number {
    return this.totalSize;
  }
}

export const globalCookieJar: CookieJar = new CookieJar();
