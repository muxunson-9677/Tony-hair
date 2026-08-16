import { HttpError } from './http'

export interface RuntimeConfig {
  accessCodeHash: string
  blobToken: string
  cookieSigningSecret: string
  cronSecret: string
  databaseUrl: string
  managementTokenPepper: string
}

export function readRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
  const required = [
    'ACCESS_CODE_HASH',
    'BLOB_READ_WRITE_TOKEN',
    'COOKIE_SIGNING_SECRET',
    'CRON_SECRET',
    'DATABASE_URL',
    'MANAGEMENT_TOKEN_PEPPER',
  ] as const
  for (const name of required) {
    if (!environment[name]) {
      throw new HttpError(503, 'SERVER_MISCONFIGURED', `缺少服务端配置：${name}`)
    }
  }
  const invalid = (name: string): never => {
    throw new HttpError(503, 'SERVER_MISCONFIGURED', `服务端配置格式无效：${name}`)
  }
  if (!/^scrypt\$v1\$/.test(environment.ACCESS_CODE_HASH!)) invalid('ACCESS_CODE_HASH')
  if (environment.BLOB_READ_WRITE_TOKEN!.length < 20) invalid('BLOB_READ_WRITE_TOKEN')
  if (environment.COOKIE_SIGNING_SECRET!.length < 32) invalid('COOKIE_SIGNING_SECRET')
  if (environment.CRON_SECRET!.length < 32) invalid('CRON_SECRET')
  if (environment.MANAGEMENT_TOKEN_PEPPER!.length < 32) invalid('MANAGEMENT_TOKEN_PEPPER')
  try {
    const databaseUrl = new URL(environment.DATABASE_URL!)
    if (databaseUrl.protocol !== 'postgres:' && databaseUrl.protocol !== 'postgresql:') {
      invalid('DATABASE_URL')
    }
  } catch {
    invalid('DATABASE_URL')
  }
  return {
    accessCodeHash: environment.ACCESS_CODE_HASH!,
    blobToken: environment.BLOB_READ_WRITE_TOKEN!,
    cookieSigningSecret: environment.COOKIE_SIGNING_SECRET!,
    cronSecret: environment.CRON_SECRET!,
    databaseUrl: environment.DATABASE_URL!,
    managementTokenPepper: environment.MANAGEMENT_TOKEN_PEPPER!,
  }
}
