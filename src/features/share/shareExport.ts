export type ShareExportOutcome = 'shared' | 'downloaded' | 'cancelled'

export interface ShareExportDependencies {
  readonly canShareFiles: (files: readonly File[]) => boolean
  readonly shareFiles: (files: readonly File[], title: string) => Promise<void>
  readonly createObjectURL: (blob: Blob) => string
  readonly revokeObjectURL: (url: string) => void
  readonly createAnchor: () => HTMLAnchorElement
}

const defaultDependencies: ShareExportDependencies = {
  canShareFiles: (files) => {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    return typeof nav.share === 'function'
      && typeof nav.canShare === 'function'
      && nav.canShare({ files: [...files] })
  },
  shareFiles: (files, title) => navigator.share({ files: [...files], title }),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createAnchor: () => {
    const anchor = document.createElement('a')
    document.body.append(anchor)
    return anchor
  },
}

export const safeShareFilename = (value: string) => (
  Array.from(value, (character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[ .-]+|[ .-]+$/g, '')
    .slice(0, 60)
  || '分享图'
)

const downloadBlob = (blob: Blob, filename: string, dependencies: ShareExportDependencies) => {
  const url = dependencies.createObjectURL(blob)
  let anchor: HTMLAnchorElement | undefined
  try {
    anchor = dependencies.createAnchor()
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    anchor?.remove()
    dependencies.revokeObjectURL(url)
  }
}

/**
 * 导出策略：优先唤起系统分享面板（微信/小红书直达）；
 * 不支持或分享失败时静默降级为下载；用户主动取消不降级。
 */
export const exportShareImage = async (
  blob: Blob,
  title: string,
  overrides: Partial<ShareExportDependencies> = {},
): Promise<ShareExportOutcome> => {
  const dependencies = { ...defaultDependencies, ...overrides }
  const filename = `${safeShareFilename(title)}.png`
  const file = new File([blob], filename, { type: 'image/png' })

  let canShare: boolean
  try {
    canShare = dependencies.canShareFiles([file])
  } catch {
    canShare = false
  }

  if (canShare) {
    try {
      await dependencies.shareFiles([file], title)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }

  downloadBlob(blob, filename, dependencies)
  return 'downloaded'
}
