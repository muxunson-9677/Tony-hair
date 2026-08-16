import { readFile, readdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? filesBelow(join(directory, entry.name)) : [join(directory, entry.name)],
    ),
  )
  return nested.flat()
}

describe('backend security contract', () => {
  it('keeps all server-only environment names out of client source', async () => {
    const clientFiles = [
      ...(await filesBelow(resolve('src'))),
      ...(await filesBelow(resolve('public'))),
      resolve('index.html'),
    ].filter((file) => ['.ts', '.vue', '.html', '.js'].includes(extname(file)))
    const clientSource = (await Promise.all(clientFiles.map((file) => readFile(file, 'utf8')))).join('\n')
    expect(clientSource).not.toMatch(
      /ACCESS_CODE_HASH|BLOB_READ_WRITE_TOKEN|COOKIE_SIGNING_SECRET|CRON_SECRET|DATABASE_URL|MANAGEMENT_TOKEN_PEPPER/,
    )
  })

  it('uses database constraints for cross-poll options and concurrent duplicate votes', async () => {
    const sql = await readFile(resolve('db/migrations/001_polling.sql'), 'utf8')
    expect(sql).toMatch(/unique \(poll_id, voter_cookie_hash\)/i)
    expect(sql).toMatch(
      /foreign key \(poll_id, option_id\) references poll_options \(poll_id, id\) on delete cascade/i,
    )
    expect(sql).toMatch(/state in \('reserved', 'ready'\)/i)
    expect(sql).toMatch(/poll-session:/i)
    expect(sql).toMatch(/content_hash char\(64\) not null/i)
    expect(sql).toMatch(/unique index.*\(session_hash, upload_id\)/i)
    expect(sql).toMatch(/upload_id = p_upload_id[\s\S]*for update/i)
    expect(sql).toMatch(/state = 'ready' and id = any\(p_asset_ids\)[\s\S]*for update/i)
    expect(sql).toMatch(/from polls where id = p_poll_id for share/i)
    expect(sql).toMatch(/v_poll\.status = 'delete_pending'/i)
    expect(sql).toMatch(/title text not null/i)
    expect(sql).toMatch(/disclosure text not null/i)
    const databaseSource = await readFile(resolve('api/_lib/database.ts'), 'utf8')
    expect(databaseSource).toMatch(
      /jsonb_build_object\('comment', listed\.comment, 'createdAt', listed\.created_at\)/i,
    )
  })

  it('never accepts a management token in a URL or JSON body', async () => {
    const createSource = await readFile(resolve('api/polls.ts'), 'utf8')
    const resourceSource = await readFile(resolve('api/polls/[id].ts'), 'utf8')
    const resultsSource = await readFile(resolve('api/polls/[id]/results.ts'), 'utf8')
    const helperSource = await readFile(resolve('api/_lib/polls.ts'), 'utf8')
    const managementSources = `${createSource}\n${resourceSource}\n${resultsSource}\n${helperSource}`
    expect(managementSources).not.toMatch(
      /searchParams.*management|body\.managementToken/i,
    )
    expect(managementSources).toContain("request.headers.get('x-poll-management-token')")
  })
})
