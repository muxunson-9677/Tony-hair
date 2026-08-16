import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationPath = resolve('db/migrations/001_polling.sql')

describe('polling SQL contract', () => {
  it('defines quota and state constraints plus race-safe functions', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toMatch(/create table if not exists share_assets/i)
    expect(sql).toMatch(/state in \('reserved', 'ready', 'attached', 'delete_pending'\)/i)
    expect(sql).toMatch(/bytes between 1 and 1500000/i)
    expect(sql).toMatch(/unique \(session_hash, client_request_id\)/i)
    expect(sql).toMatch(/unique \(poll_id, ordinal\)/i)
    expect(sql).toMatch(/unique \(poll_id, voter_cookie_hash\)/i)
    expect(sql).toMatch(/foreign key \(poll_id, option_id\).*references poll_options \(poll_id, id\)/is)
    expect(sql).toMatch(/pg_advisory_xact_lock/i)
    expect(sql).toMatch(/create or replace function reserve_share_asset/i)
    expect(sql).toMatch(/800 \* 1024 \* 1024/i)
    expect(sql).toMatch(/create or replace function create_share_poll/i)
    expect(sql).toMatch(/create or replace function cast_share_vote/i)
    expect(sql).toMatch(/create or replace function begin_poll_deletion/i)
    expect(sql).toMatch(/create or replace function claim_poll_cleanup/i)
  })

  it('does not store network or device fingerprint fields', async () => {
    const sql = await readFile(migrationPath, 'utf8')
    expect(sql).not.toMatch(/\b(ip|ip_address|user_agent|fingerprint)\b/i)
  })
})
