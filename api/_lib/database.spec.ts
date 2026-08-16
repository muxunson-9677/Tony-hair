import { describe, expect, it } from 'vitest'

import { NeonDatabase } from './database'

function databaseReturning(row: Record<string, unknown>) {
  const database = new NeonDatabase('postgresql://user:password@example.com/database')
  let calls = 0
  Reflect.set(database, 'sql', {
    query: async () => {
      calls += 1
      return [row]
    },
  })
  return { database, calls: () => calls }
}

describe('Neon read snapshots', () => {
  it('reads public poll state, options, and viewer status in one SQL statement', async () => {
    const { database, calls } = databaseReturning({
      outcome: 'active',
      title: '帮我选短发',
      expires_at: '2026-08-17T00:00:00.000Z',
      viewer_has_voted: true,
      options: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: '方案',
          disclosure: 'demo',
          imageUrl: 'https://blob.example/one.webp',
        },
      ],
    })
    const result = await database.getPoll({
      pollId: 'poll_1234567890123456',
      voterCookieHash: 'a'.repeat(64),
      now: new Date('2026-08-10T00:00:00.000Z'),
    })
    expect(calls()).toBe(1)
    expect(result).toMatchObject({ outcome: 'active', poll: { viewerHasVoted: true } })
  })

  it('reads result state, totals, option counts, and comments in one SQL statement', async () => {
    const { database, calls } = databaseReturning({
      outcome: 'active',
      total: 2,
      none: 1,
      options: [{ optionId: '11111111-1111-4111-8111-111111111111', votes: 1 }],
      comments: [{ comment: '<b>字面</b>', createdAt: '2026-08-10T00:00:00.000Z' }],
    })
    const result = await database.getResults({
      pollId: 'poll_1234567890123456',
      managementTokenHash: 'b'.repeat(64),
      now: new Date('2026-08-10T00:00:00.000Z'),
    })
    expect(calls()).toBe(1)
    expect(result).toMatchObject({ outcome: 'active', results: { total: 2, none: 1 } })
  })
})
