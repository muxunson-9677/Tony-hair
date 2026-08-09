import { describe, expect, test, vi } from 'vitest'

import type { HaircutPhoto, Candidate } from '../archive/types'
import { buildPollCandidateSeeds, loadPollCandidateBlob } from './pollCreateQueue'

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'candidate-1',
  planId: 'plan-1',
  order: 1,
  name: '轻盈短碎',
  notes: '',
  source: 'demo_ai',
  demoImagePath: '/demo/persona-lin-pixie.webp',
  ...overrides,
})

test('maps archive candidates to stable labels and public disclosures', () => {
  expect(buildPollCandidateSeeds([
    candidate(),
    candidate({
      id: 'candidate-2',
      order: 2,
      name: '真实参考',
      source: 'user_reference',
      demoImagePath: undefined,
      referenceId: 'ref-1',
      referenceImage: new Blob(['reference'], { type: 'image/webp' }),
      referenceImageWidth: 800,
      referenceImageHeight: 1000,
      referenceImageBytes: 9,
      referenceImageProcessedAt: '2026-08-10T04:00:00.000Z',
    }),
  ])).toEqual([
    { candidateId: 'candidate-1', label: '轻盈短碎', disclosure: 'demo' },
    { candidateId: 'candidate-2', label: '真实参考', disclosure: 'reference' },
  ])
})

describe('loadPollCandidateBlob', () => {
  test('fetches a demo candidate from its same-origin asset path', async () => {
    const blob = new Blob(['demo'], { type: 'image/webp' })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(blob, { status: 200 }))

    await expect(loadPollCandidateBlob(candidate(), {}, fetchMock)).resolves.toEqual(blob)
    expect(fetchMock).toHaveBeenCalledWith('/demo/persona-lin-pixie.webp', {
      credentials: 'same-origin',
    })
  })

  test('uses the persisted local candidate Blob without network access', async () => {
    const blob = new Blob(['reference'], { type: 'image/webp' })
    const fetchMock = vi.fn<typeof fetch>()

    await expect(loadPollCandidateBlob(candidate({
      source: 'user_reference',
      demoImagePath: undefined,
      referenceId: 'ref-1',
      referenceImage: blob,
      referenceImageWidth: 800,
      referenceImageHeight: 1000,
      referenceImageBytes: blob.size,
      referenceImageProcessedAt: '2026-08-10T04:00:00.000Z',
    }), {}, fetchMock)).resolves.toEqual(blob)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('uses a persisted record photo for a past-record candidate', async () => {
    const blob = new Blob(['record'], { type: 'image/webp' })
    const photo: HaircutPhoto = {
      id: 'photo-1',
      recordId: 'record-1',
      stage: 'styled',
      image: blob,
      capturedAt: '2026-08-10T04:00:00.000Z',
    }

    await expect(loadPollCandidateBlob(candidate({
      source: 'past_record',
      demoImagePath: undefined,
      pastRecordId: 'record-1',
      referenceImage: blob,
    }), { 'record-1': [photo] }, vi.fn<typeof fetch>())).resolves.toEqual(blob)
  })

  test('fails explicitly when a candidate source is unavailable', async () => {
    await expect(loadPollCandidateBlob(candidate(), {}, vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 404 }),
    ))).rejects.toThrow('候选图片读取失败')
  })
})
