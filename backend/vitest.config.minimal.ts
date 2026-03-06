import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/__tests__/simple.test.ts'],
    environment: 'node',
  },
});
