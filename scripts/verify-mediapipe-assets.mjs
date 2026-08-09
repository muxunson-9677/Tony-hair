import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const expected = new Map([
  ['public/mediapipe/1.0.1/wasm/vision_wasm_internal.js', [323377, 'e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73']],
  ['public/mediapipe/1.0.1/wasm/vision_wasm_internal.wasm', [11756954, '8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886']],
  ['public/mediapipe/1.0.1/wasm/vision_wasm_module_internal.js', [323415, 'da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d']],
  ['public/mediapipe/1.0.1/wasm/vision_wasm_module_internal.wasm', [11756972, '2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b']],
  ['public/mediapipe/1.0.1/wasm/vision_wasm_nosimd_internal.js', [323180, 'e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658']],
  ['public/mediapipe/1.0.1/wasm/vision_wasm_nosimd_internal.wasm', [10960242, 'a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192']],
  ['public/mediapipe/models/face-landmarker-float16-v1.task', [3758596, '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff']],
])

const wasmRoot = resolve(root, 'public/mediapipe/1.0.1/wasm')
const actualWasm = (await readdir(wasmRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => `public/mediapipe/1.0.1/wasm/${entry.name}`)
  .sort()
const expectedWasm = [...expected.keys()].filter((path) => path.includes('/wasm/')).sort()

if (JSON.stringify(actualWasm) !== JSON.stringify(expectedWasm)) {
  throw new Error(`Unexpected MediaPipe WASM inventory: ${actualWasm.join(', ')}`)
}

for (const [path, [expectedBytes, expectedSha256]] of expected) {
  const absolutePath = resolve(root, path)
  const info = await stat(absolutePath)
  const bytes = await readFile(absolutePath)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (info.size !== expectedBytes || sha256 !== expectedSha256) {
    throw new Error(`${path} failed verification: ${info.size} bytes, sha256 ${sha256}`)
  }
}

process.stdout.write(`Verified ${expected.size} pinned MediaPipe assets.\n`)
