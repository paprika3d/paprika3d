// Browser control: open a game in Chrome with the harness's clock and three.js hook, and own its page.
// The game is served (a dev command's URL, a static server over a file or folder, or a given URL),
// opened in puppeteer-core with the installed Chrome, and paused on virtual time before any of its
// scripts run (inject/clock.js), so every later operation decides when frames happen.
// Every operation on the page goes through Game.queue, so nothing interleaves.
// After the clock is installed, never use page.waitForFunction: its polling runs on the faked
// requestAnimationFrame and setInterval. Poll from the server with page.evaluate and a server-side sleep instead.
// __clock.step(n) returns a promise: make it the evaluated expression's value (page.evaluate awaits it) or await it in an
// async function; only its first frame runs before it returns.
import { createReadStream, readFileSync, readdirSync, mkdirSync, rmSync, statSync, existsSync, type Dirent } from "node:fs";
import { join, resolve, relative, normalize, isAbsolute, dirname, extname, delimiter } from "node:path";
import { homedir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";
import puppeteer, { type Browser, type BrowserContext, type ConsoleMessage, type KeyInput, type MouseButton, type Page } from "puppeteer-core";
import { harnessDir } from "./state.ts";
import { VIEWPORT } from "./contract.ts";
import { SOFTWARE_GL } from "./budgets.ts";
import type { EngineName, Rack } from "./engines.ts";

const DEFAULT_CHROME = process.platform === "linux" ? "/usr/bin/google-chrome" : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Chrome: PAPRIKA3D_CHROME as given, else the first found of the platform's install, one on PATH, and the newest in
 *  Playwright's or Puppeteer's cache (a tester's agent took a sudo detour for /usr/bin/google-chrome with Playwright's
 *  Chromium installed, 2026-10-20); with none, the platform's path, so the error names it. */
function findChrome(): string {
  if (process.env.PAPRIKA3D_CHROME) return process.env.PAPRIKA3D_CHROME;
  const names = new Set(["chrome", "Chromium", "Google Chrome for Testing"]), home = homedir();
  // the first executable under a cache, folder names sorted descending so a later version comes first
  const newest = (d: string, depth = 0): string | undefined => {
    let list: Dirent[]; try { list = readdirSync(d, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name)); } catch { return; }
    for (const e of list) {
      const p = join(d, e.name);
      if (e.isFile() && names.has(e.name)) return p;
      if (e.isDirectory() && depth < 6) { const f = newest(p, depth + 1); if (f) return f; }
    }
  };
  const onPath = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].flatMap(n => (process.env.PATH ?? "").split(delimiter).filter(Boolean).map(d => join(d, n)));
  return [DEFAULT_CHROME, ...onPath].find(p => existsSync(p))
    ?? [".cache/ms-playwright", "Library/Caches/ms-playwright", ".cache/puppeteer/chrome"].map(d => newest(join(home, d))).find(Boolean)
    ?? DEFAULT_CHROME;
}
export const CHROME = findChrome();
export const CHROME_ARGS = [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`, "--disable-frame-rate-limit",
  // Linux is the AA-3D sandbox image: a container with no user namespaces for Chrome's sandbox, and no GPU, so WebGL runs on SwiftShader.
  // No WebGPU flag: headless Linux cannot present a WebGPU canvas (the page loses its device), and the judges' Chrome has none
  // either, so a WebGPURenderer page runs on three's WebGL 2 backend here as it does for them.
  ...(process.platform === "linux" ? ["--no-sandbox", "--enable-unsafe-swiftshader"] : []),
  // a benchmark's judging browser (AA-3D gives the gate's), so pages start and draw here as they will there
  ...(process.env.PAPRIKA3D_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean)];

/** The page as the tools use it: the puppeteer Page members they call, so Chrome's page is one as it is, and Firefox's
    (engines.ts asPage) is puppeteer's own with BiDi's few differences covered. tsc flags a tool that starts using a member
    outside this list; add it here, and to asPage when Firefox answers it differently. browser() is only asked whether the browser is still connected. */
export type HarnessPage = Pick<Page, "evaluate" | "evaluateOnNewDocument" | "removeScriptToEvaluateOnNewDocument" | "goto" | "reload"
  | "url" | "isClosed" | "on" | "off" | "once" | "keyboard" | "mouse" | "touchscreen" | "screenshot" | "setViewport"
  | "viewport" | "emulateMediaFeatures" | "setCacheEnabled" | "createCDPSession" | "metrics" | "workers"> & { browser(): { readonly connected: boolean } };

const INJECT = ["devtools.js", "geometry.js", "clock.js"].map(f => readFileSync(join(import.meta.dirname, "inject", f), "utf8")).join("\n");

/** Each distinct message once, with a (×N) count when repeated, at most n: a game logging one error a frame fills no
    reply and pushes no later error out. First-seen order keeps the first n; `last` orders by last occurrence and keeps
    the newest n. */
export function uniq(l: string[], n: number, last = false): string[] {
  const c = new Map<string, number>();
  for (const e of l) { const k = (c.get(e) ?? 0) + 1; if (last) c.delete(e); c.set(e, k); }
  const s = [...c];
  return (last ? s.slice(-n) : s.slice(0, n)).map(([e, k]) => k > 1 ? `${e} (×${k})` : e);
}

export const NOT_GAME = /\/(node_modules|runtime\/dist)\/|\/(three|three\.module|three\.core|three-runtime|geo)\.js$/;
/** " (file:line:col)" of a thrown error's first stack frame in the game's own files on the page's origin (not three.js,
    the harness's runtime or geo, or node_modules; query dropped), so the agent opens the line instead of grepping. "" when none. */
function gameFrame(stack: string, pageUrl: string): string {
  let origin: string;
  try { origin = new URL(pageUrl).origin; } catch { return ""; }
  for (const m of stack.matchAll(/^\s+at (?:.*\()?(https?:\/\/\S+?):(\d+):(\d+)\)?$/gm)) {
    const path = m[1]!.replace(/[?#].*/, "");
    // a folder URL is its index.html (serveStatic): a page opened at its project's root read " (:113:11)"
    if (path.startsWith(origin + "/") && !NOT_GAME.test(path.slice(origin.length))) return ` (${path.slice(origin.length + 1).replace(/(^|\/)$/, "$1index.html")}:${m[2]}:${m[3]})`;
  }
  return "";
}

/** Collects the console log/warn/info lines the page prints from now on; the returned function stops and gives them, at
    most 5 distinct (uniq), the newest with `last`. The page's own listener disposes each message's args (tips #12); this
    one reads only type and text. Software GL's "[.WebGL-…] GPU stall due to ReadPixels" is the driver's, not the game's. */
export function printedLines(page: HarnessPage, last = false): () => string[] {
  const printed: string[] = [];
  const on = (m: ConsoleMessage) => {
    if (["log", "warn", "info"].includes(m.type()) && !m.text().startsWith("[.WebGL")) printed.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  };
  page.on("console", on);
  return () => { page.off("console", on); return uniq(printed, 5, last); };
}

/** What the page reads from window.__harnessConfig before its own scripts run. */
export interface HarnessConfig { seed: number; runtime: { switches: Record<string, unknown> }; paused: boolean;
  /** WebGL runs on a software renderer: the clock ends every frame with a GPU sync (#25). Set by openGame once it knows. */
  software?: boolean }

export interface OpenOptions {
  /** An http(s) URL, or a file or folder to serve (relative to cwd); with `command`, the path, query and hash to open on its server. */
  url?: string;
  /** A dev-server command run in cwd; the game is the first localhost URL it prints, at `url`'s path when given. */
  command?: string;
  cwd: string;
  /** Show a Chrome window instead of running headless. */
  window?: boolean;
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  /** prefers-reduced-motion: reduce, until the next open. */
  reducedMotion?: boolean;
  config?: Partial<HarnessConfig>;
  /** A running headless Chrome (launchChrome()) to open the game in, in a browser context of its own that close() closes,
      leaving Chrome up for the next game: a launch and a close are ~0.4 s of every `open`. Ignored with `window`. */
  browser?: Browser | Promise<Browser>;
  /** The engine the page runs in: firefox through engines.ts's rack(), a browser of the game's own, with no CDP (no idle freeze) and `browser` ignored. Left out, Chrome, and only when Chrome is not there
      (launchChrome's "No Chrome at"), the engine engines.ts's fallback() picks; chromium given is Chrome or the error. */
  engine?: "chromium" | EngineName;
}

/** Starts the headless Chrome (or a window) games open in; `args` are added to CHROME_ARGS (the web 3D scorer's offline host rules). */
export function launchChrome({ window = false, viewport = VIEWPORT, args = [] }: { window?: boolean; viewport?: OpenOptions["viewport"]; args?: string[] } = {}): Promise<Browser> {
  if (!existsSync(CHROME)) return Promise.reject(new Error(`No Chrome at ${CHROME}${process.env.PAPRIKA3D_CHROME ? "" : " and none on PATH or in Playwright's or Puppeteer's cache"}: set PAPRIKA3D_CHROME to the path of Chrome or Chromium.`));
  return puppeteer.launch({
    executablePath: CHROME,
    headless: !window,
    defaultViewport: viewport,
    args: [...CHROME_ARGS, ...args],
    // over a pipe rather than a port, Chrome exits when the pipe closes, so it dies with its owner even on SIGKILL
    // (Claude Code kills a slow MCP server; a port-mode Chrome then ran on at 53% CPU for hours)
    pipe: true,
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, // only the owner's close() ends Chrome, after the queue drains
  }).then(b => (launched.push(b.process()), b));
}
/** Every Chrome process launched, never let go: under Bun (1.3.10) garbage collecting an exited Chrome's ChildProcess closes
    its pipe fds again, by then a later Chrome's DevTools pipe, so that Chrome exits and puppeteer waits forever (#28).
    shortcut: one small object per launch kept for good, drop it once Bun closes a child's extra stdio fds only once. */
const launched: unknown[] = [];

/** Kills a Chrome whose page stopped answering and waits (5 s at most) until puppeteer sees it gone, so the next call
    reopens the game before it runs instead of failing on the closed target. */
export async function stopChrome(b: Browser): Promise<void> {
  if (!b.connected) return;
  const gone = new Promise(r => b.once("disconnected", r));
  b.process()?.kill("SIGKILL");
  await Promise.race([gone, sleep(5_000)]);
}

const versions = new WeakMap<Browser, Promise<string>>();
/** Chrome's version ("155.0.8059.80"), asked once per launch: a shared Chrome serves many opens. */
const chromeVersion = (b: Browser) => versions.get(b) ?? (versions.set(b, b.version().then(v => v.replace(/^\D*\//, ""), () => "")), versions.get(b)!);

export interface Game {
  /** Chrome, through puppeteer; none in another engine (engine). */
  browser?: Browser;
  /** The engine the page runs in and its version ("155.0.8059.80", "158.0"); `instead` is the Chrome path that was
      missing when the open, given no engine, fell back to this one. */
  engine: { name: "chromium" | EngineName; version: string; instead?: string };
  page: HarnessPage;
  url: string;
  /** The folder served for a file or folder target; cwd for an http(s) URL or a dev command. */
  root: string;
  /** The harness's static server over root, so a page on any origin can load the project's node_modules/three
      (look()'s second copy of three); in static mode it also serves the game, else it serves nothing else. */
  files: string;
  /** `<cwd>/paprika3d/runs/<ISO>/`, where this run's files go. */
  runDir: string;
  config: HarnessConfig;
  /** The game's describe(), or what the three.js hook could infer. */
  info: Record<string, any>;
  /** Real milliseconds from navigation to ready (the page's own setup included), on its first load. */
  loadMs: number;
  /** What the page fetched while it opened (`__harness.loads`), read with describe() in one round trip for `open`'s reply. */
  loads: { name: string; status: number; bytes: number | null; error?: string }[];
  /** Page errors and console errors, in order. */
  errors: string[];
  /** three.js's own console warnings (lines starting "THREE."): its deprecation notices name removed API the game uses. */
  warned: string[];
  /** A dev command's last 200 lines of stdout and stderr after its URL line, kept up to date; empty without a command. */
  serverLog: string[];
  /** Keys pressed through page.keyboard and mouse buttons (`mouse:left`) not released yet. Chrome's input state outlives
      a navigation, so reload() and settle() release them: a second down of a held key arrives as a repeat, which most games ignore. */
  held: Set<string>;
  /** The size an `interact` resize set and the size before it, put back by the next reload when nothing else changed it. */
  resized?: { width: number; height: number; back: { width: number; height: number } };
  /** WebGL runs on a software renderer (SwiftShader on a machine with no GPU), so frame times say nothing of a real one. */
  software: boolean;
  /** The WebGL renderer string (the GPU), which `perf` names: an M3's frame time says little of a phone's (opinion-3). */
  gpu: string;
  /** The WebGPU adapter a WebGPURenderer on WebGPU draws with (vendor, architecture, description), or "". */
  adapter: string;
  /** False only when the page's main thread did not answer a 1 s ping (on a session of its own): it is busy with one task
      (an endless loop, or one long frame step). Any other answer, an error or a closed page included, is true. */
  alive(): Promise<boolean>;
  /** Throws away a hung page: stops its script and closes its browser context, which ends its renderer and leaves other
      games' pages running; its whole Chrome is killed when the context does not close in 2 s, or has none (a window). */
  abandon(): Promise<void>;
  /** Stops the script the page's main thread runs and keeps the page: Chrome's Runtime.terminateExecution on the ping's
      session, which the renderer takes while busy (answered in 1 ms under `for (;;) {}`). False where the engine has no
      such call (Firefox) or Chrome did not answer in 2 s: the caller then abandons the page. */
  stop(): Promise<boolean>;
  /** Runs fn after every earlier queued operation; a call made from inside a queued fn runs at once. */
  queue<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Merges config into the current one for the next load, without reloading (check and perf reload first anyway). */
  configure(config: Partial<HarnessConfig>): Promise<void>;
  /** Reloads the page with config merged into the current one, back to its paused first frame; at `url` when given. */
  reload(config?: Partial<HarnessConfig>, url?: string): Promise<void>;
  /** After the page navigated by itself under a step, releases the held keys and buttons, waits for the new document to boot
      under the harness (paused, frame 0) and returns its URL; throws "game not ready" when it is no three.js page. */
  settle(): Promise<string>;
  /** Closes page and browser and stops the dev server or static server. */
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A page call's error when the document it ran in went away under it: the page navigated (its own location.replace or
    reload, a link, a dev server's live reload) or its session was swapped. */
export const NAV_LOST = /Execution context was destroyed|Cannot find context with specified id|Not attached to an active page|detached Frame/;

/** Polls from the server (5 ms, backing off to 50) until clock.js's endBoot() ends boot, so nothing moves until a step: at once when
    window.__game exists, or when a renderer or WebGL canvas exists, the game has asked for a frame or drawn one (or stayed quiet without
    either for 3 s), and the page stayed idle with no request in flight across two polls.
    After 10 s a page with a renderer or WebGL canvas is booted anyway (a request that never ends, like a long poll); one without throws. */
async function ready(page: HarnessPage, errors: string[], requests: Set<unknown>) {
  const end = Date.now() + 10_000;
  let quiet = false, idleSince = 0, unframedSince = 0, wait = 5;
  for (;;) {
    const late = unframedSince > 0 && Date.now() - unframedSince >= 3_000;
    const s: unknown = await page.evaluate(`__clock.endBoot(${quiet && !requests.size}, ${late})`).catch(() => null); // null while the page's context is replaced
    if (s === "booted") return;
    // polls start at 5 ms and back off to 50, so a game whose __game appears just after load (R3F's onCreated) is not
    // kept waiting a whole 50 ms on every reload; quiet still needs the page idle, with nothing in flight, for 50 ms.
    // "unframed": idle, but the game has neither asked for a frame nor drawn one, so it is still setting up; it boots
    // once quiet that way for 3 s.
    const idle = (s === "idle" || s === "unframed") && !requests.size;
    idleSince = idle ? idleSince || Date.now() : 0;
    unframedSince = idle && s === "unframed" ? unframedSince || Date.now() : 0;
    quiet = idle && Date.now() - idleSince >= 50;
    if (quiet && s === "unframed" && !late) { await sleep(wait); wait = Math.min(50, wait * 1.5); continue; }
    if (Date.now() > end) {
      if (await page.evaluate("!!(window.__harness?.renderers.length || window.__harness?.gl.size) && (__clock.booted(), true)").catch(() => false)) return;
      // hooks/after-batch.ts matches "game not ready" (after cli.ts's prefix) to stay silent while no game is open
      // what the page itself says (ocean-noniv: "WebGPU is not available in this browser."), so a page that needs what headless has not is not read as broken (#44)
      const says = String(await page.evaluate("(document.body?.innerText ?? '').trim().slice(0, 300)").catch(() => "")).replace(/\s+/g, " ");
      throw new Error(`game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on ${page.url()}${says ? `\nThe page shows: "${says}"` : ""}${errors.length ? `\n${errors.join("\n")}` : ""}`);
    }
    if (quiet) continue; // the poll that ends boot follows at once
    await sleep(idle ? Math.max(1, Math.min(wait, idleSince + 50 - Date.now())) : wait); // idle: wake when it turns quiet
    wait = Math.min(50, wait * 1.5);
  }
}

// the renderer string of a WebGL context made for the purpose, freed at once
const GPU_NAME = `(() => { const gl = document.createElement("canvas").getContext("webgl"); if (!gl) return "";
  const name = gl.getParameter(gl.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  gl.getExtension("WEBGL_lose_context")?.loseContext(); return String(name); })()`;

// the adapter of the device a WebGPURenderer on WebGPU draws with: Chrome names an Apple GPU only "apple, metal-3" here,
// so the WebGL string above still names the chip; its fallback adapter (SwiftShader) is a software one
const ADAPTER = `(async () => { const r = window.__harness?.renderers.find(r => r.backend?.isWebGPUBackend); if (!r) return "";
  const i = r.backend.device?.adapterInfo ?? (await navigator.gpu?.requestAdapter())?.info; if (!i) return "";
  return [i.vendor, i.architecture, i.description].filter(Boolean).join(", ") + (i.isFallbackAdapter ? " (fallback adapter)" : ""); })()`;

/** `open`'s and `perf`'s line naming the GPU the page drew on, and saying so when it is a software one: a project's notes
    said "ANGLE Metal, Apple M4 Max" in one place and "a software renderer" in another, and agents tuned frame time
    without knowing which (Backrooms, #133). */
export function gpuLine(g: Pick<Game, "gpu" | "adapter" | "software">): string {
  const what = g.adapter ? `WebGPU adapter ${g.adapter}; WebGL names ${g.gpu || "nothing"}` : g.gpu || "unknown (no WebGL context)";
  return `GPU: ${what}${g.software ? ". A software renderer (no GPU): frame times here say nothing of a real GPU's." : "."}`;
}

const DESCRIBE = `(() => {
  const g = window.__game, h = window.__harness;
  // which backend a WebGPURenderer page drew with: Linux Chrome has no WebGPU, so three falls back to WebGL 2 there
  const gpu = h.renderers.find(r => r.isWebGPURenderer), renderer = gpu ? { renderer: gpu.backend?.isWebGPUBackend ? "WebGPURenderer on WebGPU" : "WebGPURenderer on its WebGL 2 backend (this browser has no WebGPU)" } : {};
  // a describe() that returns a string, not an object, is kept whole: spread, it printed one key per character (#62)
  if (g?.describe) { const d = g.describe(); return { ...(d && typeof d === "object" ? d : { description: String(d) }), ...renderer, hasConvention: true }; }
  const scene = h.mainScene();
  // names that differ only by a trailing number (tree0 … tree2999) are one entry, as observe() lists them, and at most
  // 50 entries: 3,000 names filled \`open\`'s whole reply and cut off its errors, first check and run folder
  const groups = new Map();
  for (const o of scene?.children ?? []) if (o.name) { const k = o.name.replace(/\\d+$/, ""), g = groups.get(k); g ? g.push(o.name) : groups.set(k, [o.name]); }
  const entities = [...groups].flatMap(([k, names]) => names.length > 3 ? [k + "* (" + names.length + ")"] : names);
  return { three: h.revision, ...renderer, scenes: h.scenes.length, entities: entities.length > 50 ? [...entities.slice(0, 50), "… " + (entities.length - 50) + " more"] : entities, hasConvention: !!g };
})()`;

/** Starts a dev command and resolves with the first localhost URL it prints (30 s deadline), and its output: the last 200
    lines of stdout and stderr after the URL line, kept up to date while it runs. The command gets its own
    process group and a watcher that kills the group once its stdin pipe closes, so the dev server dies with this
    process even when this is killed before close() (Claude Code kills MCP servers that are slow to exit). Ending stdin stops it. */
async function startCommand(command: string, cwd: string): Promise<{ proc: ChildProcess; url: string; log: string[] }> {
  // fd 3 because sh gives a background job /dev/null as stdin; `kill 0` stays in the group because of detached (setsid).
  // The command runs as shell code, not after exec: `exec PORT=3000 npm run dev` takes `PORT=3000` as the program, and
  // `exec a && b` drops b. sh waits for it, so close still fires when the command exits.
  // A server that ignores SIGTERM gets SIGKILL 5 s later (the watcher ignores TERM to live that long): close() waited
  // for its exit for ever, and it outlived a killed harness.
  const watch = `exec 3<&0 </dev/null; (trap '' TERM; read _ <&3; kill -TERM 0; sleep 5; kill -KILL 0) >/dev/null 2>&1 & exec 3<&-\n${command}`;
  const proc = spawn("sh", ["-c", watch], { cwd, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  // stderr was inherited, so a server-side error (Next's "window is not defined") behind a black page never reached the agent
  const log: string[] = [], part = ["", ""];
  let url = "";
  const out = () => [...log, ...part.filter(Boolean)].join("\n");
  const found = new Promise<string>((ok, fail) => {
    // the listeners stay on, so the pipes keep draining and a full pipe never blocks the server
    [proc.stdout!, proc.stderr!].forEach((stream, i) => stream.setEncoding("utf8").on("data", (s: string) => {
      const lines = (part[i] + s).replace(/\x1b\[[0-9;]*m/g, "").split(/\r\n?|\n/); // a bare \r too: a progress bar never ends its line
      part[i] = lines.pop()!.slice(-10_000); // a line with no end, or a minified bundle dumped as one, stays bounded too
      let from = 0;
      const at = i || url ? -1 : [...lines, part[i]].findIndex(l => LOCAL.test(l));
      if (at >= 0) { url = [...lines, part[i]][at]!.match(LOCAL)![0]; log.length = 0; from = at + 1; ok(url); }
      for (const l of lines.slice(from)) if (log.push(l.slice(0, 2_000)) > 200) log.shift();
    }));
    proc.on("close", () => fail(new Error(`${command} exited before printing a URL:\n${out()}`)));
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error(`${command} printed no localhost URL in 30 s:\n${out()}`)), 30_000); });
  try {
    return { proc, url: await Promise.race([found, timeout]), log };
  } catch (e) { proc.stdin!.end(); throw e; }
  finally { clearTimeout(timer); }
}
const LOCAL = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/;

// look()'s second copy of three, the only thing a page on another origin may load from the project.
const THREE_DIR = "/node_modules/three/";

// Chrome runs module scripts and streams wasm only with these types; others it sniffs.
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary" };

// The static server's port, picked on the first open and kept for the process's life: a page URL an agent kept failed
// with ERR_CONNECTION_REFUSED after a reopen, and agents ran their own http.server instead (AA-3D N12).
let staticPort = 0;

/** Serves root over 127.0.0.1; folders serve their index.html. Files under THREE_DIR get CORS; with threeOnly,
    nothing else is served, so a page on any origin cannot read the project's other files (.env and the like).
    Resolves with the server's base URL once it listens. */
async function serveStatic(root: string, threeOnly = false): Promise<{ server: Server; url: URL }> {
  // A throw in a request handler is uncaught and ends the whole MCP server: a malformed % (`<img src="100%.png">`), a
  // name too long to stat, or a file gone between the stat and the read answer that request alone.
  const server = createServer((req, res) => {
    try { answer(req, res); } catch { if (!res.headersSent) res.writeHead(400).end("bad request"); else res.destroy(); }
  });
  const answer = (req: IncomingMessage, res: ServerResponse) => {
    const url = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname)), three = url.startsWith(THREE_DIR);
    const path = join(root, url);
    if (relative(root, path).startsWith("..") || (threeOnly && !three)) return res.writeHead(403).end("forbidden");
    let file = path, st = statSync(path, { throwIfNoEntry: false });
    if (st?.isDirectory()) st = statSync(file = join(path, "index.html"), { throwIfNoEntry: false });
    if (!st?.isFile()) return res.writeHead(404).end("not found");
    // a validator and no-cache: every load asks again (an edit is never served stale) and an unchanged file is a 304,
    // so Chrome keeps it in its cache and reuses the compiled code of big scripts (three) across the check's reloads
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    const headers = { etag, "cache-control": "no-cache", ...three ? { "access-control-allow-origin": "*" } : {} };
    if (req.headers["if-none-match"] === etag) return res.writeHead(304, headers).end();
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "content-length": st.size });
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  };
  const listen = (port: number) => new Promise<void>((ok, fail) => {
    server.once("error", fail).listen(port, "127.0.0.1", () => { server.off("error", fail); ok(); });
  });
  // the previous game's server is closed before a reopen; one still open beside it (another named game) keeps the port
  await listen(staticPort).catch(() => listen(0));
  staticPort ||= (server.address() as AddressInfo).port;
  return { server, url: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`) };
}

