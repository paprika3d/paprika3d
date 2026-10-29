// Builds dist/fx.js, the one file games import for sound effects, canvas textures and particle bursts. The bare `three`
// import and `three/addons/...` (bake's GLTFExporter) stay external, so the game's own copy is used.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The first line of a bundle `open` copies into the project: what it is and which plugin wrote it (#65). */
export const header = (name: string) => `// ${name} ${JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")).version}, written by paprika3d's open tool: ship it with the page; each open rewrites it\n`;

/** The fx bundle's text; `entry` builds one module alone (to measure what it adds). */
export async function buildFx(entry = "index.ts"): Promise<string> {
  const r = await Bun.build({
    entrypoints: [join(import.meta.dir, "src", entry)],
    format: "esm",
    target: "browser",
    // names and statements kept, so a session that reads fx.js finds `function picture(` and its options: the 2026-10-24
    // scene loops dug the signatures out of the minified bundle (22 KB minified, 36 KB as is)
    minify: false,
    plugins: [{ name: "bare-three", setup(b) { b.onResolve({ filter: /^three(\/.*)?$/ }, a => ({ path: a.path, external: true })); } }],
  });
  if (!r.success) throw new AggregateError(r.logs, "fx build failed");
  // unminified output starts each module with a `// <its path from the shell's folder>` line, which can name the build
  // machine's folders and changes with the folder the build ran in
  return header("@paprika3d/game-fx") + (await r.outputs[0].text()).replace(/^\/\/ .*\.ts\n/gm, "");
}

if (import.meta.main) await Bun.write(join(import.meta.dir, "dist/fx.js"), await buildFx());
