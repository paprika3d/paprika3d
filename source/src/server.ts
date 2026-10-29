// The harness's MCP server: a hand-written stdio JSON-RPC loop (one JSON message per line, no SDK, the way Paprika's
// src/app.ts does it) with its tools over one open game (`eval` runs the agent's code in the page), plus a
// local control socket for the hook's CLI. With
// PAPRIKA3D_LOOP=lean (the bench's lean arm) it also lists `invariants`;
// `asset_search` reaches the hosted asset library over the network (src/asset.ts), and `publish` puts the project on
// <slug>.paprika3d.app (src/publish.ts), both in both builds.
// The server is the only owner of Chrome: every tool and every socket request runs through the open Game's queue, so
// the hook's check can never interleave with the agent's own steps. The socket listens on 127.0.0.1 at a random port
// with a random token, both saved in the project's state.json; it refuses any request carrying an Origin header, so a
// web page cannot reach it. Tool results are text under 10k tokens; `open`'s ends with the run folder and a look's starts
// with its picture's path in it, the lines the hooks find a session's runs by (hooks/session.ts). A tool's own error is
// an isError result the model reads, never a JSON-RPC error. Stdout carries protocol JSON only; logs go to stderr.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { cpus, loadavg } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { json } from "node:stream/consumers";
import { gpuLine, launchChrome, NAV_LOST, openGame, printedLines, uniq, type Game } from "./browser.ts";
import { clipText, REC_NAVIGATED, RECORD_MAX_S, VIDEO_MAX_S, videoText } from "./record.ts";
import { BROWSERS, EngineUnsupported, SAID, notes, refuse, type BrowserWord } from "./engines.ts";
import type { Browser } from "puppeteer-core";
import { contractInstructions, loadContract, predicates, saveContract, saveTest, VIEWPORT } from "./contract.ts";
import { check, type CheckResult } from "./check.ts";
import { invariants } from "./invariants.ts";
import { capAct, observe } from "./scene.ts";
import { AFTER_STOP, evaluate } from "./eval.ts";
import { act, hover, type Step } from "./input.ts";
import { look, lookFrom, lookText, faultLines, faultDiff, faultsNow, coversText, views, cameras, namedCam, sheet, viewports, viewportsText, sheetText, scrollSweep, zoom, zoomOutside, probe, opening, saveBaseline, compareBaseline, colours, type Cover, type Look, type SheetItem } from "./look.ts";
import { feel } from "./feel.ts";
import { COLOUR_SPACES } from "./lighting.ts";
import { pageAssets, perf, passesText, costsText, overlayText, variantSetup, variantUrl, firstFrame, NETWORKS, LIGHTS, manyLights, lightsText, type Lights, type Variant, type PerfResult, type Network } from "./perf.ts";
import { BUDGETS, SOFTWARE_NOTE, budgetText, type Budget } from "./budgets.ts";
import { optimize } from "./optimize.ts";
import { assetsText, CONVERT, shrink, shrinkFix, shrinkText } from "./glb.ts";
import { USD } from "./usd.ts";
import { pictureFile, reference, viewpoint } from "./reference.ts";
import { modelLook, modelRun } from "./model.ts";
import { assetsOver } from "./assets.ts";
import { fingerprint, fingerprints } from "./fingerprint.ts";
import { staleThree } from "./lint.ts";
import { openText } from "./open.ts";
import { harnessDir, issueContract, noteRun, recordRun, updateState, type Run } from "./state.ts";
import { ON as TELEMETRY, FEEDBACK, REPORT_ASK, REPORT_TOOL, event, installed, noteOpen, reportTool, told as disclosure } from "./telemetry.ts";
import type { CheckReply, Edit } from "./control.ts";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type Result = { content: Content[]; isError?: boolean };

const MAX_CHARS = 15_000; // observe/act JSON runs about 1.5 characters a token, so this stays under the 10k a tool result may take
// A reply over the limit keeps its head and its last lines, since the end is where tools put what matters most (a
// check's summary and frame line, the stale warning, `open`'s first check and run folder).
const TAIL = 2_500;
/** What `perf`'s work time is, and why an interval can be pacing (perf.ts WORK, #132). */
const WORK_IS = "paused frames, each timed from its step to the end of its GPU work, with no wait for the display";
/** `perf`'s work numbers in words: the median of the frames that drew is judged, since a page that draws one frame in four
    had a median of the frames between (0.1 ms against 1.3); the mean is the cost per 60 Hz frame, and the slowest beside. */
