// Builds dist/game-state.js (the store, bridge, save, rewind and the physics client) with only the bare `three` import
// external, as runtime/build.ts does, and dist/physics-worker.js with the engine bundled. The client loads the worker
// as `new URL("./physics-worker.js", import.meta.url)`, so the two files must sit side by side.
import { join } from "node:path";

const plugins = [{ name: "bare-three", setup(b: Bun.PluginBuilder) { b.onResolve({ filter: /^three$/ }, () => ({ path: "three", external: true })); } }];

/** The two bundles' text, by output file name. */
export async function buildState(): Promise<Record<"game-state.js" | "physics-worker.js", string>> {
  const one = async (entry: string) => {
    const r = await Bun.build({ entrypoints: [join(import.meta.dir, "src", entry)], format: "esm", minify: true, plugins });
    if (!r.success) throw new AggregateError(r.logs, `store build failed: ${entry}`);
    return r.outputs[0].text();
  };
  return { "game-state.js": await one("index.ts"), "physics-worker.js": await one("physics-worker.ts") };
}

if (import.meta.main) for (const [name, js] of Object.entries(await buildState())) await Bun.write(join(import.meta.dir, "dist", name), js);
