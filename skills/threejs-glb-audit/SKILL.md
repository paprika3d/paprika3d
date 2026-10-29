---
name: threejs-glb-audit
description: Check and shrink the .glb, .gltf and USD models a three.js page loads - size, triangles, textures, Draco, meshopt and KTX2, a verdict for a website or Shopify, a smaller copy with WebP textures. Use for a large model file. paprika3d's model_audit tool.
---

# Check a three.js page's model files

`model_audit` needs no page open: `path` is one file or a folder (the whole project when left out), read from the file itself with no decoder. Each file gets its megabytes, triangles, materials, each texture's size and format, and whether it uses Draco, meshopt and KTX2, then a verdict against `target`: `site` (the default: 4 MB of assets, 200,000 triangles, 2048 px textures) or `shopify` (a GLB of about 4 MB, textures at most 2048 px on a side).

A failing file's reply ends with the `shrink` call that fixes it: `shrink: { textures: 2048 }` caps each texture at that size as WebP, `textures: false` drops them; every triangle is kept. With the page open, `look { save: "before" }` first, then shrink, point the page at the new file and `look { compare: "before" }` (`../threejs-game/references/assets.md`).

If `model_audit` is not among your tools, the paprika3d MCP server is not installed: it runs as `npx -y paprika3d serve` (stdio), and https://paprika3d.com/docs/install has each agent's line.