const workText = (w: NonNullable<PerfResult["work"]>) => `${w.ms} ms ${w.drew ? `a frame that drew (the median of ${w.drew})` : `a frame (the median of ${w.frames}; none called three's render)`}, ${w.cpuMs} ms of it the frame's code; ${w.meanMs} ms a frame on average over ${w.frames} stepped, the slowest ${w.maxMs} ms`;
const PACED = "headless Chrome runs frames back to back only while each one draws something new, and a frame that presents nothing new waits for the 60 Hz tick (a render skipped, or a canvas not drawn to every frame).";
/** The GPU line `open` said last (gpuLine), so a reopen on the same GPU does not say it again. */
let saidGpu = "";

/** `open`'s and `perf`'s warning for a page slow to reach its first frame, or "". The judges' software-WebGL gate
    fails a page with no frame in 60 s and a player sees the first seconds, so 15 s was too late a line (full-1 findings N4). */
export function slowStart(ms: number, software = false): string {
  const secs = (ms / 1000).toFixed(1), fix = "Move heavy setup (geometry, canvas textures, shader compiles) off the first frame or make it cheaper.";
  if (ms > 10_000) return `Slow start: the page took ${secs} s to load and set up before its first frame; a judge on software WebGL may see nothing for a minute. ${fix}`;
  // 3-10 s is what software WebGL costs any page (AA-3D: agents chased it with `perf` for nothing)
  if (software) return ms > 3_000 ? `The page took ${secs} s to its first frame; expected on this software renderer, nothing to do.` : "";
  return ms > 3_000 ? `Slow start: the page took ${secs} s to load and set up before its first frame; a viewer sees nothing that long. ${fix}` : "";
}

export function fit(body: string): string {
  if (body.length <= MAX_CHARS) return body;
  const tail = body.slice(body.indexOf("\n", body.length - TAIL) + 1 || body.length - TAIL);
  const head = body.slice(0, MAX_CHARS - tail.length - 60);
  return `${head}\n… (${body.length - head.length - tail.length} characters cut) …\n${tail}`;
}
const text = (body: string): Result => ({ content: [{ type: "text", text: fit(body) }] });
const fail = (body: string): Result => ({ ...text(body), isError: true });
const log = (s: string) => console.error(`paprika3d: ${s}`);

/** The picture in the reply, as a JPEG at most 1,024 pixels wide, so the agent sees it in the same turn: a path alone cost a
    Read call per look, 27 to 50 model calls (11-20% of the turn cap) in each plugin cell of AA-3D full-1. 1,024 rather than
    1,280: about 850 tokens a picture instead of 1,330, with Sonnet's defect recall not lower (vision-detect t5-vision-1). */
/** A `camera` argument: `{ position, lookAt }` as given, or a camera by name (look.ts namedCam). */
function namedOr(cwd: string, c: unknown): { position: number[]; lookAt?: number[] } { return typeof c === "string" ? namedCam(cwd, c) : c as { position: number[]; lookAt?: number[] }; }

async function withPicture(g: Game, r: Result, file: string): Promise<Result> {
  try {
    const png = readFileSync(file).toString("base64");
    const data = await g.queue(() => g.page.evaluate(async (b64: string) => {
      // a Blob, not a data: URL: Network.enable echoed the whole URL in two events, twice the PNG's size back over CDP per picture
      const i = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: "image/png" }));
      const k = Math.min(1, 1024 / i.width), c = document.createElement("canvas");
      c.width = Math.round(i.width * k); c.height = Math.round(i.height * k);
      c.getContext("2d")!.drawImage(i, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.8).split(",")[1]!;
    }, png));
    return { ...r, content: [...r.content, { type: "image", data, mimeType: "image/jpeg" }] };
  } catch { return r; } // the path is still in the text
}

const LEAN = process.env.PAPRIKA3D_LOOP === "lean";
// the game contract runs only in the bench's contract arm until a benchmark shows it helps (docs/decisions-2026-10-16.md)
const CONTRACT = process.env.PAPRIKA3D_LOOP === "contract";
const CWD = { type: "string", description: "The game project's folder." };
// `interact` `record: "video"` (footage for a person) is in the dev build and the repo, never in stable
const VIDEO = process.env.PAPRIKA3D_CHANNEL !== "stable";
const RECORD = `true: plays the steps in real time (1/60 s a frame, ${RECORD_MAX_S} s at most) into a GIF in the run folder; the reply has four moments and the real frame intervals.`;
// `open` and `perf` share the first-visit timing on an emulated network
const NETWORK = { type: "string", enum: ["slow-4g", "fast-4g", "3g"], description: "Also time a first visit on this network (Chrome DevTools' presets), in real time with no cache: when the first scene frame came, which bytes came before it by kind (as sent: the harness's own server does not compress, a CDN does) and when an overlay over the canvas went." };
const TOOLS = [
  { name: "contract", description: "For a game with exact rules (scoring, collisions, matching, turn order, stated numbers) or when the user asks for a locked spec or tests, call it before writing game code: it turns the user's prompt into a game contract (keypoints the game must pass). It writes a brief for a fresh subagent that has seen no game code and tells you how to start it; that subagent drafts and issues the contract and replies with the keypoints. Never edit game-contract.json by hand.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "The user's prompt, verbatim." }, cwd: CWD }, required: ["prompt", "cwd"] } },
  { name: "open", description: "Opens a three.js, React Three Fiber or WebGL page (a game, viewer, configurator, simulation or shader demo) in headless Chrome (or the `browser` given) on a paused, seeded clock, closing any page already open under the same `game` name, and lists the asset files (models, textures, sounds) it fetched and any fetch that failed, what a dev-server `command` printed as an error or warning, a canvas with no height, and the page's text outside the canvas. Open once: after an edit, the next `interact`, `look`, `observe`, `eval` or `feel` reloads the page by itself. Use it when such a page has been written or changed. Give a file or folder to serve (`url`, relative to cwd), an http URL, or a dev-server `command` run in cwd. Up to 4 games can be open at once, each under its own `game` name: a subagent opens its own (`game: \"tester\"`) and passes that name to every call.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "A file or folder to serve (relative to cwd), an http URL, or, with `command`, the path and query to open on the server it starts (its origin is the one the command prints)." },
      command: { type: "string", description: "A dev-server command run in cwd, as `npx vite --port 0`; the first localhost URL it prints is the page. Closing or reopening this game stops it; an `open` with a url on its origin restarts it on that url." }, cwd: CWD, window: { type: "boolean", description: "Show the browser's window." },
      browser: { type: "string", enum: Object.keys(BROWSERS), description: "The browser engine the page runs in, chrome by default. firefox is Firefox. Every tool works in each; network (here and in `perf`), `perf`'s throttle and its main-thread time are chrome only." },
      size: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "The page's width and height in CSS pixels until the next open, 1280 × 800 by default, as [1920, 1080]." },
      dpr: { type: "number", description: "Device pixel ratio, 1 by default. `look` boxes stay in CSS pixels." },
      reducedMotion: { type: "boolean", description: "The page gets prefers-reduced-motion: reduce; `look` then says how much of the picture changed since the last look." },
      network: NETWORK }, required: ["cwd"] },
    // the one tool Claude Code (2.1.285+) loads at session start; the rest are names only until tool search loads them
    _meta: { "anthropic/alwaysLoad": true } },
  { name: "observe", description: "Reads the open page's state as JSON (window.__game.observe(), or its named three.js objects), renderer counts, new console errors and what changed since the last observe.",
    inputSchema: { type: "object", properties: {} } },
  { name: "eval", description: "Runs JavaScript in the open page and returns what it returns, as JSON, then up to 5 lines it logged (console.log, warn, info) and up to 5 console errors. In scope: scene, camera, renderer, find(name), stats(target) (vertices, triangles, bounds, closed, volume, genus per mesh), realNow(), window, and THREE on a page that loads three through an import map. performance.now, Date and timers run on the harness's paused clock (code that awaits a timer or frame steps it until done), so to time code here use realNow() (real milliseconds), and end GPU work before reading it (a 1-pixel gl.readPixels; on WebGPU, await renderer.backend.device.queue.onSubmittedWorkDone()). Use it to inspect the scene, try a change before writing it into the source, measure an imported model, or check procedural geometry with stats after each step; changes vanish on reload. A thrown error names where it threw: a line of this code or of the page's own files. Code that keeps the page busy for 30 s (longer on a busy host) is stopped and the page kept: split long work across calls, or await a 0 ms timer every few hundred iterations.",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "The body of an async function; return the value to see." },
      save: { type: "string", description: "Write what the code returns (an ArrayBuffer, typed array, Blob, canvas or data URL) to this path under cwd, e.g. assets/baked.glb or data/mask.png, and reply with its size instead of the bytes: baked geometry, a painted canvas, measured tables." } }, required: ["code"] } },
  { name: "interact", description: "Plays `steps` on the open page frame by frame and returns what changed in the state (the whole state when nothing did), the console lines and errors the steps raised, a Motion line when the subject turned or stopped under a held key, and a Sound line on a page that makes sound. Each mouse and touch step names the object under it and its distance. `expect` adds one ✓ or ✗ line per path; `save` keeps the play as a check `test` reruns, only when every entry holds. A malformed step fails the call before anything plays; a failing `expect` entry is reported, not raised. Use `feel` to measure how an event reacts on screen, `observe` to read the state without playing, and `eval` to set it with code. Options in full: the skill's references/tools.md.",
    inputSchema: { type: "object", properties: { steps: { type: "array", items: { type: "object" }, description: "Steps, in order: { key, frames? } (held, then released); { key, down: true|false } (held across steps); { mouse: click|dblclick|down|up|move, x, y }; { mouse: move, relative: [dx, dy] } (pointer lock); { wheel: deltaY, x?, y? }; { resize: [w, h] }; { scroll: px | { progress: 0..1 } | { to: \"#id\" } }; { touch: start|move|end|tap, x, y }; { wait: frames, draw? }; { action, ...args } (window.__game.act); { state: {...} } (window.__game.setState, then one frame); { until: {...}, max? } (until the state holds, values as `expect`'s; `max` 600 frames by default); { clock: { timescale?, paused? } } (paused: false plays in real time; the clock reads 60 s at frame 0 on purpose). Each step advances `frames` (default 1) and draws only its last (draw: true draws each); `frames: 0` sends it on the same frame as the next." }, look: { type: "boolean", description: "Also return `look`'s picture after the steps." },
      record: VIDEO ? { anyOf: [{ type: "boolean" }, { type: "string", enum: ["video"] }], description: `${RECORD} "video": a 60 fps MP4 for a person, on the paused clock, ${VIDEO_MAX_S} s of game time at most, no sound.` } : { type: "boolean", description: RECORD },
      trace: { type: "array", maxItems: 6, items: { type: "string" }, description: "Up to 6 dotted paths into observe(), read each frame (the first 600): first and last value, peak or low, and first change, with frames." },
      expect: { type: "object", description: "Checked against the state after the steps, keyed by dotted paths into observe() (\"coins.0.x\"): a number, string or boolean (equal), [min, max] (a range; two numbers always are), a list of other values (one of them) or null (exists)." },
      save: { type: "string", description: "Save the steps and `expect` as a check of this name in game-tests.json when every Expect entry holds; the call plays from a fresh reload, its leading state steps as setup." },
      hover: { type: "array", items: { type: "string" }, description: "After the steps, the mouse moves to each named object's centre; one diff per name after `frames`." },
      frames: { type: "number", description: "Frames to wait at each hovered object (default 1)." } } } },
  { name: "look", description: "Screenshot of the open page in the reply, an ID image beside it (one colour per object, the path with -ids before .png), and a list of what is on screen and the named objects no look has seen, with size and place. It sends no input; sheet, scroll, viewports and compare reload the page for their pictures. One mode a call: cameras, viewports, scroll, sheet, opening, zoom, at, target, save or compare. It ends with the lines the skill's references/lighting.md explains, the `Lighting:` and `Surfaces:` setup faults among them. A post-processed page is pictured as of its last drawn frame, so state set since shows after a step. Use `observe` for the state as numbers, `reference` to read or match a picture the page should look like, and `interact` with `look: true` for the picture after input. Modes in full: references/tools.md.",
    inputSchema: { type: "object", properties: { camera: { anyOf: [{ type: "string" }, { type: "object", properties: { position: { type: "array", items: { type: "number" } }, lookAt: { type: "array", items: { type: "number" } } }, required: ["position"] }], description: "This look's camera, { position, lookAt }, or a name: a refs/cameras.json picture's file name or a `cameras` label." },
      cameras: { type: "array", maxItems: 9, description: "Up to 9 cameras ({ position, lookAt, label } or a name) in one grid, no reload; a label is kept as a `camera` name.", items: { anyOf: [{ type: "string" }, { type: "object", properties: { position: { type: "array", items: { type: "number" } }, lookAt: { type: "array", items: { type: "number" } }, label: { type: "string" } }, required: ["position"] }] } },
      target: { type: "string", description: "An object in the main scene, alone from front, right, top and three-quarter views." },
      opening: { type: "boolean", description: "Picture the first 5 s after load in real time, as a viewer meets them (`open` pauses at frame 0)." },
      zoom: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4, description: "[left, top, right, bottom] in the live page's pixels (not a sheet's), as the plain look lists boxes, enlarged up to 4×; from `camera` when given." },
      sample: { type: "array", maxItems: 32, items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, description: "Points [x, y] in the live page's pixels (with zoom, inside its box): each one's colour, a 5 × 5 mean." },
      at: { type: "array", maxItems: 8, items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, description: "Up to 8 points [x, y] in the live page's pixels: the objects drawn at each, nearest first, with distance; text only; from `camera` when given." },
      save: { type: "string", description: "Keep this look's picture as the baseline of this name (letters, digits, - or _)." },
      compare: { type: "string", description: "A saved baseline's name: the page at its frame (a reload), the share of pixels that differ and a diff picture." },
      sheet: { type: "array", maxItems: 9, description: "Up to 9 moments in one grid, each a fresh reload set with `state`, then `steps` (as `interact`) and `frames`.", items: { type: "object", properties: { label: { type: "string" }, state: { type: "object" }, steps: { type: "array", items: { type: "object" } }, frames: { type: "number" } } } },
      scroll: { type: "array", maxItems: 9, items: { type: "number", minimum: 0, maximum: 1 }, description: "Scroll stops (shares of the page's scroll range) in one grid, each a fresh reload." },
      viewports: { type: "array", maxItems: 9, items: { anyOf: [{ type: "string", enum: ["phone", "tablet", "laptop", "desktop"] }, { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }] }, description: "Sizes in one grid, each a fresh reload: phone (390 × 844, DPR 3), tablet (820 × 1180, 2), laptop (1440 × 900, 2), desktop (1920 × 1080, 1), or [width, height, dpr]." } } } },
  { name: "feel", description: "Measures game feel, how the page reacts to an event: on a fresh reload, sends the steps, then watches the next frames for camera shake or one camera move out and back (a hit's lurch), scale pops, smooth moves versus teleports, colour flashes, particles (a Points pool's or an InstancedMesh's count), spawned objects, HUD text ticks and sounds, each with the watched frame it came on. Leading { state } steps set the scene up (the player next to the coin), and nothing is measured until they and one frame have run; what moved during the other steps is listed as a fact on its own line, and teleports are jumps between two watched frames, so a setup or a walk in the steps is never one. It shows whether each event a feel brief names (hits, clears, explosions, pickups, deaths, wins) reacts on screen, and whether anything teleports. It measures and saves nothing: to keep the play as a check, send the same steps to `interact` with `expect` and `save`.",
    inputSchema: { type: "object", properties: { steps: { type: "array", items: { type: "object" }, description: "Steps as for `interact`: a { state } setup, then the inputs that cause the event." }, frames: { type: "number", description: "Frames to watch after the steps (default 45)." } }, required: ["steps"] } },
  { name: "check", description: "Runs the game contract against the open game, each keypoint on a fresh page. When the project has a game contract, it shows which keypoints a change broke or fixed.",
    inputSchema: { type: "object", properties: {} } },
  { name: "perf", description: "Measures the open page's frame time (fps), draw calls, triangles and asset size against a budget (desktop by default): it is for a frame a reply reports over budget, or a user who asks about performance (stutter, low fps). To find what costs the frame, give `variants`: each is measured on a fresh page against the baseline, in this one call, with named objects hidden, a pixel ratio, code run with `renderer` and `scene` (shadows or antialias off, a material swapped), or a `query` the page loads with (\"noshadow&pr=0.5\", for switches the game reads at load); no reopening or reload code needed. Sampling waits until no element covers the canvas (a loading screen), up to 5 s of the page running, and the load line says what it waited for or sampled under. With `optimize: true` it instead tries the @paprika3d/three-runtime switches one at a time: `resolution` (lowers the pixel ratio while frames run over budget), `defaults` (pixel ratio capped at 2, shaders compiled up front, shadow maps redrawn only when a caster moves), `instancing` (still meshes that share a geometry and material drawn as one), `lod` (simpler versions of meshes over 10,000 triangles at a distance) and `dispose` (frees the GPU memory of removed objects). `instancing` and `lod` stay only when frames get faster, the others unless they slow frames. A switch is reverted if a saved test that passed without it fails with it, and `defaults`, `instancing` and `dispose` also if they change the picture; a kept `resolution` or `lod` that changes it comes with before and after pictures. What it keeps goes in the project's game-runtime.json, which the runtime reads at every load, so it lasts until that file changes; it ends with the final `test` of game-tests.json when the project has one. On a game without the runtime it changes nothing and says how to import it.",
    inputSchema: { type: "object", properties: { budget: { type: ["string", "object"], description: "desktop, mobile, quest, site (a 3D website: first scene frame within 3 s on fast-4g unless `network` says otherwise, 1 MB of script, 4 MB of assets), or limits to override: { frameMs, assetMB, triangles, drawCalls, textureMax, pixelRatioMax, firstSceneFrameMs, scriptMB }." },
      variants: { type: "array", maxItems: 8, items: { type: "object", properties: { label: { type: "string" }, hide: { type: "array", items: { type: "string" }, description: "Object names to hide: any object's name, nested or not; a group's hides its children." }, pixelRatio: { type: "number" }, code: { type: "string" }, query: { type: "string" } } } },
      costs: { type: "boolean", description: "Also list the main scene's visible content by named group (an object goes by its nearest named ancestor, as `look` names it): triangles, those casting shadows, draw calls and texture MB, the 12 groups with the most triangles and the rest in one line. Counted, not timed, with no frustum culling; `variants` with `hide` times a group." },
      throttle: { type: "number", minimum: 1, maximum: 20, description: "Slow the page's JavaScript this many times, as on a weak laptop (4 is a typical one); GPU work is not slowed." },
      network: { ...NETWORK, description: NETWORK.description + " CPU `throttle` is separate." },
      optimize: { type: "boolean", description: "Try the runtime switches and keep those that help (above). Of the other fields it takes only `budget`." } } } },
  { name: "model_audit", description: "Inspects 3D model files (.glb, .gltf, and USD: .usd, .usda, .usdc, .usdz): megabytes, triangles, materials, each texture's size and format, and whether it uses Draco, meshopt and KTX2, for one file or every one under a folder (`path`, relative to cwd; the whole project when left out), read from the file itself with no decoder, so Draco and meshopt files report too. Then a one-line verdict on what a website or a Shopify listing judges a model on, against `target`: `site` (the site budget: 4 MB of assets, 200,000 triangles, 2048 px textures by area) or `shopify` (a GLB of about 4 MB with textures at most 2048 px on a side). `shrink` rewrites one .glb or .gltf smaller, without its textures or with each capped at a size (WebP), and replies with before and after (a USD file is converted to GLB first); a failing file gets the shrink call that fixes it: save a look first (`look` `save`), shrink, point the page at the new file, then `look` `compare`.",
    inputSchema: { type: "object", properties: { cwd: CWD, path: { type: "string", description: "A .glb, .gltf or USD file, or a folder to report every one under, relative to cwd." },
      target: { type: "string", enum: ["site", "shopify"], description: "What to judge the files against (site by default)." },
      shrink: { type: "object", properties: { textures: { anyOf: [{ const: false }, { type: "number" }] }, out: { type: "string" } }, description: "Rewrite the file smaller: textures false drops them all (geometry only), a number caps each texture's longer side at that many pixels (WebP); out is the new file (<name>-opt.glb by default). Replies with before and after." } }, required: ["cwd"] } },
  { name: "model_run", description: "Runs JavaScript against the modelling scene: a three.js scene this server keeps between calls, apart from any page, for building a model in code as in Blender, then saving it as a .glb the page loads. The code is an async function body with THREE, scene, geo (Manifold, started: geo.Manifold, geo.CrossSection, geo.toGeometry(manifold), geo.toManifold(geometry), geo.boolean(op, a, ...b)), scatter, find(name), stats(target) (vertices, triangles, bounds, closed, volume, genus per mesh), load(path) (a .glb from the project, an asset_search pick included, added to the scene and returned), save(path, object = scene) (a GLB under cwd; replies with its size and the line that loads it) and clear() in scope, and returns what it returns, as JSON, with up to 5 lines it logged. What it adds to scene stays for the next call and is saved to paprika3d/model/scene.glb after each run that changed it, so a restart loads it back; variables (a Manifold) do not last between calls. Manifold works in metres with Z up and angles in degrees; three is Y up. Name every object you make: model_look lists them by name.",
    inputSchema: { type: "object", properties: { cwd: CWD, code: { type: "string", description: "An async function body, e.g. `const { Manifold, toGeometry } = geo; const m = Manifold.cube([1, 1, 1], true).subtract(Manifold.sphere(0.65, 48)); const mesh = new THREE.Mesh(toGeometry(m), new THREE.MeshStandardMaterial({ color: 0xb08050 })); mesh.name = \"block\"; scene.add(mesh); return stats(mesh)`." } }, required: ["cwd", "code"] } },
  { name: "model_look", description: "Shows the modelling scene that `model_run` builds: one picture of it (or of `object`) from the front, right and top (orthographic, so sizes read true against the grid) and a three-quarter view, under a neutral studio light with a ground grid whose step it states, and one line per object: name, type, place, turn and scale, material (colour, roughness, metalness) and, for a mesh, triangles, size, whether it is closed, its volume and genus. With `object`, that object in full; with `cameras`, those views instead of the four.",
    inputSchema: { type: "object", properties: { cwd: CWD, object: { type: "string", description: "The name of an object in the modelling scene: frame the picture to it and list it in full." },
      cameras: { type: "array", maxItems: 9, description: "Up to 9 views in place of the four, each { label, position, lookAt } in the scene's metres (lookAt defaults to the middle of what is framed).", items: { type: "object", properties: { position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, lookAt: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, label: { type: "string" } }, required: ["position", "label"] } },
      size: { type: "number", minimum: 256, maximum: 1568, description: "The picture's side in pixels (1024 by default, at most 1568)." } }, required: ["cwd"] } },
  { name: "invariants", description: "Runs built-in checks any game must pass, no contract needed: the window.__game convention, plain-JSON observe(), setState round-trip, inputs change the state, no console errors, and the same inputs give the same state twice. Call it once the game opens and after any change to the game's state handling.",
    inputSchema: { type: "object", properties: {} } },
  { name: "test", description: "Reruns every check saved with `interact` `save` (game-tests.json), each from a fresh reload at frame 0, one line each: `✓ pickup` or `✗ jump: player.y 1.4, expected ≥ 2`. Use it after an edit that could break earlier features.",
    inputSchema: { type: "object", properties: {} } },
  { name: "reference", description: "Reads a reference picture the page should match (a photo, artwork, mockup or screenshot in the project, e.g. refs/01.jpg) at full resolution, in one call and with no page open: `crop` [left, top, right, bottom] in the picture's pixels, enlarged up to 4× to fit 1280 px, with `grid` lines every N px labelled in the picture's own pixel coordinates (positions read off it go straight into the next call or the scene), and `sample` points, each answered as #rrggbb. With the page open, `compare: true` puts the picture, the page's look (from `camera` when given) and a difference picture side by side and says what share of pixels differ, overall and in a grid of regions (`cells` per side, 4 by default), with each `sample` point's colour on both, or that the canvas aspect is not the picture's. Use it to read a picture the page should match and to check the page against it.",
    inputSchema: { type: "object", properties: { cwd: CWD, file: { type: "string", description: "The picture's path, relative to cwd, or the name of a baseline saved with look { save } (compare the page with its earlier look)." },
      crop: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4, description: "[left, top, right, bottom] in the picture's pixels ([x, y, width, height] is read as such when right < left or bottom < top), trimmed to the picture; the whole picture when left out. With compare: that region of the picture and the same region of the page, enlarged side by side with their differences." },
      grid: { type: "number", description: "Gridline spacing in the picture's pixels (100 on a whole picture, 10 to 50 on a crop); none when left out." },
      sample: { type: "array", maxItems: 32, items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, description: "Points [x, y] in the picture's pixels whose colour to return (the mean of 5 × 5 pixels); with compare, the page's colour at the same point too." },
      cells: { type: "number", minimum: 2, maximum: 16, description: "Regions per side for compare's differing-share grid (4 by default)." },
      compare: { type: "boolean", description: "Put the open page's look beside the picture with their differences; needs `open` first, and a canvas with the picture's aspect for the pixel comparison." },
      camera: { anyOf: [{ type: "string" }, { type: "object", properties: { position: { type: "array", items: { type: "number" } }, lookAt: { type: "array", items: { type: "number" } } }, required: ["position"] }], description: "For compare: the page's look from this position (looking at lookAt) or from a camera by name, as `look`'s camera; left out, the picture's entry in refs/cameras.json when there is one, else the page's own camera." } },
      required: ["cwd", "file"] } },
  { name: "asset_search", description: "Searches the hosted paprika3d asset library over the network (assets.keeno.dev) for a ready-made model (57k, CC BY or CC0, as GLB and some as USD), PBR texture or HDRI sky, and puts the one you pick in the project with its loading code. A search answers one numbered line per hit (id, name, size, licence, preview image) and a contact sheet: the hits' thumbnails in one row, numbered as the lines are. `pick` an id from it (or its start, when no other hit shown in this project starts so) to download the file into assets/ (public/assets/ with vite) and get the code that loads it, a model at real size (or `height` units tall) and credited in CREDITS.md. `not` lists ids that missed, which the library learns from, and searches again without them; `more` searches the same query again for the next hits. `image` (a picture in the project, with `crop` to cut one thing out of it) ranks models by how alike they look, for the thing a reference picture shows that words miss. The library logs model searches, picks and rejections with the agent's name.",
    inputSchema: { type: "object", properties: { cwd: CWD, query: { type: "string", description: "What you need, e.g. \"wooden barrel\", \"mossy cobblestone\", \"sunset sky\"." },
      kind: { type: "string", enum: ["model", "texture", "hdri"], description: "model by default." },
      style: { type: "string", enum: ["stylized", "realistic", "low-poly", "sci-fi", "scanned", "toon", "voxel"], description: "Models only." },
      type: { type: "string", enum: ["character-humanoid", "creature-animal", "container", "decoration", "prop", "vehicle", "sci-fi-tech", "food", "weapon", "interior-furniture", "building", "architecture-part", "clothing-accessory", "foliage-plant", "tree", "rock-terrain", "environment-scene", "tool", "electronics", "sign-ui"], description: "Models only." },
      maxTris: { type: "integer" }, animated: { type: "boolean" }, rigged: { type: "boolean" },
      not: { type: "array", items: { type: "string" }, description: "Ids from the last search to reject." },
      more: { type: "boolean", description: "With the same query: the next hits, past every one it has shown, none of them rejected." },
      image: { type: "string", description: "Models only: a picture under cwd (refs/01.jpg) or a look baseline's name, to rank models by how alike they look to it (with query, by both); the reply shows the image searched with." },
      crop: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4, description: "With image: [left, top, right, bottom] in the picture's pixels, as `reference` reads them: the one thing to find, cut out of the scene." },
      sheet: { type: "boolean", description: "false leaves out the contact sheet, the picture of the shown hits' thumbnails in one row, numbered as the lines are (on by default)." },
      pick: { type: "string", description: "An id to download, or the start of one that no other hit shown in this project (in any session) starts with." }, height: { type: "number", description: "With pick: scale a model to this many units tall." },
      textures: { type: "boolean", description: "With pick: false saves a model's geometry only, every texture dropped (for a model you colour or texture yourself)." },
      format: { type: "string", enum: ["glb", "usd"], description: "Models only. In a search, only models with a file of this format; with pick, the file to download: a model with both is saved as its GLB unless this is usd, and one with only a USD file (.usdz) as that, loaded with three's USDLoader (r183 or later)." },
      model: { type: "string", description: "Optional: your own model name, e.g. \"claude-opus-5-5\", sent with model searches and picks only, so the library can learn which agents its picks suit; nothing else about the session." } }, required: ["cwd"] } },
  // in both builds (docs/plan-publish-2026-10-25.md, Jessica 2026-10-25)
  { name: "publish", description: "Publishes the project at https://<slug>.paprika3d.app (public; preview, invite-only), only when the person asks; never for another host. Never read or print ~/.config/paprika3d/credentials.json: this tool reads the key.",
    inputSchema: { type: "object", properties: { cwd: CWD, slug: { type: "string", description: "Subdomain (default: project name)." }, model: { type: "string", description: "Your model id." }, rotate: { type: "boolean", description: "Only replace this install's key." } }, required: ["cwd"] } },
];
// every page tool takes the name of the game it works on (named games, at use() below)
const GAME = { type: "string", description: "The name the game was opened under with the `open` tool, to act on (\"main\" by default; a subagent uses its own)." };
for (const t of TOOLS) if (!["contract", "asset_search", "model_audit", "model_run", "model_look", "publish"].includes(t.name)) (t.inputSchema.properties as Record<string, unknown>).game = GAME;
// the contract loop adds the contract and its check, the lean loop the spec-free invariants
const HIDDEN = [...CONTRACT ? [] : ["contract", "check"], ...LEAN ? [] : ["invariants"]];
const LOOP_NOTES: Record<string, string> = CONTRACT ? { open: " When cwd holds a game contract, the result ends with its first check.", perf: " With optimize, it ends with the final `check` of the whole contract." } : {};
const LISTED = TOOLS.filter(t => !HIDDEN.includes(t.name)).map(t => LOOP_NOTES[t.name] ? { ...t, description: t.description + LOOP_NOTES[t.name] } : t) as object[];
// `send_feedback` (src/telemetry.ts), in both builds (docs/decisions-2026-10-25.md)
if (FEEDBACK) LISTED.push(REPORT_TOOL);

