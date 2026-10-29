// Source fingerprint of a game project: sha256 over the paths and contents (not mtimes) of its source files, and the paths,
// sizes and modification times of its binary assets (stat only, never read). One fingerprint decides "reload the page", "this
// is a new iteration" (state.ts) and "this check result is stale" (check, the hook), so they can never disagree. A binary
// counts because agents write them between calls (`eval { save }`, `model_run`'s save): a texture saved into the project
// reached the page only at the next `open` (#168). Harness output, build output, dependencies and dot-folders are left out.
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { createHash } from "node:crypto";

const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);
// geo.js, fx.js and three-runtime.js are the harness's own bundles, copied in and kept current by it: a newer copy is not an
// iteration (and three-runtime.js is 113 KB read on every check); game-tests.json changes when `interact` saves a check,
// which must not reload the page or count as an edit
const SKIP_TOP = new Set(["paprika3d", "paprika-loop", "geo.js", "fx.js", "three-runtime.js", "game-contract.json", "game-tests.json", "game-runtime.json", "public/game-runtime.json"]);
// the store's two files, which the skill has the agent copy next to the entry file, in any folder (physics-worker.js is 4.4 MB);
// a physics-worker.js counts as the store's only beside a game-state.js, so a game's own worker of that name is still hashed
const isStoreCopy = (name: string, entries: { name: string }[]) => name === "game-state.js" || name === "physics-worker.js" && entries.some(e => e.name === "game-state.js");
const BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".ico", ".ktx2", ".basis", ".dds", ".hdr", ".exr",
  ".glb", ".gltf", ".bin", ".fbx", ".obj", ".blend", ".mp3", ".ogg", ".wav", ".m4a", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".zip",
]);

/** sha256 hex over every source file under `cwd`, in sorted path order. */
export const fingerprint = (cwd: string): string => fingerprints(cwd).sources;

/** `sources` as fingerprint gives it and, from the same walk, with `assets`, a hash of the binary files' paths, sizes
    and modification times alone (stat only, never read). */
export function fingerprints(cwd: string, { assets = false } = {}): { sources: string; assets: string } {
  const h = createHash("sha256"), ha = createHash("sha256");
  sourceFiles(cwd, (path, binary) => {
    if (!binary) {
      h.update(`${path}\0`); // the path too, so a rename is a change
      h.update(readFileSync(join(cwd, path)));
      h.update("\0");
      return;
    }
    const st = statSync(join(cwd, path)), line = `${path}\0${st.size}\0${st.mtimeMs}\0`;
    h.update(line);
    if (assets) ha.update(line);
  });
  return { sources: h.digest("hex"), assets: ha.digest("hex") };
}

/** Calls `visit` with each file's path under `cwd` (relative, `/`-separated, sorted) the fingerprint walks: source files,
    and binary assets with `binary` true. */
export function sourceFiles(cwd: string, visit: (path: string, binary: boolean) => void) {
  // A symlink counts as what it points to (a linked src/ was left out, so its edits never changed the fingerprint), but a
  // linked folder inside the project or one already walked is skipped: its files are hashed once, and a link loop ends.
  let real: string | undefined;
  const linked = new Set<string>();
  const follow = (path: string): { dir: boolean; file: boolean } => {
    try {
      const st = statSync(join(cwd, path));
      if (!st.isDirectory()) return { dir: false, file: st.isFile() };
      const to = realpathSync(join(cwd, path)), root = real ??= realpathSync(cwd);
      if (to === root || to.startsWith(root + sep) || linked.has(to)) return { dir: false, file: false };
      linked.add(to);
      return { dir: true, file: false };
    } catch { return { dir: false, file: false }; } // a dangling link
  };
  const walk = (rel: string) => {
    const entries = readdirSync(join(cwd, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      // a .md is notes for people and agents (a review, a README), never page code: one written mid-play reloaded the page (#53)
      if (SKIP_TOP.has(path) || isStoreCopy(e.name, entries) || /\.md$/i.test(e.name)) continue;
      const { dir, file } = e.isSymbolicLink() ? follow(path) : { dir: e.isDirectory(), file: e.isFile() };
      if (dir) {
        if (!e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) walk(path);
      } else if (file) visit(path, BINARY.has(extname(e.name).toLowerCase()));
    }
  };
  walk("");
}
