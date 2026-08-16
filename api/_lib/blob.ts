import { BlobNotFoundError, del, put } from '@vercel/blob'

export function isMissingBlobError(error: unknown): boolean {
  return error instanceof BlobNotFoundError
}

export interface BlobStore {
  put(
    body: Uint8Array,
    options: { pathname: string; cacheControlMaxAge: number },
  ): Promise<{ url: string }>
  delete(pathnames: string[]): Promise<void>
}

export function createBlobStore(token: string): BlobStore {
  return {
    async put(body, options) {
      const result = await put(options.pathname, Buffer.from(body), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: options.cacheControlMaxAge,
        contentType: options.pathname.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        token,
      })
      return { url: result.url }
    },
    async delete(pathnames) {
      await Promise.all(
        pathnames.map(async (pathname) => {
          try {
            await del(pathname, { token })
          } catch (error) {
            if (!isMissingBlobError(error)) throw error
          }
        }),
      )
    },
  }
}
