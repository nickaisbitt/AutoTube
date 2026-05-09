export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
}

const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  batchRender: { name: 'batchRender', enabled: true, rolloutPercentage: 100 },
  socialUpload: { name: 'socialUpload', enabled: false, rolloutPercentage: 100 },
  videoComparison: { name: 'videoComparison', enabled: true, rolloutPercentage: 100 },
  analytics: { name: 'analytics', enabled: true, rolloutPercentage: 100 },
};

const STORAGE_KEY = 'autotube_feature_flags';

function getOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    // ignore
  }
  return {};
}

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export const FEATURE_FLAGS: Readonly<Record<string, FeatureFlag>> = DEFAULT_FLAGS;

export function isFeatureEnabled(flag: string, userId?: string): boolean {
  const overrides = getOverrides();
  if (flag in overrides) return overrides[flag];

  const definition = DEFAULT_FLAGS[flag];
  if (!definition) return false;
  if (!definition.enabled) return false;

  if (definition.rolloutPercentage >= 100) return true;
  if (definition.rolloutPercentage <= 0) return false;

  if (userId) {
    const bucket = hashUserId(userId) % 100;
    return bucket < definition.rolloutPercentage;
  }

  return Math.random() * 100 < definition.rolloutPercentage;
}

export function setFeatureFlag(flag: string, enabled: boolean): void {
  const overrides = getOverrides();
  overrides[flag] = enabled;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetFeatureFlags(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAllFlags(): Array<FeatureFlag & { overridden?: boolean }> {
  const overrides = getOverrides();
  return Object.values(DEFAULT_FLAGS).map(flag => ({
    ...flag,
    overridden: flag.name in overrides,
    enabled: flag.name in overrides ? overrides[flag.name] : flag.enabled,
  }));
}