const described = new Map<string, string>(); // the last open's describe() per project and URL
let client = "unknown"; // the MCP client's name/version from initialize, sent to the asset library
let game: Game | null = null, cwd = "", control: Server | null = null, shots = 0, chrome: Promise<Browser> | undefined;
/** `open`'s arguments for the open game, to open it again when its Chrome is gone. */
let opened: Record<string, any> = {};
let loadedPrint = ""; // the source fingerprint the open page was loaded from
/** Named games: every page tool takes `game`, a name ("main" when left out), and `open` under a new name opens a page of
    its own beside the others, so a subagent can play and look while the lead's page stays as it was (AA-3D: leads forbade
    their subagents the tools, a "single shared instance", and the subagents rebuilt them in Playwright, 151 Bash calls in
    one cell). Calls run one at a time, so call() swaps the named game's state into game, cwd, opened and loadedPrint. */
type Slot = { game: Game | null; cwd: string; opened: Record<string, any>; loadedPrint: string; used: number };
const slots = new Map<string, Slot>();
let current = "main";
const MAX_GAMES = 4;
function use(name: string) {
  if (name === current) return;
  slots.set(current, { game, cwd, opened, loadedPrint, used: Date.now() });
  ({ game, cwd, opened, loadedPrint } = slots.get(name) ?? { game: null, cwd: "", opened: {}, loadedPrint: "" });
  slots.delete(name);
  current = name;
}
/** The slot a call for game `name` works on, read without swapping it in. */
const slotOf = (name: string): Pick<Slot, "game" | "cwd" | "opened"> => current === name ? { game, cwd, opened } : slots.get(name) ?? { game: null, cwd: "", opened: {} };
/** The main game, which the hooks' checks run on. */
const mainGame = () => slotOf("main");
const token = randomBytes(24).toString("hex");

/** A screenshot of the page as it is, for a run that made no picture of its own (every recorded run needs one). */
async function shot(g: Game, kind: string) {
  const path = join(g.runDir, `${kind}-${++shots}.png`);
  await g.page.screenshot({ path });
  return path;
}

const RUNTIME = resolve(import.meta.dirname, "../runtime/dist/index.js");
/** Puts the built @paprika3d/three-runtime in the project as three-runtime.js, only once `perf` with optimize needs it, so the agent imports it without copying it out of
    the plugin (Claude Code refuses that copy as a sensitive file, and the agent then reads a 110 KB bundle into its context). */
function ensureRuntime(dir: string) {
  const to = join(dir, "three-runtime.js");
  if (existsSync(RUNTIME) && (!existsSync(to) || !readFileSync(to).equals(readFileSync(RUNTIME)))) { mkdirSync(dir, { recursive: true }); copyFileSync(RUNTIME, to); }
  // the runtime always fetches ./game-runtime.json; without it every page load logs a 404 in the console
  if (!existsSync(join(dir, "game-runtime.json"))) writeFileSync(join(dir, "game-runtime.json"), "{}\n");
  return `The runtime layer is at ${to}: import { install } from "./three-runtime.js" (or "../three-runtime.js" from src/) and call install() before making the renderer. Never read or edit that file; the harness keeps it current.`;
}

const BUNDLES = ["geo/dist/geo.js", "fx/dist/fx.js"].map(f => resolve(import.meta.dirname, "..", f));
/** Puts the built @paprika3d/game-geo and @paprika3d/game-fx in the project as geo.js and fx.js on every `open`, so games import them from the project. */
function ensureBundles(dir: string) {
  for (const from of BUNDLES) {
    const to = join(dir, basename(from));
    if (existsSync(from) && (!existsSync(to) || !readFileSync(to).equals(readFileSync(from)))) { mkdirSync(dir, { recursive: true }); copyFileSync(from, to); }
  }
}

/** One line on what the project holds, so the agent need not ls it or read package.json before writing. */
function projectSummary(dir: string): string {
  const files = readdirSync(dir).filter(f => !["node_modules", "paprika3d", ".git", "bun.lock", "package-lock.json"].includes(f));
  const installed = ["three", "vite", "@react-three/fiber", "@dimforge/rapier3d-compat"].filter(p => existsSync(join(dir, "node_modules", p)));
  return `Project folder holds: ${files.join(", ") || "nothing yet"}. Installed: ${installed.join(", ") || "nothing (no node_modules)"}.`;
}

const contractOrNull = (dir: string, ci = false) => { if (!CONTRACT) return null; try { return loadContract(dir, { ci }); } catch { return null; } };
const TESTS = { ci: true, file: "game-tests.json" };
const testsOrNull = (dir: string) => { try { return loadContract(dir, TESTS); } catch { return null; } };

/** Runs the project's contract on the game, records the run in state.json and Paprika, and returns the runner text and
    whether the failing keypoints differ from the check recorded before this one. */
// The last full result per open game, by everything a check's result depends on: the sources and the binary assets'
// sizes and times (fingerprint with assets), the contract as loaded (the file is not read twice), the page's config (seed and runtime switches) and ci.
// The harness is deterministic, so a second check of the same key gives the same result; the agent's `check` right
// after the hook's own check of an edit (the skill asks for both) answers from here instead of running every keypoint.
const lastFull = new WeakMap<Game, { key: string; at: string; r: CheckResult & { changed: boolean } }>();
// games the after-edit hook's check reloaded: the agent's next call says so, or a zoom after it saw frame 1 with no word why (feel-9)
const hookReset = new WeakSet<Game>();
// the Lighting and Surfaces lines the hook's next fault recheck compares with: the agent's last look from the game's own
// camera (noteTest), or the last recheck
const hookFaults = new WeakMap<Game, { frame?: number; lines: string[] }>();
// the sources each game's page ran at its last look (noteTest): a look on other sources follows an edit, which can close a fault line
const lookPrint = new WeakMap<Game, string>();
const edited = (g: Game) => lookPrint.has(g) && lookPrint.get(g) !== loadedPrint;
type Faults = CheckReply["faults"];

/** A check's last reload, so the agent's next call starts at frame 0. Notes that the page runs the sources of `print`
    unless they changed meanwhile (`stale`), so that call does not reload a second time; with `faults`, the Lighting and
    Surfaces lines on the fresh page against the agent's last look from the game's own camera or the last recheck, when
    that was at the same frame (a look after play is never compared with frame 0), and none from a page the reload broke. */
async function reloadAfter(g: Game, dir: string, print: string, opts: { hook?: boolean; faults?: boolean }): Promise<{ stale: boolean; faults?: Faults }> {
  const first = (e: string) => e.split("\n")[0], had = new Set(g.errors.map(first));
  const ok = await g.reload().then(() => true, () => false);
  if (opts.hook) hookReset.add(g);
  // a page that drew nothing has no lines: no fault change at all, never every line closed
  const now = opts.faults && ok ? await faultsNow(g).catch(() => null) : null;
  const stale = fingerprint(dir) !== print;
  if (ok && !stale) { if (game === g) loadedPrint = print; for (const s of slots.values()) if (s.game === g) s.loadedPrint = print; }
  // nor a page the edit broke, which keeps the baseline: a typo that throws after the floor is built leaves the rug's line
  // missing. An error the page gives on every load (the same first line each time) is not the edit's.
  if (!now || g.errors.some(e => !had.has(first(e)))) return { stale };
  const base = hookFaults.get(g), d = base && base.frame === now.frame ? faultDiff(base.lines, now.lines, now.partial) : null;
  hookFaults.set(g, { frame: now.frame, lines: d?.kept ?? now.lines });
  return { stale, faults: { closed: d?.closed ?? [], opened: d?.opened ?? [], open: now.lines } };
}

export function runCheck(g: Game, dir: string, opts: { edit?: Edit; ci?: boolean; result?: CheckResult | null; reload?: boolean; tests?: boolean; hook?: boolean; faults?: boolean } = {}): Promise<CheckResult & { changed: boolean; faults?: Faults }> {
  return g.queue(async () => {
    // the saved checks (game-tests.json) when asked for, or when the project has them and no contract (the CLI's check after an edit)
    const tests = opts.tests ?? (!existsSync(join(dir, "game-contract.json")) && existsSync(join(dir, TESTS.file)));
    // no saved checks to rerun (a fresh install's project; a contract, which the plugin never runs, is skipped too): the
    // hook's check is its fault recheck alone, with no keypoint and no Paprika row, recorded as a check of nothing so the
    // hook skips the sources it saw
    if (opts.faults && !tests) {
      const start = Date.now(), print = fingerprint(dir);
      // a page that already runs these sources (the agent's own call reached the server first and reloaded) is not
      // reloaded: that would reset what the agent did since (it may have played to frame 300), and its own look compares
      const ran = (game === g ? loadedPrint : [...slots.values()].find(s => s.game === g)?.loadedPrint) === print;
      const after = ran ? null : await reloadAfter(g, dir, print, opts);
      noteRun(dir, print, { ts: new Date().toISOString(), kind: "check", passed: 0, failed: 0, durationMs: Date.now() - start, failing: after?.stale ? undefined : [] });
      return { passed: 0, failed: 0, outcomes: [], durationMs: Date.now() - start, fingerprint: print, text: "", changed: false, faults: after?.faults };
    }
    const contract = loadContract(dir, tests ? TESTS : { ci: opts.ci }); // first: a hand-edited contract is refused even when nothing else changed
    const print = fingerprints(dir, { assets: true });
    const key = [print.sources, print.assets, JSON.stringify(contract), JSON.stringify(g.config), !!opts.ci, tests].join("|");
    const memo = lastFull.get(g);
    if (memo?.key === key) return { ...memo.r, changed: false, text: `${memo.r.text}\n(these sources were already checked at ${memo.at}, by the after-edit hook or an earlier call, so this is that result)` };
    // `result`: a check `perf` with optimize already ran on these sources with the switches it kept, recorded instead of run again
    const r = opts.result ?? await check(g, contract, { cwd: dir, print: print.sources, tests });
    // a passing check has no picture of its own: its run.json goes in the run folder, and no check-N.png piles up after every edit
    const picture = r.outcomes.find(o => o.picture)?.picture ?? g.runDir;
    // the last keypoint left the page in its arranged state (a dead snake); the agent's next observe, act or look starts
    // from frame 0, as `open` says (`reload: false`: the CLI check, whose process exits next)
    const after = !opts.result && opts.reload !== false ? await reloadAfter(g, dir, r.fingerprint, opts) : null;
    // a result for sources that changed while it ran is not the last check: the edit that changed them gets its own
    const stale = after?.stale ?? fingerprint(dir) !== r.fingerprint;
    const state = noteRun(dir, r.fingerprint, { ts: new Date().toISOString(), kind: "check", passed: r.passed, failed: r.failed, durationMs: r.durationMs,
      failing: stale ? undefined : r.outcomes.filter(o => o.outcome !== "passed").map(o => o.id) });
    recordRun({ cwd: dir, kind: "check", picture, contractHash: state.contractHash, passed: r.passed, failed: r.failed, outcomes: r.outcomes,
      durationMs: r.durationMs, iteration: state.iterations, elapsedMs: state.issued ? Date.now() - Date.parse(state.issued) : 0, fingerprint: r.fingerprint, edit: opts.edit });
    const out = { ...r, text: `${r.text}${stale ? "\nstale: the sources changed while this check ran; run it again" : ""}`, changed: !stale && state.lastCheck!.changed };
    if (!stale) lastFull.set(g, { key, at: `${new Date().toTimeString().slice(0, 8)} local time`, r: out });
    return after?.faults ? { ...out, faults: after.faults } : out; // kept out of lastFull: a repeat of these sources closes nothing
  });
}

