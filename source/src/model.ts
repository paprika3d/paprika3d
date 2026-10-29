// `model_run` and `model_look`: a modelling scene the server keeps in a page of its own in the shared Chrome, apart from the
// game, the way the Blender MCP keeps Blender's scene between its execute-code calls. The agent builds a model there with
// three and geo (Manifold) in code, sees it from four sides with each mesh's measurements, saves a GLB into the project and
// the game loads it, as it would a model exported from Blender. In the 2026-10-24 scene loops agents built every shape in
// the page's source, lost what `eval` made at each reload, and ran local servers and Python to get a GLB out of the page.
// The scene is saved to <project>/paprika3d/model/scene.glb after each run that changed it, and a new page (a server
// restart, Chrome closed) loads it back first; Manifold objects held in variables do not last between calls, meshes do.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { Browser, CDPSession, Page } from "puppeteer-core";
import { printedLines, uniq } from "./browser.ts";
import { FORMAT } from "./eval.ts";

const STUDIO = resolve(import.meta.dirname, "..", "geo/dist/studio.js");
const GEOMETRY = join(import.meta.dirname, "inject", "geometry.js");
const SCENE = "paprika3d/model/scene.glb";
const CHARS = 2_048, HEAD = 1_500; // eval's cap
const RUN_MS = 60_000; // a run past this (scaled by the host's load) is stopped; the scene is kept

export interface View { label: string; position: number[]; lookAt?: number[] }
let studio: { page: Page; watch: CDPSession; cwd: string } | undefined, spills = 0;

/** A path the code names, under the project, or a refusal naming the project. */
function inside(cwd: string, path: string): string {
  const to = resolve(cwd, String(path)), rel = relative(cwd, to);
  if (!rel || rel.startsWith("..") || resolve(rel) === rel) throw new Error(`${path} is outside the project (${cwd}); give a path under it, e.g. assets/model.glb`);
  return to;
}

/** The modelling page for `cwd`, made (and its scene loaded back from the project) when there is none or it is another project's. */
async function page(chrome: Promise<Browser>, cwd: string): Promise<{ page: Page; note: string }> {
  if (studio && studio.cwd === cwd && !studio.page.isClosed() && studio.page.browser().connected) return { page: studio.page, note: "" };
  if (studio && !studio.page.isClosed()) await studio.page.close().catch(() => {}); // another project's scene, already saved
  if (!existsSync(STUDIO)) throw new Error(`model: ${STUDIO} is missing: run bun geo/build.ts`);
  const p = await (await chrome).newPage(), s = { page: p, watch: await p.createCDPSession(), cwd };
  await p.exposeFunction("__studioRead", (path: string) => readFileSync(inside(s.cwd, path)).toString("base64"));
  await p.exposeFunction("__studioWrite", (path: string, b64: string) => {
    const to = inside(s.cwd, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, Buffer.from(b64, "base64"));
    return relative(s.cwd, to);
  });
  // a module (manifold.js reads import.meta), which runs after addScriptTag returns; this page has no faked clock to wait on
  await p.addScriptTag({ content: readFileSync(STUDIO, "utf8"), type: "module" });
  await p.waitForFunction("window.__studio", { timeout: 30_000 });
  await p.addScriptTag({ content: readFileSync(GEOMETRY, "utf8") });
  await p.evaluate("__studio.ready");
  studio = s;
  const file = join(cwd, SCENE);
  if (!existsSync(file)) return { page: p, note: "" };
  const n = await p.evaluate((b64: string) => (window as any).__studio.restore(b64), readFileSync(file).toString("base64"));
  return { page: p, note: `The modelling scene was loaded back from ${SCENE} (${n} object${n === 1 ? "" : "s"} at the top): the page holding it was new (the server restarted or Chrome closed), so variables from earlier runs are gone.\n` };
}

/** The text a run's value or a summary becomes, cut to the cap with the whole of it in paprika3d/model/. */
function capped(cwd: string, out: string): string {
  if (out.length <= CHARS) return out;
  const path = join(cwd, "paprika3d/model", `run-${++spills}.txt`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out);
  return `${out.slice(0, HEAD)}\n… cut: ${out.length} characters, full text in ${path}\n${out.slice(out.lastIndexOf("\n") + 1).slice(-300)}`;
}

/** Runs `code` as an async function body against the modelling scene and returns its value as text, its logged lines and
    errors, and what it saved; the scene is saved to the project when the run changed it. */
