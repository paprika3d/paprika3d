# Model files: `model_audit` and `shrink`

`model_audit` reports what a website or a Shopify listing judges a `.glb` or `.gltf` on (a USD file too: [USD files](#usd-files)), for one file (`path`) or every one under a folder (the whole project when `path` is left out). It reads the file's JSON and its images' headers only, so a Draco or meshopt file needs no decoder:

```
models/chair.glb · 6.1 MB · 48,210 triangles · 3 materials · textures: 4096×4096 png, 1024×1024 jpeg · Draco no, meshopt no, KTX2 no
shopify: fails, 6.1 MB over about 4 MB; 4096×4096 texture over 2048
Fix: `model_audit` { path: "models/chair.glb", shrink: { textures: 2048 } } writes models/chair-opt.glb with each texture at most 2048 px (WebP; textures: false drops them); then `look` compare against a look saved before (save).
```

- Triangles come from the accessor counts in the JSON: indices (or positions) / 3 for triangle lists, count - 2 for strips and fans, none for points and lines (counted apart). Each mesh counts once per node that uses it in the default scene.
- A texture's size is read from its PNG, JPEG, WebP or KTX2 header; `?` means a format or a place it cannot read.
- `target: "site"` (the default) judges against the `site` budget of `perf`: 4 MB of assets, 200,000 triangles, textures of 2048 px by area (a 4096 × 1 lookup table passes). One file over 4 MB already fills a whole site's budget.
- `target: "shopify"` judges against Shopify's 3D model guidance: a GLB of about 4 MB, textures at most 2048 px on their longest side, no triangle limit.

## Fixing a file: `shrink`

`model_audit { path, shrink: { textures, out } }` rewrites one file: `textures: false` drops every texture (geometry only, for a model you colour yourself), a number caps each texture's longer side at that many pixels, re-encoded as WebP; `out` is the new file (`<name>-opt.glb` beside it by default, the file itself to replace it). The reply is the file before and after and the new verdict. A meshopt file stays meshopt (`GLTFLoader` needs `MeshoptDecoder`, from `three/addons/libs/meshopt_decoder.module.js`); a Draco file is refused. Shrink keeps every triangle: for fewer, pick a lower-poly model.

1. `look { save: "before" }` with the page showing the model.
2. `shrink`, and point the page at the new file.
3. `look { compare: "before" }`: the share of pixels that differ, and a diff picture. Keep the new file when the picture is the same.

Draco and KTX2 compression need outside tools and their loaders (`DRACOLoader`, `KTX2Loader`).

## USD files

three r183 and later load `.usd`, `.usda`, `.usdc` and `.usdz` with `USDLoader` (`USDZLoader` is deprecated):

```js
import { USDLoader } from "three/addons/loaders/USDLoader.js";
const usd = await new USDLoader().loadAsync("assets/chair.usdz"); // a Group; usd.animations holds its clips
scene.add(usd);
```

It reads meshes, UsdPreviewSurface, OpenPBR and MaterialX UsdPreviewSurface materials, textures, skinning and animation, cameras, lights, references, payloads and variants, and scales by `metersPerUnit`. It has no PointInstancer instancing and no blend shapes. It is newer than `GLTFLoader` (r183, January 2026) and still gets parser fixes each month. For a website, a GLB is smaller and every viewer reads it.

`model_audit` reports a USD file as it does a GLB (triangles, materials, textures; in a `.usdz`, the images packed in it), read by three's own USD parsers, so a file it cannot read is one `USDLoader` cannot load either. It counts each mesh once, so a mesh a file references or instances many times counts once. `shrink` rewrites glTF only: convert a USD file to GLB first (Blender's USD import, then its glTF export; or `usd2gltf`). `asset_search` `format: "usd"` finds models with a USD file, and `pick` with it saves that file with `USDLoader` code.
