import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'strip-hashbang',
      enforce: 'pre',
      transform(code) {
        if (code.startsWith('#!')) {
          return {
            code: code.replace(/^#![^\n]*/, '// stripped hashbang'),
            map: null
          };
        }
      }
    }
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx', 'server/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**/*.ts', 'src/utils/**/*.ts', 'server/routes/**/*.ts', 'server/middleware/**/*.ts', 'server/utils/**/*.ts'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 50,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
