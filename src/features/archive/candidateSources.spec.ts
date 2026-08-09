import { describe, expect, test } from 'vitest'

import {
  candidateSourceKey,
  createLocalReferenceId,
  isSafelyEditableCandidate,
  nextUserReferenceName,
  resolveCandidateImageBlob,
  selectPastRecordReferencePhoto,
} from './candidateSources'
import type { Candidate, HaircutPhoto } from './types'

const localImage = new Blob(['prepared-reference'], { type: 'image/webp' })

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'candidate-1',
  planId: 'plan-1',
  order: 1,
  name: '本地参考图',
  notes: '本机处理后的参考图',
  source: 'user_reference',
  referenceId: 'reference-1',
  referenceImage: localImage,
  referenceImageWidth: 1080,
  referenceImageHeight: 1440,
  referenceImageBytes: localImage.size,
  referenceImageProcessedAt: '2026-08-10T10:00:00.000Z',
  ...overrides,
})

describe('candidate sources', () => {
  test('uses a source-specific stable pointer for mixed-candidate deduplication', () => {
    expect(candidateSourceKey(candidate())).toBe('user_reference:reference-1')
    expect(candidateSourceKey(candidate({
      source: 'past_record',
      referenceId: undefined,
      pastRecordId: 'record-1',
    }))).toBe('past_record:record-1')
    expect(candidateSourceKey(candidate({
      source: 'demo_ai',
      referenceId: undefined,
      demoImagePath: '/demo/persona-lin-bob.webp',
    }))).toBe('demo_ai:/demo/persona-lin-bob.webp')
  })

  test('only treats complete current local sources as safely editable', () => {
    expect(isSafelyEditableCandidate(candidate(), new Set())).toBe(true)
    expect(isSafelyEditableCandidate(candidate({ referenceId: undefined }), new Set())).toBe(false)
    expect(isSafelyEditableCandidate(candidate({ referenceImageWidth: undefined }), new Set())).toBe(false)
    expect(isSafelyEditableCandidate(candidate({
      referenceImage: new Blob(['png'], { type: 'image/png' }),
      referenceImageBytes: 3,
    }), new Set())).toBe(false)
    expect(isSafelyEditableCandidate(candidate({ referenceImageWidth: 1921 }), new Set())).toBe(false)
    expect(isSafelyEditableCandidate(candidate({
      source: 'past_record',
      referenceId: undefined,
      pastRecordId: 'record-1',
    }), new Set())).toBe(true)
    expect(isSafelyEditableCandidate(candidate({
      source: 'past_record',
      referenceId: undefined,
      pastRecordId: 'record-1',
      referenceImage: new Blob([], { type: 'image/png' }),
    }), new Set())).toBe(false)
    expect(isSafelyEditableCandidate(candidate({
      source: 'demo_ai',
      referenceId: undefined,
      referenceImage: undefined,
      referenceImageWidth: undefined,
      referenceImageHeight: undefined,
      referenceImageBytes: undefined,
      referenceImageProcessedAt: undefined,
      demoImagePath: '/demo/persona-lin-bob.webp',
    }), new Set(['/demo/persona-lin-bob.webp']))).toBe(true)
    expect(isSafelyEditableCandidate(candidate({
      source: 'demo_ai',
      referenceId: undefined,
      demoImagePath: '/legacy/missing.webp',
    }), new Set(['/demo/persona-lin-bob.webp']))).toBe(false)
    expect(isSafelyEditableCandidate(candidate({
      source: 'demo_ai',
      referenceId: undefined,
      demoImagePath: '/demo/persona-lin-bob.webp',
    }), new Set(['/demo/persona-lin-bob.webp']))).toBe(false)
    expect(isSafelyEditableCandidate({
      ...candidate(),
      futureEditLayer: 'unsupported-v3-data',
    } as Candidate, new Set())).toBe(false)
    expect(isSafelyEditableCandidate({
      ...candidate(),
      source: 'future_source',
    } as unknown as Candidate, new Set())).toBe(false)
    expect(isSafelyEditableCandidate(candidate({ pastRecordId: 'hybrid-record' }), new Set()))
      .toBe(false)
    expect(isSafelyEditableCandidate(candidate({
      source: 'demo_ai',
      referenceId: 'hybrid-reference',
      demoImagePath: '/demo/persona-lin-bob.webp',
    }), new Set(['/demo/persona-lin-bob.webp']))).toBe(false)
    expect(isSafelyEditableCandidate(candidate({
      source: 'past_record',
      referenceId: undefined,
      pastRecordId: 'record-1',
      demoImagePath: '/demo/persona-lin-bob.webp',
    }), new Set())).toBe(false)
  })

  test('chooses an unused local-reference number after removal', () => {
    expect(nextUserReferenceName(['我的参考图 2', '齐颌短鲍伯'])).toBe('我的参考图 1')
    expect(nextUserReferenceName(['我的参考图 1', '我的参考图 2'])).toBe('我的参考图 3')
  })

  test('prefers the copied candidate Blob and only falls back to the real record photo', () => {
    const recordImage = new Blob(['record-photo'], { type: 'image/webp' })
    const photo: HaircutPhoto = {
      id: 'photo-1',
      recordId: 'record-1',
      stage: 'styled',
      image: recordImage,
      capturedAt: '2026-08-10T10:00:00.000Z',
    }
    expect(resolveCandidateImageBlob(candidate(), {})).toBe(localImage)
    expect(resolveCandidateImageBlob(candidate({
      source: 'past_record',
      referenceId: undefined,
      referenceImage: undefined,
      pastRecordId: 'record-1',
    }), { 'record-1': [photo] })).toBe(recordImage)
    expect(resolveCandidateImageBlob(candidate({
      source: 'demo_ai',
      referenceId: undefined,
      demoImagePath: '/demo/persona-lin-bob.webp',
    }), {})).toBeUndefined()
  })

  test('builds a private local identity from prepared bytes without using a filename', async () => {
    const digest = async (bytes: ArrayBuffer) => {
      expect(new TextDecoder().decode(bytes)).toBe('prepared-reference')
      return new Uint8Array([0x01, 0xaf, 0x20]).buffer
    }

    await expect(createLocalReferenceId(localImage, digest)).resolves.toBe('local-01af20')
  })

  test('uses a styled result before earlier progress photos for a past-record candidate', () => {
    const before: HaircutPhoto = {
      id: 'before', recordId: 'record-1', stage: 'before', image: localImage,
      capturedAt: '2026-08-10T09:00:00.000Z',
    }
    const styled: HaircutPhoto = {
      id: 'styled', recordId: 'record-1', stage: 'styled', image: localImage,
      capturedAt: '2026-08-10T10:00:00.000Z',
    }

    expect(selectPastRecordReferencePhoto([before, styled])).toBe(styled)
  })
})
