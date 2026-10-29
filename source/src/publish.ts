// `publish` (both builds, docs/plan-publish-2026-10-25.md): builds the project and puts it on https://<slug>.paprika3d.app
// through the publish Worker (worker/publish/). The key is the server's: on the first publish this mints one (solving the
// mint's proof of work) and keeps it in <config>/credentials.json (0600, <config> = $PAPRIKA3D_CONFIG_DIR, else
// $XDG_CONFIG_HOME/paprika3d, else ~/.config/paprika3d), unless PAPRIKA3D_PUBLISH_KEY holds one. The secret goes only
// in the Authorization header: never in a reply, a log line, an error, argv or a child's environment, since agent
// transcripts are plaintext; every reason, error and warning that leaves here is scrubbed of anything key- or
// bearer-shaped (a proxy's error page can echo the header). The key goes only over https (http only to localhost), and
// a key from PAPRIKA3D_PUBLISH_KEY only to the default API unless PAPRIKA3D_PUBLISH_API_TRUST=1. Publishing always binds the key's identity record (install id, agent client and version,
// model, OS, plugin version; the Worker adds a hashed IP), DO_NOT_TRACK or not, and the first publish says so once.
// Build: a project with a Vite config (or a `vite` build script) runs its own vite into paprika3d/publish/dist; a plain
// page uploads its folder as it is, with the node_modules files its import map reaches copied at the same paths. Left
// out: paprika3d/, paprika-loop/, node_modules (but those), dotfiles (.env*, .git), symlinks, files named as credentials
// (credentials.json, api_token.txt, serviceAccount.json) and the harness's and package manager's own files; game data
// that only has such a word in its name (secret-level.json, tokens.json) goes up with a warning.
// vite gets only the environment a build needs, never the agent's tokens. The slug comes from the project's name and is kept per project in <config>/projects.json,
// so a republish updates the same URL. PAPRIKA3D_PUBLISH_API points it at another server (`wrangler dev`).
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, chmodSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, posix, relative, resolve, sep } from "node:path";
import { MAX_FILE, MAX_FILES, MAX_TOTAL, badPath, brandOf, slugify, typeOf, unreserved, zeroBits } from "../worker/publish/src/rules.ts";
import { harnessDir, harnessHome } from "./state.ts";

const DEFAULT_API = "https://api.paprika3d.app";
export const apiBase = () => (process.env.PAPRIKA3D_PUBLISH_API || DEFAULT_API).replace(/\/+$/, "");
const isLocal = (api: string) => { try { const h = new URL(api).hostname; return ["localhost", "127.0.0.1", "[::1]"].includes(h) || h.endsWith(".localhost"); } catch { return false; } };
/** Hides a publish key or bearer token in any text that leaves `publish`: a proxy's, captive portal's or WAF's error page
    can echo the request's Authorization header, and every reply and error lands in the agent's plaintext transcript. */
export const scrub = (text: string) => text.replace(/ppk_live_[0-9A-Za-z]*/g, "ppk_live_[hidden]").replace(/\bBearer\s+[^\s"'<>,;]+/gi, "Bearer [hidden]"); // stops at a quote, so JSON stays JSON
export const configDir = () => process.env.PAPRIKA3D_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "paprika3d");
const CREDENTIALS = "credentials.json", PROJECTS = "projects.json", TOLD = "publish-told";
/** Where a person asks for an invite while publishing is an invite-only preview. */
export const INVITE_URL = "https://paprika3d.com/waitlist";

// ---- build -------------------------------------------------------------------------------------------------------

/** Folders and files never published: the harness's, the loop's, the package manager's and anything hidden. */
const SKIP_DIRS = new Set(["node_modules", "paprika3d", "paprika-loop"]);
const SKIP_FILES = new Set(["game-tests.json", "package.json", "package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml", "CLAUDE.md", "AGENTS.md"]);
/** Sources and notes a page never fetches: skipped without a warning. */
const QUIET = /\.(ts|tsx|jsx|cts|mts|md|lock|yaml|yml|toml|sh|py|log)$|(^|\/)tsconfig[^/]*\.json$/i;
const MAX_WALK = 20_000, MAX_DEPTH = 32;
/** A data or text file named as a credential or key (the word is its whole name or its last word: credentials.json,
    serviceAccount.json, api_token.txt, game-secrets.json): left out with a warning, never uploaded. */
const CREDENTIAL = /(^|\/|[-_.])(credentials?|secrets?|service[-_]?account(?:[-_]?key)?|private[-_]?key|client[-_]?secret|api[-_]?keys?|(?:api|access|auth|refresh|bearer|oauth|github|npm)[-_]?tokens?|passwords?|keyfile)\.(json|txt|csv|ya?ml|xml|ini|cfg|conf)$/i;
/** A data file with such a word elsewhere in its name (levels/secret-level.json, data/tokens.json, password-puzzle.json):
    most likely game data, so published, with a warning naming it. */
const SECRETISH = /(credential|secret|service[-_]?account|private[-_]?key|token|password)[^/]*\.(json|txt|csv|ya?ml|xml|ini|cfg|conf)$/i;

export type Built = { kind: "vite" | "plain"; root: string; files: Map<string, string>; warnings: string[] };

/** The project's files under `dir`, as posix paths relative to `root`, with the skips above (dot entries and symlinks too). */
function walk(root: string, dir: string, out: string[], skip: (rel: string, isDir: boolean) => boolean, links: string[], depth = 0) {
  if (depth > MAX_DEPTH) return;
  for (const name of readdirSync(dir)) {
    if (out.length > MAX_WALK) return;
    const abs = join(dir, name), rel = relative(root, abs).split(sep).join("/");
    if (name.startsWith(".")) continue;
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) { links.push(rel); continue; }
    if (st.isDirectory()) { if (!skip(rel, true)) walk(root, abs, out, skip, links, depth + 1); }
    else if (st.isFile() && !skip(rel, false)) out.push(rel);
  }
}