/** The switches `optimize` kept (game-runtime.json, or public/'s under vite): __harnessConfig.runtime wins over the
    file in the page, so without them every later open ran the game unoptimized. */
function keptSwitches(cwd: string): Record<string, unknown> {
  for (const f of [join(cwd, "game-runtime.json"), join(cwd, "public", "game-runtime.json")]) {
    try { return JSON.parse(readFileSync(f, "utf8")).switches ?? {}; } catch {}
  }
  return {};
}

/** Deletes the pictures and clips (~700 KB a look, #74) in every run folder under `runs` but the newest 10, keeping
    run.json, last-test.json and every other file (the hooks read those). A folder written to in the last hour is left
    whole: another live session may be using it. Baselines live in `paprika3d/baselines/`, never here. */
function shedPictures(runs: string) {
  let names: string[];
  try { names = readdirSync(runs).sort(); } catch { return; } // a run folder is named by its ISO time, so names sort by age
  for (const name of names.slice(0, -10)) {
    const dir = join(runs, name);
    try {
      if (Date.now() - statSync(dir).mtimeMs < 3_600_000) continue;
      for (const f of readdirSync(dir)) if (/\.(png|gif|mp4)$/i.test(f)) rmSync(join(dir, f), { force: true });
    } catch {} // not a folder, or gone under another session
  }
}

