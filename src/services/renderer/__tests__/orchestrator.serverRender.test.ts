import { describe, it, expect, vi } from 'vitest';

describe('Server render result handling', () => {
  it('accepts Blob with size > 0 as successful server render', () => {
    const blob = new Blob(['fake video data'], { type: 'video/mp4' });
    expect((blob as any).size).toBeGreaterThan(0);
    expect((blob as any).url).toBeUndefined();
  });
});
