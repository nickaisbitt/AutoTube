import { describe, it, expect } from 'vitest';
import {
  applySecondaryStockPolicy,
  isPrimaryWebSource,
  isSecondaryStockSource,
} from '../sourceProviders/providerTiers';

describe('providerTiers', () => {
  it('classifies stock APIs as secondary', () => {
    expect(isSecondaryStockSource('Pexels · John Doe')).toBe(true);
    expect(isSecondaryStockSource('Pixabay · user')).toBe(true);
    expect(isSecondaryStockSource('unsplash')).toBe(true);
    expect(isSecondaryStockSource('Picsum (Unsplash fallback)')).toBe(true);
  });

  it('classifies web harvest as primary', () => {
    expect(isPrimaryWebSource('Deep Harvest (nytimes.com)')).toBe(true);
    expect(isPrimaryWebSource('DuckDuckGo · example.com')).toBe(true);
    expect(isPrimaryWebSource('Wikimedia Commons')).toBe(true);
    expect(isPrimaryWebSource('Pexels · photographer')).toBe(false);
  });

  it('demotes stock when enough strong primary web results exist', () => {
    const scored = [
      { source: 'Deep Harvest (bbc.com)', finalScore: 420, url: 'a' },
      { source: 'DuckDuckGo · reuters.com', finalScore: 380, url: 'b' },
      { source: 'Pexels · Jane', finalScore: 410, url: 'c' },
    ];

    applySecondaryStockPolicy(scored);

    expect(scored[0].source).toContain('Deep Harvest');
    expect(scored[1].source).toContain('DuckDuckGo');
    expect(scored[2].source).toContain('Pexels');
    expect(scored[2].finalScore).toBeLessThan(scored[0].finalScore);
  });

  it('keeps stock competitive when primary web results are thin', () => {
    const scored = [
      { source: 'Pexels · Jane', finalScore: 350, url: 'c' },
      { source: 'DuckDuckGo · weak.com', finalScore: 80, url: 'b' },
    ];

    const before = scored[0].finalScore;
    applySecondaryStockPolicy(scored);
    expect(scored[0].finalScore).toBe(before);
  });
});
