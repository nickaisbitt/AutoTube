export interface StyleParticleConfig {
  style: string
  particleType: string
  count: number
  colors: string[]
  behavior: 'float_up' | 'float_down' | 'drift' | 'orbit' | 'pulse'
  sizeRange: [number, number]
  speedRange: [number, number]
}

export const STYLE_PARTICLE_PRESETS: Record<string, StyleParticleConfig> = {
  warfront: {
    style: 'warfront',
    particleType: 'sparks',
    count: 30,
    colors: ['#ff6b00', '#ff4500', '#ff8c00', '#dc2626'],
    behavior: 'float_up',
    sizeRange: [2, 6],
    speedRange: [0.5, 2.0],
  },
  cyber: {
    style: 'cyber',
    particleType: 'data_streams',
    count: 40,
    colors: ['#00ff41', '#00e5ff', '#00bcd4', '#76ff03'],
    behavior: 'float_down',
    sizeRange: [1, 4],
    speedRange: [1.0, 3.0],
  },
  documentary: {
    style: 'documentary',
    particleType: 'embers',
    count: 20,
    colors: ['#ffd700', '#ffb300', '#ff8f00', '#d4a017'],
    behavior: 'float_up',
    sizeRange: [2, 5],
    speedRange: [0.3, 1.2],
  },
  business_insider: {
    style: 'business_insider',
    particleType: 'dots',
    count: 15,
    colors: ['#2563eb', '#3b82f6', '#93c5fd', '#ffffff'],
    behavior: 'drift',
    sizeRange: [2, 4],
    speedRange: [0.2, 0.8],
  },
  explainer: {
    style: 'explainer',
    particleType: 'orbs',
    count: 22,
    colors: ['#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#10b981'],
    behavior: 'pulse',
    sizeRange: [3, 8],
    speedRange: [0.4, 1.5],
  },
}

const DEFAULT_CONFIG: StyleParticleConfig = {
  style: 'default',
  particleType: 'dots',
  count: 15,
  colors: ['#6b7280', '#9ca3af', '#d1d5db'],
  behavior: 'drift',
  sizeRange: [2, 4],
  speedRange: [0.3, 1.0],
}

export function getParticleConfigForStyle(style: string): StyleParticleConfig {
  const normalized = style.toLowerCase().replace(/\s+/g, '_')
  return STYLE_PARTICLE_PRESETS[normalized] ?? { ...DEFAULT_CONFIG, style: normalized }
}
