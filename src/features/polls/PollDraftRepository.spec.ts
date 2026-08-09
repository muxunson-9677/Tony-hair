/// <reference types="node" />

import { Blob as NodeBlob } from 'node:buffer'

import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { PollDraftDb, PollDraftRepository } from './PollDraftRepository'

const candidates = [
  { candidateId: 'candidate-1', label: '轻盈短碎', disclosure: 'demo' as const },
  { candidateId: 'candidate-2', label: '自然侧分', disclosure: 'reference' as const },
]

describe('PollDraftRepository', () => {
  let dbName: string
  let db: PollDraftDb
  let repository: PollDraftRepository

  beforeEach(() => {
    dbName = `zajianfa-poll-drafts-${crypto.randomUUID()}`
    db = new PollDraftDb(dbName, { indexedDB, IDBKeyRange })
    let randomIndex = 0
    repository = new PollDraftRepository(db, {
      now: () => '2026-08-10T04:00:00.000Z',
      randomToken: (bytes) => `${bytes === 32 ? 'management' : 'request'}_${String(randomIndex += 1).padStart(16, '0')}`,
    })
  })

  afterEach(async () => {
    db.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
      request.onblocked = () => reject(new Error(`Database deletion blocked: ${dbName}`))
    })
  })

  test('atomically persists clientRequestId, managementToken, and uploadIds before network work', async () => {
    const draft = await repository.createDraft({ planId: 'plan-1', title: '帮我选一个' }, candidates)

    expect(draft.status).toBe('draft')
    expect(draft.clientRequestId).toBe('request_0000000000000002')
    expect(draft.managementToken).toBe('management_0000000000000001')
    expect(draft.options.map(({ uploadId }) => uploadId)).toEqual([
      'request_0000000000000003',
      'request_0000000000000004',
    ])
    expect(await repository.getByPlanId('plan-1')).toEqual(draft)
  })

  test('returns the existing draft without replacing stable random values', async () => {
    const original = await repository.createDraft({ planId: 'plan-1', title: '帮我选一个' }, candidates)
    const restored = await repository.createDraft({ planId: 'plan-1', title: '新的页面标题' }, candidates)

    expect(restored).toEqual(original)
  })

  test('persists a flattened image and uploaded asset for refresh recovery', async () => {
    const draft = await repository.createDraft({ planId: 'plan-1', title: '帮我选一个' }, candidates)
    const maskedImage = new NodeBlob(['masked'], { type: 'image/webp' }) as unknown as Blob

    await repository.saveMaskedImage(draft.id, 'candidate-1', {
      blob: maskedImage,
      mimeType: 'image/webp',
      width: 900,
      height: 1125,
      bytes: maskedImage.size,
      processedAt: '2026-08-10T04:01:00.000Z',
    })
    await repository.saveUploadedAsset(draft.id, 'candidate-1', {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      imageUrl: 'https://example.test/masked.webp',
    })

    const restored = await repository.get(draft.id)
    expect(restored?.options[0]).toMatchObject({
      uploadStatus: 'uploaded',
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      imageUrl: 'https://example.test/masked.webp',
      maskedMimeType: 'image/webp',
    })
    expect(restored?.options[0]?.maskedImage).toEqual(maskedImage)
  })

  test('marks a poll active and finds its local management record by poll id', async () => {
    const draft = await repository.createDraft({ planId: 'plan-1', title: '帮我选一个' }, candidates)

    await repository.markActive(
      draft.id,
      'public_poll_id_1234567890',
      '2026-08-17T04:00:00.000Z',
    )

    expect(await repository.getByPollId('public_poll_id_1234567890')).toMatchObject({
      status: 'active',
      managementToken: 'management_0000000000000001',
      pollId: 'public_poll_id_1234567890',
    })
  })

  test('revocation clears local image blobs but retains the minimal management record', async () => {
    const draft = await repository.createDraft({ planId: 'plan-1', title: '帮我选一个' }, candidates)
    const maskedImage = new NodeBlob(['masked'], { type: 'image/webp' }) as unknown as Blob
    await repository.saveMaskedImage(draft.id, 'candidate-1', {
      blob: maskedImage,
      mimeType: 'image/webp',
      width: 900,
      height: 1125,
      bytes: maskedImage.size,
      processedAt: '2026-08-10T04:01:00.000Z',
    })
    await repository.markActive(draft.id, 'public_poll_id_1234567890', '2026-08-17T04:00:00.000Z')

    await repository.markRevoked(draft.id)

    const revoked = await repository.get(draft.id)
    expect(revoked).toMatchObject({ status: 'revoked', pollId: 'public_poll_id_1234567890' })
    expect(revoked?.options.every(({ maskedImage }) => maskedImage === undefined)).toBe(true)
  })
})
