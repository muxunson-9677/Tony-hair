import { describe, expect, it } from 'vitest'

import { createPollResultsHandler, type PollResultsDatabase } from './results'

const token = Buffer.alloc(32, 3).toString('base64url')

describe('GET /api/polls/:id/results', () => {
  it('requires the management header and returns aggregated results', async () => {
    const database: PollResultsDatabase = {
      getResults: async ({ managementTokenHash }) =>
        managementTokenHash.length === 64
          ? {
              outcome: 'active',
              results: {
                total: 2,
                none: 1,
                options: [{ optionId: 'id', votes: 1 }],
                comments: [{ comment: '<b>字面文本</b>', createdAt: '2026-08-10T00:00:00.000Z' }],
              },
            }
          : { outcome: 'forbidden' },
    }
    const handler = createPollResultsHandler({
      database,
      managementTokenPepper: 'pepper',
      now: () => 0,
    })
    const missing = new Request('https://app.example/api/polls/poll_1234567890123456/results')
    expect((await handler(missing)).status).toBe(401)
    const valid = new Request('https://app.example/api/polls/poll_1234567890123456/results', {
      headers: { 'x-poll-management-token': token },
    })
    const response = await handler(valid)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      comments: [{ comment: '<b>字面文本</b>' }],
    })
  })
})
