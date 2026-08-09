import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { Pool } from '@neondatabase/serverless'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

describeWithDatabase('real Neon polling migration and concurrency', () => {
  const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl }) : null

  beforeAll(async () => {
    const migration = await readFile(resolve('db/migrations/001_polling.sql'), 'utf8')
    await pool!.query(migration)
  })

  beforeEach(async () => {
    await pool!.query(
      'truncate table poll_votes, poll_options, share_assets, polls, poll_tombstones restart identity cascade',
    )
  })

  afterAll(async () => {
    await pool?.end()
  })

  it('applies the migration to an explicitly configured disposable database', async () => {
    const result = await pool!.query<{ name: string }>("select to_regclass('public.polls')::text as name")
    expect(result.rows[0]?.name).toBe('polls')
  })

  it('allows only one concurrent vote for the same poll and voter hash', async () => {
    const now = new Date('2026-08-10T00:00:00.000Z')
    await pool!.query(
      `insert into polls(id, session_hash, client_request_id, title, management_token_hash, status, created_at, expires_at)
       values ($1, $2, $3, '并发测试', $4, 'active', $5, $6)`,
      ['poll_concurrency_test', 'a'.repeat(64), 'request_concurrency', 'b'.repeat(64), now, new Date('2026-08-17T00:00:00.000Z')],
    )
    const asset = await pool!.query<{ id: string }>(
      `insert into share_assets(upload_id, session_hash, pathname, content_type, content_hash, bytes, state, poll_id, reserved_at, ready_at)
       values ($1, $2, $3, 'image/webp', $4, 12, 'attached', $5, $6, $6) returning id::text`,
      ['upload_concurrency', 'a'.repeat(64), 'polls/concurrency.webp', 'c'.repeat(64), 'poll_concurrency_test', now],
    )
    const option = await pool!.query<{ id: string }>(
      `insert into poll_options(poll_id, asset_id, ordinal, label, disclosure)
       values ($1, $2, 1, '方案', 'reference') returning id::text`,
      ['poll_concurrency_test', asset.rows[0]!.id],
    )
    const parameters = [
      'poll_concurrency_test',
      option.rows[0]!.id,
      'd'.repeat(64),
      '同一票',
      now,
    ]
    const [first, second] = await Promise.all([
      pool!.query<{ outcome: string }>(
        'select cast_share_vote($1, $2::uuid, $3, $4, $5) as outcome',
        parameters,
      ),
      pool!.query<{ outcome: string }>(
        'select cast_share_vote($1, $2::uuid, $3, $4, $5) as outcome',
        parameters,
      ),
    ])
    expect([first.rows[0]!.outcome, second.rows[0]!.outcome].sort()).toEqual([
      'created',
      'duplicate',
    ])
  })
})
