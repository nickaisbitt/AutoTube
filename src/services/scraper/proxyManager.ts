export interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5';
  username?: string;
  password?: string;
}

interface ProxyStats {
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
}

export function createProxyAgent(proxy: ProxyConfig): string {
  const auth = proxy.username && proxy.password
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
    : '';
  return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
}

export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private stats: Map<string, ProxyStats> = new Map();
  private roundRobinIndex: number = 0;

  constructor(proxies?: ProxyConfig[]) {
    if (proxies) {
      for (const proxy of proxies) {
        this.addProxy(proxy);
      }
    }
  }

  private key(proxy: ProxyConfig): string {
    return `${proxy.host}:${proxy.port}`;
  }

  addProxy(proxy: ProxyConfig): void {
    const k = this.key(proxy);
    if (!this.stats.has(k)) {
      this.proxies.push(proxy);
      this.stats.set(k, { successCount: 0, failureCount: 0, consecutiveFailures: 0 });
    }
  }

  removeProxy(host: string, port: number): void {
    const k = `${host}:${port}`;
    this.proxies = this.proxies.filter((p) => this.key(p) !== k);
    this.stats.delete(k);
    if (this.roundRobinIndex >= this.proxies.length) {
      this.roundRobinIndex = 0;
    }
  }

  getNextProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.roundRobinIndex % this.proxies.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.proxies.length;
    return proxy;
  }

  getRandomProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  markHealthy(proxy: ProxyConfig): void {
    const stats = this.stats.get(this.key(proxy));
    if (stats) {
      stats.successCount++;
      stats.consecutiveFailures = 0;
    }
  }

  markFailed(proxy: ProxyConfig): void {
    const stats = this.stats.get(this.key(proxy));
    if (stats) {
      stats.failureCount++;
      stats.consecutiveFailures++;
      if (stats.consecutiveFailures >= 3) {
        this.removeProxy(proxy.host, proxy.port);
      }
    }
  }

  getHealthyProxies(): ProxyConfig[] {
    return this.proxies.filter((p) => {
      const stats = this.stats.get(this.key(p));
      if (!stats) return false;
      const total = stats.successCount + stats.failureCount;
      if (total === 0) return true;
      return stats.successCount / total > 0.5;
    });
  }

  toFetchOptions(proxy: ProxyConfig): RequestInit {
    return {
      // @ts-expect-error - proxy agent URL for use with node-fetch or undici dispatcher
      agent: createProxyAgent(proxy),
    };
  }
}
