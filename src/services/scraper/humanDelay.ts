interface HumanDelayOptions {
  minMs?: number;
  maxMs?: number;
  meanMs?: number;
  stddevMs?: number;
}

const domainLastRequest: Map<string, number> = new Map();
const requestTimestamps: number[] = [];

function gaussianRandom(mean: number, stddev: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stddev + mean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function humanDelaySync(options?: HumanDelayOptions): number {
  const minMs = options?.minMs ?? 1000;
  const maxMs = options?.maxMs ?? 4000;
  const meanMs = options?.meanMs ?? (minMs + maxMs) / 2;
  const stddevMs = options?.stddevMs ?? (maxMs - minMs) / 6;

  const raw = gaussianRandom(meanMs, stddevMs);
  return Math.round(clamp(raw, minMs, maxMs));
}

export async function humanDelay(options?: HumanDelayOptions): Promise<void> {
  const ms = humanDelaySync(options);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rateLimitDelay(domain: string): Promise<void> {
  const now = Date.now();
  const last = domainLastRequest.get(domain) ?? 0;
  const minGap = 1000 + Math.random() * 2000;
  const elapsed = now - last;

  if (elapsed < minGap) {
    const waitMs = Math.round(minGap - elapsed);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  domainLastRequest.set(domain, Date.now());
}

export async function burstProtection(requestCount: number): Promise<void> {
  const now = Date.now();
  const windowMs = 30_000;
  const threshold = 10;

  requestTimestamps.push(now);

  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - windowMs) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= threshold) {
    const backoffMs = 5000 * Math.pow(1.5, Math.floor(requestCount / threshold) - 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 60_000)));
  }
}
