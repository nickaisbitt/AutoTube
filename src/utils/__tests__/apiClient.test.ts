import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiHeaders, getAutotubeApiKey, isPrivilegedApiUrl, setAutotubeApiKey } from '../apiClient';
import { fetchWithTimeout } from '../fetchWithTimeout';

function headerOf(call: [string, RequestInit?] | undefined, name: string): string | null {
  return new Headers(call?.[1]?.headers).get(name);
}

describe('apiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setAutotubeApiKey('test-api-key');
  });

  afterEach(() => {
    setAutotubeApiKey('');
    vi.unstubAllGlobals();
  });

  it('attaches X-API-Key to same-origin /api/* requests', async () => {
    await apiFetch('/api/tts/capabilities');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headerOf(fetchMock.mock.calls[0] as [string, RequestInit?], 'X-API-Key')).toBe('test-api-key');
  });

  it('attaches the key to absolute same-origin /api/* URLs', async () => {
    await apiFetch(`${location.origin}/api/search-pexels?q=cats&type=photos`);

    expect(headerOf(fetchMock.mock.calls[0] as [string, RequestInit?], 'X-API-Key')).toBe('test-api-key');
  });

  it('preserves caller headers and body while adding the key', async () => {
    await apiFetch('/api/llm', {
      method: 'POST',
      headers: { Authorization: 'Bearer sk-or-byok', 'Content-Type': 'application/json' },
      body: '{}',
    });

    const call = fetchMock.mock.calls[0] as [string, RequestInit?];
    expect(headerOf(call, 'X-API-Key')).toBe('test-api-key');
    expect(headerOf(call, 'Authorization')).toBe('Bearer sk-or-byok');
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.body).toBe('{}');
  });

  it('never sends the key to third-party hosts with an /api/ path', async () => {
    await apiFetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' });
    await apiFetch('https://images.weserv.nl/?url=x');

    expect(headerOf(fetchMock.mock.calls[0] as [string, RequestInit?], 'X-API-Key')).toBeNull();
    expect(headerOf(fetchMock.mock.calls[1] as [string, RequestInit?], 'X-API-Key')).toBeNull();
  });

  it('does not override an explicit X-API-Key', () => {
    expect(apiHeaders({ 'X-API-Key': 'caller-key' }).get('X-API-Key')).toBe('caller-key');
  });

  it('falls back to VITE_AUTOTUBE_API_KEY when the stored config has no key', async () => {
    const envKey = (import.meta.env.VITE_AUTOTUBE_API_KEY || '').trim();
    setAutotubeApiKey('');

    expect(getAutotubeApiKey()).toBe(envKey);

    await apiFetch('/api/health');
    expect(headerOf(fetchMock.mock.calls[0] as [string, RequestInit?], 'X-API-Key')).toBe(
      envKey || null,
    );
  });

  it('classifies privileged URLs', () => {
    expect(isPrivilegedApiUrl('/api/deep-harvest?q=x')).toBe(true);
    expect(isPrivilegedApiUrl(`${location.origin}/api/llm`)).toBe(true);
    expect(isPrivilegedApiUrl('/assets/logo.png')).toBe(false);
    expect(isPrivilegedApiUrl('https://pixabay.com/api/videos/?key=x')).toBe(false);
    expect(isPrivilegedApiUrl('')).toBe(false);
  });

  it('fetchWithTimeout attaches the key for /api/* and not for third parties', async () => {
    await fetchWithTimeout('/api/search?q=x', {}, { maxRetries: 1 });
    await fetchWithTimeout('https://api.pexels.com/v1/search?query=x', {}, { maxRetries: 1 });

    expect(headerOf(fetchMock.mock.calls[0] as [string, RequestInit?], 'X-API-Key')).toBe('test-api-key');
    expect(headerOf(fetchMock.mock.calls[1] as [string, RequestInit?], 'X-API-Key')).toBeNull();
  });
});
