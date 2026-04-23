import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid({ ssr: false, dev: true })],
  test: {
    environment: 'jsdom',
    globals: true,
    transformMode: { web: [/\.[jt]sx?$/] },
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    conditions: ['browser', 'development', 'module', 'import', 'default'],
  },
});
