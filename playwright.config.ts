import { defineConfig } from '@playwright/test'

process.env.VITE_ARCHIVE_DB_NAME ??= `zajianfa-e2e-run-${process.pid}-${Date.now()}`
process.env.VITE_ALLOW_ARCHIVE_DB_OVERRIDE = 'true'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