/** Records a look or perf run, which has no keypoints. */
function recordPlain(kind: string, picture: string, durationMs: number, extra: Partial<Run> = {}) {
  const print = fingerprint(cwd);
  const state = noteRun(cwd, print, { ts: new Date().toISOString(), kind, passed: 0, failed: 0, durationMs });
  recordRun({ cwd, kind, picture, contractHash: state.contractHash, passed: 0, failed: 0, outcomes: [], durationMs, iteration: state.iterations,
    elapsedMs: state.issued ? Date.now() - Date.parse(state.issued) : 0, fingerprint: print, ...extra });
}

/** A hook check queued behind other work and not started yet. */
let waiting: { game: Game; ci?: boolean; tests?: boolean; faults?: boolean; edit?: Edit; latest: number; result: ReturnType<typeof runCheck> } | null = null;

/** Answers the hook's CLI: `POST /check` with `{ token, edit?, ci?, tests?, faults? }` runs a check (of the saved checks with
    `tests`, then a recheck of the fault lines with `faults`) on the open game's queue. Resolves once listening. */
async function startControl(): Promise<Server> {
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: string | object) =>
      typeof body === "string" ? res.writeHead(status).end(body) : res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (req.headers.origin) return reply(403, "forbidden"); // a browser page, never the CLI
    if (req.method !== "POST" || new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/check") return reply(404, "not found");
    const body = await json(req).catch(() => null) as { token?: string; edit?: Edit; ci?: boolean; tests?: boolean; faults?: boolean } | null;
    if (body?.token !== token) return reply(403, "forbidden");
    const { game, cwd } = mainGame();
    if (!game) return reply(409, "no game open");
    log(`check from the control socket${body.edit ? ` after ${body.edit.file || "a shell command"}` : ""}`);
    // A check still waiting in the queue runs on the sources as they are when it starts, so a later request joins it
    // instead of queueing another; only the latest request reports a change, so one change wakes the agent once.
    const p = waiting && waiting.game === game && !!waiting.ci === !!body.ci && waiting.tests === body.tests && !!waiting.faults === !!body.faults ? waiting : null;
    const mine = p ?? (waiting = { game, ci: body.ci, tests: body.tests, faults: body.faults, edit: body.edit, latest: 0, result: null! });
    const me = ++mine.latest;
    if (body.edit) mine.edit = body.edit;
    if (!p) {
      const g = game;
      mine.result = guarded(g.queue(() => {
        if (waiting === mine) waiting = null;
        // queued behind a call whose page hung: every keypoint would fail on the closed page and read as a change
        if (g.page.isClosed() || !g.page.browser().connected) throw new Error("the game's page was closed after a call hung; the agent's next call opens it again");
        return runCheck(g, cwd, { edit: mine.edit, ci: mine.ci, tests: mine.tests, faults: mine.faults, hook: true });
      }), "check", () => g);
    }
    try {
      const r = await mine.result;
      reply(200, { passed: r.passed, failed: r.failed, changed: r.changed && me === mine.latest, text: r.text, faults: me === mine.latest ? r.faults : undefined });
    } catch (e) { reply(500, { error: (e as Error).message }); }
  });
  await new Promise<void>(ok => server.listen(0, "127.0.0.1", ok));
  return server;
}

/** Closes the open game and takes the server out of its project's state.json. */
async function closeGame() {
  if (!game) return;
  const g = game, dir = cwd;
  game = null;
  if (current === "main") updateState(dir, s => { s.server = null; });
  // after any check the control socket already queued, never under it; with Chrome gone, a stuck queue may never drain
  await (g.page.browser().connected && !g.page.isClosed() ? g.queue(() => g.close()) : g.close());
}

/** `open`'s and `perf`'s `network`, checked. */
const netArg = (n: unknown) => {
  if (n !== undefined && !Object.hasOwn(NETWORKS, String(n))) throw new Error(`network: one of ${Object.keys(NETWORKS).join(", ")}`);
  return n as Network | undefined;
};
const slowed = (t?: number) => t && t > 1 ? `\nMeasured with the page's JavaScript slowed ${t}× (a weak laptop); the GPU was not slowed.` : "";
// other Chromes and builds on the host slow every number (AA-3D: load 23 on 4 cores, "too noisy" to compare two samples)
const hostLoad = () => { const l = loadavg()[0]!, n = cpus().length; return `Host load ${l.toFixed(1)} on ${n} cores${l > n * 0.75 ? ": a busy host, so these numbers are noisy; measure again when it is quieter" : ""}.`; };
const need = () => {
  if (game) return game;
  const open = [...slots].filter(([, v]) => v.game).map(([k]) => k); // the current slot's game is null here, so slots holds every open game
  if (open.length) throw new Error(`no game "${current}" is open; open games: ${open.join(", ")}. Pass game: "${open[0]}" or call \`open\` with game "${current}".`);
  throw new Error(current === "main" ? "no game is open; call `open` first" : `no game "${current}" is open; call \`open\` with game "${current}" first`);
};
let evicted = "";
/** A `save` name, checked before any input. */
const saveName = (s: unknown) => { if (s !== undefined && (typeof s !== "string" || !/^[\w-]{1,64}$/.test(s))) throw new Error('save: a name of letters, digits, - or _, as "pickup"'); };
/** "Saved" or "Replaced": whether game-tests.json in `dir` already holds a check of this name, which a save writes over. */
const savedVerb = (dir: string, name: string) => { try { return (JSON.parse(readFileSync(join(dir, "game-tests.json"), "utf8")).keypoints ?? []).some((k: any) => k?.id === name) ? "Replaced" : "Saved"; } catch { return "Saved"; } };

