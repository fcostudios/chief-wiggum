import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

// Keep HMR scoped to the app itself. This repo also stores docs, tests, plans,
// and local metadata that should not force a dev-page reload.
const ignoredDevWatchGlobs = [
  '**/src-tauri/**',
  '**/docs/**',
  '**/tests/**',
  '**/test-results/**',
  '**/playwright-report/**',
  '**/blob-report/**',
  '**/.worktrees/**',
  '**/.claude/**',
  '**/.playwright-mcp/**',
  '**/.github/**',
  '**/chief-wiggum.db',
  '**/CLAUDE.md',
  '**/README.md',
  '**/playwright.config.ts',
  '**/vitest.config.ts',
];

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  // Prevent vite from obscuring Rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ignoredDevWatchGlobs,
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
