// `asset_search`: a client of the hosted asset library (asset-cdn/api/search_api.py, reached through the Worker at
// assets.keeno.dev): 57k models (CC BY or CC0, meshopt + WebP .glb; a row may also or instead carry a USD file, `usd_url`), CC0 PBR textures and HDRIs, all files on R2. A search
// answers one numbered line per hit and a contact sheet of their thumbnails, ranked by text or, with an image (a crop of a reference picture), by how alike they look; `pick` downloads one into the project with its loading code, and for a model reports the
// choice and credits it in CREDITS.md. The API logs model searches, picks and rejections with the agent's name (sent as
// x-agent-model) so its ranking can learn; texture and HDRI searches are not logged.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import type { Browser } from "puppeteer-core";
import { shrink } from "./glb.ts";
import { utilPage } from "./reference.ts";
import { harnessDir } from "./state.ts";

const API = process.env.PAPRIKA3D_ASSET_API ?? "https://assets.keeno.dev"; // the env var is for tests

export type Kind = "model" | "texture" | "hdri";
export type Query = { query?: string; kind?: Kind; style?: string; type?: string; maxTris?: number; animated?: boolean; rigged?: boolean; not?: string[]; more?: boolean;
  /** models with a file of this format; the API reads it as `format` */ format?: "glb" | "usd";
  /** a JPEG (base64) to rank models by how alike they look, with `query` too when given */ image?: string };
type Model = { uid: string; name: string; style?: string; tris: number; mb: number; bbox?: number[]; real_height_m?: number | null; scale_to_real?: number | null;
  animated?: boolean; license: string; attribution: string; thumb_url: string;
  /** a row has one file or both: a meshopt + WebP .glb, a USD file (.usdz) */ glb_url?: string; usd_url?: string };
type Texture = { tid: string; name: string; size_m?: number[]; maps: Record<string, Record<string, string>>; license: string; preview_url: string };
type Hdri = { hid: string; name: string; tags: string[]; urls: Record<string, string>; license: string; preview_url: string };
type Hit = { kind: "model"; sid?: string; m: Model } | { kind: "texture"; m: Texture } | { kind: "hdri"; m: Hdri };

/** Every hit shown this session by id, with the model search that showed it, so `pick` and `not` report back to it. */
const seen = new Map<string, Hit>();
/** The ids each query (by kind and text) has shown this session, so `more` can page past them without rejecting them. */
const shown = new Map<string, string[]>();
const idOf = (h: Hit) => h.kind === "model" ? h.m.uid : h.kind === "texture" ? h.m.tid : h.m.hid;
/** Every id a project's searches showed, any session's, with its kind and the search that showed it, in
    `<cwd>/paprika3d/asset-hits.json`: a loop's judge named ids it was shown by their first 8 characters, and the builder's
    later session, whose server had shown nothing, got the API's 404 for them (bloom/opus-1, skull/opus-2). The row
    itself is fetched again, so a pick after a catalog repair gets the repaired one. */
type Shown = { kind: Kind; sid?: string };
const HITS = "asset-hits.json";
const projectHits = (cwd: string): Record<string, Shown> => { try { return JSON.parse(readFileSync(join(cwd, "paprika3d", HITS), "utf8")); } catch { return {}; } };

