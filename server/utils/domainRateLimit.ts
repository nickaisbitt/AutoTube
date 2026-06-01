const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_PER_MINUTE = 15;

export async function waitForDomain(domain: string): Promise<void> {
  const bucket = buckets.get(domain) || { count: 0, resetAt: Date.now() + 60000 };
  if (bucket.resetAt <= Date.now()) {
    bucket.count = 0;
    bucket.resetAt = Date.now() + 60000;
  }
  if (bucket.count >= MAX_PER_MINUTE) {
    const delay = bucket.resetAt - Date.now();
    await new Promise(r => setTimeout(r, delay));
    bucket.count = 0;
    bucket.resetAt = Date.now() + 60000;
  }
  bucket.count++;
  buckets.set(domain, bucket);
}
