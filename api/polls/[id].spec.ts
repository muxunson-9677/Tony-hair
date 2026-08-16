import { describe, expect, it } from 'vitest'

import { createSignedCookie, hashOpaqueToken } from '../_lib/security'
import { createPollResourceHandler, type PollResourceDatabase } from './[id]'

const token = Buffer.alloc(32, 9).toString('base64url')

function poll() {
  return {
    pollId: 'poll_1234567890123456',
    title: '帮我选短发',
    expiresAt: new Date('2026-08-17T00:00:00.000Z'),
    viewerHasVoted: false,
    options: [
      { id: '11111111-1111-4111-8111-111111111111', label: '<b>短发</b>', disclosure: 'demo' as const, imageUrl: 'https://blob/1' },
      { id: '22222222-2222-4222-8222-222222222222', label: '层次', disclosure: 'reference' as const, imageUrl: 'https://blob/2' },
    ],
  }
}

function request(method = 'GET', managementToken?: string) {
  const headers: Record<string, string> = {}
  if (method === 'DELETE') headers.origin = 'https://app.example'
  if (managementToken) headers['x-poll-management-token'] = managementToken
  return new Request('https://app.example/api/polls/poll_1234567890123456', { method, headers })
}

describe('GET and DELETE /api/polls/:id', () => {
  it('publicly reads literal plain-text option data without login', async () => {
    const db: PollResourceDatabase = {
      getPoll: async () => ({ outcome: 'active', poll: poll() }),
      beginDelete: async () => ({ outcome: 'not_found' }),
      finalizeDelete: async () => undefined,
    }
    const response = await createPollResourceHandler({
      database: db,
      deleteBlobs: async () => undefined,
      managementTokenPepper: 'pepper',
      cookieSecret: 'cookie-secret',
      now: () => 0,
    })(request())
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      title: string
      options: Array<{ label: string; disclosure: string }>
    }
    expect(body.options[0]?.label).toBe('<b>短发</b>')
    expect(body.options[0]?.disclosure).toBe('demo')
    expect(body.title).toBe('帮我选短发')
    expect(response.headers.get('set-cookie')).toMatch(/zjf_voter=.*HttpOnly; SameSite=Lax/)
  })

  it.each([
    ['not_found', 404],
    ['gone', 410],
  ] as const)('maps %s reads to %i', async (outcome, expected) => {
    const db: PollResourceDatabase = {
      getPoll: async () => ({ outcome }),
      beginDelete: async () => ({ outcome: 'not_found' }),
      finalizeDelete: async () => undefined,
    }
    expect(
      (
        await createPollResourceHandler({
          database: db,
          deleteBlobs: async () => undefined,
          managementTokenPepper: 'pepper',
          cookieSecret: 'cookie-secret',
          now: () => 0,
        })(request())
      ).status,
    ).toBe(expected)
  })

  it('tombstones before Blob deletion and finalizes only after deletion succeeds', async () => {
    const events: string[] = []
    const db: PollResourceDatabase = {
      getPoll: async () => ({ outcome: 'gone' }),
      beginDelete: async (input) => {
        events.push('tombstone')
        expect(input.managementTokenHash).toBe(
          hashOpaqueToken('poll-management:poll_1234567890123456', token, 'pepper'),
        )
        return { outcome: 'delete_pending', pathnames: ['polls/one.webp'] }
      },
      finalizeDelete: async () => {
        events.push('finalize')
      },
    }
    const handler = createPollResourceHandler({
      database: db,
      deleteBlobs: async () => {
        events.push('blob')
      },
      managementTokenPepper: 'pepper',
      cookieSecret: 'cookie-secret',
      now: () => 0,
    })
    expect((await handler(request('DELETE', token))).status).toBe(204)
    expect(events).toEqual(['tombstone', 'blob', 'finalize'])
  })

  it('leaves delete_pending for cleanup when Blob deletion fails', async () => {
    let finalized = false
    const db: PollResourceDatabase = {
      getPoll: async () => ({ outcome: 'gone' }),
      beginDelete: async () => ({ outcome: 'delete_pending', pathnames: ['polls/one.webp'] }),
      finalizeDelete: async () => {
        finalized = true
      },
    }
    const response = await createPollResourceHandler({
      database: db,
      deleteBlobs: async () => {
        throw new Error('temporary')
      },
      managementTokenPepper: 'pepper',
      cookieSecret: 'cookie-secret',
      now: () => 0,
    })(request('DELETE', token))
    expect(response.status).toBe(503)
    expect(finalized).toBe(false)
  })

  it('derives viewerHasVoted from a valid voter cookie without exposing the token', async () => {
    let voterHash: string | null = null
    const db: PollResourceDatabase = {
      getPoll: async (input) => {
        voterHash = input.voterCookieHash
        return { outcome: 'active', poll: { ...poll(), viewerHasVoted: input.voterCookieHash !== null } }
      },
      beginDelete: async () => ({ outcome: 'not_found' }),
      finalizeDelete: async () => undefined,
    }
    const signed = createSignedCookie('voter-token', 2_000, 'cookie-secret')
    const response = await createPollResourceHandler({
      database: db,
      deleteBlobs: async () => undefined,
      managementTokenPepper: 'pepper',
      cookieSecret: 'cookie-secret',
      now: () => 1_000,
    })(
      new Request('https://app.example/api/polls/poll_1234567890123456', {
        headers: { cookie: `zjf_voter=${signed}` },
      }),
    )
    expect(voterHash).toMatch(/^[0-9a-f]{64}$/)
    await expect(response.json()).resolves.toMatchObject({ viewerHasVoted: true })
  })
})