/** Opens a game in Chrome, paused on the harness clock, and waits until it is ready. */
export async function openGame(opts: OpenOptions): Promise<Game> {
  const cwd = resolve(opts.cwd);
  let config: HarnessConfig = { seed: 1, runtime: { switches: keptSwitches(cwd) }, paused: true, ...opts.config };
  let proc: ChildProcess | undefined, served: { server: Server; url: URL } | undefined, url: string, root = cwd, serverLog: string[] = [], fileNote: string | undefined;
  const viewport = opts.viewport ?? VIEWPORT;
  // Chrome starts while the dev server does (vite then Chrome took 465 ms, both at once 291 ms); a failure meanwhile
  // closes it. A shared Chrome is only borrowed: this game gets a context of its own, and closing closes that alone.
  // Firefox: engines.ts launches it with the page, and says how to ping, drop and close it
  let other = opts.engine && opts.engine !== "chromium" ? opts.engine : undefined, shared = !other && !opts.window && !!opts.browser;
  let instead: string | undefined;
  const racks = (name: EngineName) => import("./engines.ts").then(m => m.rack(name, { window: opts.window, reducedMotion: opts.reducedMotion, viewport }));
  const chrome = !other && (shared ? Promise.resolve(opts.browser!) : launchChrome({ window: opts.window, viewport }));
  // no engine asked for and no Chrome: the page opens in another engine (engines.ts fallback()), saying so on `open`
  const launching: Promise<Browser | Rack> = other ? racks(other) : opts.engine ? chrome as Promise<Browser> : (chrome as Promise<Browser>).catch(async e => {
    const pick = String((e as Error)?.message).startsWith("No Chrome at ") && (await import("./engines.ts")).fallback();
    if (!pick) throw e;
    [other, shared, instead] = [pick, false, CHROME];
    return racks(pick);
  });
  launching.catch(() => {}); // awaited below; a rejection before then is not unhandled
  let context: BrowserContext | undefined;
  const end = (b: Browser | Rack) => shared ? context?.close() : b.close();
  try {
    if (opts.command) {
      ({ proc, url, log: serverLog } = await startCommand(opts.command, cwd));
      // a `url` beside a command is the path, query and hash to open on the server it started; the origin is always the one the
      // command printed, so a port Vite moved to is followed and a stale port cannot land on another project's server (dev #121, #133)
      if (opts.url) {
        const u = new URL(opts.url, url), file = opts.url.match(/^[^?#]*/)![0];
        // a file named beside the command (index.html, public/index.html, an absolute path) is not a path on its server: the server's own URL opens, with the url's query
        if (file && existsSync(resolve(cwd, file)) && !/^https?:\/\//.test(opts.url)) { fileNote = `url names the file ${file}, which is not a path on the command's server, so its own URL opened${u.search || u.hash ? " with the url's query" : ""}`; url = new URL(u.search + u.hash, url).href; }
        else url = new URL(u.pathname + u.search + u.hash, url).href;
      }
    } else if (opts.url && /^https?:\/\//.test(opts.url)) url = opts.url;
    else {
      // cwd is the web root, so a project's /node_modules/... resolves; a target outside cwd is served from its own folder.
      // a query or hash ("index.html?level=2") is the page's, not part of the file's path
      const [, file = ".", suffix = ""] = (opts.url ?? ".").match(/^([^?#]*)(.*)$/s) ?? [];
      const target = resolve(cwd, file || ".");
      const rel = relative(cwd, target);
      if (rel.startsWith("..") || isAbsolute(rel)) root = statSync(target).isDirectory() ? target : dirname(target);
      served = await serveStatic(root);
      const path = relative(root, target);
      url = new URL(encodeURI(path && statSync(target).isDirectory() ? path + "/" : path) + suffix, served.url).href; // trailing slash keeps the page's relative URLs inside its folder
    }
  } catch (e) {
    await launching.then(end).catch(() => {});
    served?.server.close();
    proc?.stdin!.end(); // a url that does not parse throws after the command started
    throw e;
  }
  const files = (served ??= await serveStatic(root, true)).url.href;

  let browser: Browser | undefined, racked: Rack | undefined;
  try {
    const got = await launching;
    if (other) racked = got as Rack; else browser = got as Browser;
    if (shared) context = await browser!.createBrowserContext();
    const page: HarnessPage = racked?.page ?? (shared ? await context!.newPage() : (await browser!.pages())[0] ?? await browser!.newPage());
    if (shared) await page.setViewport(viewport);
    // Firefox's is a launch pref (rack()), since BiDi has no media emulation
    if (opts.reducedMotion && !racked) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    // a server of the agent's own (python3 -m http.server) sends no cache-control, so Chrome reused edited modules on a
    // reload and an AA-3D agent compared 23 perf runs of stale code; the harness's own server revalidates every load
    if (!opts.command && /^https?:\/\//.test(opts.url ?? "")) await page.setCacheEnabled(false);
    const errors: string[] = fileNote ? [fileNote] : [], warned: string[] = [];
    page.on("pageerror", e => {
      const [first, ...rest] = String((e as Error)?.message ?? e).split("\n"); // act and eval show only the first line
      errors.push([first + gameFrame(String((e as Error)?.stack ?? ""), page.url()), ...rest].join("\n"));
    });
    // Chrome asks every page for /favicon.ico; its 404 is not the game's error. Each logged value comes with a handle
    // that keeps it alive in the page until released: a game logging an object a frame held 6.0 MB after 10,000 frames
    // (1.3 MB released), skewing perf's heapMB and gcPauses.
    page.on("console", m => {
      const at = m.type() === "error" ? m.location().url ?? "" : "/favicon.ico";
      // a failed load's location is the resource itself; name it, relative to the page, since the text alone names no file
      if (!at.endsWith("/favicon.ico")) errors.push(m.text() + (/^Failed to load resource/.test(m.text()) && at
        ? ` ${at.replace(page.url().replace(/[^/]*([?#].*)?$/, ""), "")}${at.includes("/node_modules/three/") ? " (run bun add three in cwd)" : ""}` : ""));
      // capped: an old getter read every frame warns every frame, and only boot's are read (`open`)
      if (m.type() === "warn" && m.text().startsWith("THREE.") && warned.length < 200) warned.push(m.text().slice(0, 300));
      for (const a of m.args()) a.dispose().catch(() => {});
    });

    // Requests the page still waits on keep boot going; streams that never end do not count.
    const requests = new Set<unknown>();
    page.on("request", r => { if (!["eventsource", "websocket"].includes(r.resourceType())) requests.add(r); });
    page.on("requestfinished", r => requests.delete(r));
    page.on("requestfailed", r => requests.delete(r));

    let injected = (await page.evaluateOnNewDocument(`window.__harnessConfig = ${JSON.stringify(config)};\n${INJECT}`)).identifier;
    const load = async (go: () => Promise<unknown>) => {
      requests.clear(); // a navigation drops the old page's requests
      // the page's session can be swapped under a reload the page started itself (a location.reload() from `eval`):
      // `perf`'s reload then failed with "Not attached to an active page" twice in an AA-3D atlantis cell, and the
      // same call run again worked
      try { await go(); }
      catch (e) {
        const message = String((e as Error)?.message);
        // a request that never ends (a long poll, a server that never answers) holds the load event, not boot: ready()
        // boots past it; a document still parsing (a script that never ends) never loaded at all (#29)
        if (/Navigation timeout/.test(message)) {
          const parsed = await Promise.race([page.evaluate("document.readyState !== 'loading'").catch(() => false), sleep(2_000).then(() => false)]);
          if (!parsed) throw new Error(`the page never finished loading: still parsing its HTML after ${message.match(/\d+ ms/)?.[0] ?? "30 s"} (a script that never ends, or a server that never sends the whole page)`);
          const held = [...requests].map(r => (r as { url(): string }).url()).slice(0, 3);
          errors.push(`The page's load event never fired: ${held.length ? `requests never answered (${held.join(", ")})` : "a request never answered"} held it for ${message.match(/\d+ ms/)?.[0] ?? "30 s"}, so the harness opened the page without it`);
        } else {
          if (!NAV_LOST.test(message)) throw e;
          await sleep(500);
          requests.clear();
          await go();
        }
      }
      await ready(page, errors, requests);
    };
    const loadStart = Date.now();
    await load(() => page.goto(url));
    const loadMs = Date.now() - loadStart;

    shedPictures(join(harnessDir(cwd), "runs"));
    const runDir = join(harnessDir(cwd), "runs", new Date().toISOString().replace(/[:.]/g, "-"));
    mkdirSync(runDir, { recursive: true });

    const inQueue = new AsyncLocalStorage<true>();
    let chain: Promise<unknown> = Promise.resolve();
    // A headless page left open burns ~40% of a core doing nothing (two cores under SwiftShader in the AA-3D containers,
    // where agents then killed the harness's Chrome or parked it on a blank page). Once the queue has been idle a while on
    // a paused clock the page is frozen, and the next queued call wakes it first. A frozen page still answers a plain
    // evaluate, but nothing that waits on a task, so every page call goes through the queue. Firefox has no freeze
    // and needs none: a page there on the paused clock idles at 0-2% of a core (cubes, snake, store-platformer, T2b).
    const cdp = opts.window || racked ? null : await page.createCDPSession();
    let pending = 0, frozen = false, idle: ReturnType<typeof setTimeout> | undefined;
    const freezeMs = Number(process.env.PAPRIKA3D_FREEZE_MS) || 10_000;
    // Freezing hides the page and waking leaves it hidden, and a hidden page runs no real-time frame: `perf` read "no
    // frames ran" on every page idle 10 s (AA-3D P1). Focus emulation shows it again, so it is on only while awake.
    const life = async (state: "frozen" | "active") => {
      if (state === "frozen") await cdp!.send("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
      await cdp!.send("Page.setWebLifecycleState", { state }).catch(() => {});
      if (state === "active") await cdp!.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
    };
    const rest = () => {
      clearTimeout(idle);
      if (!cdp) return;
      idle = setTimeout(() => {
        chain = chain.then(async () => {
          if (pending || frozen || !await page.evaluate("window.__clock?.paused?.() ?? false").catch(() => false)) return;
          frozen = true;
          await life("frozen");
        }).catch(() => {});
      }, freezeMs);
      idle.unref?.();
    };
    const b = browser;
    // pings and terminateExecution go on a session of their own, so nothing the page's own session waits on is ahead of them
    const watch = racked ? null : await page.createCDPSession();
    // the page's browser as the game's alive, abandon and close see it: another engine's from rack(), else Chrome's
    const seat: Pick<Rack, "alive" | "abandon" | "close"> & { version: string | Promise<string> } = racked ?? {
      version: chromeVersion(b!),
      alive: () => watch!.send("Runtime.evaluate", { expression: "1" }, { timeout: 1_000 }).then(() => true, e => !/timed out/.test(String(e?.message))),
      // Target.closeTarget answers at once but leaves a spinning renderer running; closing the context ends it (3 ms on a
      // `while (true)` page)
      abandon: async () => {
        watch!.send("Runtime.terminateExecution").catch(() => {});
        // puppeteer marks the page closed a moment after the close answers; callers test page.isClosed() next
        const closed = context && Promise.all([context.close(), page.isClosed() || new Promise(r => page.once("close", r))]).then(() => true, () => false);
        if (!closed || !await Promise.race([closed, sleep(2_000).then(() => false)])) await stopChrome(b!);
      },
      close: async () => { await end(b!); },
    };
    let dropped: Promise<void> | undefined;
    const [info, loads] = await page.evaluate(`[${DESCRIBE}, window.__harness?.loads ?? []]`) as [Game["info"], Game["loads"]];
    const gpu = await page.evaluate(GPU_NAME) as string, adapter = await page.evaluate(ADAPTER).catch(() => "") as string;
    // puppeteer keeps the pressed keys and buttons on the page, not the document, so a navigation leaves them down (Game.held)
    const letGo = async () => {
      for (const key of game.held) {
        if (key.startsWith("mouse:")) await page.mouse.up({ button: key.slice(6) as MouseButton });
        else await page.keyboard.up(key as KeyInput);
      }
      game.held.clear();
    };
    const game: Game = {
      browser: b, engine: { name: other ?? "chromium", version: await seat.version, ...instead && { instead } }, page, url, root, files, runDir, config, errors, warned, serverLog, held: new Set(), info, loads,
      loadMs,
      gpu, adapter, software: SOFTWARE_GL.test(gpu) || /fallback|swiftshader/i.test(adapter),
      alive: seat.alive,
      // a second caller (the control socket's check and a call both saw it hang) waits on the first
      abandon: () => dropped ??= (async () => {
        clearTimeout(idle);
        await seat.abandon();
      })(),
      stop: async () => !!watch && await Promise.race([watch.send("Runtime.terminateExecution").then(() => true, () => false), sleep(2_000).then(() => false)]),
      queue<T>(fn: () => T | Promise<T>) {
        if (inQueue.getStore()) return Promise.resolve().then(fn);
        pending++;
        clearTimeout(idle);
        const run = chain.then(async () => {
          // terminateExecution ends the hung fn before its context is closed: the next waits for the close, so it sees it
          if (dropped) await dropped;
          if (frozen) { frozen = false; await life("active"); }
          return inQueue.run(true, fn);
        });
        chain = run.catch(() => {});
        run.finally(() => { if (--pending === 0) rest(); }).catch(() => {});
        return run;
      },
      configure(next) {
        return game.queue(async () => {
          game.config = config = { ...config, ...next };
          await page.removeScriptToEvaluateOnNewDocument(injected);
          injected = (await page.evaluateOnNewDocument(`window.__harnessConfig = ${JSON.stringify(config)};\n${INJECT}`)).identifier;
        });
      },
      reload(next, to) {
        return game.queue(async () => {
          if (next) await game.configure(next);
          await letGo();
          await page.evaluate("scrollTo(0, 0)").catch(() => {}); // Chrome restores a reloaded page's scroll; a reload starts at the top, as an open does
          // an `interact` resize lasts until the next reload: a saved check run after one played at 390 px and failed
          // (feel-8); a size a viewports look set since is that look's to put back
          const v = page.viewport(), r = game.resized;
          game.resized = undefined;
          if (v && r && v.width === r.width && v.height === r.height) await page.setViewport({ ...v, ...r.back });
          const t0 = Date.now();
          await load(() => to ? page.goto(to) : page.reload());
          game.loadMs = Date.now() - t0; // `perf` reports this reload's load-to-first-frame time (warm cache)
        });
      },
      settle() {
        return game.queue(async () => { await letGo(); await ready(page, errors, requests); return page.url(); });
      },
      async close() {
        clearTimeout(idle);
        await seat.close().catch(() => {});
        served?.server.close();
        served?.server.closeAllConnections();
        if (proc && proc.exitCode === null && proc.signalCode === null) { const exited = once(proc, "exit"); proc.stdin!.end(); await exited; }
      },
    };
    // known only once the page has loaded, so the page loaded now learns it here and every reload from its config
    if (game.software) { await game.configure({ software: true }); await page.evaluate("window.__harnessConfig && (window.__harnessConfig.software = true)"); }
    return game;
  } catch (e) {
    const opened = racked ?? browser;
    if (opened) await end(opened)?.catch(() => {});
    served?.server.close();
    served?.server.closeAllConnections();
    proc?.stdin!.end();
    throw e;
  }
}
