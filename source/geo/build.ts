// Builds dist/geo.js, the one file games import for Manifold geometry. The bare `three` import stays external, as in
// runtime/build.ts, so the game's own copy is used. manifold.wasm is inlined, gzipped then base64, in place of src/wasm.ts (which reads
// the file under Bun) and handed to Manifold as `wasmBinary`, so the page never fetches a second file. The one place
// manifold.js would build the wasm's URL (`new URL("manifold.wasm", import.meta.url)`) is cut out, so a game's bundler
// (vite) does not go looking for a manifold.wasm next to geo.js; the build fails if a Manifold upgrade moves that text.
// dist/studio.js is the modelling page's script (src/studio.ts, for src/model.ts), with three bundled in, since that page
// loads no game.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BunPlugin } from "bun";

import { header } from "../fx/build.ts";

const WASM_URL = 'new URL("manifold.wasm",import.meta.url).href';

/** The geo bundle's text. */
export async function buildGeo(): Promise<string> {
  return header("@paprika3d/game-geo") + await bundle("src/index.ts", [{ name: "bare-three", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "three", external: true })); } }]);
}

/** The modelling page's script, three included. */
export async function buildStudio(): Promise<string> {
  return `// paprika3d's modelling page (model_run, model_look): three, geo and the scene's helpers\n${await bundle("src/studio.ts", [])}`;
}

async function bundle(entry: string, plugins: BunPlugin[]): Promise<string> {
  const r = await Bun.build({
    entrypoints: [join(import.meta.dir, entry)],
    format: "esm",
    target: "browser",
    minify: true,
    plugins: [
      ...plugins,
      { name: "manifold-wasm", setup(b) {
        // gzipped first: 541 KB of wasm is 722 KB as base64 but about 270 KB gzipped, and the page inflates it with DecompressionStream
        b.onLoad({ filter: /geo[\\/]src[\\/]wasm\.ts$/ }, () => ({ loader: "js", contents: `export const gzipped = true; export default ${JSON.stringify(Buffer.from(Bun.gzipSync(readFileSync(Bun.resolveSync("manifold-3d/manifold.wasm", import.meta.dir)), { level: 9 })).toString("base64"))};` }));
        b.onLoad({ filter: /manifold-3d[\\/]manifold\.js$/ }, ({ path }) => {
          const js = readFileSync(path, "utf8");
          if (!js.includes(WASM_URL)) throw new Error(`geo build: manifold.js no longer contains ${WASM_URL}; update geo/build.ts`);
          return { loader: "js", contents: js.replace(WASM_URL, '"manifold.wasm"') };
        });
      } },
    ],
  });
  if (!r.success) throw new AggregateError(r.logs, "geo build failed");
  return await r.outputs[0]!.text();
}

if (import.meta.main) {
  await Bun.write(join(import.meta.dir, "dist/geo.js"), await buildGeo());
  await Bun.write(join(import.meta.dir, "dist/studio.js"), await buildStudio());
}
