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
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.*', 'src/index.tsx'],
    },
    testTransformMode: {
      web: [/\.[jt]sx?$/],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
});