const TOOL_FNS: Record<string, (a: Record<string, any>) => Promise<Result>> = {
  async contract(a) {
    const dir = resolve(a.cwd);
    // the brief and the draft go through files, never through the agent's context: a 15 KB contract read twice early
    // in a session is re-read on every later turn
    const brief = join(dir, "paprika3d", "contract-brief.md"), draft = join(dir, "paprika3d", "contract-draft.json");
    const src = existsSync(draft) ? readFileSync(draft, "utf8") : null;
    let raw = null;
    try { raw = src === null ? null : JSON.parse(src); }
    catch (e) { // unparsed, a draft for this prompt still holds it as a JSON string; any other starts over below
      if (src!.includes(JSON.stringify(String(a.prompt).trim()))) throw new Error(`${draft} is not JSON (${(e as Error).message}); fix it and call \`contract\` again with the same prompt.`);
      rmSync(draft);
    }
    // a draft left by an earlier subagent carries the prompt it was written for; a different prompt starts over
    if (typeof raw?.prompt === "string" && raw.prompt.trim() !== String(a.prompt).trim()) { rmSync(draft); raw = null; }
    if (!raw) {
      harnessDir(dir);
      writeFileSync(brief, `${contractInstructions(a.prompt)}\n\nWrite the JSON to ${draft} (nothing else). Then call the \`contract\` tool with cwd ${JSON.stringify(dir)} and, as prompt, the PROMPT text above, and reply with exactly the text it returns, nothing else.\n`);
      return text(`Brief written to ${brief}. Start a fresh subagent with the Agent tool, in the foreground (not in the background), model sonnet, with exactly this prompt and nothing else:\n` +
        `"Read ${brief} and do what it says."\nIt issues the contract and replies with the keypoints and the observe() schema; then write the game. Never read the brief, the draft or game-contract.json yourself.`);
    }
    let c: ReturnType<typeof saveContract>;
    try { c = saveContract(dir, { ...raw, prompt: raw.prompt ?? a.prompt }); }
    catch (e) { // an invalid draft stays for an edit only when it names its prompt, so a new prompt still starts over
      const keep = typeof raw.prompt === "string";
      if (!keep) rmSync(draft, { force: true });
      throw new Error(`${(e as Error).message}\n${keep ? `Fix ${draft}` : `Write ${draft} again, with the prompt in "prompt",`} and call \`contract\` again with the same prompt.`);
    }
    rmSync(draft, { force: true }); // a new prompt must get a new draft
    // the state's hash only tells contracts apart; the one that refuses hand edits stays in issued.json
    const hash = createHash("sha256").update(readFileSync(join(dir, "game-contract.json"))).digest("hex");
    const state = issueContract(dir, hash, c.issued);
    const runDir = join(dir, "paprika3d", "runs", c.issued.replace(/[:.]/g, "-"));
    mkdirSync(runDir, { recursive: true });
    const copy = join(runDir, "game-contract.json");
    writeFileSync(copy, JSON.stringify(c, null, 2) + "\n");
    recordRun({ cwd: dir, kind: "contract", picture: copy, contractHash: hash, passed: 0, failed: 0, outcomes: c.keypoints.map(k => k.title),
      durationMs: 0, iteration: state.iterations, elapsedMs: 0, fingerprint: fingerprint(dir) });
    return text(`Saved game-contract.json with ${c.keypoints.length} keypoints:\n${c.keypoints.map(k => `- ${k.title}`).join("\n")}\n` +
      `The game must expose window.__game = { describe, observe, act, setState }; observe() returns exactly these keys:\n${JSON.stringify(c.schema)}\n` +
      `Open it with \`open\`, then call \`check\` after each change: a failure says which state or value was off.\n${projectSummary(dir)}`);
  },

  async open(a) {
    // agents reopen to pick up an edit (15 times in one AA-3D cell, each with a 40-130 s check under emulation): the
    // contract runs on the first open of a project only; after that the hook checks edits and `check` runs it all
    const again = !!game && resolve(a.cwd) === cwd;
    // a url on the origin of this game's dev server (`open { url: "http://localhost:5199/?at=course" }` after a command open):
    // closing the game stops that server, so the same command opens the url on a restarted one instead (dev #127)
    if (again && !a.command && opened.command && typeof a.url === "string" && /^https?:\/\//.test(a.url) && new URL(a.url).origin === new URL(game!.url).origin) a = { ...a, command: opened.command };
    const repeat = again && JSON.stringify(a) === JSON.stringify(opened); // same arguments as this game's last open (opened is kept per slot)
    // every AA-3D agent checked its scene at other window sizes (a phone, 1920 × 1080), the plugin's in a Playwright
    // script of their own since the page was always 1280 × 800
    const size = a.size as number[] | undefined;
    if (size && !(size.length === 2 && size.every(n => Number.isInteger(n) && n >= 200 && n <= 4096))) throw new Error("size: width and height from 200 to 4096, whole CSS pixels, as [width, height]");
    const dpr = a.dpr as number | undefined;
    if (dpr !== undefined && !(typeof dpr === "number" && dpr >= 1 && dpr <= 4)) throw new Error("dpr: a device pixel ratio from 1 to 4");
    const network = netArg(a.network);
    if (a.browser !== undefined && !Object.hasOwn(BROWSERS, a.browser)) throw new Error(`browser: one of ${Object.keys(BROWSERS).join(", ")}`);
    if (a.browser !== undefined) refuse(a.browser, a); // what the engine lacks, before anything opens
    const engine = a.browser === undefined ? undefined : BROWSERS[a.browser as BrowserWord];
    // ensureBundles' mkdir would fail with EACCES, which reads as a permissions problem
    if (!existsSync(resolve(a.cwd))) throw new Error(`cwd ${resolve(a.cwd)} does not exist; pass the game project's folder`);
    await closeGame();
    // more named games than MAX_GAMES: the one used longest ago, never main, is closed
    const others = [...slots].filter(([k, v]) => v.game && k !== "main");
    if (others.length + (current !== "main" && slots.get("main")?.game ? 1 : 0) + 1 > MAX_GAMES && others.length) {
      const [k, v] = others.sort((x, y) => x[1].used - y[1].used)[0]!;
      slots.delete(k);
      evicted = k;
      await v.game!.queue(() => v.game!.close()).catch(() => {});
    }
    cwd = resolve(a.cwd);
    ensureBundles(cwd);
    // one headless Chrome for the server's life (launched as the first game's dev server starts); each game gets a
    // context of its own in it, so a reopen skips Chrome's ~0.3 s launch and ~0.1 s close
    const inChrome = a.browser === undefined || a.browser === "chrome";
    if (inChrome && !a.window && !(await chrome?.catch(() => null))?.connected) chrome = launchChrome();
    const viewport = size || dpr ? { width: size?.[0] ?? VIEWPORT.width, height: size?.[1] ?? VIEWPORT.height, deviceScaleFactor: dpr ?? 1 } : undefined;
    try { game = await openGame({ url: a.url, command: a.command, cwd, window: a.window, browser: a.window || !inChrome ? undefined : chrome, engine, viewport, reducedMotion: !!a.reducedMotion }); loadedPrint = fingerprint(cwd); }
    catch (e) { // the game that was open is closed by now: say so, or the next tool call's "no game is open" is a surprise
      throw new Error(`${(e as Error).message}${again ? "\nThe game that was open is closed, so no game is open now: call `open` again." : ""}`);
    }
    opened = { ...a };
    // a visitor's first load on a slow network, timed on a reload of its own: the open itself stays paused and fast
    const visit = network ? await firstFrame(game, network) : undefined;
    control ??= await startControl();
    const port = (control.address() as AddressInfo).port;
    if (current === "main") updateState(cwd, s => Object.assign(s, { url: a.url ?? null, command: a.command ?? null, server: { port, token } }));
    log(`opened ${game.url}; control socket on 127.0.0.1:${port}`);
    const errors = game.errors.length ? `\nErrors so far:\n${uniq(game.errors, 10, true).join("\n")}` : "";
    const loads = game.loads;
    const failed = loads.filter(l => l.status >= 400 || l.status === 0).slice(0, 20).map(l => `${l.name} (${l.error ?? l.status})`);
    const ok = loads.filter(l => l.status > 0 && l.status < 400).slice(0, 20).map(l => `${l.name}${l.bytes ? ` ${(l.bytes / 1e6).toFixed(1)} MB` : ""}`);
    const loaded = (ok.length ? `\nLoaded: ${ok.join(", ")}` : "") + (failed.length ? `\nFailed to load: ${failed.join(", ")}` : "");
    // the first check rides along: with a contract, opening the game is also checking it, so no separate `check` turn follows
    const contract = !!contractOrNull(cwd);
    const first = contract && !again ? await runCheck(game, cwd).then(c => `\n\nFirst check:\n${c.text}`, e => `\n\nFirst check failed: ${(e as Error).message}`) : "";
    const reopened = contract && again ? "\nReopened without a contract check: the hook checks each edit; `check` runs the whole contract." : "";
    // the reply is the one text every run reads, so it names the step agents skip (docs/results-assets-2026-10-13.md)
    const next = first ? "" : "\nNext: `look` to see it, then `interact` for each interaction the request names.";
    // ensureBundles writes them on every open; agents found two files they never wrote (opinion-7: 4 of 5)
    // and that the page ships them: agents read "kept current" as code changing under the game (opinion-9, opinion-10); one
    // deleted them with paprika3d/ as clutter, which silenced the Stop hook (#65), so the line says to leave them; the
    // signatures are the ones the 2026-10-24 scene loops dug out of the minified fx.js
    const geo = `\ngeo.js and fx.js are here, written on the first open and replaced only when the plugin's copy changes (each starts with the plugin version that wrote it): they are the plugin's, part of the project like node_modules: leave them in place.`
      + `\nProcedural geometry: import { geo, scatter } from "./geo.js" (see the skill's geometry reference).`
      + `\nEffects: import { stage, tex, field, place, instances, sfx, burst, shake, uv, picture, bake, trace, heightfield } from "./fx.js" (lights and camera, canvas textures, terrain, placement, sound, particles, a reference picture's camera and pixel maps, a subtree as GLB bytes, a picture's outlines and heights; seeded, no files).`
      + `\npicture({ position, lookAt?, fov?, size? }) returns { camera, at(px, py, depth), ground(px, py, y?), px(point), fit(width, height, cam?) }; bake(object, { animations? }) returns a Promise of GLB bytes (an ArrayBuffer, which eval { save } writes to a file); trace(src, { colour?, tolerance?, invert?, simplify?, minArea?, scale? }) returns a Promise of { shapes, mask, width, height }; heightfield(src, { size, height, base? }) returns a Promise of a Field like field()'s. Every option: references/fx.md in the threejs-game skill.`;
    // describe() is the same on most reopens (an edit rarely changes it), and it is ~1 KB on a full game
    const { hasConvention: _, ...shown } = game.info, info = JSON.stringify(shown), same = described.get(`${cwd}\0${game.url}`) === info;
    described.set(`${cwd}\0${game.url}`, info);
    // a page whose setup is slow shows nothing that long; agents never saw it (an atlantis page ready in 12 s here
    // drew no frame in the judging browser's 60 s), so the time is in every reply and a slow one is called out
    const secs = (game.loadMs / 1000).toFixed(1);
    // a loading veil or title card over the first frame is what a player and the judges see first, and no look of the 3D
    // scene showed it (AA-3D full-1: such a first frame lost 4 of the 5 votes where only one side had one)
    const over = (await game.page.evaluate("__harness.covers()").catch(() => []) as Cover[]);
    const cover = over.length ? `\n${coversText(over).join("\n")}${over.some(c => c.over) ? " A visitor sees it first; `look` opening: true shows how long it stays." : ""}` : "";
    const slow = visit ? `${visit.line} ${hostLoad()}` : slowStart(game.loadMs, game.software);
    // agents write three.js from an older release than the page loads: the removed API they used, before they debug it
    const stale = [...staleThree(cwd), ...uniq(game.warned, 5).map(w => `three.js warned: ${w}`)].map(l => `\n${l}`).join("");
    // a black page's server-side error, a canvas with no height, and what a crawler reads
    const around = (await openText(game, cwd)).map(l => `\n${l}`).join("");
    const lights = lightsText(await game.page.evaluate(LIGHTS).catch(() => null) as Lights | null), lit = lights && `\n${lights}`;
    // a mistagged texture draws washed out or wrong in every look after; say it before the first one (web3d layer 1, #30)
    const spaces = (await game.page.evaluate(COLOUR_SPACES).catch(() => []) as string[]).map(l => `\n${l}`).join("");
    const named = current === "main" ? "" : ` as game "${current}"${evicted ? ` (game "${evicted}" was closed: at most ${MAX_GAMES} games are open at once)` : ""}`;
    evicted = "";
    const at = viewport ? ` at ${viewport.width} × ${viewport.height}${dpr ? `, DPR ${dpr}` : ""}` : "";
    if (TELEMETRY) {
      const page = await game.page.evaluate("({ three: window.__THREE__ ?? null, game: !!window.__game, webgpu: !!window.__harness?.renderers?.some(r => r.isWebGPURenderer) })").catch(() => ({})) as object;
      const models = game.loads.filter(l => /\.(glb|gltf|usd[acz]?)(\?|$)/i.test(l.name));
      const r3f = (() => { try { return readFileSync(join(cwd, "package.json"), "utf8").includes('"@react-three/fiber"'); } catch { return false; } })();
      noteOpen({ open: { via: a.command ? "command" : "url", ...page, r3f, models: models.length, mb: Math.round(game.loads.reduce((n, l) => n + (l.bytes ?? 0), 0) / 1e5) / 10, loadS: Math.round(game.loadMs / 1000), software: game.software } });
    }
    const reduced = a.reducedMotion ? "\nReduced motion: the page gets prefers-reduced-motion: reduce. Look, step 60 frames (`interact` wait), look again: the Pixels line says whether animation stopped." : "";
    // another engine is named first: by the agent's ask, or because Chrome was missing (browser.ts openGame)
    const e = game.engine, said = e.name === "chromium" ? "" : `${SAID[e.name]} ${e.version}`;
    const engineLine = e.instead ? `No Chrome at ${e.instead}: opened in ${said} instead. Set PAPRIKA3D_CHROME, or install Chrome, for the default engine.\n` : "";
    // the GPU once per server until it changes (another browser, a window), as perf names it with every measure (#133)
    const gpu = gpuLine(game), gpuSaid = gpu === saidGpu ? "" : `\n${gpu}`;
    saidGpu = gpu;
    return text(`${engineLine}Opened ${said && !e.instead ? `in ${said}: ` : ""}${game.url}${named}${at} in ${secs} s, paused at frame 0.${repeat ? "\nAn open is needed only for a fresh frame 0: after an edit, the next tool call reloads by itself." : ""}${gpuSaid}${slow && `\n${slow}`}${reduced}${stale}${cover}${around}${lit}${spaces}\n${same ? "describe(): unchanged since the last open" : info}${again ? "" : geo}${errors}${loaded}${next}${reopened}${first}${disclosure()}\n\nRun folder: ${game.runDir}`);
  },

  async observe() {
    const g = need();
    return text(JSON.stringify(await observe(g)));
  },

  async eval(a) {
    const g = need();
    const r = await evaluate(g, a.code, a.save, cwd);
    if (r.stepped) noteTest(g, undefined, r.stepped); // a bot that stepped frames played the game (build-review-1, #90)
    return r.failed ? fail(r.text) : text(r.text);
  },

  async interact(a) {
    const g = need();
    // refused before any input: a check saved without expect passes whatever happens
    saveName(a.save);
    if (a.save !== undefined && a.expect === undefined) throw new Error("a saved check needs `expect`, or it passes whatever happens: add expect: { path: value } for what this play must reach");
    if (a.record === "video" && !VIDEO) throw new Error('record: "video" is not in this build; record: true keeps a GIF; nothing was played');
    if (a.save !== undefined && a.record) throw new Error(`${a.record === "video" ? "a video films one play" : "record plays in real time"} and a saved check replays from a fresh reload: save the check in one call and record in another; nothing was played`);
    // errors the steps raised come back with the state, as observe and eval give theirs, without another observe
    // and so do the log lines they printed, the newest 5 distinct when every frame prints a different one
    const { r, hovered, errors, logs } = await g.queue(async () => {
      // a save plays from a fresh reload, as `test` reruns it: a score left by the last call passed a check that
      // `test` then failed (feel-4, opinion-5)
      if (a.save !== undefined) await g.reload();
      const n = g.errors.length, stop = printedLines(g.page, true);
      try {
        const r = await act(g, (a.steps ?? (a.hover && [])) as Step[], { trace: a.trace, expect: a.expect, record: a.record === "video" ? "video" : a.record === true }), hovered = a.hover && await hover(g, a.hover as string[], a.frames as number | undefined);
        return { r, hovered, errors: g.errors.slice(n), logs: stop() };
      } finally { stop(); }
    });
    noteTest(g, undefined, keyFramesOf(a.steps as Step[] | undefined, r.framesRun));
    const reply = capAct(r.after, r.changed); // the state before is what the last observe or act already showed
    // a play that came out right becomes a check `test` reruns from a fresh reload; one that did not is not saved
    const verb = a.save !== undefined ? savedVerb(cwd, a.save) : "Saved", n = a.save !== undefined && r.passed ? saveTest(cwd, a.save, a.steps ?? [], predicates(a.expect)) : 0;
    const saved = a.save === undefined ? "" : !n ? "Not saved: an Expect entry failed, and a saved check must pass when it is saved."
      : `${verb} check "${a.save}" in game-tests.json (${n === 1 ? "1 check" : `${n} checks`} now); \`test\` reruns them all, each from a fresh reload${n === 1 ? ", and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing" : ""}.`;
    // the trace shows only as its lines (r.traceText): its JSON said the same twice over (opinion-2, opinion-3)
    const body = JSON.stringify({ ...reply, ...(hovered && { hover: hovered }), ...(logs.length > 0 && { logs }), ...(errors.length > 0 && { errors: uniq(errors.map(e => e.split("\n")[0]!.slice(0, 300)), 5) }) })
      + [r.motion, r.sound, r.hint, r.traceText, r.expect, saved, r.clip && clipText(r.clip, g), r.video && videoText(r.video)].map(l => l ? `\n${l}` : "").join("");
    // the clip's or video's four moments are the agent's view of it: it reads only a GIF's first frame, and no video
    const strip = r.clip?.strip ?? r.video?.strip;
    if (!a.look) return strip ? withPicture(g, text(body), strip) : text(body);
    // the look after the steps in the same reply: AA-3D full-1 agents sent a `look` right after an `interact` up to 22
    // times a cell, a model call each
    const start = Date.now(), l = await look(g, { edited: edited(g) }), lt = lookText(l);
    recordPlain("look", l.picture, Date.now() - start);
    noteTest(g, l);
    // with a clip, both pictures: look's after the steps, then the clip's four moments
    const both = await withPicture(g, text(`${body}\n${lt}${strip ? `\nThe reply's pictures: look's after the steps, then the ${r.clip ? "clip" : "video"}'s four moments.` : ""}`), l.picture);
    return strip ? withPicture(g, both, strip) : both;
  },

  async look(a) {
    const cam = (c: unknown) => namedOr(cwd, c);
    const g = need(), start = Date.now();
    // the chain below runs the first mode it meets: `look { sheet, save }` returned the sheet and saved nothing (dev #118);
    // refused before noteTest, whose time the Stop hook reads as the last look (a call that pictured nothing is none)
    const modes = ["cameras", "viewports", "scroll", "sheet", "opening", "zoom", "at", "target", "save", "compare"].filter(k => a[k]);
    if (modes.length > 1) throw new Error(`look: one of ${modes.join(", ")} per call${modes.includes("sheet") && (modes.includes("save") || modes.includes("compare")) ? "; a sheet is several pictures, so it cannot be saved as a baseline (compare diffs one plain look)" : ""}.`);
    // `sample` takes the page's pixels, as `zoom` does: a point outside the zoom box or the page is refused here, as above (#155)
    if (a.sample?.length && modes.length && !a.zoom) throw new Error(`look: sample reads the plain look or a zoom, not ${modes[0]}: give it in a look of its own`);
    const read = a.sample?.length ? colours(a.sample, g.page.viewport()!, a.zoom) : undefined;
    noteTest(g);
    if (a.cameras) {
      const v = await cameras(g, cwd, (a.cameras as (string | { position: number[]; lookAt?: number[]; label?: string })[]).map(c => typeof c === "string" ? { ...namedCam(cwd, c), label: c } : c));
      recordPlain("look", v.picture, Date.now() - start);
      return withPicture(g, text(`Picture: ${v.picture} (${v.cells.length} cameras, left to right, top to bottom, at frame ${v.cells[0]!.look.frame ?? 0}, no reload; the game's own camera is not moved)\n${sheetText(v.cells).join("\n")}`
        + `\nEach cell at full size: ${v.cells.map(c => `${c.label} ${basename(c.look.picture)}`).join(", ")} (in the picture's folder).`
        + (v.kept.length ? `\nKept as \`camera\` names for look, zoom and reference compare: ${v.kept.map(n => JSON.stringify(n)).join(", ")} (paprika3d/cameras.json).` : "")), v.picture);
    }
    if (a.viewports) {
      const v = await viewports(g, a.viewports as (string | number[])[]);
      recordPlain("look", v.picture, Date.now() - start);
      return withPicture(g, text(`Picture: ${v.picture} (${v.cells.length} viewports, left to right, top to bottom, each on a fresh reload); the game is reloaded at its own size and first frame\n${viewportsText(v.cells).join("\n")}`), v.picture);
    }
    if (a.scroll) {
      const v = await scrollSweep(g, a.scroll as number[]);
      recordPlain("look", v.picture, Date.now() - start);
      return withPicture(g, text(`Picture: ${v.picture} (${v.cells.length} scroll stops, left to right, top to bottom, each on a fresh reload); the game is reloaded at its first frame\n${v.cells.map(c => c.text).join("\n")}`), v.picture);
    }
    if (a.sheet) {
      const v = await sheet(g, a.sheet as SheetItem[]), took = Date.now() - start;
      recordPlain("look", v.picture, took);
      return withPicture(g, text(`Picture: ${v.picture} (${v.labels.length} moments, left to right, top to bottom: ${v.labels.join(" | ")}); the game is reloaded at its first frame\n${sheetText(v.cells).join("\n")}${v.missed.length ? `\nDid not finish: ${v.missed.join(" | ")}; try fewer frames or steps for those` : ""}\nThis sheet took ${Math.round(took / 1000)} s (about ${Math.round(took / 1000 / (a.sheet as SheetItem[]).length)} s a cell)${g.software ? " on a software renderer" : ""}.`), v.picture);
    }
    if (a.opening) {
      const o = await opening(g);
      recordPlain("look", o.picture, Date.now() - start);
      return withPicture(g, text(`Picture: ${o.picture} (the first seconds in real time, left to right: ${o.labels.join(" | ")}); the game is reloaded paused at its first frame${g.software && o.msPerFrame
        ? `\nSoftware renderer (no GPU): about ${o.msPerFrame} ms a drawn frame, so a game that moves one step a frame ran about ${Math.round(o.msPerFrame * 60 / 1000)}× slower than real time in this opening; a countdown or animation that looks stuck may only be slow.` : ""}`), o.picture);
    }
    if (a.zoom) {
      const z = await zoom(g, a.zoom as number[], cam(a.camera));
      recordPlain("look", z.picture, Date.now() - start);
      return withPicture(g, text(`Picture: ${z.picture} ([${(a.zoom as number[]).join(", ")}] at ${z.scale}×${a.camera ? ", from camera" : ""}) of the live page at frame ${z.frame}, not a saved picture or sheet${read ? `\n${read(z.picture)}` : ""}`), z.picture);
    }
    // text only: the agent picked the points off a look it already has
    if (a.at) return text((await probe(g, a.at as number[][], cam(a.camera))).join("\n"));
    if (a.target) {
      const v = await views(g, a.target);
      recordPlain("look", v.picture, Date.now() - start);
      return withPicture(g, text(`Picture: ${v.picture} (front, right, top, three-quarter)\n${a.target}: size ${v.size.join(" × ")}, centre [${v.center.join(", ")}]`), v.picture);
    }
    if (a.save) {
      const v = await saveBaseline(g, cwd, a.save);
      recordPlain("look", v.look.picture, Date.now() - start);
      return withPicture(g, text(`Saved as baseline ${a.save}: ${v.file}\n${noteTest(g, v.look)}`), v.look.picture);
    }
    if (a.compare) {
      const v = await compareBaseline(g, cwd, a.compare);
      recordPlain("look", v.look.picture, Date.now() - start);
      return withPicture(g, text(`${v.text}\n${noteTest(g, v.look)}`), v.look.picture);
    }
    const l = a.camera ? await lookFrom(g, cam(a.camera)) : await look(g, { edited: edited(g) });
    recordPlain("look", l.picture, Date.now() - start);
    return withPicture(g, text(noteTest(g, l, 0, !a.camera) + (read ? `\n${read(l.picture)}` : "")), l.picture);
  },

  async feel(a) {
    const g = need();
    return text((await feel(g, a.steps as Step[], a.frames)).text);
  },

  async check() {
    const g = need();
    const r = await runCheck(g, cwd), fetched = await g.queue(() => pageAssets(g)).catch(() => null); // what the page fetched, as `perf` counts it (#131)
    return text(r.text + (fetched ? assetsOver(fetched, { ...BUDGETS.desktop, ...contractOrNull(cwd)?.budget }) : ""));
  },

  async perf(a) {
    const g = need();
    const named = typeof a.budget === "string" ? (BUDGETS as Record<string, Budget>)[a.budget] : a.budget;
    if (typeof a.budget === "string" && !named) return fail(`unknown budget ${a.budget}; use ${Object.keys(BUDGETS).join(", ")}`);
    if (a.optimize) {
      // a measuring field would be dropped without a word, so it is refused: an argument is honoured or refused, never dropped (#150)
      const extra = ["variants", "costs", "throttle", "network"].filter(k => a[k] != null);
      if (extra.length) return fail(`\`perf\` with optimize takes only \`budget\`: ${extra.map(k => `\`${k}\``).join(", ")} ${extra.length > 1 ? "are" : "is"} for measuring, in a call without optimize.`);
      // the switches run inside the game's own runtime import; a game without it gets the import to add
      // (no measuring first: the median it printed, 5 s later, changed nothing the agent does next, and the next call measures)
      if (!await g.queue(() => g.page.evaluate("!!window.__threeRuntime")))
        return text(`The runtime layer is not installed in this game, so no switch can be tried. ${ensureRuntime(cwd)} \`perf\` with optimize: true tries the switches once the reopened page imports it.`);
      const issued = contractOrNull(cwd), contract = issued ?? testsOrNull(cwd); // the project's own checks stand in for a contract
      const r = await optimize(g, { contract, budget: { ...BUDGETS.desktop, ...contract?.budget, ...named }, cwd });
      // the final check rides along: one tool call at the end of a session, not two, and never a background check lost at exit
      const c = issued ? await runCheck(g, cwd, { result: r.check }) : contract ? r.check ?? await check(g, contract, { cwd }) : null;
      return text(c ? `${r.text}\n\nFinal ${issued ? "check" : "test"}:\n${c.text}` : r.text);
    }
    const budget: Budget = { ...BUDGETS.desktop, ...contractOrNull(cwd)?.budget, ...named };
    const network = netArg(a.network) ?? (budget.firstSceneFrameMs ? "fast-4g" : undefined); // the network the budget is set for
    // the first visit's line, or the paused load's time with a slow one called out; then the loading overlay the sample
    // waited for, which the first frame may have been (a poster read as the scene, #164)
    const loaded = (p: PerfResult) => (p.firstFrame?.line ?? `Load to first frame: ${(g.loadMs / 1000).toFixed(1)} s.${slowStart(g.loadMs, g.software) && ` ${slowStart(g.loadMs, g.software)}`}`) + overlayText(p.overlay);
    // an overlay still up after the wait is not waited for again in this call: a "click to start" card cost 5 s a measure
    const stuck = (p: PerfResult) => p.overlay && !p.overlay.cleared ? 0 : undefined;
    const costs = (p: PerfResult) => p.costs !== undefined ? `\n${costsText(p.costs, p)}` : "";
    const start = Date.now();
    const name = typeof a.budget === "string" ? a.budget : a.budget ? "given" : contractOrNull(cwd)?.budget ? "contract" : "desktop";
    const felt = (p: PerfResult) => ({ frameMs: p.work?.paced ? p.work.ms : p.median, assetMB: p.assetMB, ...p.firstFrame && { scriptMB: p.firstFrame.scriptMB, firstSceneFrameMs: p.firstFrame.ms ?? Infinity } });
    // mobile and quest are limits only: the frame is timed on this host's GPU, and throttle slows JavaScript alone (opinion-7: 4 of 5)
    const proxy = budget.proxy ? `\nOnly the limits are a ${name === "quest" ? "headset" : "phone"}'s: the frame ran on this host's GPU, which is faster than a ${name === "quest" ? "headset" : "phone"}'s, so GPU work (shadows, post-processing, a high pixel ratio) costs more there than this says.` : "";
    if (a.variants?.length) {
      // the baseline and each variant measured on a fresh page, in one call: agents ran an `open` with URL switches and
      // a `perf` per variant, 40 model calls in one AA-3D cell
      const variants = (a.variants as Variant[]).slice(0, 8), rows: string[] = [], home = g.page.url();
      const throttle = a.throttle as number | undefined;
      const base = await perf(g, budget, { url: home, throttle, network, work: true, costs: !!a.costs });
      // a paced baseline's interval is the display's tick, the same 17 ms for every variant ("within the noise" for a
      // 1-draw-call one, #132): the variants are compared on their work then
      const paced = !!base.work?.paced, cost = (p: PerfResult) => paced ? p.work?.ms ?? p.median : p.median;
      // a change under twice the noise is no result: "−14% vs baseline" for 0.1 ms beside 0.3 ms of noise (opinion-9)
      const delta = (p: PerfResult) => Math.abs(cost(p) - cost(base)) < 2 * base.noiseMs ? `within the noise of the baseline${paced ? "'s work" : ""}`
        : `${cost(p) <= cost(base) ? "−" : "+"}${Math.abs(Math.round((cost(p) - cost(base)) / Math.max(cost(base), 0.01) * 100))}% ${paced ? "work " : ""}vs baseline`;
      // draw calls and triangles are counts, not samples: halved draw calls read only "within the noise of the baseline" (#163)
      const change = (n: number, b: number, what: string) => { const pct = Math.round((n - b) / Math.max(b, 1) * 100); return Math.abs(pct) > 2 ? `${pct < 0 ? "−" : "+"}${Math.abs(pct)}% ${what}` : ""; };
      const counts = (p: PerfResult) => [change(p.calls, base.calls, "draw calls"), change(p.triangles, base.triangles, "triangles")].filter(Boolean).join(", ");
      const line = (label: string, p: PerfResult) => `${label}: ${p.median} ms median (p95 ${p.p95})${p.work ? `, work ${p.work.ms} ms` : ""}, ${p.calls} draw calls, ${p.triangles} triangles` +
        `; ${p === base ? budgetText(p.overBudget, budget, felt(p), name) : [delta(p), counts(p)].filter(Boolean).join("; ")}`;
      rows.push(line("baseline", base));
      for (const [i, v] of variants.entries()) {
        const label = v.label ?? ([v.query !== undefined && `?${v.query.replace(/^\?/, "")}`, v.hide?.length && `hide ${v.hide.join(", ")}`, v.pixelRatio && `pixel ratio ${v.pixelRatio}`, v.code && "code"].filter(Boolean).join(", ") || `variant ${i + 1}`);
        const run = () => perf(g, budget, { setup: variantSetup(v), url: variantUrl(home, v), throttle, work: true, overlayMs: stuck(base) }), off = (p: PerfResult) => Math.abs(cost(p) - cost(base));
        // a change past 3× the noise and a quarter of the frame is measured again and the smaller kept: one stalled sample
        // read as +2148% for hiding a 2-triangle plane (opinion-8, #67)
        try { let p = await run(); if (off(p) > Math.max(3 * base.noiseMs, cost(base) / 4)) { const q = await run(); if (off(q) < off(p)) p = q; } rows.push(line(label, p)); }
        catch (e) { rows.push(`${label}: ${(e as Error).message.split("\n")[0]}`); }
      }
      await g.reload(undefined, home); // nothing a variant hid, changed or loaded with stays in the page
      recordPlain("perf", await shot(g, "perf"), Date.now() - start, { perf: base });
      return text(`${rows.join("\n")}${slowed(throttle)}${proxy}\nWork: the median of the frames that drew, of ${WORK_IS}.${paced ? ` The baseline's ${base.median} ms is pacing, not work, so each variant is compared on its work: ${PACED}` : ""}\nNoise between two samples of the baseline: ${base.noiseMs} ms. ${loaded(base)}\n${hostLoad()} ${gpuLine(g)}\nThe page is reloaded as it was.${costs(base)}`);
    }
    const n = g.errors.length;
    const { p, pic } = await g.queue(async () => ({ p: await perf(g, budget, { passes: true, work: true, throttle: a.throttle, network, costs: !!a.costs }), pic: await shot(g, "perf") })); // one entry, so a socket check cannot run between the measure and its picture
    recordPlain("perf", pic, Date.now() - start, { perf: p });
    // a frame loop that throws every frame is fast because it stops early: atlantis read "0.3 ms median, 1 draw call; within budget"
    const thrown = g.errors.length - n;
    const over = budgetText(p.overBudget, budget, felt(p), name) + (thrown ? `, but the page threw ${thrown} errors while measuring (below), so this may be a frame cut short` : "") + (g.software && p.overBudget.includes("frameMs") ? `; ${SOFTWARE_NOTE}` : "");
    // the median judges the budget; a p95 over two budget frames is a hitch a viewer sees all the same (opinion-7: "within budget" beside p95 70 ms)
    const hitch = !p.overBudget.includes("frameMs") && p.p95 > 2 * budget.frameMs ? `; but p95 ${p.p95} ms: 1 frame in 20 takes over two budget frames, a hitch a viewer sees` : "";
    // a script over budget named no file (opinion-7: the starter's 2.35 MB was three.js unminified, as served from node_modules)
    const scripts = p.overBudget.includes("scriptMB") && p.firstFrame?.scripts.length ? `\nLargest scripts: ${p.firstFrame.scripts.map(s => `${s.name} ${s.MB} MB`).join(", ")}. Fix: serve a production build (vite build minifies three.js and drops what the page does not import), compressed.` : "";
    // many lights: what they cost, measured with them off on a fresh page (the warehouse's 18 point lights went unnamed)
    const lights = await g.queue(() => g.page.evaluate(LIGHTS)).catch(() => null) as Lights | null;
    let lightLine = "";
    const home = g.page.url();
    if (manyLights(lights)) {
      const many = lights.point + lights.spot > 8, what = many ? "point and spot lights" : "shadows";
      const code = many ? "scene.traverse(o => { if (o.isPointLight || o.isSpotLight || o.isRectAreaLight) o.visible = false; })" : "scene.traverse(o => { if (o.isLight) o.castShadow = false; })";
      try {
        const off = await perf(g, budget, { setup: variantSetup({ code }), url: home, throttle: a.throttle, work: true, overlayMs: stuck(p) });
        const cost = (q: PerfResult) => p.work?.paced ? q.work?.ms ?? q.median : q.median; // a paced interval says nothing of the lights (#132)
        lightLine = `\n${lightsText(lights, { ms: +(cost(p) - cost(off)).toFixed(2), frame: cost(p), noise: p.noiseMs, what })}`;
      } catch { lightLine = `\n${lightsText(lights)}`; }
    }
    await g.reload(undefined, home); // a fresh frame 0, as every reloading call leaves it: a plain perf left the page at frame 152 (opinion-10)
    // the rest as words with units: a JSON tail ({"textureMax":887, …}) left agents asking 887 of what (opinion-7)
    const more = `Textures ${p.textureMB} MB on the GPU (largest ${p.textureMax} px), ${p.programs} shader programs, pixel ratio ${p.pixelRatio}, heap ${p.heapMB ?? "unknown"} MB, ${p.longTasks} long tasks, ${p.gcPauses} frames over 3× the median (GC-like pauses); noise between two samples ${p.noiseMs} ms.`;
    // the work apart from the interval: a frame that draws nothing new waits for the 60 Hz tick here (#132)
    const work = p.work ? `\nWork per frame: ${workText(p.work)}; ${WORK_IS}.${p.work.paced ? ` The ${p.median} ms between frames is pacing, not work, so the budget judged the work: ${PACED}` : ""}` : "";
    // what the page fetched, by name: the served folder's 990 MB of raw downloads read as its assets (#131)
    const fetched = p.assets.length || p.unsized ? `\nAssets are the files this load fetched${p.assets.length ? `, largest ${p.assets.map(x => `${x.name} ${x.MB} MB`).join(", ")}` : ""}${p.unsized ? `; ${p.unsized} more gave no size (from another origin without Timing-Allow-Origin, or cached), so the total leaves them out` : ""}.` : "";
    // a download over budget names what cuts its largest file, when the project holds it (#163): a model's shrink call as
    // `model_audit` words it (1024 px: a cap at the desktop guide's 2048 leaves the commonest big texture as it is), or for
    // an image the words of the over-budget texture list (`perf` with optimize, `check`)
    const big = p.overBudget.includes("assetMB") ? p.assets[0]?.file : undefined;
    const fix = !big ? "" : /\.(gl(b|tf)|usd[acz]?)$/i.test(big) ? `\n${shrinkFix(relative(cwd, big), Math.min(1024, budget.textureMax))}`
      : /\.(png|jpe?g|webp|avif|gif|bmp|ktx2|hdr|exr)$/i.test(big) ? `\nFix: resize or compress ${relative(cwd, big)}.` : "";
    return text(`${p.median} ms median frame (p95 ${p.p95} ms, ${p.fps} fps on average), ${p.calls} draw calls, ${p.triangles} triangles, ${p.assetMB} MB assets; ${over}${hitch}${slowed(a.throttle)}${proxy}${scripts}${lightLine}${work}${fetched}${fix}\n${loaded(p)}\n${hostLoad()} ${gpuLine(g)}\n${more}${p.passes ? `\n${passesText(p.passes)}` : ""}${costs(p)}`);
  },

  async invariants() {
    const g = need();
    return text((await invariants(g)).text);
  },

  async test() {
    const g = need();
    return text((await runCheck(g, cwd, { tests: true })).text);
  },


  async model_audit(a) {
    const dir = resolve(a.cwd);
    if (!a.shrink) return text(assetsText(dir, a.path ?? ".", a.target ?? "site"));
    const file = resolve(dir, a.path ?? "");
    if (a.path && USD.test(file)) throw new Error(`model_audit: shrink rewrites .glb and .gltf files only: ${CONVERT(a.path)}`);
    if (!a.path || !existsSync(file) || !/\.gl(b|tf)$/i.test(file)) throw new Error("model_audit: shrink rewrites one .glb or .gltf file: give it as path");
    const resize = typeof a.shrink.textures === "number";
    if (resize && !(await chrome?.catch(() => null))?.connected) chrome = launchChrome(); // textures are resized in the shared Chrome's canvas
    const s = await shrink(file, { textures: a.shrink.textures, out: a.shrink.out && resolve(dir, a.shrink.out) }, resize ? chrome : undefined);
    return text(shrinkText(dir, file, s, a.target ?? "site"));
  },
  // the modelling scene is a page of the shared Chrome, launched when first needed, as reference's canvas is
  async model_run(a) {
    if (!(await chrome?.catch(() => null))?.connected) chrome = launchChrome();
    const r = await modelRun(chrome!, resolve(a.cwd), a.code);
    return r.failed ? fail(r.text) : text(r.text);
  },
  async model_look(a) {
    if (!(await chrome?.catch(() => null))?.connected) chrome = launchChrome();
    const r = await modelLook(chrome!, resolve(a.cwd), { object: a.object, cameras: a.cameras, size: a.size });
    return { content: [{ type: "text", text: r.text }, ...r.jpeg ? [{ type: "image" as const, data: r.jpeg, mimeType: "image/jpeg" }] : []] };
  },
  async reference(a) {
    const dir = resolve(a.cwd), { file, name } = pictureFile(dir, a.file);
    let lookPng: string | undefined, kept = false;
    if (a.compare) {
      if (!game) throw new Error("reference: compare needs the page open: call `open` first, or leave compare out to read the picture alone");
      const cam = a.camera ? namedOr(dir, a.camera) : viewpoint(dir, file); kept = !a.camera && !!cam;
      lookPng = (await (cam ? lookFrom(game, cam) : look(game))).picture;
    }
    if (!(await chrome?.catch(() => null))?.connected) chrome = launchChrome(); // the canvas work runs in the shared Chrome, page open or not
    const r = await reference(chrome!, { file, crop: a.crop, grid: a.grid, sample: a.sample, look: lookPng, cells: a.cells }, name);
    return { content: [{ type: "text", text: (kept ? `The page's look is from cameras.json's viewpoint for ${basename(file)}.\n` : "") + r.text }, { type: "image", data: r.jpeg, mimeType: "image/jpeg" }] };
  },

  async asset_search(a) {
    const { search, pick } = await import("./asset.ts");
    const agent = a.model || client; // Claude Code tells a server its own name, never the model's
    if (a.pick) return text(await pick(a.pick, a.kind ?? "model", resolve(a.cwd), agent, a.height, a.textures, a.format));
    // the crop and the contact sheet are drawn in the shared Chrome's canvas, launched when first needed
    const shared = async () => { if (!(await chrome?.catch(() => null))?.connected) chrome = launchChrome(); return chrome!; };
    let cut: string | undefined;
    if (a.image) { const { file, name } = pictureFile(resolve(a.cwd), a.image); cut = (await reference(shared(), { file, crop: a.crop }, name)).jpeg; }
    const s = await search({ ...a, image: cut }, agent, a.cwd && resolve(a.cwd), a.sheet === false ? undefined : shared);
    const jpeg = (data: string): Content => ({ type: "image", data, mimeType: "image/jpeg" });
    return { content: [{ type: "text", text: s.text }, ...cut ? [jpeg(cut)] : [], ...s.sheet ? [jpeg(s.sheet)] : []] };
  },
};

// shown to the model in its system prompt, so it reaches for these tools even when no skill triggers
const INSTRUCTIONS = "Use these tools, the `paprika` server's, rather than a Playwright or Chrome DevTools script, to run, see, test, play or profile any three.js, React Three Fiber or other WebGL page, new or existing, in Chrome or Firefox: a game, a viewer, a product configurator, a simulation, a shader or post-processing demo. " +
  "`open` runs the page in headless Chrome (by default) on a paused, seeded clock, so the same inputs always give the same frames and state; `look` shows what a viewer sees and lists what is on screen and what never appears (a model loaded at the wrong scale, out of view or not loaded at all shows only there). " +
  "`look`'s `Lighting:` and `Surfaces:` lines name the object, where it is and the number that fixes it. " +
  "Search for the tool by what you need: `look` to see the page, `interact` to play it, `observe` to read its state, `eval` to run code in it, `feel` to measure how an event reacts, `perf` to time it against a budget, `model_run` to build a model in code (three and Manifold, as in Blender) and `model_look` to see it from four sides, saved as a .glb the page loads, `asset_search` for a ready-made model (57,732, CC BY or CC0), PBR texture or HDRI sky from the hosted library. " +
  "Calls run one at a time: a call made while another still runs, one moved to the background included, waits for it to finish, and its reply starts with how long it waited.";

let calls: Promise<unknown> = Promise.resolve();
// the tool whose call is running now, named by a call that waits behind it (report 7b22b0d6: an `interact` queued
// 111 s behind a backgrounded look sheet and nothing said so)
let running: string | null = null;
/** Runs one tools/call after every earlier one (a client may send them in parallel, and `open` swaps the game);
    a tool's own failure is an isError result for the model. */
// Tools that read or drive the page reload it first when the sources changed since it loaded: agents reopened with
// `open` after every edit, one model call each (21 in an AA-3D full-1 cell).
const FRESH = new Set(["observe", "eval", "interact", "look", "feel"]);
// reload() sets loadMs; the time shows a slow software-GL reload as the cost of this call (AA-3D: 570 such lines)
const reloaded = (ms: number) => `Reloaded (sources changed), ran on the new code from frame 0 (ready in ${(ms / 1000).toFixed(1)} s).\n`;
// an agent killed the harness's Chrome to measure in its own (AA-3D excavator cell); the next call failed with "detached
// Frame" and it reopened by hand, each time
const HOOK_RESET = "The after-edit hook reran its checks since your last call, so the page restarted at frame 0.\n";
const REOPENED = "Reopened first: the game's page had closed (a call before this one hung, or Chrome was killed or crashed), so the game was opened again and this ran from frame 0.\n";
// a reopen's new folder, which no other reply names: the hooks find a session's runs by the folders its replies name
const newRun = () => `Run folder: ${game!.runDir}`;
const gone = () => !!game && (game.page.isClosed() || !game.page.browser().connected); // Chrome died, or a hung page was closed
async function reopen() { await TOOL_FNS.open(opened); }
if (FEEDBACK) TOOL_FNS[REPORT_TOOL.name] = async a => text(await reportTool(a, game?.runDir));
// `publish` (src/publish.ts): the key and the build stay in the server; the reply holds the URL, never the secret
TOOL_FNS.publish = async a => {
  const { publish } = await import("./publish.ts");
  return text(await publish(resolve(a.cwd), { client, model: a.model }, { slug: a.slug, rotate: a.rotate === true }));
};

/** For the finish check (hooks/before-stop.ts): when this game was last played or looked at, and a plain look's fault
    lines (Lighting, Surfaces, Surface), which stay until the next plain look. A look also notes the sources its page ran
    (for the next look's closed lines) and, from the game's own camera (`own`), the hook's fault baseline. Returns the
    look's reply text. */
function noteTest(g: Game, l?: Look, keyFrames = 0, own = true): string {
  const f = join(g.runDir, "last-test.json");
  let was: { faults?: string[]; keyFrames?: number; plain?: Plain } = {};
  try { was = JSON.parse(readFileSync(f, "utf8")); } catch {}
  // from the Look, not the reply: a look repeating the last one's faults prints them as one line
  const faults = l ? faultLines(l).filter(x => /^(Lighting|Surfaces|Surface): /.test(x)) : was.faults ?? [];
  // the longest key-driven `interact` so far, for the finish check's feel item
  const keys = Math.max(was.keyFrames ?? 0, keyFrames);
  const plain = l ? plainOf(l) : was.plain;
  try { writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), faults, ...(keys && { keyFrames: keys }), ...(plain && { plain }) })); } catch {}
  if (l) {
    lookPrint.set(g, loadedPrint);
    // not faultLines: its picture-based Surface line is one the hook's recheck (faultsNow) never makes. A look after play
    // (interact to frame 120) never replaces the fresh page's baseline, which every later recheck at frame 0 compares with;
    // a look whose z-fighting check stopped at its work or triangle limit keeps the baseline's Surfaces lines it may have missed
    const base = hookFaults.get(g);
    if (own && (!base || base.frame === l.frame)) hookFaults.set(g, { frame: l.frame, lines: faultDiff(base?.lines ?? [], [...l.setup ?? [], ...l.surfaces ?? []], !!l.unchecked).kept });
  }
  return l ? lookText(l) : "";
}

