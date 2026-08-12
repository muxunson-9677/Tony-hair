import { describe, expect, it } from 'vitest'

import { exportShareImage, safeShareFilename, type ShareExportDependencies } from './shareExport'

const blob = new Blob(['png'], { type: 'image/png' })

const createHarness = (options: {
  canShare: boolean
  shareError?: Error
}) => {
  const calls: string[] = []
  let downloadedName = ''
  const anchor = {
    href: '',
    download: '',
    click: () => { calls.push('click') },
    remove: () => { calls.push('remove') },
  } as unknown as HTMLAnchorElement
  const dependencies: ShareExportDependencies = {
    canShareFiles: () => options.canShare,
    shareFiles: async () => {
      calls.push('share')
      if (options.shareError) {
        throw options.shareError
      }
    },
    createObjectURL: () => { calls.push('createObjectURL'); return 'blob:test' },
    revokeObjectURL: () => { calls.push('revokeObjectURL') },
    createAnchor: () => {
      calls.push('createAnchor')
      return new Proxy(anchor, {
        set(target, property, value) {
          if (property === 'download') {
            downloadedName = String(value)
          }
          Reflect.set(target, property, value)
          return true
        },
      })
    },
  }
  return { calls, dependencies, downloadedName: () => downloadedName }
}

describe('exportShareImage', () => {
  it('uses the system share sheet when available', async () => {
    const { calls, dependencies } = createHarness({ canShare: true })
    const outcome = await exportShareImage(blob, '咋剪发-对比图', dependencies)
    expect(outcome).toBe('shared')
    expect(calls).toEqual(['share'])
  })

  it('falls back to a download when file sharing is unsupported', async () => {
    const { calls, dependencies, downloadedName } = createHarness({ canShare: false })
    const outcome = await exportShareImage(blob, '咋剪发-对比图', dependencies)
    expect(outcome).toBe('downloaded')
    expect(calls).toContain('click')
    expect(calls).toContain('revokeObjectURL')
    expect(downloadedName()).toBe('咋剪发-对比图.png')
  })

  it('falls back to a download when sharing fails for a non-cancel reason', async () => {
    const { calls, dependencies } = createHarness({
      canShare: true,
      shareError: new Error('share broke'),
    })
    const outcome = await exportShareImage(blob, '图', dependencies)
    expect(outcome).toBe('downloaded')
    expect(calls).toContain('share')
    expect(calls).toContain('click')
  })

  it('respects user cancellation without forcing a download', async () => {
    const { calls, dependencies } = createHarness({
      canShare: true,
      shareError: new DOMException('user cancelled', 'AbortError'),
    })
    const outcome = await exportShareImage(blob, '图', dependencies)
    expect(outcome).toBe('cancelled')
    expect(calls).toEqual(['share'])
  })
})

describe('safeShareFilename', () => {
  it('strips characters that break filesystems', () => {
    expect(safeShareFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('falls back for empty names', () => {
    expect(safeShareFilename('  ')).toBe('分享图')
  })
})
