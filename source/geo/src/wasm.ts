// manifold.wasm as base64. Under Bun (tests) it is read from node_modules; geo/build.ts replaces this whole file with
// the gzipped wasm's base64 literal (`gzipped` true), so dist/geo.js carries the engine and the browser never fetches it.
import { readFileSync } from "node:fs";

/** Whether the base64 below is of gzipped bytes. */
export const gzipped = false;

/** manifold.wasm's bytes as base64. */
export default readFileSync(Bun.resolveSync("manifold-3d/manifold.wasm", import.meta.dir)).toString("base64");
