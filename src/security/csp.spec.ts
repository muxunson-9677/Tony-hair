/// <reference types="node" />

import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import { CONTENT_SECURITY_POLICY } from './csp'

const expected = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' blob: data: https://*.public.blob.vercel-storage.com; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

describe('content security policy', () => {
  test('keeps the approved strict policy exact', () => {
    expect(CONTENT_SECURITY_POLICY).toBe(expected)
  })

  test('applies the same policy to every Vercel response', async () => {
    const vercel = JSON.parse(await readFile(`${process.cwd()}/vercel.json`, 'utf8'))
    const cspHeader = vercel.headers
      .find((rule: { source: string }) => rule.source === '/(.*)')
      ?.headers.find((header: { key: string }) => header.key === 'Content-Security-Policy')

    expect(cspHeader?.value).toBe(expected)
  })
})