export async function modelRun(chrome: Promise<Browser>, cwd: string, code: string): Promise<{ text: string; failed?: true }> {
  const { page: p, note } = await page(chrome, cwd), logs = printedLines(p as never), errors: string[] = [];
  const onError = (e: unknown) => errors.push(String((e as Error)?.message ?? e).split("\n")[0]!);
  p.on("pageerror", onError);
  const bound = RUN_MS * Math.min(4, Math.max(1, loadavg()[0]! / cpus().length));
  let timer: ReturnType<typeof setTimeout> | undefined, late = false;
  try {
    const run = p.evaluate(`(async () => {
  const before = __studio.signature(), { THREE, scene, geo, scatter, find, stats, save, load, clear } = await __studio.scope(), saved = [];
  const keep = save; // what the code saved, for the reply
  const [, self, mark] = /^\\s*at (?:async )?(.*):(\\d+):\\d+$/.exec(String(new Error().stack).split("\\n")[1]) ?? [];
  let value, error;
  try {
    value = await (async (save) => {
${code}
    })(async (path, object) => { const s = await keep(path, object); saved.push(s); return s; });
  } catch (e) { error = e; }
  const changed = await __studio.keep(before, ${JSON.stringify(SCENE)});
  if (error) {
    if (typeof error === "object" && !(error instanceof Error)) { let j; try { j = JSON.stringify(error); } catch { j = "{" + Object.keys(error).join(", ") + "}"; } error = new Error("threw object: " + j); }
    const top = +mark + 4, end = top + ${code.split(/\r\n?|\n/).length}, where = [];
    for (const l of error instanceof Error ? String(error.stack).split("\\n").slice(1) : []) {
      const i = self ? l.indexOf(self + ":") : -1;
      if (i >= 0) { const [L, C] = l.slice(i + self.length + 1).split(":").map(parseFloat); if (L >= top && L < end) where.push("at line " + (L - top + 1) + ":" + C + " of the code"); }
      if (where.length === 3) break;
    }
    return { error: String(error?.message ?? error).split("\\n")[0] + (where.length ? "\\n" + where.join("\\n") : ""), changed, saved };
  }
  return { value: (${FORMAT})(value), changed, saved };
})()`) as Promise<{ value?: string; error?: string; changed: boolean; saved: { saved: string; bytes: number; triangles: number }[] }>;
    const stop = new Promise<never>((_, no) => { timer = setTimeout(() => { late = true; no(new Error("late")); }, bound); });
    const r = await Promise.race([run, stop]);
    const lines = [...r.saved.map(s => `Saved ${s.saved} (${Math.ceil(s.bytes / 1024).toLocaleString("en-US")} KB, ${s.triangles.toLocaleString("en-US")} triangles). The game loads it with:\n${loading(s.saved)}`),
      ...logs(), ...uniq(errors, 5).map(e => `errors: ${e}`)];
    if (r.error) return { text: [note + `model_run threw: ${r.error}`, ...lines, r.changed ? `The scene was saved with what the code did before it threw.` : ""].filter(Boolean).join("\n"), failed: true };
    return { text: [note + capped(cwd, r.value ?? "undefined"), ...lines].join("\n") };
  } catch (e) {
    if (!late) throw e;
    // the code is still running: stop it (a loop that never yields), or close the page when it waits on nothing (the next
    // call loads the scene back from its last save)
    await studio?.watch.send("Runtime.terminateExecution").catch(() => {});
    const done = await Promise.race([p.evaluate("1").then(() => true, () => false), new Promise<boolean>(ok => setTimeout(() => ok(false), 2_000))]);
    if (!done) { await p.close().catch(() => {}); studio = undefined; }
    return { text: [`model_run ran ${Math.round(bound / 1000)} s without finishing and was stopped; ${done ? "the page is kept with the scene as the code left it (not saved)" : `the page was closed, and the next call loads the scene back from ${SCENE}`}. Split long work across calls, or await a 0 ms timer every few hundred iterations.`, ...logs()].join("\n"), failed: true };
  } finally { clearTimeout(timer); p.off("pageerror", onError); logs(); }
}

/** The game's code to load a saved model, as asset_search gives a pick's. */
const loading = (file: string) => [
  `import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";`,
  `const model = (await new GLTFLoader().loadAsync(${JSON.stringify(file.split("\\").join("/"))})).scene; // where it stood in the modelling scene`,
  "scene.add(model);"].join("\n");

/** The scene (or `object`) from four sides, or from `cameras`, in one labelled picture, with one line per object and its measurements. */
export async function modelLook(chrome: Promise<Browser>, cwd: string, o: { object?: string; cameras?: View[]; size?: number }): Promise<{ text: string; jpeg?: string }> {
  const { page: p, note } = await page(chrome, cwd);
  const lines = await p.evaluate((name?: string) => (window as any).__studio.summary(name), o.object) as string;
  if (lines === "The modelling scene is empty.") return { text: `${note}${lines} Make something with model_run first, e.g. \`scene.add(new THREE.Mesh(geo.toGeometry(geo.Manifold.cube([1, 1, 1], true)), new THREE.MeshStandardMaterial()))\`.` };
  const jpeg = await p.evaluate((a: typeof o) => (window as any).__studio.picture(a), o) as string;
  const views = o.cameras?.length ? o.cameras.map(c => c.label).join(", ") : "front, right and top (orthographic, true to size) and three-quarter (perspective)";
  return { text: `${note}${capped(cwd, lines)}\nPicture: ${views}, framed to ${o.object ?? "the whole scene"}, under a neutral studio light with a grid on the ground.`, jpeg };
}
