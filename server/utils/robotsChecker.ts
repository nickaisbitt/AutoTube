const cache = new Map<string, { allowed: boolean; expires: number }>();

export async function isAllowed(domain: string, path: string = '/'): Promise<boolean> {
  const key = `${domain}${path}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.allowed;
  
  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      cache.set(key, { allowed: true, expires: Date.now() + 3600000 });
      return true;
    }
    const text = await res.text();
    const disallow = /Disallow:\s*(.+)/gi;
    const isBlocked = text.split('\n').some(line => {
      const disallowMatch = disallow.exec(line);
      return disallowMatch && disallowMatch[1].trim() === '/';
    });
    cache.set(key, { allowed: !isBlocked, expires: Date.now() + 3600000 });
    return !isBlocked;
  } catch {
    return true;
  }
}
