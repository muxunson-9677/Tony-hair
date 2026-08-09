import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { CONTENT_SECURITY_POLICY } from './src/security/csp.js'

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
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
