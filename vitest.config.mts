import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/services/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/util/**', 'src/services/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, 'src/domain/**': { lines: 90 } },
    },
  },
});
