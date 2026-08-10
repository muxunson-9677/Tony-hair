import { defineConfig } from '@playwright/test'

process.env.VITE_ARCHIVE_DB_NAME ??= `zajianfa-e2e-run-${process.pid}-${Date.now()}`
process.env.VITE_ALLOW_ARCHIVE_DB_OVERRIDE = 'true'

const rawPort = process.env.PLAYWRIGHT_PORT
if (rawPort !== undefined && !/^[1-9]\d*$/.test(rawPort)) {
  throw new Error('PLAYWRIGHT_PORT must be a base-10 integer between 1024 and 65535.')
}

const port = rawPort === undefined ? 4317 : Number(rawPort)
if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
  throw new Error('PLAYWRIGHT_PORT must be a base-10 integer between 1024 and 65535.')
}

const origin = `http://127.0.0.1:${port}`
const node = `"${process.execPath.replaceAll('"', '\\"')}"`
const vite = 'node_modules/vite/bin/vite.js'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: origin,
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `${node} ${vite} build && ${node} ${vite} preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
  },
})
