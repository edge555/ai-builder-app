import { defineConfig } from 'vitest/config';

const pool = process.env.VITEST_POOL ?? 'forks';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'app/api/__tests__/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    environment: 'node',
    pool,
    poolOptions: pool === 'forks'
      ? {
          forks: {
            maxForks: 2,
            minForks: 1,
          },
        }
      : undefined,
    setupFiles: ['./lib/__tests__/setup.ts'],
    globals: false,
    testTimeout: 10000,
  },
});