/** Every file a published project would hold, before the allowlist: the top-level skips apply to the project root only. */
export function projectFiles(cwd: string): { files: string[]; links: string[] } {
  const files: string[] = [], links: string[] = [];
  walk(cwd, cwd, files, (rel, isDir) => isDir ? SKIP_DIRS.has(rel) || rel.split("/").at(-1) === "node_modules" : SKIP_FILES.has(rel), links);
  return { files, links };
}

const IMPORTMAP = /<script\b[^>]*\btype\s*=\s*["']?importmap["']?[^>]*>([\s\S]*?)<\/script>/gi;
const STATIC = /\b(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"'\n]+)["']/g;
const DYNAMIC = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
const URL_REF = /\bnew\s+URL\s*\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url/g;
const SRC = /<(?:script|link|img|source|audio|video)\b[^>]*\b(?:src|href)\s*=\s*["']?([^"'\s>]+)/gi;
const NODE_MODULES = /["'`]((?:\.{0,2}\/)*node_modules\/[^"'`\s?#]+)["'`]/g;
const all = (re: RegExp, s: string) => [...s.matchAll(re)].map(m => m[1]!);

/** The node_modules files a plain page reaches through its import map, relative imports, `new URL(…, import.meta.url)`
    and "node_modules/…" strings (a decoder folder), each at its own path so the import map works unchanged. */
export function vendored(cwd: string, pages: string[], scripts: string[], warnings: string[]): string[] {
  const map: Record<string, string> = {}; // specifier → project path, or "" for a URL elsewhere
  for (const page of pages) for (const block of all(IMPORTMAP, readFileSync(join(cwd, page), "utf8"))) {
    let imports: Record<string, string> = {};
    try { imports = JSON.parse(block).imports ?? {}; } catch { warnings.push(`${page}: its import map is not JSON`); }
    for (const [k, v] of Object.entries(imports)) if (typeof v === "string") map[k] = /^[a-z]+:/i.test(v) ? "" : v.startsWith("/") ? v.slice(1) : posix.join(posix.dirname(page), v);
  }
  const found = new Set<string>(), queue: string[] = [], unmapped = new Set<string>();
  const inside = (p: string) => !p.startsWith("../") && p !== ".." && !posix.isAbsolute(p);
  const add = (p: string) => {
    if (!p.startsWith("node_modules/") || !inside(p) || found.has(p)) return;
    const abs = join(cwd, p);
    let st;
    try { st = statSync(abs); } catch { warnings.push(`${p} is referenced but not installed`); return; }
    if (st.isDirectory()) { // a folder named in a string (a Draco or Basis decoder path): its files that may be served
      const files: string[] = [], links: string[] = [];
      walk(cwd, abs, files, () => false, links);
      for (const f of files.slice(0, 500)) if (typeOf(f)) found.add(f);
      return;
    }
    found.add(p);
    if (/\.m?js$/.test(p)) queue.push(p);
  };
  const resolveFrom = (from: string, spec: string): string | null => {
    spec = spec.split(/[?#]/)[0]!;
    if (!spec || /^[a-z][a-z0-9+.-]*:/i.test(spec)) return null; // a URL: a CDN, data: or blob:
    if (spec.startsWith("/")) return posix.normalize(spec.slice(1));
    if (spec.startsWith("./") || spec.startsWith("../")) return posix.normalize(posix.join(posix.dirname(from), spec));
    if (Object.hasOwn(map, spec)) return map[spec] || null;
    const prefix = Object.keys(map).filter(k => k.endsWith("/") && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (prefix !== undefined) return map[prefix] ? posix.normalize(map[prefix] + spec.slice(prefix.length)) : null;
    unmapped.add(spec);
    return null;
  };
  const scan = (file: string, text: string, html: boolean) => {
    if (html) text = text.replace(IMPORTMAP, ""); // its folder entries ("three/addons/") are prefixes, not files to copy whole
    for (const spec of [...all(STATIC, text), ...all(DYNAMIC, text)]) { const p = resolveFrom(file, spec); if (p) add(p); }
    for (const spec of [...all(URL_REF, text), ...html ? all(SRC, text) : []]) { const p = resolveFrom(file, spec.startsWith(".") || spec.startsWith("/") ? spec : `./${spec}`); if (p) add(p); }
    for (const spec of all(NODE_MODULES, text)) add(posix.normalize(spec.startsWith("/") ? spec.slice(1) : posix.join(posix.dirname(file), spec)));
  };
  for (const f of [...pages, ...scripts]) scan(f, readFileSync(join(cwd, f), "utf8"), /\.html?$/.test(f));
  while (queue.length) { const f = queue.shift()!; scan(f, readFileSync(join(cwd, f), "utf8"), false); }
  if (unmapped.size) warnings.push(`imports with no import map entry, which fail in the browser: ${[...unmapped].slice(0, 5).join(", ")}`);
  return [...found];
}

/** A Vite project: a vite.config file, or a build script that runs vite. */
export function isVite(cwd: string): boolean {
  if (readdirSync(cwd).some(f => /^vite\.config\.(js|mjs|cjs|ts|mts|cts)$/.test(f))) return true;
  try { return /\bvite\b/.test(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).scripts?.build ?? ""); } catch { return false; }
}

/** The environment vite gets: what a build needs (paths, locale, Node's and Vite's own variables), never the agent's
    tokens (CLOUDFLARE_API_TOKEN, GITHUB_TOKEN, ANTHROPIC_API_KEY, the publish key), since the project's vite.config runs
    as code and the project may not be the person's own. */
const CHILD_ENV = /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LANGUAGE|TERM|TZ|CI|NODE_ENV|NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|COLORTERM|FORCE_COLOR|NO_COLOR|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|USERPROFILE|HOMEDRIVE|HOMEPATH|LC_[A-Z_]+|VITE_[A-Z0-9_]+|XDG_[A-Z_]+)$/i;
export const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => CHILD_ENV.test(k) && !/^PAPRIKA3D_PUBLISH/i.test(k)));

/** Runs the project's own vite (`node_modules/vite/bin/vite.js` under this runtime) into paprika3d/publish/dist. */
async function viteBuild(cwd: string): Promise<string> {
  const bin = join(cwd, "node_modules/vite/bin/vite.js");
  if (!existsSync(bin)) throw new Error("This is a Vite project but vite is not installed in it: run `npm install` (or `bun install`) in the project, then publish again.");
  const out = join(harnessDir(cwd), "publish", "dist");
  const said: string[] = [];
  const code = await new Promise<number>((done, fail) => {
    const p = spawn(process.execPath, [bin, "build", "--outDir", out, "--emptyOutDir", "--base", "/", "--logLevel", "warn"], { cwd, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
    const keep = (b: Buffer) => { said.push(...b.toString().split("\n").filter(Boolean)); said.splice(0, Math.max(0, said.length - 30)); };
    p.stdout.on("data", keep); p.stderr.on("data", keep);
    const timer = setTimeout(() => p.kill("SIGKILL"), 5 * 60_000);
    p.on("error", e => { clearTimeout(timer); fail(e); });
    p.on("close", c => { clearTimeout(timer); done(c ?? 1); });
  });
  if (code !== 0) throw new Error(`\`vite build\` failed (exit ${code}); nothing was published. Its last lines:\n${said.slice(-15).join("\n")}`);
  return out;
}

/** The files to publish, by published path → file on disk, and what was left out that the agent should know. */
export async function build(cwd: string): Promise<Built> {
  const warnings: string[] = [], files = new Map<string, string>();
  const keep = (root: string, rels: string[]) => {
    const refused: string[] = [], secret: string[] = [], named: string[] = [];
    for (const rel of rels) {
      if (badPath(rel)) { if (!QUIET.test(rel)) refused.push(rel); continue; }
      if (CREDENTIAL.test(rel)) { secret.push(rel); continue; }
      if (SECRETISH.test(rel.split("/").at(-1)!)) named.push(rel);
      if (/\.md$/i.test(rel) && !/(^|\/)CREDITS\.md$/i.test(rel)) continue;
      files.set(rel, join(root, rel));
    }
    if (refused.length) warnings.push(`left out ${refused.length} file${refused.length > 1 ? "s" : ""} of a type that is not served: ${refused.slice(0, 5).join(", ")}${refused.length > 5 ? ", …" : ""}`);
    if (secret.length) warnings.push(`left out ${secret.length} file${secret.length > 1 ? "s" : ""} whose name looks like a credential or key (never published; rename it if the page needs it): ${secret.slice(0, 5).join(", ")}`);
    if (named.length) warnings.push(`published ${named.length} file${named.length > 1 ? "s" : ""} with a credential-like word in the name, taken as game data: ${named.slice(0, 5).join(", ")}. If one holds a real secret, move it out of the project and publish again.`);
  };
  if (isVite(cwd)) {
    const out = await viteBuild(cwd), rels: string[] = [], links: string[] = [];
    walk(out, out, rels, () => false, links);
    keep(out, rels);
    return { kind: "vite", root: out, files, warnings };
  }
  const { files: rels, links } = projectFiles(cwd);
  if (links.length) warnings.push(`left out ${links.length} symlink${links.length > 1 ? "s" : ""}: ${links.slice(0, 5).join(", ")}`);
  keep(cwd, rels);
  const pages = [...files.keys()].filter(f => /\.html?$/i.test(f)), scripts = [...files.keys()].filter(f => /\.m?js$/i.test(f));
  const unserved: string[] = [];
  for (const f of vendored(cwd, pages, scripts, warnings)) if (badPath(f)) unserved.push(f); else files.set(f, join(cwd, f));
  if (unserved.length) warnings.push(`the page imports files of a type that is not served, left out: ${unserved.slice(0, 5).join(", ")}`);
  return { kind: "plain", root: cwd, files, warnings };
}

// ---- key and slug ------------------------------------------------------------------------------------------------

type Cred = { public_id?: string; secret: string; from: "env" | "file"; unsaved?: true };
const readJson = (f: string): Record<string, any> => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return {}; } };
/** The config folder, made (or, made earlier with a looser mode, set) so only this user can list it. */
function privateDir() {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  if (platform() !== "win32") chmodSync(configDir(), 0o700);
}
/** Writes a file only this user can read, in a folder only this user can list. */
function writePrivate(file: string, text: string) {
  privateDir();
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600); // an older file keeps its mode through writeFileSync
}
/** Rotated keys this process could not write to credentials.json (verify3 P3-3), by config folder and API: the server
    refuses the old secret already, so the new one lives here until a write succeeds. Filled only by that failure. */
