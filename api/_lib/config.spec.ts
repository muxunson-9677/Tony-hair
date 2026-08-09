import { describe, expect, it } from 'vitest'

import { readRuntimeConfig } from './config'

describe('runtime config', () => {
  it('reports missing variables without exposing values', () => {
    expect(() => readRuntimeConfig({})).toThrowError(
      expect.objectContaining({ code: 'SERVER_MISCONFIGURED', status: 503 }),
    )
  })

  it('accepts a complete injected environment', () => {
    const config = readRuntimeConfig({
      ACCESS_CODE_HASH:
        'scrypt$v1$16384$8$1$00112233445566778899aabbccddeeff$8f95f0edd763b3c649324a4f153673e4c620efe445a840b16ca341c824e3d76c675d7ad7e6e76dbe4b6f74b8994e69954bb4d99903a2a2b9ff6737347ca5c652',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abcdefghijklmnopqrstuvwxyz',
      COOKIE_SIGNING_SECRET: 'c'.repeat(32),
      CRON_SECRET: 'r'.repeat(32),
      DATABASE_URL: 'postgresql://database',
      MANAGEMENT_TOKEN_PEPPER: 'p'.repeat(32),
    })
    expect(config.databaseUrl).toBe('postgresql://database')
  })

  it('rejects weak secrets and non-Postgres URLs without echoing values', () => {
    const environment = {
      ACCESS_CODE_HASH: 'not-scrypt',
      BLOB_READ_WRITE_TOKEN: 'short',
      COOKIE_SIGNING_SECRET: 'weak-cookie',
      CRON_SECRET: 'weak-cron',
      DATABASE_URL: 'https://example.com/database',
      MANAGEMENT_TOKEN_PEPPER: 'weak-pepper',
    }
    expect(() => readRuntimeConfig(environment)).toThrowError(
      expect.objectContaining({ code: 'SERVER_MISCONFIGURED', status: 503 }),
    )
    try {
      readRuntimeConfig(environment)
    } catch (error) {
      expect(String(error)).not.toContain('weak-cookie')
    }
  })
})