/** What the finish check's "still plain" item quotes from the last look: the subject's share of the frame, the objects'
    main hues and how many named objects were on screen. */
type Plain = { subject: { name: string; share: number } | null; hues: string; onScreen: number };
function plainOf(l: Look): Plain | undefined {
  if (!l.ids) return undefined; // no three.js scene: nothing named to count
  const s = l.subject && !("absent" in l.subject) ? { name: l.subject.name, share: l.subject.share } : null;
  const hues = Object.entries(l.pixels?.objects?.hues ?? l.pixels?.hues ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .filter(([, v]) => v >= 0.05).map(([h, v]) => `${h} ${Math.round(v * 100)}%`).join(", ");
  return { subject: s, hues, onScreen: l.onScreen.length };
}

/** Frames an `interact` ran with input in it (the frames act() ran, else each step's frames, default 1, and the waits), 0 with no
    input step: a drag counts as much as a key (feel-5: a product viewer's agent played only with the mouse), and an until step
    its held frame, not 1 (build-review-1, #77). */
const keyFramesOf = (steps: Step[] = [], ran?: number) => !steps.some(s => "key" in s || "mouse" in s || "touch" in s || "wheel" in s || "scroll" in s) ? 0
  : ran ?? steps.reduce((n, s) => n + Number(("wait" in s ? s.wait : "frames" in s ? s.frames : 1) ?? 1), 0);

// Every call has a bound (#29). A page whose main thread spins (an endless loop in the game, or a setState, frame or eval
// that never returns) answered nothing until puppeteer's 180 s, and nor did the next call. While a call runs, its page is
// pinged once a second on a session of its own; a page that answered no ping for the whole bound is hung, and is thrown
// away (game.abandon(): its context closed, other games' pages untouched). The bound is on silence, not on the call: one
// clock step evaluate is one main-thread task (a check keypoint's 60 frames, a feel run), so a slow software-GL step is
// silent for a while without being hung. A call whose page keeps answering runs to the old limit: an `interact` ran 35 min
// in an AA-3D excavator cell, waiting on something that never came. Checks, opens and `perf` with optimize get twice as long.
const LIMIT_MS = Number(process.env.PAPRIKA3D_CALL_LIMIT_MS) || 10 * 60_000;
const BOUND_MS = Number(process.env.PAPRIKA3D_BOUND_MS) || 30_000;
const LONG = new Set(["open", "check", "contract"]);
class Hung extends Error {}
/** The one reply for a call stopped because its page hung or never finished: what happened, and that the game starts over. */
// on a busy host the page can be starved rather than stuck: four of four feel-5 agents searched their code for a loop at
// load 64 to 98 on 8 cores, and the same call passed on the next try
const hung = (name: string, what: string) => {
  const load = loadavg()[0]!, cores = cpus().length, busy = load > cores * 2;
  return new Hung(`\`${name}\` ${what}, so the harness closed its page: the next call opens the game again at frame 0. ${busy
    ? `The host is busy (load ${load.toFixed(0)} on ${cores} cores), which can starve the page: run the call again before looking for a loop. If it hangs again, find`
    : "Find"} what never ends before running it again: an endless loop in the game or in code you ran, or a frame that waits on something that never comes (a network request, audio, a worker).`);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** p, unless the page of `page()` stops answering for the bound or p outlives the limit: then that page is abandoned
    and, once p settles (10 s at most), a Hung error. Also used for the control socket's and the CLI's checks. */
export async function guarded<T>(p: Promise<T>, name: string, page: () => Game | null, long = LONG.has(name)): Promise<T> {
  // the bound grows with the host's load: at load 64 to 98 on 8 cores a look's pass alone was silent for 30 s, and
  // pages that were starved, not stuck, were thrown away 20 to 36 times a cell (feel-5)
  const limit = long ? 2 * LIMIT_MS : LIMIT_MS, start = Date.now();
  const bound = () => (long ? 2 : 1) * BOUND_MS * Math.min(4, Math.max(1, loadavg()[0]! / cpus().length)); // 4x at most: an endless loop still ends in 2 min
  let done = false, heard = start;
  const settled = p.then(() => { done = true; }, () => { done = true; });
  for (;;) {
    await Promise.race([settled, sleep(1_000)]);
    const g = page();
    if (!done && (!g || await g.alive())) heard = Date.now();
    if (done) return p;
    const now = Date.now(), b = bound();
    if (now - heard < b && now - start < limit) continue;
    // an `eval` past the bound on Chrome is stopped and its page kept (#165: finite runs of 30 to 62 s lost the page and
    // its state in six scene loops), so a false stop on a starved host costs one eval and needs no busy-host sentence
    if (name === "eval" && now - heard >= b && g && await g.stop()) {
      await Promise.race([settled, sleep(1_000)]); // the code's own run fails at once; a script of the page's own lets it run on
      const whole = await Promise.race([g.page.evaluate(AFTER_STOP).then(Boolean, () => false), sleep(1_000).then(() => false)]);
      await Promise.race([settled, sleep(1_000)]);
      const line = `\`eval\` ran ${Math.round((now - heard) / 1000)} s without yielding and was stopped; the page is kept. Split the work across calls, or await a 0 ms timer every few hundred iterations (the harness steps the clock once and the page answers).`;
      if (whole && done) return p.then(r => withText(r as Result, `${line}\n${body(r as Result)}`) as T, () => { throw new Hung(line); });
    }
    await g?.abandon();
    await Promise.race([settled, sleep(10_000)]); // the stuck call fails once its page is gone
    throw now - heard >= b ? hung(name, `stopped: the page answered nothing for ${Math.round((now - heard) / 1000)} s (its main thread never came free)`)
      : hung(name, `ran for ${Math.round((now - start) / 1000)} s without finishing`);
  }
}

// Page errors the agent has been told of, per game. `open`, `observe`, `interact` and `eval` say which errors they
// raised; the other page tools did not, so a frame loop that threw every frame read "within budget" in `perf` and a
// shader that failed to compile read as objects "never visible" in `look` (AA-3D full-1).
const told = new WeakMap<Game, number>();
const OWN_ERRORS = new Set(["open", "observe", "interact", "eval", "check", "invariants", "test", "contract", "asset_search", "model_audit", "model_run", "model_look", "publish"]);
/** Page errors, the same ones counted once each, or "" when there are none. */
export function errorsText(errors: string[]): string {
  if (!errors.length) return "";
  const firsts = errors.map(e => e.split("\n")[0]!.slice(0, 300)), kinds = new Set(firsts).size;
  const lines = uniq(firsts, 5);
  const shader = errors.some(e => /Shader Error|VALIDATE_STATUS|program not valid/i.test(e))
    ? "\nA shader failed to compile: what is drawn with it draws nothing (a look lists it never visible) until it compiles." : "";
  return `\nPage errors since the last call (${errors.length}):\n${lines.join("\n")}${kinds > 5 ? `\n… ${kinds - 5} more kinds` : ""}${shader}`;
}

// A page that navigates under a call (its own location.reload(), or a dev server's live reload after an edit sent in the
// same turn) failed 8 of 9 evals in one tester session although each reply said to run the call again (telemetry
// 2026-10-20): the harness runs it again itself once, on the page it reloaded.
const NAVIGATED = "\nThe page navigated while this ran, so the harness reloaded it: paused at frame 0. Run the call again. Do not reload the page yourself: after an edit, the next call reloads it.";
const NAVIGATED_TWICE = "\nThe page navigated under this call twice, and the harness reloaded it each time: paused at frame 0. Something reloads the page: your own code (location.reload, location.href, a redirect), a dev server's live reload after an edit (edit first, then call, not both in one turn), or Vite optimizing a dependency the page imported late. Find it before running the call again.";
const RERAN = "The page navigated during the first try of this call, so the harness reloaded it and ran the call again.\n";
/** The dev server's own word for a reload it sent, from the lines it printed since `from` (the log's length then, and
    its last line, since the log keeps only its last 200), or "". Vite reloads the page when it
    optimizes a dependency first imported after it started (a lazy import, a package just added) that shares code with
    ones it optimized before, and says "optimized dependencies changed. reloading"; run-folder writes never reload it
    (Vite 8 reloads for an .html outside the module graph only), so #135's navigations were named wrongly. */
export function reloadCause(log: string[], from: { length: number; last?: string }): string {
  const at = from.last === undefined ? 0 : log.length > from.length && log[from.length - 1] === from.last ? from.length : log.lastIndexOf(from.last) + 1;
  const lines = log.slice(at);
  const dep = lines.find(l => /optimized dependencies changed\. reloading/.test(l)), page = lines.find(l => /\bpage reload\b/.test(l));
  if (dep) return `\nVite reloaded it: it optimized a dependency the page imported after the dev server started (its log: "${dep.trim().slice(0, 200)}"). Name that package in optimizeDeps.include in vite.config, or restart the dev server once after adding a dependency, and these reloads stop.`;
  if (page) return `\nThe dev server reloaded it (its log: "${page.trim().slice(0, 200)}"): a file it serves changed while the call ran.`;
  return "";
}
const body = (r: Result) => r.content[0]?.type === "text" ? r.content[0].text : "";
const withText = (r: Result, t: string): Result => ({ ...r, content: [{ type: "text", text: t }, ...r.content.slice(r.content[0]?.type === "text" ? 1 : 0)] });

/** A field of a tool's schema, as checkArgs reads it. */
type Field = { type?: string | string[]; description?: string; items?: { type?: unknown }; minItems?: number; maxItems?: number };
// names agents sent from other APIs: 100 scene-loop `eval` calls sent CDP's `expression` and ran `undefined`
const ALIASES: Record<string, string> = { expression: "code", js: "code", script: "code", width: "size", height: "size", path: "file", q: "query", prompt: "query" };
/** Levenshtein distance, for the field a misspelt one meant. */
function edits(a: string, b: string): number {
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}
/** A value's JSON Schema type: array, object, null, string, number or boolean. */
const kind = (v: unknown) => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
const an = (t: string) => `${/^[aeiou]/.test(t) ? "an" : "a"} ${t}`;
const about = (p: Field) => p.description ? `: ${p.description}` : "";

/** Why a call's arguments cannot work, one line per field naming it and its own description, or null: checked against
    the tool's schema before the page queue, so the reply never waits behind another call (#152: 193 scene-loop calls
    left out `cwd` and failed on Node's `paths[0]`). A missing `cwd` becomes `openCwd`, the project of the game the call
    works on, and a JSON string where the schema wants an array or an object becomes what it parses to (clients send
    arrays as strings). Only a value that cannot work is refused: scalars are the handlers' to coerce, and a field with
    no plain type (anyOf) theirs to read. `pages`: the sizes the call's page can have when it runs, for a `look` zoom box
    outside all of them (such zooms waited 18-24 s behind `perf` in the scene loops). */
export function checkArgs(name: string, args: Record<string, any>, openCwd: string, pages: { width: number; height: number }[] = []): string | null {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return null; // send_feedback checks its own two fields
  const { properties: props, required = [] } = tool.inputSchema as unknown as { properties: Record<string, Field>; required?: string[] };
  const fields = Object.keys(props), has = (k: string) => Object.hasOwn(props, k);
  if (kind(args) !== "object") return `\`${name}\` takes its arguments as an object: ${fields.join(", ")}`;
  // a page tool works on its game's page, so a `cwd` naming that project is what was meant; another project's is not
  const here = (k: string) => k === "cwd" && (!openCwd || resolve(String(args.cwd)) === openCwd);
  const unknown = Object.keys(args).filter(k => args[k] != null && !has(k) && k !== "game" && !here(k));
  if (unknown.length) return unknown.map(k => {
    const alias = Object.hasOwn(ALIASES, k) && has(ALIASES[k]!) ? ALIASES[k] : undefined;
    // within 3 edits and under half the name, so a short name gets no unrelated guess (`frames` is 3 from `game`)
    const near = alias ?? fields.map(f => ({ f, d: edits(k.toLowerCase(), f.toLowerCase()) })).filter(({ d }) => d <= 3 && 2 * d < k.length).sort((x, y) => x.d - y.d)[0]?.f;
    return `\`${name}\` has no \`${k}\`${k === "cwd" ? `: it works on the game opened from ${openCwd}; \`open\` ${resolve(String(args.cwd))} first to work there`
      : near ? `: did you mean \`${near}\`?` : `; its fields are ${fields.join(", ")}`}`;
  }).join("\n");
  const missing: string[] = [];
  for (const f of required) if (args[f] == null) {
    if (f === "cwd" && openCwd) args.cwd = openCwd;
    else missing.push(`\`${name}\` needs \`${f}\`${about(props[f]!)}`);
  }
  if (missing.length) return missing.join("\n");
  for (const [k, v] of Object.entries(args)) {
    const p = has(k) ? props[k]! : undefined, types = [p?.type ?? []].flat();
    if (v == null || !types.some(t => t === "array" || t === "object")) continue;
    let val = v;
    if (typeof v === "string") try { const j = JSON.parse(v); if (typeof j === "object" && types.includes(kind(j))) val = j; } catch {}
    if (!types.includes(kind(val))) return `\`${name}\` \`${k}\` takes ${types.map(an).join(" or ")}, not ${an(kind(v))}${about(p!)}`;
    args[k] = val;
    if (!Array.isArray(val)) continue;
    const { minItems = 0, maxItems = Infinity } = p!, t = p!.items?.type;
    if (val.length < minItems || val.length > maxItems)
      return `\`${name}\` \`${k}\` takes ${minItems === maxItems ? minItems : val.length < minItems ? `at least ${minItems}` : `at most ${maxItems}`} items, not ${val.length}${about(p!)}`;
    const at = typeof t === "string" ? val.findIndex(x => kind(x) !== (t === "integer" ? "number" : t)) : -1;
    if (at >= 0) return `\`${name}\` \`${k}\` takes ${t}s, and its item ${at} is ${an(kind(val[at]))}${about(p!)}`;
  }
  const outside = name === "look" && Array.isArray(args.zoom) ? pages.map(v => zoomOutside(args.zoom, v)) : [];
  return outside.length && outside.every(Boolean) ? outside.at(-1)! : null;
}

function call(name: string, args: Record<string, any>): Promise<Result> {
  const tool = !HIDDEN.includes(name) && TOOL_FNS[name]; // a hidden tool is not called by name either
  if (!tool) throw { code: -32602, message: `unknown tool ${name}` };
  const named = typeof args.game === "string" && args.game.trim() ? args.game.trim() : "main", slot = slotOf(named);
  // the page's size when the call runs, held here: as opened, or an `interact` resize's until the next reload (browser.ts reload())
  const own = { width: slot.opened.size?.[0] ?? VIEWPORT.width, height: slot.opened.size?.[1] ?? VIEWPORT.height }, resized = slot.game?.resized;
  const bad = checkArgs(name, args, slot.cwd, slot.game ? [own, ...resized ? [resized] : []] : []);
  if (bad) return Promise.resolve(fail(bad + REPORT_ASK)); // before the queue, so it never waits behind another call
  // `perf` with optimize runs a trial per switch and the final test, as `check` runs keypoints: the long tools' bound, and
  // no page-error list after it (a reverted switch's error is in its row)
  const optimizing = name === "perf" && !!args.optimize;
  const once = () => answer(name, (async () => {
    use(named);
    let note = "";
    const from = game ? told.get(game) ?? game.errors.length : 0; // a game running in real time can throw between calls
    if (name !== "open" && gone()) { await reopen(); note = `${REOPENED}${newRun()}\n`; }
    else if (game && (FRESH.has(name) || name === "reference" && args.compare)) { // reference reads the page only to compare (#149)
      const print = fingerprint(cwd);
      if (print !== loadedPrint) { await game.reload(); loadedPrint = print; note = reloaded(game.loadMs); }
      else if (hookReset.has(game) && name !== "feel") note = HOOK_RESET; // it reloads anyway
    }
    if (game) hookReset.delete(game);
    const r = await tool(args);
    // after an error's first line and the lines it threw at: a reply that began "Reloaded (sources changed)" read as that (#166)
    if (note && r.content[0]?.type === "text") r.content[0] = { type: "text", text: r.isError ? r.content[0].text.replace(/^.*(\nat .*)*/, l => `${l}\n${note.trimEnd()}`) : note + r.content[0].text };
    if (game && !OWN_ERRORS.has(name) && !optimizing && r.content[0]?.type === "text") r.content[0] = { type: "text", text: r.content[0].text + errorsText(game.errors.slice(from)) };
    if (game) told.set(game, game.errors.length);
    return r;
  })(), () => game, LONG.has(name) || optimizing);
  const arrived = Date.now(), before = running;
  const run = calls.then(async () => {
    const waited = Date.now() - arrived;
    running = name;
    let r = await once(); // answer() turns every failure into a reply, so this never throws
    if (r.isError && body(r).includes(NAVIGATED)) { // an engine's notes can follow the message (answer())
      const again = await once();
      const cause = /\n(Vite reloaded it|The dev server reloaded it)[^\n]*/.exec(body(r))?.[0].slice(1) ?? ""; // the first try's cause, for a second try that ran
      r = again.isError && body(again).includes(NAVIGATED) ? withText(again, body(again).replace(NAVIGATED, NAVIGATED_TWICE)) : again.isError ? again : withText(again, RERAN + (cause && `${cause}\n`) + body(again));
    }
    running = null;
    // both builds: a failed reply asks for a report, since no tester's agent sent one unasked (telemetry 2026-10-20)
    if (FEEDBACK && r.isError && REPORT_ASK && r.content[0]?.type === "text") r = withText(r, body(r) + REPORT_ASK);
    if (waited > 5000) r = withText(r, `Waited ${Math.round(waited / 1000)} s for ${before ? `the \`${before}\` call` : "the calls"} before this one to finish (calls run one at a time).\n` + body(r));
    return r;
  });
  calls = run;
  return run;
}

const heard = new WeakMap<Game, { length: number; last?: string }>(); // where each game's server log stood when its last call began

/** One call's reply from its run p, bound by guarded(): p's result, or its failure as a reply (a hung page, what the
    engine lacks, a navigation under the call, a closed Chrome, a protocol timeout), with the engine's notes after it.
    page() is the call's game; test/engines.test.ts drives an engine's game through here. */
export function answer(name: string, p: Promise<Result>, page: () => Game | null, long?: boolean): Promise<Result> {
  // the dev server's lines since the game's last call began: Vite's reload is a timer on the page's paused clock, so a
  // reload it sent during one call (an `eval`'s lazy import) lands in the next call that steps a frame
  const g0 = page(), log = g0?.serverLog, from = (g0 && heard.get(g0)) ?? { length: 0 };
  if (g0) heard.set(g0, { length: g0.serverLog.length, last: g0.serverLog.at(-1) });
  return guarded(p, name, page, long).catch(async e => {
    const game = page();
    if (e instanceof Hung) return fail(e.message);
    // what Firefox lacks (src/engines.ts), one line for every tool
    if (e instanceof EngineUnsupported) return fail(`${e.what} needs chrome: reopen with browser: chrome`);
    const message = String((e as Error)?.message ?? e);
    // the page navigated under the call (a location.reload() from `eval`, a link): put it back in the harness's
    // paused, seeded state, or every later call fails the same way (twice in a row in an AA-3D cell); at the game's own
    // URL, since a plain reload of an about:blank the code went to never boots (#29)
    // (a recording sees it only at its stop, since its steps sleep in the server: record.ts says so in REC_NAVIGATED)
    // (run() in input.ts follows a step that sent the page to another URL; the rest come here)
    if (game && (NAV_LOST.test(message) || message.includes(REC_NAVIGATED))) {
      const reloaded = await game.reload(undefined, game.url).then(() => true, () => false);
      // the dev server's log line is read after the reload, by which time its output has arrived
      if (reloaded) return fail(message + NAVIGATED + (log === game.serverLog ? reloadCause(game.serverLog, from) : ""));
    }
    // its Chrome closed while the call ran
    if (name !== "open" && gone() && await reopen().then(() => true, () => false))
      return fail(`${message}\nThe harness's Chrome closed while this ran, so the harness opened the game again: paused at frame 0. Run the call again.\n${newRun()}`);
    // puppeteer's "Increase the 'protocolTimeout'" is nothing the agent can do (51 `look` timeouts in AA-3D 2026-10-15).
    // A page that answered pings but not this command for 180 s (a screenshot after Chrome's GPU process died) answered
    // no later call either: it is abandoned as a hung one is.
    const slow = /(\S+) timed out\. Increase the 'protocolTimeout'/.exec(message);
    if (!slow || !game) return fail(message);
    await game.abandon();
    return fail(hung(name, `stopped: the page did not answer ${slow[1]} within 180 s (on a software renderer a frame can take half a second: ask for less per call, fewer frames, a smaller viewport)`).message);
  }).then(r => {
    // the engine's notes since the last call (its install line, no main-thread time), once each; none in Chrome
    const said = page() ? notes(page()!.page) : [];
    if (!said.length) return r;
    const [first, ...more] = r.content;
    return { ...r, content: first?.type === "text" ? [{ ...first, text: `${first.text}\n${said.join("\n")}` }, ...more] : [{ type: "text", text: said.join("\n") }, ...r.content] };
  });
}

/** The result for one JSON-RPC request; throws `{ code, message }` to send a JSON-RPC error. */
async function handle(method: string, params: any): Promise<unknown> {
  switch (method) {
    case "initialize":
      client = [params?.clientInfo?.name, params?.clientInfo?.version].filter(Boolean).join("/") || client;
      void installed(client);
      return { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "paprika3d", title: "paprika3d", version: process.env.PAPRIKA3D_VERSION ?? "0.0.0-src" }, instructions: INSTRUCTIONS };
    case "ping":
      return {};
    case "tools/list":
      return { tools: LISTED };
    case "tools/call": {
      const name = params?.name, args = params?.arguments ?? {}, start = Date.now();
      log(`${name} ${JSON.stringify(args).slice(0, 300)}`);
      const r = await call(name, args).catch(e => { event(name, args, null, Date.now() - start); throw e; });
      // a named budget is a string or an object of limits, so its schema has no enum: its names stand in for one
      const props = { ...(LISTED.find(t => (t as { name: string }).name === name) as { inputSchema?: { properties?: object } } | undefined)?.inputSchema?.properties, ...name === "perf" && { budget: { enum: Object.keys(BUDGETS) } } };
      event(name, args, r, Date.now() - start, { properties: props } as any);
      return r;
    }
    default:
      throw { code: -32601, message: `method not found: ${method}` };
  }
}

