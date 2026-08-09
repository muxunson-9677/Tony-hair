import { describe, expect, it } from 'vitest'

import { createSignedCookie } from '../../_lib/security'
import { createPollVoteHandler, type VoteDatabase } from './votes'

function request(optionId: string | null, comment: string, cookie = validVoterCookie()) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'https://app.example',
  }
  if (cookie) headers.cookie = cookie
  return new Request('https://app.example/api/polls/poll_1234567890123456/votes', {
    method: 'POST',
    headers,
    body: JSON.stringify({ optionId, comment }),
  })
}

function rawRequest(body: unknown) {
  return new Request('https://app.example/api/polls/poll_1234567890123456/votes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example',
      cookie: validVoterCookie(),
    },
    body: JSON.stringify(body),
  })
}

function validVoterCookie() {
  return `zjf_voter=${createSignedCookie('stable-voter', 2_000, 'cookie-secret')}`
}

function handler(database: VoteDatabase) {
  return createPollVoteHandler({
    database,
    cookieSecret: 'cookie-secret',
    now: () => 1_000,
    randomToken: () => 'voter-token',
  })
}

describe('POST /api/polls/:id/votes', () => {
  it.each([null, []])('rejects a non-object JSON root without counting a vote', async (body) => {
    let calls = 0
    const database: VoteDatabase = {
      castVote: async () => {
        calls += 1
        return 'created'
      },
    }
    const response = await handler(database)(rawRequest(body))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_VOTE_BODY' } })
    expect(calls).toBe(0)
  })

  it('accepts null as 都不合适 and sets a random HttpOnly voter cookie', async () => {
    let observed: Parameters<VoteDatabase['castVote']>[0] | undefined
    const database: VoteDatabase = {
      castVote: async (input) => {
        observed = input
        return 'created'
      },
    }
    const response = await handler(database)(request(null, '都不适合'))
    expect(response.status).toBe(201)
    expect(observed?.optionId).toBeNull()
    expect(observed?.voterCookieHash).toMatch(/^[a-f0-9]{64}$/)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/)
  })

  it('issues a stable cookie without counting when a first vote has no cookie', async () => {
    let calls = 0
    const database: VoteDatabase = {
      castVote: async () => {
        calls += 1
        return 'created'
      },
    }
    const vote = request(null, '', '')
    const [first, second] = await Promise.all([handler(database)(vote.clone()), handler(database)(vote)])
    expect(first.status).toBe(409)
    expect(second.status).toBe(409)
    expect(first.headers.get('set-cookie')).toMatch(/zjf_voter=.*HttpOnly; SameSite=Lax/)
    expect(second.headers.get('set-cookie')).toMatch(/zjf_voter=.*HttpOnly; SameSite=Lax/)
    expect(calls).toBe(0)
  })

  it('enforces 60 Unicode code points after removing NUL', async () => {
    let comment = ''
    const database: VoteDatabase = {
      castVote: async (input) => {
        comment = input.comment
        return 'created'
      },
    }
    expect((await handler(database)(request(null, `${'😀'.repeat(60)}\0`))).status).toBe(201)
    expect([...comment]).toHaveLength(60)
    expect(comment.includes('\0')).toBe(false)
    expect((await handler(database)(request(null, '😀'.repeat(61)))).status).toBe(422)
  })

  it('keeps HTML-shaped text literal and maps cross-poll or concurrent duplicates', async () => {
    let literal = ''
    const created: VoteDatabase = {
      castVote: async (input) => {
        literal = input.comment
        return 'created'
      },
    }
    expect((await handler(created)(request(null, '<b>不要剪</b>'))).status).toBe(201)
    expect(literal).toBe('<b>不要剪</b>')

    const invalid: VoteDatabase = { castVote: async () => 'invalid_option' }
    expect(
      (await handler(invalid)(request('11111111-1111-4111-8111-111111111111', ''))).status,
    ).toBe(422)
    const duplicate: VoteDatabase = { castVote: async () => 'duplicate' }
    expect((await handler(duplicate)(request(null, ''))).status).toBe(409)
  })
})
