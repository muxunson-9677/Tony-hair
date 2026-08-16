import { describe, expect, it } from 'vitest'

import { createCleanupHandler, type CleanupDatabase } from './cleanup'

function request(secret?: string) {
  return new Request('https://app.example/api/internal/cleanup', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

describe('GET /api/internal/cleanup', () => {
  it('rejects missing or wrong cron authorization', async () => {
    const database: CleanupDatabase = {
      claimCleanup: async () => [],
      finalizeCleanup: async () => undefined,
    }
    const handler = createCleanupHandler({
      database,
      deleteBlobs: async () => undefined,
      cronSecret: 'cron-secret',
      now: () => 0,
      batchSize: 50,
    })
    expect((await handler(request())).status).toBe(401)
    expect((await handler(request('wrong'))).status).toBe(401)
  })

  it('claims a bounded batch, deletes Blob first, and then finalizes', async () => {
    const events: string[] = []
    const database: CleanupDatabase = {
      claimCleanup: async ({ batchSize }) => {
        expect(batchSize).toBe(50)
        events.push('claim')
        return ['polls/a.webp', 'polls/already-missing.webp']
      },
      finalizeCleanup: async () => {
        events.push('finalize')
      },
    }
    const response = await createCleanupHandler({
      database,
      deleteBlobs: async () => {
        events.push('blob')
      },
      cronSecret: 'cron-secret',
      now: () => 1_000,
      batchSize: 50,
    })(request('cron-secret'))
    expect(response.status).toBe(200)
    expect(events).toEqual(['claim', 'blob', 'finalize'])
  })

  it('does not finalize a failed Blob batch and can run twice idempotently', async () => {
    let pending = ['polls/a.webp']
    let deletes = 0
    const database: CleanupDatabase = {
      claimCleanup: async () => [...pending],
      finalizeCleanup: async (pathnames) => {
        pending = pending.filter((pathname) => !pathnames.includes(pathname))
      },
    }
    const handler = createCleanupHandler({
      database,
      deleteBlobs: async () => {
        deletes += 1
        if (deletes === 1) throw new Error('temporary')
      },
      cronSecret: 'cron-secret',
      now: () => 1_000,
      batchSize: 50,
    })
    expect((await handler(request('cron-secret'))).status).toBe(503)
    expect(pending).toEqual(['polls/a.webp'])
    expect((await handler(request('cron-secret'))).status).toBe(200)
    expect((await handler(request('cron-secret'))).status).toBe(200)
    expect(pending).toEqual([])
  })
})
