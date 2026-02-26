/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

const rootDir = process.cwd();
const repoRootDir = resolve(rootDir, '..', '..');

export default defineConfig({
  root: rootDir,
  plugins: [solid()],
  server: {
    fs: {
      allow: [rootDir, repoRootDir],
    },
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [resolve(rootDir, 'src/test/setup.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.*', 'src/index.tsx'],
      thresholds: {
        // Baseline per-file floors for critical stores (CHI-176); ramp upward as coverage improves.
        'src/stores/conversationStore.ts': { lines: 10 },
        'src/stores/sessionStore.ts': { lines: 10 },
        'src/stores/contextStore.ts': { lines: 80 },
        'src/stores/slashStore.ts': { lines: 50 },
        'src/stores/uiStore.ts': { lines: 20 },
      },
    },
    testTransformMode: {
      web: [/\.[jt]sx?$/],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
});
