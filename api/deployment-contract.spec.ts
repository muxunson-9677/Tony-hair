/// <reference types="node" />

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

async function readJson(pathname: string) {
  return JSON.parse(await readFile(`${process.cwd()}/${pathname}`, 'utf8'))
}

describe('deployment contract', () => {
  it('runs the protected cleanup endpoint once per day', async () => {
    const vercel = await readJson('vercel.json')

    expect(vercel.crons).toEqual([
      {
        path: '/api/internal/cleanup',
        schedule: '0 3 * * *',
      },
    ])
  })

  it('keeps the SPA fallback away from API routes', async () => {
    const vercel = await readJson('vercel.json')
    const fallback = vercel.rewrites.find(
      (rewrite: { destination?: string }) => rewrite.destination === '/index.html',
    )

    expect(fallback).toEqual({
      source: '/((?!api(?:/|$)).*)',
      destination: '/index.html',
    })
  })

  it('pins Node and npm in package metadata and the lockfile', async () => {
    const packageJson = await readJson('package.json')
    const packageLock = await readJson('package-lock.json')

    expect(packageJson.engines?.node).toBe('24.19.0')
    expect(packageJson.packageManager).toBe('npm@11.17.0')
    expect(packageLock.packages?.['']?.engines?.node).toBe('24.19.0')
  })

  it('uses the exact toolchain and verifies bundled MediaPipe assets in CI', async () => {
    const workflow = await readFile(
      `${process.cwd()}/.github/workflows/ci.yml`,
      'utf8',
    )

    expect(workflow).toContain('node-version: 24.19.0')
    expect(workflow).toContain('npm install --global npm@11.17.0')
    expect(workflow).toContain('run: npm run verify:mediapipe')
  })

  it('reserves Playwright minutes for pull requests and the main branch', async () => {
    const workflow = await readFile(
      `${process.cwd()}/.github/workflows/ci.yml`,
      'utf8',
    )

    expect(workflow).toContain(
      "if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'",
    )
  })

  it('keeps test sources out of Vercel function discovery', async () => {
    const vercelIgnore = await readFile(
      `${process.cwd()}/.vercelignore`,
      'utf8',
    )
    const patterns = vercelIgnore.split(/\r?\n/)

    expect(patterns).toContain('**/*.spec.ts')
    expect(patterns).toEqual(
      expect.arrayContaining(['.env', '.env.*', '!.env.example']),
    )
  })

  it('gives Vercel functions explicit Node TypeScript resolution at the root', async () => {
    const tsconfig = await readJson('tsconfig.json')

    expect(tsconfig.compilerOptions).toMatchObject({
      module: 'ESNext',
      moduleResolution: 'Bundler',
      types: ['node'],
    })
  })
})
