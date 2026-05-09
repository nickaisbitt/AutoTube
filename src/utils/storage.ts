export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded for key:', key);
      throw new Error('Storage is full. Please free up space.');
    }
    throw err;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
