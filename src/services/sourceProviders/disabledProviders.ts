/**
 * Providers excluded from harvest (e.g. Pexels — low quality / user preference).
 * Set VITE_DISABLED_PROVIDERS="Pexels,Pexels Videos,Picsum" or AUTOTUBE_DISABLED_PROVIDERS at build time.
 */

const DEFAULT_DISABLED = ['Pexels', 'Pexels Videos', 'Picsum'];

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** @returns lowercased provider names to exclude */
export function getDisabledProviderNames(): Set<string> {
  const fromVite =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_DISABLED_PROVIDERS
      ? String(import.meta.env.VITE_DISABLED_PROVIDERS)
      : '';
  const combined = [...DEFAULT_DISABLED, ...parseList(fromVite)];
  return new Set(combined.map((n) => n.toLowerCase()));
}

export function isProviderDisabled(providerName: string): boolean {
  return getDisabledProviderNames().has(providerName.toLowerCase());
}
