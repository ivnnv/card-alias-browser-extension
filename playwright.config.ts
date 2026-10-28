import { defineConfig } from '@playwright/test';

// Runs against the production build in .output/chrome-mv3, so run `bun run build` first.
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.e2e.ts',
  timeout: 30_000,
  reporter: 'list',
});