const reason = (e: unknown) => String((e as { cause?: Error })?.cause?.message ?? (e as Error)?.message ?? e);
/** fetch, with a dead network, a timeout and a 5xx (the Worker answers 5xx when the pod is down) as one "unreachable" error. */
async function get(url: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  let r: Response;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) }); } catch (e) { throw new Error(`asset library unreachable: ${reason(e)}`); }
  if (r.status >= 500) throw new Error(`asset library unreachable: HTTP ${r.status}`);
  if (!r.ok) throw new Error(`asset library answered ${r.status} for ${new URL(url).pathname}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
const api = async (path: string, agent: string, body?: object) => (await get(API + path, body
  ? { method: "POST", headers: { "x-agent-model": agent, "content-type": "application/json" }, body: JSON.stringify(body) }
  : { headers: { "x-agent-model": agent } })).json() as Promise<any>;
// logging only: a report that fails never costs the agent its search or its file
const report = (path: string, agent: string, body: object) => api(path, agent, body).catch(() => {});
async function download(url: string, file: string) {
  const bytes = Buffer.from(await (await get(url, {}, 120_000)).arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
const qs = (o: Record<string, unknown>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

const line = (h: Hit) => h.kind === "model"
  ? [h.m.uid, h.m.name, h.m.style, `${h.m.tris} tris`, `${h.m.mb} MB`, h.m.real_height_m ? `about ${h.m.real_height_m} m tall` : "", h.m.animated ? "animated" : "", h.m.usd_url ? h.m.glb_url ? "also USD" : "USD only" : "", h.m.license, h.m.thumb_url]
  : h.kind === "texture"
  ? [h.m.tid, h.m.name, `maps: ${Object.keys(h.m.maps).join(", ")}`, h.m.size_m ? `tiles every ${h.m.size_m.join(" × ")} m` : "", h.m.license, h.m.preview_url]
  : [h.m.hid, h.m.name, h.m.tags.join(", "), h.m.license, h.m.preview_url];

const CELL = 160; // px: five hits make an 800 × 160 sheet, about 170 image tokens (width × height / 750)
/** Runs in the page: the thumbnails (base64, null for one not fetched) in one row of `cell` px cells, each numbered as
    its hit's line is, as a JPEG (base64). */
async function drawSheet(pics: (string | null)[], cell: number): Promise<string> {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  c.width = cell * pics.length; c.height = cell;
  g.fillStyle = "#222"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < pics.length; i++) {
    const x = i * cell, b64 = pics[i];
    const img = b64 ? await createImageBitmap(new Blob([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))])).catch(() => null) : null;
    if (img) { const k = Math.min((cell - 4) / img.width, (cell - 4) / img.height), w = img.width * k, h = img.height * k; g.drawImage(img, x + (cell - w) / 2, (cell - h) / 2, w, h); }
    else { g.fillStyle = "#999"; g.font = "13px sans-serif"; g.fillText("no picture", x + 48, cell / 2 + 4); }
    g.fillStyle = "rgba(0, 0, 0, 0.75)"; g.fillRect(x + 2, 2, 24, 22);
    g.fillStyle = "#fff"; g.font = "bold 16px sans-serif"; g.fillText(String(i + 1), x + 9, 19);
  }
  return c.toDataURL("image/jpeg", 0.8).split(",")[1]!;
}
/** The hits' thumbnails as one sheet, drawn in the shared Chrome's bare page from bytes fetched here (5 s each, in
    parallel), so the page needs no network; one that fails leaves its cell saying so, and none at all throws its reason. */
async function contactSheet(chrome: Promise<Browser>, urls: (string | undefined)[]): Promise<string> {
  const why: string[] = [];
  const thumb = (u?: string) => u ? get(u, {}, 5_000).then(r => r.arrayBuffer()).then(b => Buffer.from(b).toString("base64")).catch(e => (why.push(reason(e)), null)) : null;
  const [pics, page] = await Promise.all([Promise.all(urls.map(thumb)), utilPage(chrome)]);
  if (!pics.some(Boolean)) throw new Error(why[0] ?? "no hit has a thumbnail");
  return page.evaluate(drawSheet, pics, CELL);
}

/** One numbered line per hit, then how to pick, reject or page, and with `chrome` a contact sheet of the hits (JPEG, base64).
    Ids in q.not are reported as rejected (models only: the API logs no texture or HDRI search) and left out of a fresh
    search; q.more leaves out everything this query has shown. With `cwd`, the hits are kept in the project's asset-hits.json. */
export async function search(q: Query, agent: string, cwd?: string, chrome?: () => Promise<Browser>): Promise<{ text: string; sheet?: string }> {
  const kind = q.kind ?? "model", not = q.not ?? [], key = `${kind}:${q.query}:${q.image ? createHash("sha1").update(q.image).digest("hex") : ""}`;
  if (!q.query && !q.image) throw new Error("query is needed: what you want, e.g. \"wooden barrel\"; or an image of it");
  if (q.image && kind !== "model") throw new Error("image search is for models only: give textures and HDRIs a query");
  for (const id of not) { const h = seen.get(id); if (h?.kind === "model" && h.sid) await report("/feedback", agent, { search_id: h.sid, uid: id, verdict: "rejected" }); }
  const skip = q.more ? [...new Set([...not, ...shown.get(key) ?? []])] : not;
  let hits: Hit[];
  const filters = { type: q.type, style: q.style, max_tris: q.maxTris && Math.round(q.maxTris), animated: q.animated, rigged: q.rigged, format: q.format };
  if (q.image) {
    const r = await (await get(`${API}/similar?${qs({ q: q.query, k: Math.min(100, 5 + skip.length), ...filters })}`,
      { method: "POST", headers: { "x-agent-model": agent, "content-type": "image/jpeg" }, body: Buffer.from(q.image, "base64") })).json() as any;
    hits = (r.hits as Model[]).map(m => ({ kind: "model", sid: r.search_id, m }));
  } else if (kind === "model") {
    const r = await api(`/pick?${qs({ q: q.query, ...filters, exclude: skip.join(",") || undefined })}`, agent);
    hits = (r.candidates as Model[]).map(m => ({ kind, sid: r.search_id, m }));
  } else {
    const r = await api(`/${kind === "texture" ? "textures" : "hdris"}/search?${qs({ q: q.query, k: 5 + skip.length })}`, agent);
    hits = (r.hits as (Texture & Hdri)[]).map(m => ({ kind, m }) as Hit);
  }
  hits = hits.filter(h => !skip.includes(idOf(h))).slice(0, 5);
  if (!hits.length) throw new Error(`No ${kind} matches ${q.query ? `"${q.query}"` : "the image"}${skip.length ? " beyond the ones shown" : ""}. Try other words or fewer filters.`);
  for (const h of hits) seen.set(idOf(h), h);
  // a cache: a project folder it cannot be written to costs only a later session's short-id pick
  try { if (cwd) writeFileSync(join(harnessDir(cwd), HITS), JSON.stringify({ ...projectHits(cwd), ...Object.fromEntries(hits.map(h => [idOf(h), { kind: h.kind, sid: h.kind === "model" ? h.sid : undefined }])) })); } catch {}
  shown.set(key, [...shown.get(key) ?? [], ...hits.map(idOf)]);
  const text = [...hits.map((h, i) => `${i + 1}. ${line(h).filter(Boolean).join(" · ")}`),
    `Pick one with { pick: "<id>" }${kind === "model" ? " (real size, or height: units tall)" : ""}, search again with not: [ids] to reject these, or add more: true for the next ones.`].join("\n");
  if (!chrome) return { text };
  // in all eight 2026-10-24 scene loops the agents fetched the thumbnail URLs with curl and tiled them by hand (paprika/opus-2:
  // 22 Bash blocks in 6 sessions), and picks made blind were removed later (skull/opus-1: 13 of 23)
  try { return { text, sheet: await contactSheet(chrome(), hits.map(h => h.kind === "model" ? h.m.thumb_url : h.m.preview_url)) }; }
  catch (e) { return { text: `${text}\nNo contact sheet: ${reason(e)}` }; } // the search stands without it
}

const isVite = (cwd: string) => {
  try {
    const p = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    return !!(p.dependencies?.vite ?? p.devDependencies?.vite);
  } catch { return false; } // no or unreadable package.json: a plain page
};

// names the snippets themselves use, and JS keywords a model could be called
const TAKEN = new Set(["scene", "camera", "renderer", "controls", "clock", "light", "player", "world", "floor", "ground", "loader", "gltf", "box", "mixer", "pmrem", "sky", "loadMap", "class", "new", "delete", "switch", "case", "default", "function", "return", "var", "let", "const", "if", "else", "for", "while", "do", "in", "of", "import", "export"]);

/** A camelCase identifier for a model name: "character-a" -> characterA. */
const varName = (name: string) => {
  const v = name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w, i) => i ? w[0]!.toUpperCase() + w.slice(1) : w.toLowerCase()).join("");
  return /^[a-z]/.test(v) && !TAKEN.has(v) ? v : `asset${v.charAt(0).toUpperCase()}${v.slice(1)}`;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
const num = (x: number) => +x.toPrecision(4);
// texture maps by the material slot they fill; displacement moves vertices, so it needs a dense mesh and is left out
const SLOTS: Record<string, string> = { basecolor: "map", normal: "normalMap", roughness: "roughnessMap", metalness: "metalnessMap", ao: "aoMap", opacity: "alphaMap" };

/** Downloads a hit (by its id, or the start of the one id this session or the project's searches showed that starts so;
    from this session's searches, else looked up by id) into the project's assets/ (public/assets/ with vite) and returns
    where it went and a paste-ready loading snippet. A model's pick is reported to its search and the model credited
    once in CREDITS.md beside it. height scales a model to that many units tall, else to real size. */
export async function pick(id: string, kind: Kind, cwd: string, agent: string, height?: number, textures?: boolean, format?: "glb" | "usd"): Promise<string> {
  const file = projectHits(cwd), all = [...new Set([...seen.keys(), ...Object.keys(file)])], ids = all.includes(id) ? [id] : all.filter(k => k.startsWith(id));
  if (ids.length > 1) throw new Error(`pick: "${id}" matches ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ` and ${ids.length - 5} more` : ""}: give the whole id`);
  const full = ids[0] ?? id, was: Shown = ids.length ? seen.get(full) ?? file[full]! : { kind };
  const h: Hit = seen.get(full) ?? { ...was, m: await api(`/${was.kind === "model" ? "asset" : was.kind === "texture" ? "textures" : "hdris"}/${encodeURIComponent(full)}`, agent) } as Hit;
  const vite = isVite(cwd), dir = join(cwd, vite ? "public" : "", "assets"), base = vite ? "three/examples/jsm" : "three/addons";
  const url = (file: string) => relative(dir, file).split("\\").join("/"); // as the page loads it: assets/ at its root
  const saved: string[] = [], code: (string | null)[] = [];
  let where = "";
  if (h.kind === "model") {
    const m = h.m, usd = format === "usd" || !m.glb_url, src = usd ? m.usd_url : m.glb_url;
    if (!src) throw new Error(`pick: ${m.uid} has no USD file; pick it without format for its GLB`);
    if (usd && textures === false) throw new Error("pick: textures: false rewrites a GLB; give format: \"glb\" or leave textures out");
    const file = join(dir, `${slug(m.name)}-${m.uid.slice(0, 6)}${usd ? src.match(/\.usd[acz]?$/i)?.[0] ?? ".usdz" : ".glb"}`), v = varName(m.name);
    await download(src, file);
    if (textures === false) { await shrink(file, { textures: false, out: file }); where = `${relative(cwd, file)} without its textures`; }
    saved.push(file);
    if (h.sid) await report(`/pick/${h.sid}`, agent, { uid: m.uid });
    const credits = join(dir, "CREDITS.md"), credit = `- ${m.name}: ${m.attribution}\n`;
    if (!(existsSync(credits) && readFileSync(credits, "utf8").includes(credit))) appendFileSync(credits, credit);
    const tall = m.bbox?.[1];
    // USDLoader (three r183+) gives a group holding its clips; GLTFLoader a result whose scene and animations are apart
    const root = usd ? "usd" : "gltf.scene", loaded = JSON.stringify(`assets/${url(file)}`);
    code.push(
      ...usd ? [`import { USDLoader } from "${base}/loaders/USDLoader.js";`]
        : [`import { GLTFLoader } from "${base}/loaders/GLTFLoader.js";`, `import { MeshoptDecoder } from "${base}/libs/meshopt_decoder.module.js";`],
      "",
      `const ${v} = new THREE.Group();`,
      "{ // a block, so a second pick's snippet pastes beside this one",
      ...usd ? [`  const usd = await new USDLoader().loadAsync(${loaded});`]
        : ["  const loader = new GLTFLoader();", "  loader.setMeshoptDecoder(MeshoptDecoder);", `  const gltf = await loader.loadAsync(${loaded});`],
      `  const box = new THREE.Box3().setFromObject(${root});`,
      `  ${root}.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); // origin to floor centre`,
      `  ${v}.add(${root});`,
      m.animated ? `  ${v}.animations = ${usd ? "usd" : "gltf"}.animations;` : null,
      "}",
      height && tall ? `${v}.scale.setScalar(${height} / ${num(tall)}); // ${height} units tall`
        : m.scale_to_real ? `${v}.scale.setScalar(${m.scale_to_real}); // real size${m.real_height_m ? `, about ${m.real_height_m} m tall` : ""}` : null,
      `scene.add(${v});`,
      ...m.animated ? [`const ${v}Mixer = new THREE.AnimationMixer(${v});`,
        `${v}Mixer.clipAction(${v}.animations[0]).play(); // ${v}Mixer.update(dt) each frame; ${v}.animations holds every clip by name`] : []);
  } else if (h.kind === "texture") {
    const m = h.m, folder = join(dir, "textures", m.tid), maps = Object.keys(m.maps).filter(k => SLOTS[k] && m.maps[k]!["1k"]);
    for (const k of maps) { const f = join(folder, k + (m.maps[k]!["1k"]!.match(/\.\w+$/)?.[0] ?? ".webp")); await download(m.maps[k]!["1k"]!, f); saved.push(f); }
    where = `${relative(cwd, folder)}/: ${maps.join(", ")}`;
    const [w, d] = m.size_m ?? [1, 1];
    code.push(
      `const ${varName(m.name)} = (() => {`,
      `  const loadMap = (file, srgb) => {`,
      `    const t = new THREE.TextureLoader().load(${JSON.stringify(`assets/${url(folder)}/`)} + file);`,
      `    t.wrapS = t.wrapT = THREE.RepeatWrapping;`,
      `    t.repeat.set(10 / ${num(w!)}, 10 / ${num(d!)}); // a 10 × 10 m surface with 0-1 UVs; with UVs in metres, 1 / ${num(w!)}`,
      `    if (srgb) t.colorSpace = THREE.SRGBColorSpace; // colour map only`,
      `    return t;`,
      `  };`,
      `  return new THREE.MeshStandardMaterial({`,
      ...saved.map((f, i) => `    ${SLOTS[maps[i]!]}: loadMap(${JSON.stringify(url(f).split("/").pop())}${maps[i] === "basecolor" ? ", true" : ""}),`),
      maps.includes("metalness") ? "    metalness: 1, // the map sets it" : null,
      maps.includes("opacity") ? "    alphaTest: 0.5," : null,
      "  });",
      "})();");
  } else {
    const m = h.m, src = m.urls["1k"] ?? Object.values(m.urls)[0]!, ext = src.match(/\.(\w+)$/)?.[1] ?? "hdr", file = join(dir, "hdri", `${m.hid}.${ext}`);
    await download(src, file);
    saved.push(file);
    // HDRLoader replaced RGBELoader in three r180; an older install in the project has only RGBELoader
    const loaders = join(cwd, "node_modules", "three", "examples", "jsm", "loaders");
    const L = ext === "exr" ? "EXRLoader" : !existsSync(join(loaders, "HDRLoader.js")) && existsSync(join(loaders, "RGBELoader.js")) ? "RGBELoader" : "HDRLoader";
    code.push(
      `import { ${L} } from "${base}/loaders/${L}.js";`,
      "",
      "{",
      "  const pmrem = new THREE.PMREMGenerator(renderer);",
      `  const sky = await new ${L}().loadAsync(${JSON.stringify(`assets/${url(file)}`)});`,
      "  scene.environment = pmrem.fromEquirectangular(sky).texture;",
      "  sky.mapping = THREE.EquirectangularReflectionMapping;",
      "  scene.background = sky; // the sky as backdrop; leave this line out to keep your own",
      "  pmrem.dispose();",
      "}");
  }
  return [
    ...full === id ? [] : [`Picked ${full}, the one shown id that starts with "${id}".`],
    `Saved ${where || relative(cwd, saved[0]!)} (${h.m.name}, ${h.m.license})${h.kind === "model" ? `; credited in ${relative(cwd, join(dir, "CREDITS.md"))}` : ""}`,
    ...(vite || h.kind === "texture" ? [] : ["If the import map has no `three/addons/`, map it to three's `examples/jsm/` folder."]),
    "```js", ...code.filter(l => l !== null), "```",
  ].join("\n");
}
