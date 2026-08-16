import { neon } from '@neondatabase/serverless'

import type { UploadDatabase } from '../uploads/masked'
import type { PollCreateDatabase } from '../polls'
import type { PollResourceDatabase } from '../polls/[id]'
import type { PollResultsDatabase } from '../polls/[id]/results'
import type { VoteDatabase } from '../polls/[id]/votes'
import type { CleanupDatabase } from '../internal/cleanup'

type Row = Record<string, unknown>

function jsonArray(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[]
  if (typeof value !== 'string') return []
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? (parsed as Row[]) : []
}

export class NeonDatabase
  implements
    UploadDatabase,
    PollCreateDatabase,
    PollResourceDatabase,
    PollResultsDatabase,
    VoteDatabase,
    CleanupDatabase
{
  private readonly sql

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl)
  }

  async reserveAsset(input: {
    sessionHash: string
    uploadId: string
    pathname: string
    bytes: number
    contentType: 'image/jpeg' | 'image/webp'
    contentHash: string
    now: Date
  }): ReturnType<UploadDatabase['reserveAsset']> {
    const rows = (await this.sql.query(
      `select outcome, returned_asset_id::text, returned_pathname, returned_blob_url
       from reserve_share_asset($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.sessionHash,
        input.uploadId,
        input.pathname,
        input.bytes,
        input.contentType,
        input.contentHash,
        input.now,
      ],
    )) as Row[]
    const row = rows[0]
    const outcome = String(row?.outcome)
    if (outcome === 'reserved' || outcome === 'reserved_replay') {
      return {
        outcome,
        assetId: String(row?.returned_asset_id),
        pathname: String(row?.returned_pathname),
      }
    }
    if (outcome === 'ready') {
      return {
        outcome,
        assetId: String(row?.returned_asset_id),
        blobUrl: String(row?.returned_blob_url),
      }
    }
    if (outcome === 'pending_limit' || outcome === 'global_limit' || outcome === 'attached') {
      return { outcome }
    }
    return { outcome: 'conflict' }
  }

  async markAssetReady(input: {
    sessionHash: string
    uploadId: string
    blobUrl: string
    now: Date
  }): Promise<boolean> {
    const rows = (await this.sql.query(
      'select mark_share_asset_ready($1, $2, $3, $4) as ready',
      [input.uploadId, input.sessionHash, input.blobUrl, input.now],
    )) as Row[]
    return rows[0]?.ready === true
  }

  async createPoll(input: Parameters<PollCreateDatabase['createPoll']>[0]) {
    const rows = (await this.sql.query(
      `select outcome, returned_poll_id, returned_expires_at, returned_management_hash
       from create_share_poll($1, $2, $3, $4, $5, $6::uuid[], $7::text[], $8::text[], $9)`,
      [
        input.pollId,
        input.sessionHash,
        input.clientRequestId,
        input.managementTokenHash,
        input.title,
        input.assetIds,
        input.labels,
        input.disclosures,
        input.now,
      ],
    )) as Row[]
    const row = rows[0]
    const outcome = String(row?.outcome)
    if (outcome === 'created') {
      return {
        outcome,
        pollId: String(row?.returned_poll_id),
        expiresAt: new Date(String(row?.returned_expires_at)),
      } as const
    }
    if (outcome === 'idempotent_candidate') {
      return {
        outcome,
        pollId: String(row?.returned_poll_id),
        expiresAt: new Date(String(row?.returned_expires_at)),
        managementTokenHash: String(row?.returned_management_hash),
      } as const
    }
    if (outcome === 'invalid_assets' || outcome === 'active_limit') return { outcome } as const
    return { outcome: 'conflict' } as const
  }

  async getPoll(input: Parameters<PollResourceDatabase['getPoll']>[0]) {
    const rows = (await this.sql.query(
      `select case
         when t.poll_id is not null then 'gone'
         when p.id is null then 'not_found'
         when p.status <> 'active' or p.expires_at <= $2 then 'gone'
         else 'active'
       end as outcome,
       p.expires_at,
       p.title,
       case when $3::char(64) is null then false else exists(
         select 1 from poll_votes v
         where v.poll_id = $1 and v.voter_cookie_hash = $3
       ) end as viewer_has_voted,
       coalesce(
         jsonb_agg(
           jsonb_build_object(
             'id', o.id::text,
             'label', o.label,
             'disclosure', o.disclosure,
             'imageUrl', a.blob_url
           ) order by o.ordinal
         ) filter (where o.id is not null),
         '[]'::jsonb
       ) as options
       from (select 1) seed
       left join polls p on p.id = $1
       left join poll_tombstones t on t.poll_id = $1
       left join poll_options o on o.poll_id = p.id
       left join share_assets a on a.id = o.asset_id
       group by p.id, p.expires_at, p.title, p.status, t.poll_id`,
      [input.pollId, input.now, input.voterCookieHash],
    )) as Row[]
    const row = rows[0]
    const state = String(row?.outcome)
    if (state !== 'active') return { outcome: state === 'gone' ? 'gone' : 'not_found' } as const
    const options = jsonArray(row?.options)
    return {
      outcome: 'active',
      poll: {
        pollId: input.pollId,
        title: String(row?.title),
        expiresAt: new Date(String(row?.expires_at)),
        viewerHasVoted: row?.viewer_has_voted === true,
        options: options.map((option) => ({
          id: String(option.id),
          label: String(option.label),
          disclosure: String(option.disclosure) as 'demo' | 'reference',
          imageUrl: String(option.imageUrl),
        })),
      },
    } as const
  }

  async getResults(input: Parameters<PollResultsDatabase['getResults']>[0]) {
    const rows = (await this.sql.query(
      `with target as (
         select case
           when t.poll_id is not null then 'gone'
           when p.id is null then 'not_found'
           when p.status <> 'active' or p.expires_at <= $3 then 'gone'
           when p.management_token_hash <> $2 then 'forbidden'
           else 'active'
         end as outcome
         from (select 1) seed
         left join polls p on p.id = $1
         left join poll_tombstones t on t.poll_id = $1
       )
       select target.outcome,
         (select count(*)::integer from poll_votes v where v.poll_id = $1) as total,
         (select count(*) filter (where v.option_id is null)::integer
          from poll_votes v where v.poll_id = $1) as none,
         coalesce((
           select jsonb_agg(
             jsonb_build_object('optionId', counted.option_id, 'votes', counted.votes)
             order by counted.ordinal
           )
           from (
             select o.id::text as option_id, o.ordinal, count(v.id)::integer as votes
             from poll_options o
             left join poll_votes v on v.option_id = o.id
             where o.poll_id = $1
             group by o.id, o.ordinal
           ) counted
         ), '[]'::jsonb) as options,
         coalesce((
           select jsonb_agg(
             jsonb_build_object('comment', listed.comment, 'createdAt', listed.created_at)
             order by listed.created_at, listed.id
           )
           from (
             select v.id, v.comment, v.created_at
             from poll_votes v
             where v.poll_id = $1 and v.comment <> ''
           ) listed
         ), '[]'::jsonb) as comments
       from target`,
      [input.pollId, input.managementTokenHash, input.now],
    )) as Row[]
    const row = rows[0]
    const state = String(row?.outcome)
    if (state !== 'active') {
      if (state === 'gone' || state === 'forbidden') return { outcome: state } as const
      return { outcome: 'not_found' } as const
    }
    const options = jsonArray(row?.options)
    const comments = jsonArray(row?.comments)
    return {
      outcome: 'active',
      results: {
        total: Number(row?.total ?? 0),
        none: Number(row?.none ?? 0),
        options: options.map((option) => ({
          optionId: String(option.optionId),
          votes: Number(option.votes),
        })),
        comments: comments.map((comment) => ({
          comment: String(comment.comment),
          createdAt: new Date(String(comment.createdAt)).toISOString(),
        })),
      },
    } as const
  }

  async beginDelete(input: Parameters<PollResourceDatabase['beginDelete']>[0]) {
    const rows = (await this.sql.query(
      `select outcome, pathname
       from begin_poll_deletion($1, $2, 'revoked', $3)`,
      [input.pollId, input.managementTokenHash, input.now],
    )) as Row[]
    const outcome = String(rows[0]?.outcome)
    if (outcome === 'delete_pending') {
      return {
        outcome,
        pathnames: rows.map((row) => row.pathname).filter((value): value is string => typeof value === 'string'),
      } as const
    }
    if (outcome === 'gone' || outcome === 'forbidden') return { outcome } as const
    return { outcome: 'not_found' } as const
  }

  async finalizeDelete(pathnames: string[]): Promise<void> {
    await this.sql.query('select finalize_poll_cleanup($1::text[])', [pathnames])
  }

  async castVote(input: Parameters<VoteDatabase['castVote']>[0]) {
    const rows = (await this.sql.query(
      'select cast_share_vote($1, $2::uuid, $3, $4, $5) as outcome',
      [input.pollId, input.optionId, input.voterCookieHash, input.comment, input.now],
    )) as Row[]
    const outcome = String(rows[0]?.outcome)
    if (
      outcome === 'created' ||
      outcome === 'duplicate' ||
      outcome === 'invalid_option' ||
      outcome === 'gone'
    ) {
      return outcome
    }
    return 'not_found'
  }

  async claimCleanup(input: Parameters<CleanupDatabase['claimCleanup']>[0]): Promise<string[]> {
    const rows = (await this.sql.query(
      'select pathname from claim_poll_cleanup($1, $2)',
      [input.now, input.batchSize],
    )) as Row[]
    return rows.map((row) => String(row.pathname))
  }

  async finalizeCleanup(pathnames: string[]): Promise<void> {
    await this.sql.query('select finalize_poll_cleanup($1::text[])', [pathnames])
  }
}
