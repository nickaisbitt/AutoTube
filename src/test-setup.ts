import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Ensure DEV_SERVER_URL is set for server-side render tests
process.env.DEV_SERVER_URL = process.env.DEV_SERVER_URL || 'http://localhost:5173';

// jsdom does not implement these media APIs; stub them so tests don't emit
// "Not implemented" noise when components try to pause/load media elements.
if (typeof HTMLMediaElement !== 'undefined') {
  const proto = HTMLMediaElement.prototype as HTMLMediaElement & {
    pause?: () => void;
    load?: () => void;
  };

  proto.pause = vi.fn();
  proto.load = vi.fn();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
