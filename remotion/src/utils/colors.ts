export const ACCENT_COLORS: Record<string, string> = {
  intro: '#e74c3c',
  section: '#3498db',
  transition: '#f39c12',
  outro: '#2ecc71',
};

export const TOPIC_PALETTES: Record<string, { bg: string[]; accent: string; text: string }> = {
  finance: { bg: ['#0a1628', '#0d2137', '#091422'], accent: '#ffd700', text: '#e0e0e0' },
  tech: { bg: ['#0a0e17', '#0d1520', '#080c14'], accent: '#00d4ff', text: '#e0e0e0' },
  health: { bg: ['#1a1510', '#201a14', '#16120e'], accent: '#22c55e', text: '#e0e0e0' },
  science: { bg: ['#0f0a1a', '#140d22', '#0c0816'], accent: '#a855f7', text: '#e0e0e0' },
  politics: { bg: ['#1a0a0a', '#201010', '#160808'], accent: '#dc2626', text: '#e0e0e0' },
  general: { bg: ['#1a1510', '#201a14', '#16120e'], accent: '#f97316', text: '#e0e0e0' },
};

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getTopicPalette(topic: string) {
  const t = topic.toLowerCase();
  if (t.includes('financ') || t.includes('econom') || t.includes('money') || t.includes('stock')) return TOPIC_PALETTES.finance;
  if (t.includes('tech') || t.includes('ai') || t.includes('software') || t.includes('cyber')) return TOPIC_PALETTES.tech;
  if (t.includes('health') || t.includes('medic') || t.includes('disease') || t.includes('hospital')) return TOPIC_PALETTES.health;
  if (t.includes('science') || t.includes('physic') || t.includes('chem') || t.includes('research')) return TOPIC_PALETTES.science;
  if (t.includes('politic') || t.includes('elect') || t.includes('vote') || t.includes('govern')) return TOPIC_PALETTES.politics;
  return TOPIC_PALETTES.general;
}
