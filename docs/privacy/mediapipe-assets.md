# MediaPipe local inference assets

The browser runtime is pinned to `@mediapipe/tasks-vision@1.0.1`. Its complete published `wasm/` directory is copied without renaming to `public/mediapipe/1.0.1/wasm/`. The app never uses a CDN or a `latest` URL at runtime.

The model comes from Google's versioned URL:

`https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

| Local path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/mediapipe/1.0.1/wasm/vision_wasm_internal.js` | 323377 | `e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73` |
| `public/mediapipe/1.0.1/wasm/vision_wasm_internal.wasm` | 11756954 | `8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886` |
| `public/mediapipe/1.0.1/wasm/vision_wasm_module_internal.js` | 323415 | `da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d` |
| `public/mediapipe/1.0.1/wasm/vision_wasm_module_internal.wasm` | 11756972 | `2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b` |
| `public/mediapipe/1.0.1/wasm/vision_wasm_nosimd_internal.js` | 323180 | `e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658` |
| `public/mediapipe/1.0.1/wasm/vision_wasm_nosimd_internal.wasm` | 10960242 | `a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192` |
| `public/mediapipe/models/face-landmarker-float16-v1.task` | 3758596 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |

Run `npm run verify:mediapipe` offline to verify sizes, hashes, and that the WASM directory contains no unexpected files.

Face landmarks exist briefly inside the worker because the model needs them to determine an initial mask. They are reduced to a normalized transform before crossing the worker boundary and are not persisted or sent over the network. This is not a claim that landmarks never exist in browser memory.
