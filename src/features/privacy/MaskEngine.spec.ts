import { describe, expect, test, vi } from 'vitest'

import { MaskEngine, type DetectionWorkerLike } from './MaskEngine'

class FakeWorker implements DetectionWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly postMessage = vi.fn()
  readonly terminate = vi.fn()

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap

describe('MaskEngine', () => {
  test('does not create a worker until first detection', async () => {
    const worker = new FakeWorker()
    const factory = vi.fn(() => worker)
    const engine = new MaskEngine(factory)

    expect(factory).not.toHaveBeenCalled()
    const pending = engine.detect(bitmap(), 1)
    expect(factory).toHaveBeenCalledOnce()
    worker.emit({ type: 'result', generation: 1, outcome: { kind: 'none' } })
    await expect(pending).resolves.toEqual({ kind: 'none' })
  })

  test('transfers the bitmap and returns only the current generation result', async () => {
    const worker = new FakeWorker()
    const engine = new MaskEngine(() => worker)
    const first = engine.detect(bitmap(), 4)
    const second = engine.detect(bitmap(), 5)

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'detect', generation: 4 }),
      [expect.anything()],
    )
    worker.emit({ type: 'result', generation: 4, outcome: { kind: 'none' } })
    worker.emit({ type: 'result', generation: 5, outcome: { kind: 'multiple' } })

    await expect(first).resolves.toEqual({ kind: 'error', code: 'stale_result' })
    await expect(second).resolves.toEqual({ kind: 'multiple' })
  })

  test('falls back with a stable error and closes an untransferred bitmap when worker startup fails', async () => {
    const input = bitmap()
    const engine = new MaskEngine(() => { throw new Error('CSP refused worker') })

    await expect(engine.detect(input, 1)).resolves.toEqual({ kind: 'error', code: 'worker_unavailable' })
    expect(input.close).toHaveBeenCalledOnce()
  })

  test('rejects unsafe worker messages as inference failures', async () => {
    const worker = new FakeWorker()
    const engine = new MaskEngine(() => worker)
    const pending = engine.detect(bitmap(), 1)

    worker.emit({ type: 'result', generation: 1, outcome: { kind: 'none', landmarks: [] } })

    await expect(pending).resolves.toEqual({ kind: 'error', code: 'inference_failed' })
  })

  test('starts a new worker after the active worker crashes', async () => {
    const firstWorker = new FakeWorker()
    const secondWorker = new FakeWorker()
    const factory = vi.fn()
      .mockReturnValueOnce(firstWorker)
      .mockReturnValueOnce(secondWorker)
    const engine = new MaskEngine(factory)
    const failed = engine.detect(bitmap(), 1)

    firstWorker.onerror?.({} as ErrorEvent)

    await expect(failed).resolves.toEqual({ kind: 'error', code: 'inference_failed' })
    expect(firstWorker.terminate).toHaveBeenCalledOnce()

    const retried = engine.detect(bitmap(), 2)
    secondWorker.emit({ type: 'result', generation: 2, outcome: { kind: 'none' } })
    await expect(retried).resolves.toEqual({ kind: 'none' })
    expect(factory).toHaveBeenCalledTimes(2)
  })

  test.each(['model_fetch_failed', 'worker_init_failed'] as const)(
    'starts a new worker after a recoverable %s result',
    async (code) => {
      const firstWorker = new FakeWorker()
      const secondWorker = new FakeWorker()
      const factory = vi.fn()
        .mockReturnValueOnce(firstWorker)
        .mockReturnValueOnce(secondWorker)
      const engine = new MaskEngine(factory)
      const failed = engine.detect(bitmap(), 1)

      firstWorker.emit({ type: 'result', generation: 1, outcome: { kind: 'error', code } })

      await expect(failed).resolves.toEqual({ kind: 'error', code })
      expect(firstWorker.terminate).toHaveBeenCalledOnce()

      const retried = engine.detect(bitmap(), 2)
      secondWorker.emit({ type: 'result', generation: 2, outcome: { kind: 'none' } })
      await expect(retried).resolves.toEqual({ kind: 'none' })
      expect(factory).toHaveBeenCalledTimes(2)
    },
  )

  test('immediately cancels slow detection for manual mode and can start cleanly again', async () => {
    const firstWorker = new FakeWorker()
    const secondWorker = new FakeWorker()
    const factory = vi.fn()
      .mockReturnValueOnce(firstWorker)
      .mockReturnValueOnce(secondWorker)
    const engine = new MaskEngine(factory)
    const slow = engine.detect(bitmap(), 1)

    engine.cancelCurrent(2)

    await expect(slow).resolves.toEqual({ kind: 'error', code: 'stale_result' })
    expect(firstWorker.terminate).toHaveBeenCalledOnce()

    const fresh = engine.detect(bitmap(), 3)
    secondWorker.emit({ type: 'result', generation: 3, outcome: { kind: 'none' } })
    await expect(fresh).resolves.toEqual({ kind: 'none' })
  })

  test.each(['none', 'multiple'] as const)(
    'reuses one initialized worker for a later generation after a completed %s result',
    async (kind) => {
      const worker = new FakeWorker()
      const factory = vi.fn(() => worker)
      const engine = new MaskEngine(factory)
      const first = engine.detect(bitmap(), 1)
      worker.emit({ type: 'result', generation: 1, outcome: { kind } })
      await first

      engine.cancelCurrent(2)
      const second = engine.detect(bitmap(), 2)
      worker.emit({ type: 'result', generation: 2, outcome: { kind: 'none' } })
      await second

      expect(factory).toHaveBeenCalledOnce()
      expect(worker.terminate).not.toHaveBeenCalled()
    },
  )

  test('reuses the initialized worker after a completed single-face result', async () => {
    const worker = new FakeWorker()
    const factory = vi.fn(() => worker)
    const engine = new MaskEngine(factory)
    const first = engine.detect(bitmap(), 1)
    worker.emit({
      type: 'result',
      generation: 1,
      outcome: {
        kind: 'single',
        transform: { centerX: 0.5, centerY: 0.4, width: 0.6, height: 0.3, rotation: 0 },
      },
    })
    await first

    engine.cancelCurrent(2)
    const second = engine.detect(bitmap(), 2)
    worker.emit({ type: 'result', generation: 2, outcome: { kind: 'none' } })
    await second

    expect(factory).toHaveBeenCalledOnce()
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  test('asks the worker to dispose and terminates after its acknowledgement', async () => {
    const worker = new FakeWorker()
    const engine = new MaskEngine(() => worker)
    const pending = engine.detect(bitmap(), 1)
    worker.emit({ type: 'result', generation: 1, outcome: { kind: 'none' } })
    await pending

    const disposing = engine.dispose()
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'dispose' })
    worker.emit({ type: 'disposed' })
    await disposing
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
