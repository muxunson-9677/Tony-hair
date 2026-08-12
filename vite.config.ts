import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

import { CONTENT_SECURITY_POLICY } from './src/security/csp.js'

const PRECACHE_PLACEHOLDER = /['"`]__PRECACHE_MANIFEST_JSON__['"`]/

const listPublicFiles = (subdirectory: string) => {
  try {
    return readdirSync(fileURLToPath(new URL(`./public/${subdirectory}`, import.meta.url)))
      .map((file) => `/${subdirectory}/${file}`)
  } catch {
    return []
  }
}

// 把构建产物与小体积 public 资源清单注入 sw.js 的预缓存占位符。
// mediapipe/* 刻意排除：现场离线用不上，体积过大。
const swPrecachePlugin = (): Plugin => ({
  name: 'tonybao-sw-precache',
  apply: 'build',
  generateBundle(_options, bundle) {
    const swChunk = Object.values(bundle).find(
      (item) => item.type === 'chunk' && item.fileName === 'sw.js',
    )
    if (!swChunk || swChunk.type !== 'chunk') {
      return
    }
    const builtFiles = Object.values(bundle)
      .map(({ fileName }) => fileName)
      .filter((fileName) => fileName !== 'sw.js' && fileName !== 'index.html')
      .map((fileName) => `/${fileName}`)
    const publicFiles = [
      '/manifest.webmanifest',
      ...listPublicFiles('brand'),
      ...listPublicFiles('demo'),
    ]
    const manifestJson = JSON.stringify([...builtFiles, ...publicFiles])
    if (!PRECACHE_PLACEHOLDER.test(swChunk.code)) {
      throw new Error('sw.js precache placeholder not found; refusing to ship an empty offline manifest.')
    }
    swChunk.code = swChunk.code.replace(PRECACHE_PLACEHOLDER, JSON.stringify(manifestJson))
  },
})

export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    },
  },
  plugins: [vue(), swPrecachePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        sw: fileURLToPath(new URL('./src/pwa/sw.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
