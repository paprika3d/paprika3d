// @paprika3d/three-runtime: the browser-side optimizer layer a game imports once, at the top of its entry file.
// It has to be imported, not injected: only the game's own copy of three can patch its classes and render its
// objects. It finds the renderer through three's devtools hook (listening from import time, before the game
// constructs anything), wraps renderer.render, and runs the enabled switches around each frame.
// Which switches run: window.__harnessConfig.runtime (set by paprika3d before load, so it can measure
// each one) wins over install()'s config, which wins over ./game-runtime.json (what `optimize` kept).
import { ShaderMaterial, WebGLRenderTarget, Color, Raycaster, Vector3, type Camera, type Scene, type WebGLRenderer } from "three";
import { resolution } from "./resolution.ts";
import { defaults } from "./defaults.ts";
import { instancing, originals } from "./instancing.ts";
import { lod } from "./lod.ts";
import { dispose } from "./dispose.ts";
import { staleAll } from "./fresh.ts";

/** One runtime switch, run while it is enabled. A frame is the task (one animation frame callback) that rendered:
    every top-level render in it, so post-processing (scene to a target, a quad to the screen) and a HUD scene drawn
    over the game's (autoClear false) count as one frame. It ends in a microtask after the task's first render. */
export interface Switch {
  enable(r: WebGLRenderer, opts: unknown): void;
  disable(r: WebGLRenderer): void;
  /** Before each top-level render call of the frame, whatever its target. */
  before?(r: WebGLRenderer, scene: Scene, camera: Camera): void;
  /** Once after the frame; ms: the real time all of the frame's render calls took. */
  after?(r: WebGLRenderer, ms: number): void;
  status(): Record<string, unknown>;
}

/** Which switches to run, with each one's options (`true` for defaults); the shape of game-runtime.json. */
export interface RuntimeConfig { switches?: Record<string, unknown> }

// Switches always run in this order, whatever order a config lists them in: instancing groups by the game's own
// geometries before lod swaps in levels, and lod puts the originals back before dispose sweeps.
const SWITCHES: Record<string, Switch> = { resolution, defaults, instancing, lod, dispose };
const on = new Map<string, unknown>();
const w = window as any;
// The fake clock replaces performance.now with virtual time; the prototype's is still the real one.
const realNow = () => Performance.prototype.now.call(performance);

let renderer: WebGLRenderer | null = null, found: WebGLRenderer | null = null, installed = false;
let depth = 0, frameMs = 0, pending = false, toScreen = false;
let hint: { scene?: Scene; camera?: Camera } = {};

const hook: EventTarget = w.__THREE_DEVTOOLS__ ??= new EventTarget();
hook.addEventListener("observe", (e) => {
  const o = (e as CustomEvent).detail;
  if (!(o?.isWebGLRenderer || o?.isWebGPURenderer) || found) return;
  found = o;
  if (installed) attach(o);
});

/** Wraps r.render so enabled switches run around each frame, then enables them on r. */
function attach(r: WebGLRenderer) {
  if (renderer) return;
  renderer = r;
  const render = r.render;
  r.render = (scene, camera) => {
    if (depth) {
      // a render inside a render (Reflector, CubeCamera in onBeforeRender) is part of the outer one; its scene still counts
      // as rendered for dispose, or what only it draws is disposed and uploaded again on every sweep
      if (on.has("dispose")) dispose.before?.(r, scene as Scene, camera);
      return render.call(r, scene, camera);
    }
    staleAll();
    if (!pending) { pending = true; queueMicrotask(() => endFrame(r)); }
    toScreen ||= r.getRenderTarget() === null;
    for (const name in SWITCHES) if (on.has(name)) SWITCHES[name].before?.(r, (hint.scene ?? scene) as Scene, hint.camera ?? camera);
    const t0 = realNow();
    depth++;
    try { render.call(r, scene, camera); } finally { depth--; }
    frameMs += realNow() - t0;
  };
  for (const name in SWITCHES) if (on.has(name)) SWITCHES[name].enable(r, on.get(name));
}

/** Ends the frame once the task that rendered is done; a task that drew only to render targets carries its time on. */
function endFrame(r: WebGLRenderer) {
  pending = false;
  if (!toScreen) return;
  toScreen = false;
  wrapGame(w.__game); // catches a __game the install() trap could not (a `var __game`, or one deleted and assigned again)
  for (const name in SWITCHES) if (on.has(name)) SWITCHES[name].after?.(r, frameMs);
  frameMs = 0;
}

/** Turns a switch on (opts true or its options); unknown names are warned about and ignored. */
export function enable(name: string, opts: unknown = true) {
  if (!SWITCHES[name]) return console.warn(`three-runtime: no switch named ${name}`);
  if (on.has(name)) disable(name);
  on.set(name, opts);
  if (renderer) SWITCHES[name].enable(renderer, opts);
}

/** Turns a switch off and undoes what it changed. */
export function disable(name: string) {
  if (!on.delete(name)) return;
  if (renderer) SWITCHES[name].disable(renderer);
}

/** What is on and what each switch has done, off ones included; observe() carries brief(). */
export function status() {
  const s: Record<string, unknown> = { renderer: !!renderer, switches: [...on.keys()] };
  for (const name in SWITCHES) s[name] = SWITCHES[name].status();
  return s;
}

/** status() of the switches that are on only: an observe with none on carries 31 characters instead of 319. */
function brief() {
  const s: Record<string, unknown> = { renderer: !!renderer, switches: [...on.keys()] };
  for (const name in SWITCHES) if (on.has(name)) s[name] = SWITCHES[name].status();
  return s;
}

/** Adds `runtime: brief()` to the results of game.observe(), once per game object. */
function wrapGame(g: any) {
  if (!g?.observe || g.observe.__runtime) return g;
  const observe = g.observe;
  g.observe = (...a: unknown[]) => {
    const r = observe.apply(g, a);
    return r && typeof r === "object" ? { ...r, runtime: brief() } : r;
  };
  g.observe.__runtime = true;
  return g;
}

/** Reads ./game-runtime.json; anything that is not JSON (vite answers a missing file with index.html) is nothing. */
async function fileConfig(): Promise<RuntimeConfig | null> {
  try {
    const res = await fetch("./game-runtime.json");
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/** Starts the runtime layer: call once at the top of the game's entry file, before the first render.
    The scene and camera come from each render call, so only a renderer made before the import needs passing; a scene
    and camera given here are what the switches work on instead (the game's own, when the screen gets a post-processing quad). */
export async function install(opts: { renderer?: WebGLRenderer; scene?: Scene; camera?: Camera; config?: RuntimeConfig } = {}) {
  if (installed) return;
  installed = true;
  hint = { scene: opts.scene, camera: opts.camera };
  // window.__game may be assigned after install (React effects) and wrapped then, even if no frame follows.
  // A non-configurable __game (a classic script's `var __game`) cannot be trapped; each frame wraps it instead.
  let game = wrapGame(w.__game);
  try {
    Object.defineProperty(w, "__game", { configurable: true, enumerable: true, get: () => game, set: (g) => { game = wrapGame(g); } });
  } catch {}
  const r = opts.renderer ?? found;
  if (r) attach(r);
  const cfg: RuntimeConfig | null = w.__harnessConfig?.runtime ?? opts.config ?? await fileConfig();
  for (const [name, o] of Object.entries(cfg?.switches ?? {})) if (o) enable(name, o);
}

w.__threeRuntime = { enable, disable, status, originals, THREE: { ShaderMaterial, WebGLRenderTarget, Color, Raycaster, Vector3 } };