const unsaved = new Map<string, Cred>();
/** Writes `api`'s key entry into credentials.json (0600), keeping the other entries. */
function storeKey(api: string, k: { public_id: string; secret: string }, extra: Record<string, string>) {
  const f = join(configDir(), CREDENTIALS), all = readJson(f);
  all[api] = { ...all[api], public_id: k.public_id, secret: k.secret, ...extra };
  writePrivate(f, JSON.stringify(all, null, 2));
}
/** The key for this API: PAPRIKA3D_PUBLISH_KEY, else one this process rotated and could not save, else
    credentials.json's entry for it, else null. */
export function savedKey(api = apiBase()): Cred | null {
  const env = process.env.PAPRIKA3D_PUBLISH_KEY?.trim();
  if (env) return { secret: env, from: "env" };
  const held = unsaved.get(`${configDir()} ${api}`);
  if (held) return held;
  const c = readJson(join(configDir(), CREDENTIALS))[api];
  return typeof c?.secret === "string" ? { public_id: c.public_id, secret: c.secret, from: "file" } : null;
}
const keyWhere = (c: Cred) => c.from === "env" ? "PAPRIKA3D_PUBLISH_KEY" : join(configDir(), CREDENTIALS);

/** The install id: the telemetry one when this install has one (never made here), else the publish-only one a successful
    mint wrote, else null. */
