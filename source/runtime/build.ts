// Builds dist/index.js, the file games import. Only the bare `three` import stays external, so the game's own copy
// (through its import map or bundler) is the one patched and drawn with; three's subpaths that dependencies use
// (`three/addons/...` in @three.ez/instanced-mesh) are bundled in, since a plain page's import map often names only
// `three`. `bun build --external three` would leave those subpaths external and the page would fail to load.
import { join } from "node:path";

/** The runtime bundle's text. */
export async function buildRuntime(): Promise<string> {
  const r = await Bun.build({
    entrypoints: [join(import.meta.dir, "src/index.ts")],
    format: "esm",
    minify: true, // also drops the build machine's paths that unminified output carries as comments
    plugins: [{ name: "bare-three", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "three", external: true })); } }],
  });
  if (!r.success) throw new AggregateError(r.logs, "runtime build failed");
  // Named imports from three become reads of one namespace import: a name one build lacks (WebGLUtils and ShaderChunk,
  // which three.webgpu.js does not export) is then undefined where the instancing switch would use it, instead of a
  // link error that stops the whole page on a WebGPURenderer game.
  const text = await r.outputs[0].text();
  return 'import*as __three from"three";' + text.replace(/import\{([^}]*)\}from"three";?/g, (_, names) => `const{${names.replace(/ as /g, ":")}}=__three;`);
}

if (import.meta.main) await Bun.write(join(import.meta.dir, "dist/index.js"), await buildRuntime());
