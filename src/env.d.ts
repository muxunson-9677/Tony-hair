/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_ARCHIVE_DB_OVERRIDE?: string
  readonly VITE_ARCHIVE_DB_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
