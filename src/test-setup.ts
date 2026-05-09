import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Ensure DEV_SERVER_URL is set for server-side render tests
process.env.DEV_SERVER_URL = process.env.DEV_SERVER_URL || 'http://localhost:5173';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
