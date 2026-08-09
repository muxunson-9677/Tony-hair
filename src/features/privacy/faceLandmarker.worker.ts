import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

import type { DetectionWorkerRequest, DetectionWorkerResponse } from './faceLandmarker.protocol'
import type { MaskDetectionErrorCode } from './types'
import { outcomeFromFaceLandmarks } from './workerOutcome'

interface WorkerScope {
  readonly location: Location
  addEventListener(type: 'message', listener: (event: MessageEvent<DetectionWorkerRequest>) => void): void
  postMessage(message: DetectionWorkerResponse): void
  close(): void
}

class ModelFetchError extends Error {}

const scope = self as unknown as WorkerScope
const wasmBase = new URL('/mediapipe/1.0.1/wasm', scope.location.origin).href
const modelUrl = new URL('/mediapipe/models/face-landmarker-float16-v1.task', scope.location.origin).href
let landmarkerPromise: Promise<FaceLandmarker> | null = null

const createLandmarker = async () => {
  const response = await fetch(modelUrl, { credentials: 'same-origin' })
  if (!response.ok) {
    throw new ModelFetchError(`Model request failed: ${response.status}`)
  }
  const modelAssetBuffer = new Uint8Array(await response.arrayBuffer())
  // Module workers cannot use the classic Emscripten loader: 1.0.1's resolver
  // must select the `_module_internal` loader so it installs ModuleFactory.
  const fileset = await FilesetResolver.forVisionTasks(wasmBase, true)
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numFaces: 2,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
}

const getLandmarker = () => {
  landmarkerPromise ??= createLandmarker()
  return landmarkerPromise
}

const errorCode = (error: unknown, phase: 'initialize' | 'detect'): MaskDetectionErrorCode => {
  if (error instanceof ModelFetchError) {
    return 'model_fetch_failed'
  }
  return phase === 'initialize' ? 'worker_init_failed' : 'inference_failed'
}

scope.addEventListener('message', async (event) => {
  const request = event.data
  if (request.type === 'dispose') {
    try {
      const landmarker = await landmarkerPromise
      landmarker?.close()
    } catch {
      // A failed initialization has no live task to dispose.
    } finally {
      landmarkerPromise = null
      scope.postMessage({ type: 'disposed' })
      scope.close()
    }
    return
  }

  const bitmap = request.bitmap
  let phase: 'initialize' | 'detect' = 'initialize'
  try {
    const landmarker = await getLandmarker()
    phase = 'detect'
    const result = landmarker.detect(bitmap)
    scope.postMessage({
      type: 'result',
      generation: request.generation,
      outcome: outcomeFromFaceLandmarks(result.faceLandmarks),
    })
  } catch (error) {
    if (phase === 'initialize') {
      landmarkerPromise = null
    }
    scope.postMessage({
      type: 'result',
      generation: request.generation,
      outcome: { kind: 'error', code: errorCode(error, phase) },
    })
  } finally {
    bitmap.close()
  }
})
