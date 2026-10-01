/**
 * Providers excluded from harvest.
 * Picsum is disabled by default (random, irrelevant). Pexels/Pixabay are enabled when API keys
 * exist but rank as secondary behind web harvest (see providerTiers.ts).
 * Override: VITE_DISABLED_PROVIDERS or AUTOTUBE_DISABLED_PROVIDERS at build time.
 */

const DEFAULT_DISABLED = ['Picsum'];

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
