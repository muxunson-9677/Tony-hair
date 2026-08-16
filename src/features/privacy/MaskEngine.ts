import { parseDetectionWorkerResponse, type DetectionWorkerRequest } from './faceLandmarker.protocol'
import type { MaskDetectionOutcome } from './types'

export interface DetectionWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: DetectionWorkerRequest, transfer?: Transferable[]): void
  terminate(): void
}

type WorkerFactory = () => DetectionWorkerLike

interface PendingDetection {
  readonly resolve: (outcome: MaskDetectionOutcome) => void
}

const createDetectionWorker = (): DetectionWorkerLike => new Worker(
  new URL('./faceLandmarker.worker.ts', import.meta.url),
  { type: 'module', name: 'zajianfa-face-landmarker' },
)

export class MaskEngine {
  private worker: DetectionWorkerLike | null = null
  private readonly pending = new Map<number, PendingDetection>()
  private activeGeneration = 0
  private disposeResolver: (() => void) | null = null
  private disposeTimer: ReturnType<typeof setTimeout> | null = null
  private disposalWorker: DetectionWorkerLike | null = null

  constructor(private readonly createWorker: WorkerFactory = createDetectionWorker) {}

  private ensureWorker() {
    if (this.worker) {
      return this.worker
    }
    const worker = this.createWorker()
    worker.onmessage = (event) => this.handleMessage(worker, event.data)
    worker.onerror = () => {
      this.recycleWorker(worker)
      this.failPending('inference_failed')
    }
    this.worker = worker
    return worker
  }

  detect(bitmap: ImageBitmap, generation: number): Promise<MaskDetectionOutcome> {
    this.activeGeneration = generation
    let worker: DetectionWorkerLike
    try {
      worker = this.ensureWorker()
    } catch {
      bitmap.close()
      return Promise.resolve({ kind: 'error', code: 'worker_unavailable' })
    }

    return new Promise((resolve) => {
      this.pending.set(generation, { resolve })
      try {
        worker.postMessage({ type: 'detect', generation, bitmap }, [bitmap])
      } catch {
        this.pending.delete(generation)
        bitmap.close()
        resolve({ kind: 'error', code: 'bitmap_failed' })
      }
    })
  }

  cancelCurrent(nextGeneration: number) {
    this.activeGeneration = nextGeneration
    if (this.pending.size === 0) {
      return
    }
    this.worker?.terminate()
    this.worker = null
    this.failPending('stale_result')
  }

  async dispose() {
    this.activeGeneration += 1
    this.failPending('stale_result')
    const worker = this.worker
    this.worker = null
    if (!worker) {
      return
    }

    await new Promise<void>((resolve) => {
      this.disposeResolver = resolve
      this.disposalWorker = worker
      this.disposeTimer = setTimeout(() => {
        this.finishDispose()
      }, 250)
      try {
        worker.postMessage({ type: 'dispose' })
      } catch {
        this.finishDispose()
      }
    })
  }

  private handleMessage(worker: DetectionWorkerLike, data: unknown) {
    const response = parseDetectionWorkerResponse(data)
    if (!response) {
      this.recycleWorker(worker)
      this.failPending('inference_failed')
      return
    }
    if (response.type === 'disposed') {
      this.finishDispose()
      return
    }
    const pending = this.pending.get(response.generation)
    if (!pending) {
      return
    }
    this.pending.delete(response.generation)
    pending.resolve(response.generation === this.activeGeneration
      ? response.outcome
      : { kind: 'error', code: 'stale_result' })

    if (
      response.outcome.kind === 'error'
      && (response.outcome.code === 'model_fetch_failed' || response.outcome.code === 'worker_init_failed')
    ) {
      this.recycleWorker(worker)
    }

  }

  private failPending(code: 'inference_failed' | 'stale_result') {
    for (const pending of this.pending.values()) {
      pending.resolve({ kind: 'error', code })
    }
    this.pending.clear()
  }

  private recycleWorker(worker: DetectionWorkerLike) {
    if (this.worker !== worker) {
      return
    }
    worker.terminate()
    this.worker = null
  }

  private finishDispose() {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer)
      this.disposeTimer = null
    }
    this.disposalWorker?.terminate()
    this.disposalWorker = null
    this.disposeResolver?.()
    this.disposeResolver = null
  }
}
