import { describe, expect, it } from 'vitest'

import { createSignedCookie, hashOpaqueToken } from './_lib/security'
import { createPollHandler, type PollCreateDatabase } from './polls'

const managementToken = Buffer.alloc(32, 7).toString('base64url')
const cookie = `zjf_session=${createSignedCookie('session', 2_000_000_000_000, 'cookie-secret')}`

function request(body: unknown, token = managementToken) {
  return new Request('https://app.example/api/polls', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      origin: 'https://app.example',
      'x-poll-management-token': token,
    },
    body: JSON.stringify(body),
  })
}

function validBody() {
  return {
    clientRequestId: 'request_1234567890',
    title: '帮我选下次短发',
    options: [
      { assetId: '11111111-1111-4111-8111-111111111111', label: '方案一', disclosure: 'demo' },
      { assetId: '22222222-2222-4222-8222-222222222222', label: '方案二', disclosure: 'reference' },
    ],
  }
}

function database(
  outcome: Awaited<ReturnType<PollCreateDatabase['createPoll']>> = {
    outcome: 'created',
    pollId: 'existing_poll_identifier',
    expiresAt: new Date(1_786_924_800_000),
  },
): PollCreateDatabase {
  return { createPoll: async () => outcome }
}

function handler(db: PollCreateDatabase, randomPollId = () => 'new_poll_identifier_123') {
  return createPollHandler({
    database: db,
    cookieSecret: 'cookie-secret',
    managementTokenPepper: 'pepper',
    now: () => 1_786_320_000_000,
    randomPollId,
  })
}

describe('POST /api/polls', () => {
  it.each([null, []])('rejects a non-object JSON root without creating a poll', async (body) => {
    let calls = 0
    const db: PollCreateDatabase = {
      createPoll: async () => {
        calls += 1
        return {
          outcome: 'created',
          pollId: 'unexpected_poll_identifier',
          expiresAt: new Date(),
        }
      },
    }
    const response = await handler(db)(request(body))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_POLL_BODY' } })
    expect(calls).toBe(0)
  })

  it('requires 2-4 unique upload ids and a 32-byte management header', async () => {
    expect((await handler(database())(request({ ...validBody(), options: [] }))).status).toBe(422)
    expect(
      (
        await handler(database())(
          request({
            ...validBody(),
            options: [
              { assetId: '11111111-1111-4111-8111-111111111111', label: '甲', disclosure: 'demo' },
              { assetId: '11111111-1111-4111-8111-111111111111', label: '乙', disclosure: 'demo' },
            ],
          }),
        )
      ).status,
    ).toBe(422)
    expect((await handler(database())(request(validBody(), 'short'))).status).toBe(401)
  })

  it('passes clientRequestId and an exact seven-day expiry through an atomic create', async () => {
    let observed: Parameters<PollCreateDatabase['createPoll']>[0] | undefined
    const db: PollCreateDatabase = {
      createPoll: async (input) => {
        observed = input
        return {
          outcome: 'created',
          pollId: input.pollId,
          expiresAt: new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000),
        }
      },
    }
    const response = await handler(db)(request(validBody()))
    expect(response.status).toBe(201)
    expect(observed?.clientRequestId).toBe('request_1234567890')
    expect(observed?.title).toBe('帮我选下次短发')
    expect(observed?.assetIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(observed?.disclosures).toEqual(['demo', 'reference'])
    expect(observed?.managementTokenHash).toBe(
      hashOpaqueToken('poll-management:new_poll_identifier_123', managementToken, 'pepper'),
    )
  })

  it('returns the original poll on an authenticated idempotent retry', async () => {
    const originalPollId = 'original_poll_identifier'
    const response = await handler(
      database({
        outcome: 'idempotent_candidate',
        pollId: originalPollId,
        expiresAt: new Date(1_786_924_800_000),
        managementTokenHash: hashOpaqueToken(
          `poll-management:${originalPollId}`,
          managementToken,
          'pepper',
        ),
      }),
    )(request(validBody()))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ pollId: originalPollId, idempotent: true })
  })

  it('does not reveal an idempotent poll to the wrong management token', async () => {
    const response = await handler(
      database({
        outcome: 'idempotent_candidate',
        pollId: 'original_poll_identifier',
        expiresAt: new Date(1_786_924_800_000),
        managementTokenHash: '0'.repeat(64),
      }),
    )(request(validBody()))
    expect(response.status).toBe(409)
  })

  it('maps wrong ownership and active-session limits', async () => {
    expect((await handler(database({ outcome: 'invalid_assets' }))(request(validBody()))).status).toBe(422)
    expect((await handler(database({ outcome: 'active_limit' }))(request(validBody()))).status).toBe(409)
  })
})