/** Splits a byte stream into newline-delimited lines (MCP stdio framing). */
async function* lines(stream: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of stream) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, nl);
      buf = buf.slice(nl + 1);
    }
  }
  if (buf) yield buf;
}

/** Serves MCP on stdin/stdout until stdin closes, then closes the game and its Chrome. */
export async function serve(): Promise<void> {
  const send = (msg: unknown) => { process.stdout.write(JSON.stringify(msg) + "\n"); };
  const stop = async () => {
    await closeGame().catch(() => {});
    for (const v of slots.values()) await v.game?.close().catch(() => {}); await chrome?.then(c => c.close()).catch(() => {}); control?.close(); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  for await (const line of lines(process.stdin)) {
    if (!line.trim()) continue;
    let msg: any;
    try { msg = JSON.parse(line); }
    catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); continue; }
    // A notification (notifications/initialized, cancelled) gets no reply; nor does a response, as the server sends no requests.
    if (msg?.id === undefined || msg.id === null || typeof msg.method !== "string") continue;
    handle(msg.method, msg.params).then(
      (result) => send({ jsonrpc: "2.0", id: msg.id, result }),
      (err) => {
        if (!err?.code) log(`${msg.method}: ${err?.stack ?? err}`);
        send({ jsonrpc: "2.0", id: msg.id, error: err?.code ? err : { code: -32603, message: String(err?.message ?? err) } });
      },
    );
  }
  await stop();
}