function installId(): string | null {
  try { const id = readFileSync(join(harnessHome(), "telemetry", "id"), "utf8").trim(); if (id) return id; } catch {}
  try { const id = readFileSync(join(configDir(), "install-id"), "utf8").trim(); if (id) return id; } catch {}
  return null;
}

/** A nonce whose SHA-256 with the challenge has `bits` leading zero bits (about 2^bits tries: a second at 20). It runs on
    the MCP server's thread, so a server asking for more than MAX_POW_BITS is refused and the search stops after `ms`. */
export const MAX_POW_BITS = 24;
export function solve(challenge: string, bits: number, ms = 60_000): string {
  if (!(bits >= 0 && bits <= MAX_POW_BITS)) throw new Error(`The publish server asked for a ${bits}-bit proof of work, more than this install solves (${MAX_POW_BITS}); nothing was published. Try again later.`);
  const end = Date.now() + ms;
  for (let n = 0; n < 2 ** (bits + 8); n++) {
    if (zeroBits(createHash("sha256").update(`${challenge}:${n}`).digest()) >= bits) return String(n);
    if ((n & 0xffff) === 0xffff && Date.now() > end) break;
  }
  throw new Error("could not solve the publish server's proof of work in time; nothing was published. Try again in a minute.");
}

/** The slug kept for this project, else one from its package.json name or folder name. */
export function slugFor(cwd: string, api = apiBase()): { slug: string; kept: boolean } {
  const kept = readJson(join(configDir(), PROJECTS))[`${api} ${realpathSync(cwd)}`]?.slug;
  if (typeof kept === "string") return { slug: kept, kept: true };
  let name = "";
  try { name = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).name ?? ""; } catch {}
  // template names say nothing about the game
  if (!name || /^(vite-project|my-app|app|game|three|plain|r3f|vite|paprika-game|paprika3d-game|create-paprika3d-game)$/.test(name.replace(/^@[^/]+\//, ""))) name = realpathSync(cwd).split(sep).at(-1) ?? "";
  return { slug: slugify(name) || "game", kept: false };
}
function keepSlug(cwd: string, slug: string, api: string) {
  const f = join(configDir(), PROJECTS), all = readJson(f);
  all[`${api} ${realpathSync(cwd)}`] = { slug, at: new Date().toISOString() };
  privateDir();
  writeFileSync(f, JSON.stringify(all, null, 2));
}
const withSuffix = (slug: string) => `${slug.slice(0, 35).replace(/-+$/, "")}-${randomUUID().replace(/-/g, "").slice(0, 4)}`;

// ---- the API -----------------------------------------------------------------------------------------------------

export class PublishError extends Error { constructor(public status: number, public body: Record<string, any>) { super(scrub(String(body.reason ?? `HTTP ${status}`))); } }
async function call(path: string, init: { method?: string; json?: unknown; body?: Uint8Array; secret?: string; headers?: Record<string, string> } = {}): Promise<any> {
  const api = apiBase(), headers: Record<string, string> = { ...init.headers };
  if (init.secret) headers.authorization = `Bearer ${init.secret}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";
  let r: Response;
  try {
    r = await fetch(api + path, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body as BodyInit | undefined, signal: AbortSignal.timeout(120_000) });
  } catch (e) { throw new Error(scrub(`The publish server at ${api} did not answer (${(e as Error)?.message ?? e}); nothing was published. Try again in a minute.`)); }
  const text = await r.text();
  let body: Record<string, any>;
  try { body = JSON.parse(text); } catch { body = { reason: text.slice(0, 200) || `HTTP ${r.status}` }; }
  if (typeof body.reason === "string") body.reason = scrub(body.reason);
  if (!r.ok) throw new PublishError(r.status, body);
  return body;
}

/** A key the server says was replaced (verify3 P2-2): by a rotation this install's key file did not make, so someone else
    had the key, or by the team's reissue. What happened and the way back, said once: the tool never retries, mints or
    rotates on its own after it. */
function replacedWords(b: Record<string, any>, where: string): string {
  const on = String(b.replaced_at ?? "").slice(0, 10), id = /^pub_[0-9A-Za-z]+$/.test(String(b.public_id)) ? String(b.public_id) : "this key's public id";
  if (b.replaced === "reissue") return `Not published: the publish key in ${where} was replaced on ${on}: the paprika3d team reissued its games to a new key. Tell the person: they put the new key the team sent them in ${where}, in place of the old one, themselves (or ask at founders@keeno.dev, with ${id}). Do not retry, mint or rotate, and do not read or edit that file yourself.`;
  const until = typeof b.reclaim_until === "string" ? `${b.reclaim_until.slice(0, 16).replace("T", " ")} UTC` : null;
  return `Not published: the publish key in ${where} was replaced on ${on} by a rotation not made with this key, so someone else has had it. Its games are still on the server. Tell the person: ${until ? `until ${until}, publishing with rotate: true from the network this key was made or last rotated on (their usual one) takes it back; after that, ` : ""}they write to founders@keeno.dev with ${id} and ask for a reissue. Do not retry, and do not mint a new key.`;
}

/** What the agent can do about a refusal, in words it can relay. */
export function guidance(e: PublishError, where: string): string {
  const b = e.body, why = scrub(String(b.reason ?? ""));
  switch (e.status) {
    case 401: return b.replaced ? scrub(replacedWords(b, where)) : `The publish server refused the publish key in ${where} (${why}). Tell the person; do not make, paste or print a key yourself.`;
    case 402: return `Not published: ${why}. Republishing one of this key's games (the same project) still works. The person can ask for more games on the waitlist: ${b.waitlist_url ?? "https://paprika3d.com/waitlist"}`;
    case 403: return /invite/i.test(why) ? `Not published: ${why}. Publishing to paprika3d.app is an invite-only preview: tell the person they can ask for an invite at ${INVITE_URL}, then set PAPRIKA3D_PUBLISH_INVITE to the code.` : `Not published: ${why}. Tell the person.`;
    case 429: { const s = Number(b.retry_after) || 60; return `Not published: rate limit (${why}). Try again in ${s} s (${s < 120 ? "about a minute" : `about ${Math.ceil(s / 60)} minutes`}); tell the person if they are waiting.`; }
    case 400: case 413: return `Not published: ${why}.`;
    default: return `Not published: the publish server answered ${e.status} (${why}). Try again in a minute.`;
  }
}

/** Before any build: whether the publish server answers and, for an install with no key yet, whether it would mint one.
    The default server not answering means publishing has not opened (or is down), which retrying in a minute does not fix. */
async function ready(api: string, minting: boolean): Promise<void> {
  let r: Response;
  try { r = await fetch(`${api}/v1/mint`, { signal: AbortSignal.timeout(10_000) }); }
  catch (e) {
    throw new Error(api === DEFAULT_API ? notOpen("did not answer") : scrub(`The publish server at ${api} (PAPRIKA3D_PUBLISH_API) did not answer (${(e as Error)?.message ?? e}); nothing was built or published.`));
  }
  if (!r.ok) throw new Error(api === DEFAULT_API ? notOpen(`answered ${r.status}`) : scrub(`The publish server at ${api} (PAPRIKA3D_PUBLISH_API) answered ${r.status}; nothing was built or published.`));
  const b = await r.json().catch(() => ({})) as { invite_only?: boolean };
  if (minting && b.invite_only && !process.env.PAPRIKA3D_PUBLISH_INVITE?.trim())
    throw new Error(`Not published: publishing to paprika3d.app is an invite-only preview, and this install has no publish key yet. Nothing was built or uploaded. Tell the person they can ask for an invite at ${INVITE_URL}, then set PAPRIKA3D_PUBLISH_INVITE to the code and ask again.`);
}
const notOpen = (what: string) => `Not published: publishing to paprika3d.app is not open yet (an invite-only preview), and its server ${what}. Nothing was built or uploaded, and trying again soon will not help. Tell the person they can ask for an invite at ${INVITE_URL}.`;

/** Mints this install's key (proof of work, then the identity record) and saves it 0600. */
async function mint(who: Who): Promise<Cred> {
  const { challenge, bits } = await call("/v1/mint");
  const nonce = solve(challenge, Number(bits) || 20);
  const [client, client_version] = splitClient(who.client);
  const invite = process.env.PAPRIKA3D_PUBLISH_INVITE?.trim(), had = installId(), install = had ?? randomUUID();
  const k = await call("/v1/mint", { json: { challenge, nonce, install, client, client_version, model: who.model ?? null, os: platform(),
    plugin_version: process.env.PAPRIKA3D_VERSION ?? "0.0.0-src" }, headers: invite ? { "x-paprika3d-invite": invite } : {} });
  // only a key that was made leaves anything in the config folder: a refused mint writes no install id
  if (!had) writePrivate(join(configDir(), "install-id"), install);
  storeKey(apiBase(), k, { created: new Date().toISOString() });
  return { public_id: k.public_id, secret: k.secret, from: "file" };
}
const splitClient = (c: string): [string | null, string | null] => { const i = c.lastIndexOf("/"); return !c || c === "unknown" ? [null, null] : i > 0 ? [c.slice(0, i), c.slice(i + 1)] : [c, null]; };

export type Who = { client: string; model?: string };
type Reply = { url: string; public_id: string; slug: string; version: number; claim_url: string; held?: string; warning?: string; remaining_quota: unknown; files: number; uploaded: number; seconds: number; warnings: string[] };

/** Replaces this install's key (POST /v1/key/rotate): the server refuses the old secret from then on, and the new one is
    written over it in credentials.json, never shown. Publishes nothing.
    The server has replaced the secret before the new one is written here, so a failed write must not lose it (verify3
    P3-3). Chosen over a two-phase rotation (the server keeping both secrets until the client confirms), which would
    leave the stolen secret working for that window: the folder and file are checked writable first (a probe file, so
    a full disk shows too), and a write that still fails keeps the new key in this process's memory, used by every
    publish until one manages to write it, with words that say so and never the key. */
async function rotateKey(api: string, who: Who): Promise<string> {
  const key = savedKey(api);
  if (!key) return "This install has no publish key yet, so there is nothing to rotate. Nothing was published.";
  if (key.from === "env") return "The publish key in use is PAPRIKA3D_PUBLISH_KEY, which the person set: only they can replace it. Nothing was rotated or published.";
  const f = join(configDir(), CREDENTIALS), probe = join(configDir(), `.rotate-${process.pid}`);
  try { privateDir(); writeFileSync(probe, "x"); unlinkSync(probe); if (existsSync(f)) accessSync(f, fsConstants.W_OK); }
  catch (e) { throw new Error(scrub(`Nothing was rotated: ${f} cannot be written (${(e as NodeJS.ErrnoException)?.code ?? e}), so the new key would have nowhere to go. Tell the person to make it writable (or free disk space), then ask again.`)); }
  try {
    const k = await call("/v1/key/rotate", { json: { client: splitClient(who.client)[0] }, secret: key.secret });
    try { storeKey(api, k, { rotated: new Date().toISOString() }); unsaved.delete(`${configDir()} ${api}`); }
    catch (e) {
      unsaved.set(`${configDir()} ${api}`, { public_id: k.public_id, secret: k.secret, from: "file", unsaved: true });
      return scrub(`Rotated this install's publish key, but the new key could not be saved to ${f} (${(e as NodeJS.ErrnoException)?.code ?? e}); the old key no longer works anywhere. This MCP server holds the new key in memory, so publishing works until the agent restarts, and the next publish saves it once the file can be written. Tell the person to make ${f} writable (or free disk space) and publish once. If the agent restarts before that, the key is lost: they write to founders@keeno.dev with the public id ${k.public_id} and ask for a reissue. Nothing was published.`);
    }
    return scrub(k.reclaimed ? `Took this install's publish key back: it had been rotated from another network, and the copy made there no longer works. The new key is kept in ${f}, never shown; its games stay its own. Nothing was published. Tell the person the key had leaked, and to keep ${f} private.`
      : `Rotated this install's publish key: the old one no longer works anywhere, and the new one is kept in ${f}, never shown. Its games stay its own. Nothing was published.`);
  } catch (e) {
    if (e instanceof PublishError) throw new Error(guidance(e, keyWhere(key)));
    throw new Error(scrub(e instanceof Error ? e.message : String(e)));
  }
}

/** Builds and publishes the project in `cwd`; returns the reply text. Refusals throw with words the agent can relay. */
export async function publish(cwd: string, who: Who, opts: { slug?: string; rotate?: boolean } = {}): Promise<string> {
  const t0 = Date.now(), api = apiBase();
  // the key goes only over https (http to this machine, for `wrangler dev`), and a key from the environment only to the
  // default API unless the person says otherwise: a project's .mcp.json or settings can set PAPRIKA3D_PUBLISH_API
  if (!/^https:\/\//.test(api) && !(/^http:\/\//.test(api) && isLocal(api)))
    throw new Error(`Nothing was published: the publish server ${scrub(api)} (PAPRIKA3D_PUBLISH_API) is not an https URL; only localhost may be plain http.`);
  if (process.env.PAPRIKA3D_PUBLISH_KEY?.trim() && api !== DEFAULT_API && !isLocal(api) && process.env.PAPRIKA3D_PUBLISH_API_TRUST !== "1")
    throw new Error(`Nothing was published: PAPRIKA3D_PUBLISH_KEY is sent only to ${DEFAULT_API}, and PAPRIKA3D_PUBLISH_API points at ${scrub(api)}. Tell the person: they can set PAPRIKA3D_PUBLISH_API_TRUST=1 if they trust that server.`);
  if (opts.rotate) return rotateKey(api, who);
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`publish: ${cwd} is not a folder`);
  await ready(api, !savedKey(api)); // a server that is not there, or a mint that would be refused, is said before a build
  const built = await build(cwd);
  if (!built.files.has("index.html")) throw new Error(built.kind === "vite" ? "The Vite build has no index.html at its top; nothing was published." : "The project has no index.html at its top: publish serves a folder whose page is index.html. Nothing was published.");
  if (built.files.size > MAX_FILES) throw new Error(`The project has ${built.files.size} files to publish; the most a game holds is ${MAX_FILES}. Nothing was published.`);
  // sizes first, from stat, so an oversized project is refused before a byte of it is read
  let total = 0;
  for (const [rel, abs] of built.files) {
    const size = statSync(abs).size;
    if (size > MAX_FILE) throw new Error(`${rel} is ${(size / 1048576).toFixed(1)} MiB; the most a file may be is 25 MiB (\`model_audit\` with \`shrink\` makes a model smaller). Nothing was published.`);
    total += size;
    if (total > MAX_TOTAL) throw new Error(`The project is over ${(MAX_TOTAL / 1e6).toFixed(0)} MB to publish (at ${rel}); the most a game may be is 100 MB. Nothing was published.`);
  }
  const manifest: Record<string, { hash: string; size: number }> = {}, byHash = new Map<string, string>();
  for (const [rel, abs] of built.files) {
    const bytes = readFileSync(abs), hash = createHash("sha256").update(bytes).digest("hex");
    manifest[rel] = { hash, size: bytes.byteLength };
    byHash.set(hash, abs);
  }

  let key = savedKey(api), minted = false;
  const where = () => key ? keyWhere(key) : join(configDir(), CREDENTIALS);
  try {
    if (!key) { key = await mint(who); minted = true; }
    const agent = { install: installId(), client: who.client === "unknown" ? null : who.client, model: who.model ?? null, plugin_version: process.env.PAPRIKA3D_VERSION ?? "0.0.0-src" };
    const chosen = opts.slug ? { slug: opts.slug, kept: true } : slugFor(cwd, api);
    let slug = chosen.slug, s: { session: string; missing: string[] } | undefined;
    for (let tries = 0; !s; tries++) {
      try { s = await call("/v1/publish", { json: { slug, files: manifest, agent }, secret: key.secret }); }
      catch (e) {
        // a name taken by another key, or reserved: a suffix, unless the slug was asked for or is this project's already;
        // a brand name with a sign-in word stays refused whatever the suffix, so the retry leaves those words out
        if (!(e instanceof PublishError) || e.status !== 409 || chosen.kept || opts.slug || tries >= 3) throw e;
        slug = withSuffix(brandOf(chosen.slug) ? unreserved(chosen.slug) : chosen.slug);
      }
    }
    const queue = [...s.missing];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let h = queue.shift(); h; h = queue.shift())
        await call(`/v1/blobs/${h}`, { method: "PUT", body: readFileSync(byHash.get(h)!), secret: key!.secret, headers: { "x-paprika3d-session": s!.session, "content-type": "application/octet-stream" } });
    }));
    const done = await call(`/v1/publish/${s.session}/finalize`, { json: {}, secret: key.secret });
    keepSlug(cwd, slug, api);
    if (key.unsaved) { // a rotated key only in memory (rotateKey): saved now if the file can be written
      try { storeKey(api, { public_id: key.public_id!, secret: key.secret }, { rotated: new Date().toISOString() }); unsaved.delete(`${configDir()} ${api}`); built.warnings.push(`saved the rotated publish key to ${join(configDir(), CREDENTIALS)}, never shown`); }
      catch { built.warnings.push(`the publish key is still only in this MCP server's memory: ${join(configDir(), CREDENTIALS)} cannot be written. Tell the person to fix that before the agent restarts, or the key is lost (then founders@keeno.dev for a reissue)`); }
    }
    if (key.from === "file" && !key.public_id) { const f = join(configDir(), CREDENTIALS), c = readJson(f); if (c[api]) { c[api].public_id = done.public_id; writePrivate(f, JSON.stringify(c, null, 2)); } }
    const reply: Reply = { url: done.url, public_id: done.public_id, slug: done.slug, version: done.version, claim_url: done.claim_url, ...done.held && { held: scrub(String(done.held)) }, ...done.warning && { warning: scrub(String(done.warning)) }, remaining_quota: done.remaining_quota,
      files: built.files.size, uploaded: s.missing.length, seconds: Math.round((Date.now() - t0) / 100) / 10, warnings: built.warnings };
    return scrub(JSON.stringify(reply, null, 2)) + told(minted); // a hostile or proxied server could echo the key in a URL
  } catch (e) {
    if (e instanceof PublishError) throw new Error(guidance(e, where()));
    throw new Error(scrub(e instanceof Error ? e.message : String(e)));
  }
}

/** Once per install: what publishing sends, which DO_NOT_TRACK does not turn off. */
function told(minted: boolean): string {
  const f = join(configDir(), TOLD);
  if (existsSync(f)) return "";
  try { privateDir(); writeFileSync(f, new Date().toISOString()); } catch {}
  return `\nFirst publish from this install${minted ? `: it made this install's publish key, kept in ${join(configDir(), CREDENTIALS)} and never shown` : ""}. Publishing uploads the built files to paprika3d.app, where anyone with the link can open them, and binds the key to this install (install id, agent client and version, model, OS, plugin version and a hashed IP) for every publish, even with DO_NOT_TRACK set, since publishing opts in to hosting. Say this to the person once.`;
}
