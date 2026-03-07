import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    environment: 'node',
    setupFiles: ['./lib/__tests__/setup.ts'],
    globals: false,
    testTimeout: 10000,
  },
});
