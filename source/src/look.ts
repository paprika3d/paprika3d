// look(): what the player would see, and which objects are on screen, without the agent guessing from a picture.
// Pauses the clock, draws the game's last frame to the screen again as things are now (state set since then shows),
// unless that frame drew into a render target (post-processing, a reflection buffer): then the picture is the frame as
// the game drew it, since what it changes between passes (a quad's material, visibility, uniforms) cannot be replayed;
// and saves a screenshot; then draws the biggest scene once more with every object
// in its own flat colour (an ID image) into a render target, counts each colour's pixels in the page, and returns
// each visible object's coverage and box, plus the objects no look of this run has seen yet.
// The ID pass is one override ShaderMaterial (an objectId uniform plus gl_InstanceID, so each instance of an
// InstancedMesh gets its own id) whose own onBeforeRender sets the id for each draw: three calls it with the object
// being drawn, so nothing of the game is patched. Counting happens in the page and the image comes back as a PNG,
// since returning raw pixels through page.evaluate takes seconds. Its classes come from the game's own three when it
// imports @paprika3d/three-runtime, else from a second copy of the same revision; a second copy can only build passive
// objects (a material, a render target) that the game's renderer then uses.
// views(): one named object alone from four angles in one picture, for checking a shape the game's camera shows from one side.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import type { Game, HarnessPage } from "./browser.ts";
import { VIEWPORTS } from "./contract.ts";
import { act, gameUp, play, GAME_LATE, type Step } from "./input.ts";
import { fingerprint } from "./fingerprint.ts";
import { harnessDir } from "./state.ts";
import { SETUP } from "./lighting.ts";
import { COPLANAR } from "./surfaces.ts";

/** One object (or one instance, `name[i]`) on screen: its share of the canvas's pixels and its box in the picture's pixels. */
export interface OnScreen { name: string; coverage: number; bbox: [x0: number, y0: number, x1: number, y1: number]; approximate?: true;
  /** a thin or long object's two largest world sides, and which way its long side runs against the camera's (on the ground) */ extent?: [number, number]; runs?: "along the view" | "across the view" }

/** A named object no look of this run has seen: the longest side of its world box and where it is against the camera.
    `group`: its nearest named ancestor below the scene; `own`: what covers it (`over`) is inside that ancestor. */
export interface NeverVisible { name: string; size: number; where: "in view" | "behind the camera" | "outside the view" | "no geometry" | "hidden" | "own shader"; over?: string; group?: string; own?: true }

/** A page element over the canvas (`__harness.covers()`): the share of the canvas it shows over and of the clicks there it takes. */
export interface Cover { what: string; over: number; clicks: number; opacity: number; background: string | null }

/** look()'s answer; picture and ids are PNG paths in the run folder. */
/** The game's subject in this look: `__game.subject` or a guess (`set` false), its share of the picture and box, how many of
    its named parts drew a pixel, and which are in view but covered (and by what). `absent`: __game.subject names nothing.
    `contrast`: mean brightness and saturation (0–1) of its pixels and of a ring around its box, and the mean brightness step across its outline. */
export interface Subject { name: string; set: boolean; /** what __game.subject named when it matched nothing in the scene */ asked?: string; share: number; bbox: OnScreen["bbox"] | null; parts: number; drew: number; covered: [string, string | null][]; edge: boolean; /** this game already said the camera hint for this subject, so it is not said again */ hintSaid?: boolean;
  /** no pixel, and part of it is drawn by its own shader or see-through, which the ID image cannot find: its share is not measured */ unseen?: true;
  contrast?: { bright: [number, number]; sat: [number, number]; edge: number } }
/** The picture's pixels: mean brightness and colour saturation (0–1), the share near black and blown out to white, and the
    share of an 80 × 50 grid that changed since the last look (null on the first). */
export interface Pixels { brightness: number; saturation: number; black: number; blown: number; changed: number | null; /** frames since the last look, under reduced motion */ reduced?: number;
  /** shares of all pixels by hue (red under 15° or from 345°, orange to 45°, yellow to 70°, green to 165°, cyan to 200°, blue to 260°, violet to 290°, magenta to 345°); grey is saturation under 25% or brightness under 10% */ hues: Record<string, number>;
  /** the same over the pixels objects drew (the id pass), with their share of the canvas; absent with no id pass or under a `veil`.
      `rest`: the hues without the one object over half the frame (a ground or sky), named, so it does not hide the rest's colours (#178) */ objects?: { share: number; brightness: number; saturation: number; black: number; hues: Record<string, number>; rest?: { name: string; share: number; hues: Record<string, number> } } }
/** The canvas: its drawing buffer and CSS size, the page's DPR, the renderer's pixel ratio (null without three.js), and
    whether its size followed the page's when the page narrowed (null when not tried; "fixed": a fixed buffer CSS scales at its shape). */
export interface Canvas { buffer: [number, number]; css: [number, number]; dpr: number; ratio: number | null; resized: boolean | "fixed" | null }
/** The page-canvas seam (`__harness.seam()`): what shows through a transparent canvas, and the HTML over it (labels, and
    the page's own HUD, menus and controls). */
export interface Seam {
  behind: { clear: number; open: number; background: string; texts: { what: string; shows: number }[]; more: number } | null;
  labels: { count: number; kinds: string[]; overlap: number; off: number; cut: number; list: { what: string; box: OnScreen["bbox"] | null; overlaps: boolean; cut: boolean }[] } | null;
}
export interface Look { picture: string; ids: string; onScreen: OnScreen[]; neverVisible: NeverVisible[];
  /** background below the horizon (past the world's edge): its share of the picture and its box */ edge?: { share: number; bbox: OnScreen["bbox"] };
  /** named objects an earlier look of this run saw that are now behind the camera or outside the view */ left?: { name: string; where: string; group?: string }[]; covers: Cover[]; subject: Subject | { name: string; absent: true } | null; pixels?: Pixels; canvas?: Canvas; seam?: Seam;
  /** an opaque page element over 90% or more of the canvas (its `what`): the picture's pixels are its, so Surface, Depth, Stands out and the objects' hues are left out */ veil?: string;
  /** the Canvas line is the last look's and flags nothing, or the page named it in __game.intentional, so the reply leaves it out */ canvasSame?: boolean;
  /** the fault lines, Canvas line and never-visible names left out because the page named them in __game.intentional: how many per piece */ known?: Record<string, number>;
  /** the Lighting, Surfaces and Surface lines are the last look's, so the reply says so in one line */ faultsSame?: boolean;
  /** fault lines the last look printed that this one lacks, in the last look's words: only after an edit, at the same frame and camera */ closed?: string[];
  /** the page's frame (FRAME) this look pictured */ frame?: number;
  /** the sizes of the render targets the last frame drew into when none of its calls drew to the screen (#130) */ offscreen?: string[];
  /** no part of the picture changed since the last look, though these keys of observe() did, top-level numbers aside (#130) */ unchanged?: string[];
  /** the Pixels, Hues and Stands out numbers are within 5 points of the last look's: the reply folds them unless one flags something */ numbersSame?: boolean;
  /** mean [brightness, saturation] of the nearest and farthest third of named objects (9 or more on screen), and whether the scene has fog */
  depth?: { near: [number, number]; far: [number, number]; fog: boolean };
  /** `Lighting: …` lines, the setup faults src/lighting.ts finds in the live scene */ setup?: string[];
  /** `Surfaces: …` lines, the coplanar faces src/surfaces.ts finds in the live scene */ surfaces?: string[];
  /** the coplanar check's note when its work or triangle limit ran out before every mesh was compared */ unchecked?: string[];
  /** the largest object over 15% of the picture: its fine detail (of 255) and its strongest repeat (correlation, period in px, across or down) */
  surface?: { name: string; share: number; detail: number; repeat?: number; every?: number; across?: boolean; ms: number } }

/** The World's edge line: background where ground should be, below the horizon. */
export const edgeText = (e: Look["edge"]) => e ? [`World's edge: ${Math.round(e.share * 100)}% of the picture is background below the horizon, in [${e.bbox.join(", ")}], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.`] : [];

/** The page elements over the canvas, a line each, or nothing when none is. */
export function coversText(covers: Cover[]): string[] {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return covers.map(c => {
    const look = [c.opacity < 1 && `opacity ${c.opacity}`, c.background && `background ${c.background}`].filter(Boolean).join(", ");
    const shows = c.over ? `shows over ${pct(c.over)} of it${look ? ` (${look})` : ""}` : "";
    const takes = c.clicks ? `takes the clicks on ${pct(c.clicks)} of it${c.over ? "" : " though it shows nothing"} (listeners on the canvas miss them)` : "";
    return `Over the canvas: ${c.what} ${[shows, takes].filter(Boolean).join(" and ")}.`;
  });
}

// The scene look() draws: the one with the most children, with the renderer and camera that last drew it.
// `__harness.lookCam` (`look` `camera`) stands in for the game's camera for one picture: a copy the game's own code
// never moves, where moving the game's camera was undone by a game that sets it every frame (AA-3D air-hockey).
// render(scene, undefined) records a view before three throws, so `undefined === undefined` read lookCam.to (#63): say so instead
const VIEW = "const h = window.__harness, [scene, { renderer: r, camera: c0 }] = h.main(), camera = c0 && h.lookCam?.from === c0 ? h.lookCam.to : c0;"
  + " if (!camera) throw new Error('the page\\'s last render of its scene had no camera (renderer.render(scene, camera) was called with camera undefined): fix the camera, step a frame with `interact` { steps: [{ wait: 1 }] } and look again');";

// Draws the game's last frame again through the unwrapped render: its top-level render and clear calls in order, each
// with the render target and autoClear flags it had, so a HUD drawn over the scene is in the picture and the redraw is
// not one of the game's frames. A page with no recorded frame gets the scene above.
// Other state the game changes between its calls (viewport, scissor, a material or uniform a pass swaps, what it hides
// for one pass) is as the frame left it, so look() replays only a frame drawn straight to the screen: an aurora
// whose glow pass and upscale share one quad came out with the whole frame added to its sky (rgb 13,17,25 pictured
// as 70,83,105), and an agent spent nine calls proving the picture wrong. A camera moved for one picture still needs it.
const DRAW = `(() => { const h = window.__harness, saved = new Map();
  let frame = h.frame;
  if (!frame.length) { ${VIEW} frame = [{ r, target: null, scene, camera, auto: [true, true, true, true] }]; }
  h.depth++;
  try {
    for (const e of frame) {
      const r = e.r;
      if (!saved.has(r)) saved.set(r, [r.getRenderTarget(), r.autoClear, r.autoClearColor, r.autoClearDepth, r.autoClearStencil, { ...r.info.render }, r.toneMapping, r.outputColorSpace]);
      r.setRenderTarget(e.target);
      if (e.clear) r.clear(...e.clear);
      else { [r.autoClear, r.autoClearColor, r.autoClearDepth, r.autoClearStencil] = e.auto; if (e.out) [r.toneMapping, r.outputColorSpace] = e.out; h.raw.get(r).call(r, e.scene, e.camera && h.lookCam?.from === e.camera ? h.lookCam.to : e.camera); }
    }
  } finally {
    h.depth--;
    for (const [r, [target, a, c, d, s, info, tone, space]] of saved) {
      r.setRenderTarget(target); r.autoClear = a; r.autoClearColor = c; r.autoClearDepth = d; r.autoClearStencil = s; r.toneMapping = tone; r.outputColorSpace = space;
      Object.assign(r.info.render, info);
    }
  }
})()`;

// In the page, for PIXELS (the frame) and PASS (the objects): hue buckets at the colours' names (yellow 45-70°, green 70-165°: even
// 45° bands put pure yellow in orange and yellow-green grass in yellow, opinion-5, opinion-6); grey is saturation under 25% or brightness under 10%.
const HUE = `const HUES = ["red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "grey"];
  const bucket = (r, g, b, hi, lo, l, sa) => { if (sa < 0.25 || l < 0.1) return 8; const k = hi - lo, h = hi === r ? ((g - b) / k + 6) % 6 : hi === g ? (b - r) / k + 2 : (r - g) / k + 4; const d = h * 60; return d < 15 || d >= 345 ? 0 : d < 45 ? 1 : d < 70 ? 2 : d < 165 ? 3 : d < 200 ? 4 : d < 260 ? 5 : d < 290 ? 6 : 7; };`;

// Runs in the page with the fallback three URL. window.__harnessLook keeps the material between looks of one page load.
const PASS = `(async (url, shot) => { ${HUE}
  ${VIEW} const L = window.__harnessLook ??= {};
  // a mesh seen through: transparent below half opacity, or transparent without writing depth (an additive beam)
  L.see = o => { const m = [o.material].flat()[0]; return !!(o.isMesh && m?.transparent && m.opacity < 0.5); };
  // shortcut: the node material keeps FrontSide and solid draws for every object (no per-draw hook), so #60 and #91 stay on WebGPU; give it one if a WebGPU game hits them
  if (!L.mat && r.isWebGPURenderer) { // a node material: WebGPURenderer draws no GLSL, on either of its backends
    const R = window.__threeRuntime?.THREE, T = R?.MeshBasicNodeMaterial ? R : await import(url);
    L.from = T === R ? "runtime" : url;
    L.T = T;
    const { uniform, instanceIndex, int, float, vec4 } = T.TSL;
    const id = uniform(0, "int").onObjectUpdate(({ object }) => L.ids.get(object) ?? 0), n = id.add(int(instanceIndex));
    const byte = (k) => float(n.shiftRight(k).bitAnd(255)).div(255);
    // the material's class is the game's own (its renderer's library): TSL's assign needs the stack of the copy of three that
    // builds the shader, so a second copy's (Vite prebundles the game's) dropped instancing (#137) and threw in setupFog (#134)
    L.mat = new (r.library?.getMaterialNodeClass?.("MeshBasicMaterial") ?? T.MeshBasicNodeMaterial)();
    L.mat.fog = false; // fog would mix the ids with its colour
    L.mat.fragmentNode = vec4(byte(0), byte(8), byte(16), 1); // the whole output: no tone mapping or colour space
  }
  if (!L.mat) {
    const T = window.__threeRuntime?.THREE ?? await import(url);
    L.from = window.__threeRuntime?.THREE ? "runtime" : url;
    L.T = T;
    L.mat = new T.ShaderMaterial({
      glslVersion: "300 es",
      uniforms: { objectId: { value: 0 }, pointSize: { value: 1 }, pointScale: { value: 0 } },
      vertexShader: \`flat out int vInst; uniform float pointSize, pointScale;
        #include <common>
        #include <batching_pars_vertex>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        void main() {
          #include <batching_vertex>
          #include <skinbase_vertex>
          #include <morphinstance_vertex>
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          #include <project_vertex>
          gl_PointSize = pointScale > 0.0 && isPerspectiveMatrix(projectionMatrix) ? pointSize * pointScale / -mvPosition.z : pointSize; // three's points_vert
          #ifdef USE_INSTANCING
            vInst = gl_InstanceID;
          #else
            vInst = 0;
          #endif
        }\`.replace(/#include <([a-z_]+)>/g, (inc, name) => !T.ShaderChunk || name in T.ShaderChunk ? inc : ""), // an older three lacks newer chunks (r160 has no morphinstance_vertex)
      fragmentShader: \`flat in int vInst; uniform int objectId; out vec4 outColor;
        void main() { int id = objectId + vInst;
          outColor = vec4(float(id & 255) / 255.0, float((id >> 8) & 255) / 255.0, float((id >> 16) & 255) / 255.0, 1.0); }\`,
    });
    L.mat.onBeforeRender = (r, _s, _c, _g, o, grp) => {
      const u = L.mat.uniforms, m0 = Array.isArray(o.material) ? o.material[grp?.materialIndex ?? 0] : o.material, m = o.isPoints ? m0 : null; // unset, gl_PointSize is undefined
      u.objectId.value = L.ids.get(o) ?? 0; u.pointSize.value = m?.size ?? 1;
      u.pointScale.value = m?.sizeAttenuation ? (r.getRenderTarget()?.height ?? r.domElement.height) / 2 : 0; L.mat.uniformsNeedUpdate = true;
      // each draw culls and writes depth as its own material does (three r186 reads side and depthWrite in state.setMaterial,
      // after this call, and neither recompiles): a BackSide sky was culled (blender-pilot-2, #60) and a see-through beam hid the
      // flag behind it (natural-1, #91); a see-through mesh draws nothing here
      const see = L.see(o);
      L.mat.side = m0?.side ?? 0; L.mat.depthWrite = !see && m0?.depthWrite !== false; L.mat.colorWrite = !see;
    };
  }

  // Ids from 1 (0 is the cleared background); an InstancedMesh takes one per instance. A material that refuses the
  // override (allowOverride false) would draw itself into the image, so its object is hidden for the pass. So is a shadow
  // catcher (ShadowMaterial, stage()'s default ground): it draws only shadows, and as an object it read as a flat floor
  // with a world's edge on every product page (feel-5, four of four).
  const objs = [], hidden = [], names = new Set(), seenNames = new Set();
  // an unnamed part goes by its nearest named ancestor below the scene: "Mesh" was most lines of every look (natural-1, #93)
  const named = o => { for (let a = o; a && a !== scene; a = a.parent) if (a.name) return a.name; return ""; };
  L.ids = new Map();
  let next = 1;
  scene.traverse(o => {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
    if ([o.material].flat().some(m => m?.allowOverride === false || m?.isShadowMaterial)) { if (o.visible) hidden.push(o); return; }
    L.ids.set(o, next);
    objs.push(o);
    if (o.name) names.add(o.name); // neverVisible lists named objects only
    next += o.isInstancedMesh ? Math.max(o.count, 1) : 1;
  });
  const owner = new Int32Array(next).fill(-1);
  objs.forEach((o, i) => owner.fill(i, L.ids.get(o), L.ids.get(o) + (o.isInstancedMesh ? Math.max(o.count, 1) : 1)));

  const w = r.domElement.width, ht = r.domElement.height, buf = new Uint8Array(w * ht * 4);
  const rt = new (r.isWebGPURenderer ? L.T.RenderTarget : L.T.WebGLRenderTarget)(w, ht); // no MSAA, so edges never blend two ids
  const prev = { override: scene.overrideMaterial, bg: scene.background, target: r.getRenderTarget(),
    clear: r.getClearColor(new L.T.Color()), alpha: r.getClearAlpha(), info: { ...r.info.render } };
  h.depth++; // the pass's clear and render are not the game's frame
  try {
    for (const o of hidden) o.visible = false;
    scene.overrideMaterial = L.mat;
    scene.background = null;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear();
    // The runtime's auto-instancing draws its grouped originals here instead of their instances, so ids name them.
    (window.__threeRuntime?.originals ?? (f => f()))(() => h.raw.get(r).call(r, scene, camera));
    if (!r.isWebGPURenderer) r.readRenderTargetPixels(rt, 0, 0, w, ht, buf);
    else if (!r.backend.isWebGPUBackend) { // WebGPURenderer's own read on its WebGL 2 backend waits on a fence it polls with rAF, which the paused clock never runs
      const gl = r.getContext(), { textureGPU } = r.backend.get(rt.texture), fb = gl.createFramebuffer(), was = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureGPU, 0);
      gl.readPixels(0, 0, w, ht, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, was);
      gl.deleteFramebuffer(fb);
    } else { // WebGPU reads rows top-down, each padded to 256 bytes
      const got = new Uint8Array((await r.readRenderTargetPixelsAsync(rt, 0, 0, w, ht)).buffer);
      for (let row = 0, stride = Math.ceil(w * 4 / 256) * 256; row < ht; row++) buf.set(got.subarray(row * stride, row * stride + w * 4), (ht - 1 - row) * w * 4);
    }
  } finally {
    h.depth--;
    for (const o of hidden) o.visible = true;
    scene.overrideMaterial = prev.override;
    scene.background = prev.bg;
    r.setRenderTarget(prev.target);
    r.setClearColor(prev.clear, prev.alpha);
    Object.assign(r.info.render, prev.info); // the pass is not one of the game's frames
    rt.dispose();
  }

  // A material that places its own vertices (a ShaderMaterial, or a built-in one changed in onBeforeCompile: a sky dome at
  // gl_Position.xyww, wind-bent trees) draws elsewhere than the id pass, which uses three's own vertex code.
  // A see-through mesh draws nothing in the pass (L.see), so it is listed with them.
  const own = o => L.see(o) || [o.material].flat().some(m => m?.isShaderMaterial || (m && Object.hasOwn(m, "onBeforeCompile")));

  // where the canvas sits on the page, so boxes come back in the picture's pixels rather than the drawing buffer's
  const rect = r.domElement.getBoundingClientRect();
  // The screenshot (CSS pixels, the whole page) scaled onto the drawing buffer, rows top-down, so pixel t matches buf's.
  // shot is null when PIXELS already decoded this look's screenshot and left it in window.__harnessShot
  const sc = new OffscreenCanvas(w, ht), sx = sc.getContext("2d"), bm = shot ? await createImageBitmap(await (await fetch("data:image/png;base64," + shot)).blob()) : window.__harnessShot;
  delete window.__harnessShot;
  sx.drawImage(bm, rect.left, rect.top, rect.width, rect.height, 0, 0, w, ht);
  const sd = sx.getImageData(0, 0, w, ht).data;
  const lum = (t) => (0.2126 * sd[t] + 0.7152 * sd[t + 1] + 0.0722 * sd[t + 2]) / 255;
  const sat = (t) => { const hi = Math.max(sd[t], sd[t + 1], sd[t + 2]), lo = Math.min(sd[t], sd[t + 1], sd[t + 2]); return hi ? (hi - lo) / hi : 0; };

  // Count each id's pixels, box and screenshot brightness and saturation (GL rows run bottom-up) and paint the PNG in bright hashed colours.
  // O: the total over every pixel an object drew (count, brightness, saturation, near black, then the 9 hue buckets), for the Hues line;
  // H: each id's 9 hue buckets, so the one object over half the frame can be left out of the objects' hues (#178)
  // cnt, bx: each id's pixel count and box in typed arrays (a Map lookup a pixel was the loop's slowest step), made into
  // seen in first-drawn order after it; a stray id past next (a shader that ignored the override) counts at next, which no object owns
  const B = new Float64Array(next), S = new Float64Array(next), O = new Float64Array(13), H = new Int32Array(9 * next + 9), cnt = new Int32Array(next + 1), bx = new Int32Array(4 * next + 4), first = [];
  // background below the horizon's row is past the world's edge (above it is sky): three of three reviewers walked the
  // template's player to where the void showed, and no line said so (opinion-3, opinion-4); a scene with fog may hide it.
  // Only with ground under the camera (most of the bottom row drawn): a product on a plain backdrop has no ground to end
  const fwd = camera.getWorldDirection(camera.position.clone()); fwd.y = 0;
  let horizon = -1; // looking straight down: all of it is below
  if (fwd.lengthSq() > 1e-8) { const q = camera.getWorldPosition(camera.position.clone()).add(fwd.normalize().multiplyScalar(camera.far * 0.9 || 1e4)).project(camera); horizon = (1 - q.y) / 2 * ht; }
  const V = [0, Infinity, Infinity, -1, -1, 0]; // count and box of the void, then the bottom row's drawn pixels
  const c = document.createElement("canvas"); c.width = w; c.height = ht;
  const ctx = c.getContext("2d"), img = ctx.createImageData(w, ht), px = img.data;
  for (let row = 0; row < ht; row++) {
    const y = ht - 1 - row;
    for (let x = 0; x < w; x++) {
      const s = (row * w + x) * 4, t = (y * w + x) * 4;
      const id = buf[s] | (buf[s + 1] << 8) | (buf[s + 2] << 16);
      px[t + 3] = 255;
      if (!row && id) V[5]++;
      if (!id) { if (y > horizon && !scene.fog) { V[0]++; if (x < V[1]) V[1] = x; if (y < V[2]) V[2] = y; if (x > V[3]) V[3] = x; if (y > V[4]) V[4] = y; } continue; }
      const R = sd[t], G = sd[t + 1], Bl = sd[t + 2], hi = Math.max(R, G, Bl), lo = Math.min(R, G, Bl), l = lum(t), sa = hi ? (hi - lo) / hi : 0;
      const hb = bucket(R, G, Bl, hi, lo, l, sa), q = id < next ? id : next, b4 = 4 * q;
      B[id] += l; S[id] += sa; O[0]++; O[1] += l; O[2] += sa; if (hi < 16) O[3]++; O[4 + hb]++; H[9 * q + hb]++;
      const k = Math.imul(id, 0x9e3779b1) >>> 0;
      px[t] = 64 + (k & 0xbf); px[t + 1] = 64 + ((k >> 8) & 0xbf); px[t + 2] = 64 + ((k >> 16) & 0xbf);
      if (!cnt[q]++) { first.push(q); bx[b4] = bx[b4 + 2] = x; bx[b4 + 1] = bx[b4 + 3] = y; }
      else { if (x < bx[b4]) bx[b4] = x; if (x > bx[b4 + 2]) bx[b4 + 2] = x; if (y < bx[b4 + 1]) bx[b4 + 1] = y; if (y > bx[b4 + 3]) bx[b4 + 3] = y; }
    }
  }
  ctx.putImageData(img, 0, 0);
  const seen = new Map(first.map(id => [id, [cnt[id], bx[4 * id], bx[4 * id + 1], bx[4 * id + 2], bx[4 * id + 3]]]));
  // A thin or long object's two largest sides and whether it runs along or across the view: a start line turned 90° ran
  // down the road through 25 looks unflagged (a6f6e9cf). Geometry box times matrixWorld's column lengths, no vertex walk.
  const XM = camera.matrixWorld.clone(), XV = camera.position.clone(), UP = camera.up.clone().normalize(), GF = camera.getWorldDirection(camera.position.clone());
  GF.addScaledVector(UP, -GF.dot(UP));
  const extent = (o, i) => {
    const g = o.geometry;
    if (!g?.isBufferGeometry || o.isSprite || o.isPoints) return null;
    g.boundingBox ?? g.computeBoundingBox();
    if (o.isInstancedMesh) { o.getMatrixAt(i, XM); XM.premultiply(o.matrixWorld); } else XM.copy(o.matrixWorld);
    const s = g.boundingBox.getSize(XV), e = XM.elements, len = [0, 1, 2].map(k => s.getComponent(k) * Math.hypot(e[4 * k], e[4 * k + 1], e[4 * k + 2]));
    const [a, b, c] = [0, 1, 2].sort((p, q) => len[q] - len[p]);
    if (!len[a] || !(len[a] >= 3 * len[b] || len[c] < len[a] / 10)) return null;
    const L = XV.set(e[4 * a], e[4 * a + 1], e[4 * a + 2]), full = L.length(); L.addScaledVector(UP, -L.dot(UP)); // on the ground, by camera.up
    const ax = L.length(), cos = ax && GF.lengthSq() > 1e-8 ? Math.abs(L.dot(GF)) / (ax * GF.length()) : 0;
    // only for a clear long side (twice the next: a 600 × 400 field has no direction), within 60° of the ground (not a
    // pole), and a camera not looking straight down
    const runs = len[a] < 2 * len[b] || ax < 0.5 * full || GF.lengthSq() < 1e-8 ? null : cos > Math.cos(Math.PI / 6) ? "along the view" : cos < Math.cos(Math.PI / 3) ? "across the view" : null;
    return [+len[a].toPrecision(3), +len[b].toPrecision(3), runs];
  };
  const entries = [];
  for (const [id, [n, x0, y0, x1, y1]] of seen) {
    const o = objs[owner[id]];
    if (!o) continue; // a stray colour (a shader that ignored the override)
    const nm = named(o), name = nm || o.type, base = L.ids.get(o);
    if (nm) seenNames.add(nm);
    // a sprite, or a shader that places its own vertices (a full-screen quad), draws elsewhere than the id pass does
    const shader = own(o);
    entries.push([o.isInstancedMesh ? name + "[" + (id - base) + "]" : name, n, x0, y0, x1, y1, !!o.isSprite || shader, extent(o, id - base)]);
  }
  // What is named but drew no pixel: its world size and where it is, so a model loaded at the wrong scale is named.
  // Box3 comes from a geometry's bounding box (Frustum is not reachable from an instance, so the box's corners are projected).
  const missing = new Map();
  // What is drawn where an object that drew nothing would be: at its box's centre, else at most of its corners in view.
  const nameAt = (x, y) => {
    if (Math.abs(x) > 1 || Math.abs(y) > 1) return null;
    const i = Math.min(w - 1, Math.floor((x + 1) / 2 * w)), j = Math.min(ht - 1, Math.floor((y + 1) / 2 * ht)), s = (j * w + i) * 4;
    const o = objs[owner[buf[s] | (buf[s + 1] << 8) | (buf[s + 2] << 16)]];
    return o ? named(o) || o.type : null;
  };
  const over = (box, self, v) => {
    const at = (p) => (v.copy(p).project(camera), v.z <= 1 ? nameAt(v.x, v.y) : null), n = new Map();
    const mid = at(box.getCenter(v.clone()));
    if (mid && mid !== self) return mid;
    for (let i = 0; i < 8; i++) {
      const k = at(v.clone().set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      if (k && k !== self) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  // the nearest named ancestor below the scene: a kart's 60 parts were 60 never-visible entries a look (1c17107f). Not a
  // container of other named groups (a "world" or "level" root), whose one entry would hide each model's size and place.
  const nested = new Map(), hasNamed = x => { let n = false; x.traverse(y => { n ||= y !== x && !!y.name; }); return n; };
  const container = a => nested.get(a) ?? nested.set(a, a.children.some(function inner(c) { return c.name ? hasNamed(c) : c.children.some(inner); })).get(a);
  const groupOf = o => { for (let a = o.parent; a && a !== scene; a = a.parent) if (a.name) return container(a) ? null : a; return null; };
  let Box3;
  objs.find(o => o.geometry && (o.geometry.boundingBox ?? o.geometry.computeBoundingBox(), Box3 = o.geometry.boundingBox.constructor));
  if (Box3) for (const o of objs) {
    if (!o.name || seenNames.has(o.name) || missing.has(o.name)) continue;
    const g = groupOf(o);
    // hidden by the game (culled around its own camera, hidden for a pass) or drawn where the pass cannot follow: not
    // "never visible in view", which sent agents looking for objects that were fine (AA-3D full-1, excavator and aurora)
    let shown = true;
    for (let x = o; x; x = x.parent) if (!x.visible) { shown = false; break; }
    if (!shown || own(o)) { missing.set(o.name, [0, shown ? "own shader" : "hidden", null, g?.name]); continue; }
    const box = new Box3().setFromObject(o);
    // an empty particle pool (burst() before its first emit) is not missing: "sparks (0 units, no geometry)" on every look (opinion-3, opinion-4)
    if (box.isEmpty()) { if (o.isPoints) names.delete(o.name); else missing.set(o.name, [0, "no geometry", null, g?.name]); continue; }
    const size = box.getSize(camera.position.clone()), v = camera.position.clone();
    let behind = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      if (v.z > 1) behind++;
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const where = behind === 8 ? "behind the camera" : x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1 ? "outside the view" : "in view";
    const ov = where === "in view" ? over(box, o.name, v) : null;
    missing.set(o.name, [+Math.max(size.x, size.y, size.z).toPrecision(3), where, ov, g?.name, !!g && !!ov && (ov === g.name || !!g.getObjectByName(ov))]);
  }
  // Depth: whether far objects come out lighter and paler than near ones, by each object's box centre from the camera.
  // shortcut: each instance is its own object and numbered names stay apart (as coverage counts them); group them if one big instanced field skews the thirds.
  let depth = null;
  if (Box3) {
    const eye = camera.getWorldPosition(camera.position.clone()), v = eye.clone(), M = camera.matrixWorld.clone(), at = [];
    for (const [id, [k]] of seen) {
      const o = objs[owner[id]], g = o?.geometry;
      if (!o?.name || !g || k < 0.001 * w * ht) continue;
      g.boundingBox ?? g.computeBoundingBox();
      if (o.isInstancedMesh) { o.getMatrixAt(id - L.ids.get(o), M); M.premultiply(o.matrixWorld); } else M.copy(o.matrixWorld);
      const box = g.boundingBox.clone().applyMatrix4(M);
      if (!box.isEmpty()) at.push([box.getCenter(v).distanceTo(eye), B[id] / k, S[id] / k]);
    }
    if (at.length >= 9) {
      at.sort((a, b) => a[0] - b[0]);
      const third = Math.floor(at.length / 3), near = at.slice(0, third), far = at.slice(-third);
      const mean = (xs, i) => +(xs.reduce((s, x) => s + x[i], 0) / xs.length).toFixed(3);
      depth = { near: [mean(near, 1), mean(near, 2)], far: [mean(far, 1), mean(far, 2)], fog: !!scene.fog };
    }
  }
  // Surface: the largest object over 15% of the picture (its pieces counted together by name, as a chunked terrain is),
  // inside its own pixels on a half-size copy of the screenshot: its fine detail (mean absolute Laplacian of brightness,
  // of 255; AA-3D sailboat's sea JC called bad read 45, the one he called excellent 11) and how strongly its pattern
  // repeats (the highest autocorrelation peak of its high-passed brightness at 8 to 128 px, after the first dip below
  // zero), which a tiling texture shows. A sky dome (BackSide) is left out: it is meant to be smooth.
  let surface = null;
  try {
    const t0 = __clock.realNow(), area = new Map();
    for (const [id, [k]] of seen) {
      const o = objs[owner[id]];
      if (!o?.isMesh || [o.material].flat()[0]?.side === 1) continue;
      const key = o.name || o, a = area.get(key) ?? { n: 0, ids: [], o };
      a.n += k; a.ids.push(id); area.set(key, a);
    }
    const top = [...area.values()].sort((a, b) => b.n - a.n)[0], bn = top?.n ?? 0, mine = new Uint8Array(next);
    if (top) for (const id of top.ids) mine[id] = 1;
    if (top && bn > 0.15 * w * ht) {
      const W = w >> 1, H = ht >> 1, D = new Float32Array(W * H), M = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let sum = 0, all = 1;
        for (let k = 0; k < 4; k++) {
          const X = 2 * x + (k & 1), Y = 2 * y + (k >> 1), b = ((ht - 1 - Y) * w + X) * 4;
          if (!mine[buf[b] | (buf[b + 1] << 8) | (buf[b + 2] << 16)]) all = 0;
          sum += lum((Y * w + X) * 4);
        }
        D[y * W + x] = sum / 4; M[y * W + x] = all;
      }
      // the high pass: each pixel less the mean of the 9 × 9 around it, kept only where that window is all this object
      const I = new Float64Array((W + 1) * (H + 1)), C = new Int32Array((W + 1) * (H + 1)), r9 = 4;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y + 1) * (W + 1) + x + 1;
        I[i] = D[y * W + x] * M[y * W + x] + I[i - 1] + I[i - W - 1] - I[i - W - 2];
        C[i] = M[y * W + x] + C[i - 1] + C[i - W - 1] - C[i - W - 2];
      }
      const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
      // idx: the valid pixels in scan order, which corr walks instead of the whole picture (the same sums in the same order).
      // P and V run 65 columns and rows past the picture (the longest lag), so a lag off its edge reads V = 0, P = 0.
      const Wp = W + 65, P = new Float32Array(Wp * (H + 65)), V = new Uint8Array(Wp * (H + 65)), idx = new Int32Array(W * H);
      let lap = 0, nl = 0;
      for (let y = r9; y < H - r9; y++) for (let x = r9; x < W - r9; x++) {
        const i = y * W + x, ip = y * Wp + x;
        if (!M[i] || box(C, x - r9, y - r9, x + r9 + 1, y + r9 + 1) < 81) continue;
        V[ip] = 1; P[ip] = D[i] - box(I, x - r9, y - r9, x + r9 + 1, y + r9 + 1) / 81; idx[nl] = ip;
        lap += Math.abs(4 * D[i] - D[i - 1] - D[i + 1] - D[i - W] - D[i + W]); nl++;
      }
      if (nl > 2000) {
        // the pattern's peak: a local maximum of the correlation over lags 4 to 64 (8 to 128 px), the shortest within 0.05 of the highest
        let peak = null;
        // its own small function: inline in this long one, which runs once a page load, V8 ran it at about 8 ns a step.
        // No branch: a pair with an invalid end adds exact zeros (b is 0 there, m is 0), so the sums match a skip.
        // Four lags (offsets o, o + s, o + 2s, o + 3s) a walk, each summed in its own order: one read of the list for four.
        const r = (ab, aa, bb, n) => n > 1000 && aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
        const corr4 = (o, s, c) => {
          let ab0 = 0, aa0 = 0, bb0 = 0, n0 = 0, ab1 = 0, aa1 = 0, bb1 = 0, n1 = 0, ab2 = 0, aa2 = 0, bb2 = 0, n2 = 0, ab3 = 0, aa3 = 0, bb3 = 0, n3 = 0;
          for (let j = 0; j < nl; j++) {
            const i = idx[j] + o, a = P[i - o], a2 = a * a;
            let m = V[i], b = P[i]; ab0 += a * b; aa0 += a2 * m; bb0 += b * b; n0 += m;
            m = V[i + s]; b = P[i + s]; ab1 += a * b; aa1 += a2 * m; bb1 += b * b; n1 += m;
            m = V[i + 2 * s]; b = P[i + 2 * s]; ab2 += a * b; aa2 += a2 * m; bb2 += b * b; n2 += m;
            m = V[i + 3 * s]; b = P[i + 3 * s]; ab3 += a * b; aa3 += a2 * m; bb3 += b * b; n3 += m;
          }
          c.push(r(ab0, aa0, bb0, n0), r(ab1, aa1, bb1, n1), r(ab2, aa2, bb2, n2), r(ab3, aa3, bb3, n3));
        };
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const c = [], s = dx + dy * Wp;
          for (let L = 3; L <= 65; L += 4) corr4(L * s, s, c);
          c.length = 63; // lags 3 to 65; the last walk's fourth, 66, still lands inside the padding
          // a peak counts only past the first dip below zero: before it, the high pass's own width makes a near lag correlate
          const dip = c.findIndex(v => v < 0);
          for (let k = Math.max(1, dip + 1); dip >= 0 && k < c.length - 1; k++)
            if (c[k] >= c[k - 1] && c[k] >= c[k + 1] && c[k] > 0 && (!peak || c[k] > peak.corr + 0.05)) peak = { corr: c[k], px: 2 * (k + 3), across: !dy };
        }
        const o = top.o;
        surface = { name: o.name || o.geometry?.type || o.type, share: bn / (w * ht), detail: +(255 * lap / nl).toFixed(2),
          ...peak ? { repeat: +peak.corr.toFixed(3), every: peak.px, across: peak.across } : {}, ms: Math.round(__clock.realNow() - t0) };
      }
    }
  } catch {}
  // The subject (AA-3D excavator: 12 looks with its bucket and arm "never visible" behind the boom, the camera never
  // changed): window.__game.subject (a name or an object), else a guess, the named object with the most named parts under
  // it that is not most of the scene (a world root or the terrain: over half the scene's size or nearly all its names).
  // a function is called, so the subject can follow the action (#141: a door the player had left sat at 0% of every look)
  let s0 = window.__game?.subject; if (typeof s0 === "function") try { s0 = s0(); } catch { s0 = null; }
  let set = s0 != null, subject = s0?.isObject3D ? s0 : typeof s0 === "string" ? scene.getObjectByName(s0) ?? null : null, asked;
  // a name that matches nothing (AA-3D snowflake: "snowflake" for meshes "ice-prisms" and "ice-arms") still gets judged: the
  // first name either contains, else the guess below, so the Stands out line is not lost
  if (set && !subject && typeof s0 === "string") {
    asked = s0; const k = s0.toLowerCase();
    scene.traverse(o => { const n = o.name?.toLowerCase(); if (!subject && o !== scene && n && n.length >= 3 && (n.includes(k) || k.includes(n))) subject = o; });
    if (!subject) set = false;
  }
  const parts = (o) => { const p = new Set(); o.traverse(d => { if (d.name && L.ids.has(d)) p.add(d.name); }); return p; };
  if (!set && !subject && Box3) {
    const span = new Box3().setFromObject(scene).getSize(camera.position.clone()).length();
    let most = 2;
    scene.traverse(o => {
      if (o === scene || !o.name) return;
      const n = parts(o).size;
      if (n <= most || n > 0.9 * names.size || new Box3().setFromObject(o).getSize(camera.position.clone()).length() > 0.5 * span) return;
      most = n; subject = o;
    });
  }
  let subj = s0 != null && !subject ? { name: String(s0), absent: true } : null;
  if (subject) {
    const inside = new Set(), drew = new Set(), all = parts(subject);
    subject.traverse(d => inside.add(d));
    let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const [id, [k, a, b, c1, d1]] of seen) {
      const o = objs[owner[id]];
      if (!o || !inside.has(o)) continue;
      n += k; x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c1); y1 = Math.max(y1, d1);
      if (o.name) drew.add(o.name);
    }
    subj = { name: subject.name || subject.type, set, ...asked ? { asked } : {}, n, box: n ? [x0, y0, x1, y1] : null, parts: all.size, drew: drew.size,
      covered: [...all].filter(p => !drew.has(p) && missing.get(p)?.[1] === "in view").map(p => [p, missing.get(p)[2]]),
      edge: n > 0 && (x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === ht - 1),
      // no pixel from a subject the ID image cannot find is no measure: "rails drew no pixel" beside rails under "Not found by the ID image" (demo 2026-10-28)
      ...n === 0 && [...inside].some(d => d.geometry && own(d)) ? { unseen: true } : {} };
    // Whether it stands out: its pixels against a ring around its box (grown 15% a side), and the brightness step across its outline
    const mine = new Uint8Array(next);
    objs.forEach((o, i) => { if (inside.has(o)) mine.fill(1, L.ids.get(o), L.ids.get(o) + (o.isInstancedMesh ? Math.max(o.count, 1) : 1)); });
    const at = (x, y) => { const s = ((ht - 1 - y) * w + x) * 4; return mine[buf[s] | (buf[s + 1] << 8) | (buf[s + 2] << 16)] === 1; };
    const gx = Math.ceil((x1 - x0 + 1) * 0.15), gy = Math.ceil((y1 - y0 + 1) * 0.15), m = [0, 0, 0, 0, 0, 0, 0, 0]; // subject n, b, s; ring n, b, s; edge n, sum
    if (n) for (let y = Math.max(0, y0 - gy); y <= Math.min(ht - 1, y1 + gy); y++) for (let x = Math.max(0, x0 - gx); x <= Math.min(w - 1, x1 + gx); x++) {
      const t = (y * w + x) * 4, me = at(x, y), k = me ? 0 : 3;
      m[k]++; m[k + 1] += lum(t); m[k + 2] += sat(t);
      if (x > 0 && at(x - 1, y) !== me) { m[6]++; m[7] += Math.abs(lum(t) - lum(t - 4)); }
      if (y > 0 && at(x, y - 1) !== me) { m[6]++; m[7] += Math.abs(lum(t) - lum(t - w * 4)); }
    }
    const f = (v) => +v.toFixed(3);
    if (m[0] && m[3]) subj.contrast = { bright: [f(m[1] / m[0]), f(m[4] / m[3])], sat: [f(m[2] / m[0]), f(m[5] / m[3])], edge: f(m[6] ? m[7] / m[6] : 0) };
  }
  // for __harness.seam(): whether no object is drawn at page point x, y (GL rows run bottom-up)
  L.free = (x, y) => { const i = Math.floor((x - rect.left) / rect.width * w), j = ht - 1 - Math.floor((y - rect.top) / rect.height * ht), s = (j * w + i) * 4;
    return i < 0 || j < 0 || i >= w || j >= ht || !(buf[s] | (buf[s + 1] << 8) | (buf[s + 2] << 16)); };
  const r3 = (v) => +v.toFixed(3), objects = O[0] ? { share: +(O[0] / (w * ht)).toPrecision(3), brightness: r3(O[1] / O[0]), saturation: r3(O[2] / O[0]), black: r3(O[3] / O[0]),
    hues: Object.fromEntries(HUES.map((k, i) => [k, r3(O[4 + i] / O[0])])) } : null;
  // one object over half the frame (plain.html's ground, 96%) made the objects' hues the frame's, and no look gave the
  // coin's or the player's colour (#178, opinion-12): the hues of everything else, with that object's name
  const big = first.filter(id => id < next && objs[owner[id]]).sort((a, b) => cnt[b] - cnt[a])[0], others = big === undefined ? 0 : O[0] - cnt[big];
  if (objects && cnt[big] > w * ht / 2 && others) { const o = objs[owner[big]]; objects.rest = { name: named(o) || o.type, share: +(others / (w * ht)).toPrecision(2), hues: Object.fromEntries(HUES.map((k, i) => [k, r3((O[4 + i] - H[9 * big + i]) / others)])) }; }
  return { png: c.toDataURL("image/png").split(",")[1], pixels: w * ht, entries, objects, edge: V[0] / (w * ht) > 0.02 && V[5] > w / 2 ? [V[0] / (w * ht), V[1], V[2], V[3], V[4]] : null, names: [...names], seen: [...seenNames], missing: [...missing], subject: subj, depth, surface,
    rect: [rect.left, rect.top, rect.width / w, rect.height / ht] };
})`;

// Runs in the page with the object's name: draws it alone (camera layer 31, set on its subtree and on every light) from
// four angles framed to its bounds, each straight into a quarter of a 2D canvas, then redraws the game's frame. Every
// three class comes from objects already in the page, so no second copy of three is needed.
const VIEWS = `((name) => { ${VIEW}
  const o = scene.getObjectByName(name);
  if (!o) { // name real targets, one per stem (cube0 for cube0 … cube4999), as look groups them
    const stems = new Map();
    scene.traverse(x => { const s = x.name.replace(/\\d+$/, ""); if (x.name && !stems.has(s)) stems.set(s, x.name); });
    const member = stems.get(/^(.*)\\*/.exec(name)?.[1]);
    return { error: member ? name + " is a group of names from the look list, not a target: name one member, such as " + member
      : "no object named " + name + " in the main scene" + (stems.size ? "; try " + [...stems.values()].slice(0, 8).join(", ") + (stems.size > 8 ? ", …" : "") : "") };
  }
  scene.updateMatrixWorld();
  let Box3;
  o.traverse(m => { if (!Box3 && m.geometry) { m.geometry.boundingBox ?? m.geometry.computeBoundingBox(); Box3 = m.geometry.boundingBox.constructor; } });
  if (!Box3) return { error: name + " has no geometry" };
  const box = new Box3().setFromObject(o), center = box.getCenter(camera.position.clone()), size = box.getSize(camera.position.clone());
  const radius = Math.max(size.length() / 2, 1e-3);
  const cam = new camera.constructor().copy(camera, false); // without children: a camera can carry a weapon or HUD
  cam.layers.set(31);
  let dist = radius * 3;
  if (cam.isPerspectiveCamera) {
    const half = Math.min(cam.fov / 2, Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect) * 180 / Math.PI);
    dist = radius / Math.sin(half * Math.PI / 180) * 1.1;
  } else cam.zoom = Math.min(cam.top - cam.bottom, cam.right - cam.left) / (2.2 * radius);
  cam.near = dist / 100; cam.far = dist + radius * 4;
  cam.updateProjectionMatrix();
  const masks = new Map(), tag = x => { masks.set(x, x.layers.mask); x.layers.enable(31); };
  o.traverse(tag);
  scene.traverse(x => { if (x.isLight && !masks.has(x)) tag(x); });
  const w = r.domElement.width, ht = r.domElement.height, c = document.createElement("canvas");
  c.width = w; c.height = ht;
  const ctx = c.getContext("2d"), info = { ...r.info.render }, prev = [r.getRenderTarget(), r.autoClear];
  const ANGLES = [["front", [0, 0, 1], [0, 1, 0]], ["right", [1, 0, 0], [0, 1, 0]], ["top", [0, 1, 0], [0, 0, -1]], ["three-quarter", [1, 0.8, 1], [0, 1, 0]]];
  h.depth++; // these draws are not the game's frames
  try {
    r.setRenderTarget(null); r.autoClear = true;
    ANGLES.forEach(([label, dir, up], i) => {
      const d = cam.position.clone().fromArray(dir).normalize().multiplyScalar(dist);
      cam.position.copy(center).add(d); cam.up.fromArray(up); cam.lookAt(center); cam.updateMatrixWorld();
      h.raw.get(r).call(r, scene, cam);
      const x = (i % 2) * w / 2, y = Math.floor(i / 2) * ht / 2;
      ctx.drawImage(r.domElement, x, y, w / 2, ht / 2); // the drawing buffer still holds this draw within the task
      ctx.font = Math.max(12, Math.round(ht / 40)) + "px sans-serif";
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x, y, ctx.measureText(label).width + 12, ht / 40 + 12);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 6, y + ht / 40 + 4);
    });
  } finally {
    h.depth--;
    for (const [x, m] of masks) x.layers.mask = m;
    r.autoClear = prev[1]; r.setRenderTarget(prev[0]);
    Object.assign(r.info.render, info);
  }
  ${DRAW};
  const p = v => v.toArray().map(n => +n.toFixed(3));
  return { png: c.toDataURL("image/png").split(",")[1], size: p(size), center: p(center) };
})`;

// Before a look: a page that has drawn no frame to the screen (straight after load or reload, or one that drew only into
// a render target, an environment bake) steps one. A game still setting up (its loop starts once its models are in)
// then gets a frame every 50 ms of real time for up to 5 s, so a look straight after `open` does not fail on it.
// The 5 s is real time, not a frame count: 100 frames of a game building its world at 1.8 s a frame on a software
// renderer passed the 180 s protocol timeout (AA-3D P2/#25).
export const FIRST = `(async () => { __clock.pause(); if (__harness.main()?.[1].screen) return;
  await __clock.step(1);
  const raw = () => __harness.gl.size && !__harness.renderers.length; // raw WebGL never fills views: don't wait for it
  for (const end = __clock.realNow() + 5000; !__harness.views.size && !raw() && __clock.realNow() < end;) { await __clock.realSleep(50); await __clock.step(1); } })()`;
const NOT_DRAWN = "look: the game has not drawn a three.js scene after 5 s of stepping frames; if it is still loading or building, step it with `interact` { steps: [{ wait: frames }] } and look again";
const REDRAW = (moved: boolean) => `if (__harness.views.size && (${moved} || !__harness.frame.some(e => e.target))) ${DRAW};`;

/** PASS_FN's word on a named object that drew nothing: size, where, what covers it, its named ancestor, and whether that ancestor holds the cover. */
type Where = [number, NeverVisible["where"], (string | null)?, (string | null)?, boolean?];
const runs = new WeakMap<Game, { n: number; all: Set<string>; seen: Set<string>; where: Map<string, Where> }>();

/** The second copy of three for a game without the runtime layer: the project's own three when it is the game's
    revision, served by the harness, else the same revision from jsDelivr. */
export function threeUrl(game: Game, revision: string, webgpu = false) {
  const build = webgpu ? "three.webgpu.js" : "three.module.js";
  try {
    const v = JSON.parse(readFileSync(join(game.root, "node_modules/three/package.json"), "utf8")).version;
    if (v.split(".")[1] === revision) return new URL(`node_modules/three/build/${build}`, game.files).href;
  } catch {}
  return `https://cdn.jsdelivr.net/npm/three@0.${revision}/build/${build}`;
}

/** Pauses the game, saves `look-<n>.png` (the picture) and `look-<n>-ids.png` (one colour per object) in the run folder,
    and lists what is on screen (largest first) and which named objects no look of this run has seen, each with its size
    and where it is now (a name this look did not find keeps what the last look said of it). */
// peek: a look the agent never sees (hover's), so it must not become the "last look" the next reply is compared with
/** Runs fn and puts the page's seeded Math.random back as it was: three gives every material, texture and camera a look
    builds a uuid from Math.random, so a look moved what the game drew next (opinion-2: a coin's respawn). */
async function keepSeed<T>(game: Game, fn: () => Promise<T>): Promise<T> {
  const seed = await game.page.evaluate("window.__clock?.seed?.() ?? null") as number | null;
  try { return await fn(); } finally { if (seed !== null) await game.page.evaluate(`__clock.reseed(${seed})`).catch(() => {}); }
}

/** SETUP's and COPLANAR's lines on the page as it is now. COPLANAR's "Surfaces: not checked for N of M meshes" note is not
    a fault: the Stop hook, faultsSame and closed read only its fight lines. */
async function pageFaults(page: HarnessPage, known?: Known) {
  const all = await page.evaluate(SETUP).catch(() => []) as string[], coplanar = await page.evaluate(COPLANAR).catch(() => []) as string[];
  const hidden: string[] = [], keep = (l: string) => { const k = known?.line(l); if (k) hidden.push(k); return !k; };
  const note = (l: string) => l.startsWith("Surfaces: not checked"), setup = all.filter(keep), surfaces = coplanar.filter(l => !note(l) && keep(l));
  return { setup, surfaces, unchecked: coplanar.filter(note), hidden };
}

/** A piece of __game.intentional shorter than this matches no line (["e"] hid 58 lines, ["light"] every Lighting line). */
const PIECE_MIN = 6;
/** Which piece of window.__game.intentional (a string or a list) a line or a never-visible name is, if any. */
interface Known { line(line: string): string | undefined; name(name: string): string | undefined }
/** window.__game.intentional: what the page means (no tone mapping under a post chain of its own, a fixed buffer, an object
    hidden on purpose), since loop sessions re-argued the same lines every session (#139). A piece of PIECE_MIN characters
    or more matches a fault or Canvas line's text after its "Kind:" at word ends, in any case; a never-visible name must
    equal a piece. What matches is counted per piece in one line instead of printed. */
async function knownOf(page: HarnessPage): Promise<Known> {
  const k = await page.evaluate(`(() => { const k = window.__game?.intentional;
    return [k].flat().filter(x => typeof x === "string" && x.trim()).map(x => x.trim()); })()`).catch(() => []) as string[];
  const word = (x: string) => new RegExp("(^|[^a-z0-9_])" + x.toLowerCase().replace(/[.*+?^$|()[\]{}\\]/g, "\\$&") + "($|[^a-z0-9_])");
  const res = k.filter(x => x.length >= PIECE_MIN).map(x => [x, word(x)] as const);
  return {
    line: l => { const text = l.slice(l.indexOf(": ") + 2).toLowerCase(); return res.find(([, re]) => re.test(text))?.[0]; },
    name: n => k.find(x => x.toLowerCase() === n.toLowerCase()),
  };
}

// edited: the sources changed since the last look (the caller reloaded the page for them), so a fault line gone since can be closed
export function look(game: Game, { moved = false, peek = false, edited = false }: { moved?: boolean; peek?: boolean; edited?: boolean } = {}): Promise<Look> {
  return game.queue(() => keepSeed(game, async () => {
    const { page } = game;
    const resized = await resizeProbe(game);
    // `moved`: a camera moved for this picture, which only a redraw shows.
    await page.evaluate(FIRST);
    // offscreen: the last frame's top-level calls all drew into render targets after the game had drawn to the screen, so
    // the canvas kept an older frame: the Backrooms build's feedback node left its target bound, and pictures stayed on
    // frame 1 while the state played on (#130); state: observe() as JSON, for a picture the same as the last one's
    const { views, raw, revision, webgpu, offscreen, state } = await page.evaluate(`${REDRAW(moved)}
      ({ views: __harness.views.size, raw: __harness.gl.size > 0 && !__harness.renderers.length, revision: String(__harness.revision),
        webgpu: !!__harness.main()?.[1].renderer.isWebGPURenderer,
        offscreen: (f => f.length && __harness.firstFrameAt !== undefined && f.every(e => e.target) ? [...new Set(f.map(e => e.target.width + "×" + e.target.height))] : null)(__harness.frame),
        state: (() => { try { return JSON.stringify(window.__game?.observe?.() ?? null); } catch { return null; } })() })`) as
      { views: number; raw: boolean; revision: string; webgpu: boolean; offscreen: string[] | null; state: string | null };
    if (!views && !raw) throw new Error(NOT_DRAWN);
    const run = runs.get(game) ?? { n: 0, all: new Set<string>(), seen: new Set<string>(), where: new Map() };
    runs.set(game, run);
    const n = ++run.n;
    const picture = join(game.runDir, `look-${n}.png`), ids = join(game.runDir, `look-${n}-ids.png`);
    const png = Buffer.from(await screenshot(page, picture)).toString("base64");
    const st = await page.evaluate(PIXELS_FN, png).catch(() => null) as (Omit<Pixels, "changed"> & { grid: number[] }) | null;
    const c = await page.evaluate(CANVAS) as (Omit<Canvas, "resized"> & { frame: number; reduce: boolean }) | null;
    const canvas = c ? { buffer: c.buffer, css: c.css, dpr: c.dpr, ratio: c.ratio, resized } : undefined;
    const known = await knownOf(page), ct = canvasText(canvas).join(""), flags = /stretches|did not run|nothing shows/.test(ct), canvasKnown = flags ? known.line(ct) : undefined;
    const canvasSame = !!canvasKnown || ct === lastCanvas.get(game) && !flags;
    if (!peek) lastCanvas.set(game, ct);
    const prev = lastGrid.get(game), pixels: Pixels | undefined = st ? { brightness: +st.brightness.toFixed(3), saturation: +st.saturation.toFixed(3), black: +st.black.toFixed(3), blown: +st.blown.toFixed(3),
      hues: Object.fromEntries(Object.entries(st.hues).map(([k, v]) => [k, +v.toFixed(3)])),
      changed: prev ? +(st.grid.filter((v, i) => Math.abs(v - prev.grid[i]!) > 0.04).length / st.grid.length).toFixed(3) : null,
      ...(c?.reduce && prev && c.frame > prev.frame ? { reduced: c.frame - prev.frame } : {}) } : undefined;
    if (st && !peek) lastGrid.set(game, { grid: st.grid, frame: c?.frame ?? 0 });
    const was = lastState.get(game), keys = pixels?.changed === 0 && state !== null && was != null && was !== state ? keysChanged(JSON.parse(was), JSON.parse(state)) : [];
    const stale = { ...offscreen ? { offscreen } : {}, ...keys.length ? { unchanged: keys } : {} };
    if (!peek) lastState.set(game, state);
    // raw WebGL has no scene graph to name objects from, so the picture and its pixels are all there is
    // a canvas 0 px tall or wide has no pixels for the ID pass to read (#96): the Canvas line says why
    if (!views || (c && !(c.buffer[0] && c.buffer[1]))) return { picture, ids: "", onScreen: [], neverVisible: [], covers: [], subject: null, pixels, canvas, canvasSame, frame: c?.frame, ...stale };
    const covers = await page.evaluate("__harness.covers()") as Cover[];
    // an opaque element over the whole canvas (a loader, a click-to-start screen): the picture's pixels are its, while the ID pass draws
    // the scene behind it, so every line read from the pixels at the scene's objects would judge the overlay (dev #125, #129, #130).
    // Only a solid colour counts: covers() says "an image" for an opaque gradient and a see-through vignette PNG alike
    const veil = covers.find(c => c.over >= 0.9 && c.opacity >= 0.95 && /^rgb\(/.test(c.background ?? ""));
    // the PNG goes as an argument, not pasted into the code (puppeteer scans every code string), and only when PIXELS failed
    const r = await page.evaluate(PASS_FN, threeUrl(game, revision, webgpu), st ? null : png) as
      { png: string; pixels: number; objects: Pixels["objects"] | null; edge: number[] | null; entries: [string, number, number, number, number, number, boolean, [number, number, OnScreen["runs"] | null] | null][]; names: string[]; seen: string[]; missing: [string, Where][]; rect: [number, number, number, number]; depth: Look["depth"] | null; surface: Look["surface"] | null;
        subject: (Omit<Subject, "share" | "bbox"> & { n: number; box: [number, number, number, number] | null }) | { name: string; absent: true } | null };
    writeFileSync(ids, Buffer.from(r.png, "base64"));
    if (veil) { r.surface = null; r.depth = null; r.objects = null; if (r.subject && !("absent" in r.subject)) delete r.subject.contrast; }
    if (pixels && r.objects) pixels.objects = r.objects;
    const { setup, surfaces, unchecked, hidden } = await pageFaults(page, known);
    const surfaceKnown = r.surface ? surfaceText(r.surface).map(known.line).find(Boolean) : undefined;
    if (surfaceKnown) r.surface = null;
    // compared by faultKey: a caster count or a share that moved is the same fault (gpu-4x4-7 kart: the
    // shadow line read 115, then 67 casters, and printed in full on every play run)
    const lines = faultLines({ setup, surfaces, surface: r.surface ?? undefined }), ft = lines.map(faultKey).join("\n"), last = lastFaults.get(game), faultsSame = !!ft && ft === last?.key;
    // a fault line depends on the camera (casters on screen, the gap at this distance), so a line gone after a step or a
    // look from elsewhere is not closed: only an edit seen at the same frame from the game's own camera closes one
    const same = last && !last.moved && !moved && last.frame === c?.frame ? faultDiff(last.lines, lines, unchecked.length > 0) : null;
    const closed = edited && same ? same.closed : [];
    if (!peek) lastFaults.set(game, { key: ft, lines: same?.kept ?? lines, frame: c?.frame, moved });
    const seam = await page.evaluate("(() => { try { return __harness.seam(__harnessLook.free); } finally { delete __harnessLook.free; } })()") as Seam;
    // the drawing buffer can be smaller than the canvas on the page (a lowered pixel ratio): boxes are scaled to the picture
    const [left, top, sx, sy] = r.rect, px = (x: number) => Math.round(left + x * sx), py = (y: number) => Math.round(top + y * sy);
    const onScreen = r.entries.sort((a, b) => b[1] - a[1]).map(([name, count, x0, y0, x1, y1, approx, ext]): OnScreen => ({
      name, coverage: +(count / r.pixels).toPrecision(3), bbox: [px(x0), py(y0), px(x1 + 1) - 1, py(y1 + 1) - 1], ...(approx ? { approximate: true as const } : {}),
      ...(ext ? { extent: [ext[0], ext[1]] as [number, number], ...(ext[2] ? { runs: ext[2] } : {}) } : {}),
    }));
    // a coin respawned below the frame dropped out of the list without a word (opinion-3, 3 of 3 reviewers)
    const gone = [...r.missing].filter(([name, [, where]]) => run.seen.has(name) && (where === "behind the camera" || where === "outside the view")).map(([name, [, where, , group]]) => ({ name, where, ...(group ? { group } : {}) }));
    for (const name of r.names) run.all.add(name);
    for (const name of r.seen) run.seen.add(name);
    for (const [name, at] of r.missing) run.where.set(name, at);
    const unseen = [...run.all].filter(x => !run.seen.has(x)), knownNames = unseen.map(known.name);
    const neverVisible = unseen.filter((_, i) => !knownNames[i]).map((name): NeverVisible => {
      const [size, where, over, group, own] = run.where.get(name) ?? [0, "no geometry"];
      return { name, size, where, ...(over ? { over } : {}), ...(group ? { group } : {}), ...(own ? { own: true as const } : {}) };
    });
    const s = r.subject, subject = !s || "absent" in s ? s : { name: s.name, set: s.set, share: +(s.n / r.pixels).toPrecision(3),
      bbox: s.box && [px(s.box[0]), py(s.box[1]), px(s.box[2] + 1) - 1, py(s.box[3] + 1) - 1] as OnScreen["bbox"], ...s.asked ? { asked: s.asked } : {}, parts: s.parts, drew: s.drew, covered: s.covered, edge: s.edge, contrast: s.contrast, ...s.unseen ? { unseen: s.unseen } : {} };
    // the camera hint is said once per game and subject: four of four feel-4 agents skimmed it after a wide camera chosen on
    // purpose, and a chase camera moving between "little" and "hiding" got it again every few looks (1c17107f)
    if (subject && !("absent" in subject) && hintOf(subject)) {
      const said = lastHint.get(game) ?? new Set<string>();
      if (said.has(subject.name)) (subject as Subject).hintSaid = true; else if (!peek) lastHint.set(game, said.add(subject.name));
    }
    const kept: Record<string, number> = {};
    for (const k of [...hidden, surfaceKnown, canvasKnown, ...knownNames]) if (k) kept[k] = (kept[k] ?? 0) + 1;
    const nums = numbersOf(pixels, subject && !("absent" in subject) ? subject.contrast : undefined), numbersSame = sameNumbers(nums, lastNumbers.get(game));
    if (!peek) lastNumbers.set(game, nums);
    return { picture, ids, onScreen, neverVisible, ...gone.length ? { left: gone } : {}, ...r.edge ? { edge: { share: +r.edge[0]!.toPrecision(2), bbox: [px(r.edge[1]!), py(r.edge[2]!), px(r.edge[3]! + 1) - 1, py(r.edge[4]! + 1) - 1] as OnScreen["bbox"] } } : {}, covers, ...veil ? { veil: veil.what } : {}, subject, pixels, ...stale, canvas, seam, canvasSame, ...Object.keys(kept).length ? { known: kept } : {}, faultsSame, ...closed.length ? { closed } : {}, frame: c?.frame, numbersSame, setup, surfaces, ...unchecked.length ? { unchecked } : {}, ...r.depth ? { depth: r.depth } : {}, ...r.surface ? { surface: r.surface } : {} };
  }));
}

/** The Lighting and Surfaces lines a plain look would print at the page's current frame (its `[...setup, ...surfaces]`),
    that frame, and whether the z-fighting check stopped at its work or triangle limit (`partial`: look's "Surfaces: not checked for" note), without
    a picture. Throws as look() does on a page that has drawn no three.js scene. */
export function faultsNow(game: Game): Promise<{ lines: string[]; frame: number; partial: boolean }> {
  return game.queue(() => keepSeed(game, async () => {
    const { page } = game;
    await page.evaluate(FIRST);
    const { views, raw } = await page.evaluate(`${REDRAW(false)}
      ({ views: __harness.views.size, raw: __harness.gl.size > 0 && !__harness.renderers.length })`) as { views: number; raw: boolean };
    if (!views && !raw) throw new Error(NOT_DRAWN);
    const c = await page.evaluate(CANVAS) as { buffer: [number, number]; frame: number } | null, frame = c?.frame ?? 0;
    if (!views || (c && !(c.buffer[0] && c.buffer[1]))) return { lines: [], frame, partial: false }; // as look: raw WebGL or a 0 px canvas has no fault lines
    // COPLANAR reads matrixWorld as the last render left it, and look's id pass renders the scene, so the scene's matrices are
    // brought up to date as a render does (as __harness.skip's frames do): a frame drawn in passes gets no redraw
    await page.evaluate(`(() => { const [s, { camera: c }] = __harness.main();
      if (s.matrixWorldAutoUpdate) s.updateMatrixWorld(); if (c?.parent === null && c.matrixWorldAutoUpdate) c.updateMatrixWorld(); })()`);
    const { setup, surfaces, unchecked } = await pageFaults(page, await knownOf(page));
    return { lines: [...setup, ...surfaces], frame, partial: unchecked.length > 0 };
  }));
}

/** look() from another place for this picture only: a copy of the camera that last drew the main scene, at `position`
    and facing `lookAt` (or the camera's own way), drawn in its place. The game's own camera is never moved, so a game that
    sets it every frame cannot undo the view (AA-3D air-hockey: "the harness's custom camera gets overridden"). */
export function lookFrom(game: Game, cam: Cam): Promise<Look> {
  return game.queue(() => keepSeed(game, async () => {
    const restore = await placeCam(game, cam);
    try { return await look(game, { moved: true }); }
    finally { await restore(); }
  }));
}

/** Saves `look-<n>-cameras.png`: the page at this moment, with no reload, from each camera as lookFrom draws it, in one
    labelled grid (the no-plugin scene loop scripted its own, shot.mjs); each labelled camera is kept for later calls by
    name (keepCams). */
export function cameras(game: Game, cwd: string, cams: (Cam & { label?: string })[]): Promise<{ picture: string; cells: { label: string; look: Look }[]; kept: string[] }> {
  return game.queue(async () => {
    if (!Array.isArray(cams) || !cams.length || cams.length > SHEET_MAX) throw new Error(`look: cameras takes 1 to ${SHEET_MAX} cameras`);
    const cells: { label: string; look: Look }[] = [], said = new Set(lastHint.get(game));
    try {
      for (const c of cams) {
        // `left` is dropped: between two angles of one moment, nothing left the view
        const { left, ...l } = await lookFrom(game, c);
        cells.push({ label: c.label ?? `[${c.position.join(", ")}]${c.lookAt ? ` at [${c.lookAt.join(", ")}]` : ""}`, look: l });
      }
    } finally { lastFaults.delete(game); lastHint.set(game, said); lastNumbers.delete(game); } // as a sheet
    const picture = cells[cells.length - 1]!.look.picture.replace(/\.png$/, "-cameras.png");
    const shots = cells.map(c => readFileSync(c.look.picture).toString("base64"));
    writeFileSync(picture, Buffer.from(await game.page.evaluate(`${COMPOSE}(${JSON.stringify(shots)}, ${JSON.stringify(cells.map(c => c.label))})`) as string, "base64"));
    return { picture, cells, kept: keepCams(cwd, cams) };
  });
}

export type Cam = { position: number[]; lookAt?: number[] };
/** The cameras a project knows by name: a picture's viewpoint under its file name in `refs/cameras.json` (the scene loops'
    file), then the ones `look` `cameras` labelled, in `paprika3d/cameras.json`. */
function knownCams(cwd: string): Record<string, Cam> {
  const all: Record<string, Cam> = {};
  for (const f of [join(cwd, "paprika3d", "cameras.json"), join(cwd, "refs", "cameras.json")]) {
    try { for (const [k, c] of Object.entries(JSON.parse(readFileSync(f, "utf8")) as Record<string, Cam>)) if (Array.isArray(c?.position)) all[k] = c; } catch {}
  }
  return all;
}
/** A `camera` argument given as a name: the camera of that name (namedCams), or an error naming the ones there are. */
export function namedCam(cwd: string, name: string): Cam {
  const all = knownCams(cwd), c = all[name];
  if (c) return { position: c.position, ...c.lookAt ? { lookAt: c.lookAt } : {} };
  const names = Object.keys(all);
  throw new Error(`look: no camera named ${JSON.stringify(name)}${names.length ? `; the project has ${names.map(n => JSON.stringify(n)).join(", ")} (refs/cameras.json and paprika3d/cameras.json)` : ": label one in look { cameras } first, or put it in refs/cameras.json"}`);
}
/** Keeps the labelled cameras in `<cwd>/paprika3d/cameras.json` under their labels; returns the labels kept. */
export function keepCams(cwd: string, cams: (Cam & { label?: string })[]): string[] {
  const kept = cams.filter((c): c is Cam & { label: string } => !!c.label);
  if (!kept.length) return [];
  const file = join(harnessDir(cwd), "cameras.json");
  let all: Record<string, Cam> = {};
  try { all = JSON.parse(readFileSync(file, "utf8")); } catch {}
  for (const { label, position, lookAt } of kept) all[label] = { position, ...lookAt ? { lookAt } : {} };
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
  return kept.map(c => c.label);
}
/** Puts `__harness.lookCam` in place of the camera that last drew the main scene, after a first frame; returns its removal. */
async function placeCam(game: Game, cam: Cam): Promise<() => Promise<unknown>> {
  await game.page.evaluate(FIRST);
  const placed = await game.page.evaluate(`(() => {
    const c = __harness.main()?.[1].camera; if (!c) return false;
    const to = c.clone(false);
    to.position.fromArray(${JSON.stringify(cam.position)});
    ${cam.lookAt ? `to.lookAt(...${JSON.stringify(cam.lookAt)});` : "c.getWorldQuaternion(to.quaternion);"}
    to.updateMatrixWorld(); __harness.lookCam = { from: c, to }; return true; })()`);
  if (!placed) throw new Error(NOT_DRAWN);
  return () => game.page.evaluate("delete __harness.lookCam");
}

/** Pauses the game and saves `look-<n>-views.png`: the object named `name` alone, framed to its bounds from the front,
    right, top and a three-quarter angle, in one 2×2 picture. Returns its path and the object's world size and centre. */
export function views(game: Game, name: string): Promise<{ picture: string; size: number[]; center: number[] }> {
  return game.queue(() => keepSeed(game, async () => {
    await game.page.evaluate(FIRST);
    const r = await game.page.evaluate(`__harness.views.size ? ${VIEWS}(${JSON.stringify(name)}) : { error: "${NOT_DRAWN.slice(6)}" }`) as
      { error?: string; png: string; size: number[]; center: number[] };
    if (r.error) throw new Error(`look: ${r.error}`);
    const run = runs.get(game) ?? { n: 0, all: new Set<string>(), seen: new Set<string>(), where: new Map() };
    runs.set(game, run);
    const picture = join(game.runDir, `look-${++run.n}-views.png`);
    writeFileSync(picture, Buffer.from(r.png, "base64"));
    return { picture, size: r.size, center: r.center };
  }));
}

/** `look`'s reply. Names that differ only by a trailing number (cube0 … cube4999, or an instance's sparks[3]) are one line when there are more than
    three, with their summed coverage and joined box, as observe groups them: 40 cubes one per line and 50 more never
    visible made 3,316 characters on the cube field. Coverage keeps two significant digits, so a small object is not 0.0%. */
// The screenshot's pixel statistics, decoded in the page: AA-3D agents without the plugin wrote scripts for them (bright.py,
// motion.mjs, a blank-frame detector) to catch black frames, a pale picture and whether anything moves.
const PIXELS = `(async (b64) => {
  const b = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob()), W = 80, H = 50;
  window.__harnessShot?.close?.(); window.__harnessShot = b; // PASS draws from it instead of decoding the PNG again
  const c = new OffscreenCanvas(b.width, b.height), x = c.getContext("2d");
  x.drawImage(b, 0, 0);
  const d = x.getImageData(0, 0, b.width, b.height).data, n = d.length / 4, grid = new Float64Array(W * H), cnt = new Float64Array(W * H);
  // the bitmap's width and height read once: four DOM getter calls a pixel made this loop 228 ms on 1280 x 800, now 21
  const bw = b.width, bh = b.height; let lum = 0, sat = 0, black = 0, blown = 0;
  ${HUE} const hue = new Float64Array(9);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], bl = d[i + 2], hi = Math.max(r, g, bl), lo = Math.min(r, g, bl), l = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255, sa = hi ? (hi - lo) / hi : 0;
    lum += l; sat += sa; hue[bucket(r, g, bl, hi, lo, l, sa)]++;
    if (hi < 16) black++; else if (lo > 247) blown++;
    const k = Math.floor((p / bw) * H / bh) * W + Math.floor((p % bw) * W / bw);
    grid[k] += l; cnt[k]++;
  }
  return { brightness: lum / n, saturation: sat / n, black: black / n, blown: blown / n, hues: Object.fromEntries(HUES.map((k, i) => [k, hue[i] / n])), grid: Array.from(grid, (v, i) => cnt[i] ? v / cnt[i] : 0) };
})`;
// as functions, so page.evaluate takes the PNG as an argument
const PIXELS_FN = new Function(`return ${PIXELS}`)(), PASS_FN = new Function(`return ${PASS}`)();
const lastState = new WeakMap<Game, string | null>(), lastGrid = new WeakMap<Game, { grid: number[]; frame: number }>(), lastCanvas = new WeakMap<Game, string>(), lastHint = new WeakMap<Game, Set<string>>();
const lastNumbers = new WeakMap<Game, ReturnType<typeof numbersOf>>();
/** The last look's fault lines' faultKeys joined, the lines the next look's closed ones are read against (faultDiff's
    kept), its frame and whether its camera was moved for the picture. */
const lastFaults = new WeakMap<Game, { key: string; lines: string[]; frame?: number; moved: boolean }>();

/** Page code for the frame number every tool reports: frames of the virtual clock since the page loaded (frame 0 at
    60 s). three's info.render.frame counts render calls, an environment bake's too, so a fresh reload read frame 34 (opinion-7). */
export const FRAME = "Math.max(0, Math.round((__clock.now() - 60000) * 0.06))";

// The canvas's sizes, plus the frame and whether the page asks for reduced motion, for the Canvas and Pixels lines.
const CANVAS = `(() => { const h = window.__harness, c = h.canvas(), r = h.main()?.[1].renderer ?? h.renderers[0]; if (!c) return null;
  const b = c.getBoundingClientRect();
  return { buffer: [c.width, c.height], css: [Math.round(b.width), Math.round(b.height)], dpr: devicePixelRatio, ratio: r?.getPixelRatio?.() ?? null,
    frame: ${FRAME}, reduce: matchMedia("(prefers-reduced-motion: reduce)").matches }; })()`;

/** A screenshot of the page in CSS pixels at any DPR, so boxes in it are the page coordinates mouse steps take (#32). */
// Scaled down in the page: puppeteer drops a clip's scale when it keeps the capture inside the viewport, and capturing
// beyond it can resize the page.
async function screenshot(page: HarnessPage, path?: string): Promise<Uint8Array> {
  const v = page.viewport(), dpr = v?.deviceScaleFactor ?? 1;
  if (!v || dpr === 1) return page.screenshot({ path });
  const png = Buffer.from(await page.evaluate(`(async (b64) => {
    const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode();
    const c = document.createElement("canvas"), x = c.getContext("2d");
    c.width = ${v.width}; c.height = ${v.height}; x.imageSmoothingQuality = "high"; x.drawImage(i, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1]; })(${JSON.stringify(await page.screenshot({ encoding: "base64" }))})`) as string, "base64");
  if (path) writeFileSync(path, png);
  return png;
}

/** Whether the canvas follows the page's size: once a page load, the page is made 10% narrower and 20% lower and put
    back, on real time (the resize event comes with Chrome's next rendering update) and no frame stepped. A resize clears
    the canvas, so it is tried before a look's redraw, and not on a game that already drew a frame in passes, which no
    redraw can replay. "fixed": the buffer kept its size, but the canvas still fit the smaller page at the buffer's own
    shape (or under object-fit contain), so CSS scales a fixed buffer, not a missing handler (#138: a 960x720 tape format
    read "resize handler did not run" on every look). Both sides shrink, so a handler sized from either one changes the
    buffer, and by different shares, so a window-filling canvas under CSS 100% changes shape and is still caught. */
async function resizeProbe(game: Game): Promise<Canvas["resized"]> {
  const { page } = game, v = page.viewport();
  const at = await page.evaluate(`(() => { const h = __harness, c = h.canvas();
    return !c ? null : h.resized ?? (h.main()?.[1].screen && h.frame.some(e => e.target) ? null : [c.width, c.height, scrollX, scrollY]); })()`) as Canvas["resized"] | number[];
  if (!Array.isArray(at) || !v) return at as Canvas["resized"];
  // `afterEvent`: ends 100 ms after the page's resize event, not 500 ms after the resize: a handler changes the canvas with
  // the event (plain three) or 15 ms after it (R3F's ResizeObserver), and a page with none waited out all 500 ms on its first look
  const until = (cond: string, afterEvent = false) => page.evaluate(`(async () => {
    if (${afterEvent}) await Promise.race([__harnessResize, __clock.realSleep(500)]);
    for (let i = 0; i < ${afterEvent ? 10 : 50}; i++) { const c = __harness.canvas(); if (c && (${cond})) return true; await __clock.realSleep(10); }
    return false; })()`) as Promise<boolean>;
  // `void`: an evaluate that returns the promise waits for it, which settles only after the resize below
  await page.evaluate(`void (window.__harnessResize = new Promise(ok => addEventListener("resize", ok, { once: true })))`);
  await page.setViewport({ ...v, width: Math.round(v.width * 0.9), height: Math.round(v.height * 0.8) });
  const ran = await until(`c.width !== ${at[0]} || c.height !== ${at[1]}`, true);
  const fixed = !ran && await page.evaluate(`(() => { const c = __harness.canvas(), b = c.getBoundingClientRect();
    return b.width > 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1
      && (["contain", "scale-down"].includes(getComputedStyle(c).objectFit) || Math.abs(b.width / b.height - c.width / c.height) < 0.01); })()`) as boolean;
  await page.setViewport(v);
  if (ran) await until(`c.width === ${at[0]} && c.height === ${at[1]}`);
  await page.evaluate(`scrollTo({ left: ${at[2]}, top: ${at[3]}, behavior: "instant" })`); // the smaller page clamped or anchored a scrolled one
  const resized = fixed ? "fixed" : ran;
  await page.evaluate(`__harness.resized = ${JSON.stringify(resized)}`);
  return resized;
}

/** The Canvas line: buffer for CSS size at the page's DPR, the renderer's pixel ratio, and whether a resize handler ran. */
export function canvasText(c: Canvas | undefined): string[] {
  if (!c) return [];
  const [bw, bh] = c.buffer, [cw, ch] = c.css, r = c.ratio;
  // at DPR 1 or 2 a cap of 2 (stage()'s) cannot show, so "no cap" there was a guess (opinion-7)
  const cap = r !== null && (r < c.dpr ? `capped below DPR ${c.dpr}` : c.dpr > 2 ? "no cap" : "");
  const ratio = r === null ? "no three.js renderer" : `renderer pixel ratio ${+r.toFixed(3)}${cap ? `, ${cap}` : ""}`;
  const resize = c.resized === null ? "" : c.resized === "fixed" ? "; a fixed buffer CSS scales at its own shape (or a resize handler that waits for frames)" : c.resized ? "; resize handler ran" : "; resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames)";
  const stretched = r !== null && c.resized !== "fixed" && (Math.abs(bw - cw * r) > Math.max(2, r) || Math.abs(bh - ch * r) > Math.max(2, r))
    ? ` The buffer is not CSS size × pixel ratio, so the browser stretches it: call renderer.setSize when the canvas's size changes.` : "";
  const empty = !(bw && bh && cw && ch) ? ` The canvas is 0 px ${!(bh && ch) ? "tall" : "wide"}, so nothing shows: give it (or its container) a size, then call renderer.setSize.` : "";
  return [`Canvas: ${bw}x${bh} buffer for ${cw}x${ch} CSS at DPR ${c.dpr} (${ratio})${resize}.${empty || stretched}`];
}

/** The Pixels line's words for a picture that is mostly black, dark, blown out or pale, or moved under reduced motion. */
function pixelNotes(p: Pixels): string[] {
  const pc = (x: number) => `${Math.round(x * 100)}%`, o = p.objects, share = o && `${+(o.share * 100).toPrecision(o.share >= 0.1 ? 3 : 2)}%`;
  return [p.black > 0.6 && (o && o.black < 0.6 ? `Mostly black: the objects cover ${share} of the frame.` : "Mostly black: a blank or unlit frame?"), p.black <= 0.6 && p.brightness < 0.12 && "Dark: a viewer sees little.",
    p.blown > 0.2 && "Much of it is blown out to white.", p.saturation < 0.12 && (!o || o.saturation < 0.12) && "Pale: little colour.",
    p.reduced && p.changed !== null && `With reduced motion, ${pc(p.changed)} changed over ${p.reduced} frames: ${p.changed > 0.01 ? "animation did not stop." : "animation stopped."}`].filter(Boolean) as string[];
}

/** The subject blends into what is around it: brightness, colour and edge all within a first-guess step (not yet checked against a benchmark). */
const blends = ({ bright: [b, bo], sat: [c, co], edge }: NonNullable<Subject["contrast"]>) => Math.abs(b - bo) < 0.1 && Math.abs(c - co) < 0.1 && edge < 0.08;

// Pixels, Hues and Stands out reprinted the same numbers on every look, and 6 of 9 opinion-7 agents called them noise; they
// stay because no-plugin agents scripted these checks themselves (#92), so a look prints them when one flags something or moved
const MOVED = 0.05; // a first guess: 5 points of brightness, saturation, near black, blown out or contrast
const topHues = (h: Record<string, number> = {}) => Object.entries(h).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k).join();
/** What a look's Pixels, Hues and Stands out lines say, to compare with the last look's. */
export const numbersOf = (p: Pixels | undefined, c: Subject["contrast"]) =>
  p ? { v: [p.brightness, p.saturation, p.black, p.blown, ...c ? [...c.bright, ...c.sat, c.edge] : []], hues: `${topHues(p.hues)}/${topHues(p.objects?.rest?.hues ?? p.objects?.hues)}` } : null;
const sameNumbers = (a: ReturnType<typeof numbersOf>, b: ReturnType<typeof numbersOf> | undefined) =>
  !!a && !!b && a.hues === b.hues && a.v.length === b.v.length && a.v.every((v, i) => Math.abs(v - b.v[i]!) < MOVED);

/** One line in place of Pixels, Hues and Stands out when their numbers are the last look's and none flags anything, else none. */
export function foldedText(l: Pick<Look, "pixels" | "subject" | "numbersSame">): string[] {
  const p = l.pixels, c = l.subject && !("absent" in l.subject) ? l.subject.contrast : undefined;
  if (!l.numbersSame || !p || pixelNotes(p).length || (c && blends(c))) return [];
  const names = ["Pixels", topHues(p.hues) && "Hues", c && "Stands out"].filter(Boolean).join(", ");
  return [`${names}: as the last look${p.changed === null ? "" : `; ${Math.round(p.changed * 100)}% of the picture changed since it`}.`];
}

/** A picture that may be older than the game: its last frame drew only into render targets, or it is the last look's
    picture though the state moved on (#130). */
export const staleText = (l: Pick<Look, "offscreen" | "unchanged">) => [
  ...l.offscreen ? [`Last frame: every render call drew into a render target (${l.offscreen.join(", ")}), none to the screen, so the canvas still shows an earlier frame: a render target left bound after a pass (setRenderTarget(null) missing, or a saved renderer state restored out of order)?`] : [],
  ...l.unchanged ? [`Nothing in the picture changed since the last look, while observe()'s ${l.unchanged.slice(0, 4).join(", ")}${l.unchanged.length > 4 ? ", …" : ""} changed.`] : []];
/** observe()'s top-level keys whose values differ between two reads (all of them when either is not an object), leaving
    out a top-level number in both: a frame, time, runTime, calls or triangles count moves on every frame of a still
    scene, and "observe() changed (frame)" on a healthy page after a `wait` read as #130's frozen canvas (batch 3 review). */
const keysChanged = (a: unknown, b: unknown): string[] => {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return JSON.stringify(a) === JSON.stringify(b) ? [] : ["observe()"];
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => !(typeof x[k] === "number" && typeof y[k] === "number") && JSON.stringify(x[k]) !== JSON.stringify(y[k]));
};

/** The Pixels line, with a word when the picture is dark, mostly black, blown out or pale, and the Hues line, of the frame
    and of the objects in it: a dark game with small bright objects is near black and grey as a frame (reviewers, 2026-10-17). */
export function pixelsText(p: Pixels | undefined): string[] {
  if (!p) return [];
  const pc = (x: number) => `${Math.round(x * 100)}%`, o = p.objects, share = o && `${+(o.share * 100).toPrecision(o.share >= 0.1 ? 3 : 2)}%`;
  const notes = pixelNotes(p);
  const top = (h: Record<string, number>) => Object.entries(h).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${pc(v)}`).join(", ");
  const hues = top(p.hues) && (o?.rest ? `${top(p.hues)} of the frame; over the objects but ${o.rest.name} (${+(o.rest.share * 100).toPrecision(2)}% of it): ${top(o.rest.hues)}`
    : o && o.share < 0.95 ? `${top(p.hues)} of the frame; over the objects (${share} of it): ${top(o.hues)}` : top(p.hues)); // objects over nearly all of it: the same numbers twice
  return [`Pixels: brightness ${pc(p.brightness)}, colour saturation ${pc(p.saturation)}, ${pc(p.black)} near black, ${pc(p.blown)} blown out${p.changed === null ? "" : `; ${pc(p.changed)} of the picture changed since the last look`}.${notes.length ? ` ${notes.join(" ")}` : ""}`,
    ...hues ? [`Hues: ${hues}.`] : []];
}

/** The seam lines: what shows through a transparent canvas and the HTML over it (labels, HUD, menus, controls), or nothing for
    an opaque page with none. */
export function seamText(s: Seam | undefined): string[] {
  const pct = (x: number) => `${Math.round(x * 100)}%`, lines: string[] = [];
  if (s?.behind) {
    const { clear, open, background, texts, more } = s.behind;
    const t = texts.map(x => `; ${x.what} shows through ${pct(x.shows)} of its box`).join("") + (more ? `; … ${more} more texts` : "");
    lines.push(`Behind the canvas: transparent (alpha, clear ${clear}, no scene background), the page shows through ${pct(open)} of it; page background ${background}${t}.`);
  }
  if (s?.labels) {
    const { count, kinds, overlap, off, cut, list } = s.labels;
    const each = list.map(l => `${l.what} ${l.box ? `[${l.box.join(", ")}]` : "off-screen"}${l.overlaps ? " overlaps" : ""}${l.cut ? " cut off by the screen edge" : ""}`).join(", ");
    lines.push(`HTML over the canvas: ${count} (${kinds.join(", ")}), ${overlap} overlap, ${off} off-screen, ${cut} cut off: ${each}${count > list.length ? `, … ${count - list.length} more` : ""}.`);
  }
  return lines;
}

/** The Surface line, at most one: the largest object's surface as a repeating pattern, as noise, or with no detail. */
export function surfaceText(s: Look["surface"]): string[] {
  const REPEAT = 0.5, FLAT = 1, BUSY = 35; // first guesses, set against AA-3D gpu-short-1's 65 largest surfaces (sailboat's seas read 45 and 39; the next, 28)
  if (!s) return [];
  const pct = Math.round(s.share * 100);
  if ((s.repeat ?? 0) >= REPEAT) return [`Surface: "${s.name}" covers ${pct}% and repeats every ${s.every} px ${s.across ? "across" : "down"}: the pattern shows. Unless the user asked for a pattern, vary the scale with distance or blend two scales.`];
  if (s.detail >= BUSY) return [`Surface: "${s.name}" covers ${pct}% with dense fine detail (${s.detail} of 255): it reads as noise and shimmers as it moves. Unless the user asked for it, soften the fine detail or fade it with distance.`];
  if (s.detail < FLAT) return [`Surface: "${s.name}" covers ${pct}% with almost no detail (${s.detail} of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.`];
  return [];
}

/** The Subject line: how much of the picture the game's subject takes and which of its parts something else covers. */
/** The camera hint's kind: the subject under 2% of the picture, or a quarter of its named parts covered. */
const hintOf = (s: Subject) => s.unseen ? "" : s.share < 0.02 ? "little" : s.covered.length >= Math.max(2, s.parts / 4) ? "hiding" : "";

export function subjectText(s: Look["subject"], folded = false): string[] {
  if (!s) return [];
  if ("absent" in s) return [`Subject: window.__game.subject names "${s.name}", which is not in the scene.`];
  const guess = "a guess: the named object with the most named parts", pct = +(s.share * 100).toPrecision(2);
  const named = s.asked ? ` (window.__game.subject names "${s.asked}", which is not in the scene; this is ${s.set ? "the closest name" : guess}: set window.__game.subject to its name)`
    : s.set ? "" : ` (${guess}; set window.__game.subject to its name to choose)`;
  const covered = s.covered.slice(0, 8).map(([p, by]) => by ? `${p} (behind ${by})` : p).join(", ") + (s.covered.length > 8 ? `, … ${s.covered.length - 8} more` : "");
  const lines = [`Subject: ${s.name}${named} ${s.share ? `takes ${pct}% of the picture [${s.bbox!.join(", ")}]${s.edge ? ", cut by its edge" : ""}` : s.unseen ? "is drawn by its own shader or is see-through, which the ID image cannot find, so its share is not measured (see the picture)" : "drew no pixel"}; ${s.drew} of its ${s.parts} named parts show${s.covered.length ? `; in view but covered: ${covered}` : ""}.`];
  if (s.contrast && !folded) {
    const { bright: [b, bo], sat: [c, co], edge } = s.contrast, p = (x: number) => `${Math.round(x * 100)}%`;
    lines.push(`Stands out: subject brightness ${p(b)} against ${p(bo)} around it, colour ${p(c)} against ${p(co)}, edge contrast ${edge}.${blends(s.contrast)
      ? " It blends in: the eye has nothing to land on. Light it brighter or darker than its surroundings, or give it a colour the background lacks (references/lighting.md)." : ""}`);
  }
  const hint = hintOf(s);
  if (hint && !s.hintSaid) lines.push(`This camera shows ${hint === "little" ? "little of the subject" : "the subject's parts hiding each other"}: try other views with \`look\` camera, then move the page's own camera to the best (said once).`);
  return lines;
}

/** A look's fault lines, which stay until fixed: the Lighting and Surfaces lines and the Surface line. */
export const faultLines = (l: Pick<Look, "setup" | "surfaces" | "surface">) => [...l.setup ?? [], ...l.surfaces ?? [], ...surfaceText(l.surface)];
/** The same fault with other numbers is the same fault (a caster count that moved, gpu-4x4-7). */
export const faultKey = (l: string) => l.replace(/\d+(\.\d+)?/g, "#");
/** Lines of `before` no line of `now` matches by key, and the reverse, and `kept`: the lines the next comparison starts
    from. `partial`: the z-fighting check stopped at its work or triangle limit, so a Surfaces line gone may be a mesh it never compared, neither
    closed nor dropped (kept). */
export function faultDiff(before: string[], now: string[], partial = false): { closed: string[]; opened: string[]; kept: string[] } {
  const b = new Set(before.map(faultKey)), n = new Set(now.map(faultKey));
  const gone = before.filter(l => !n.has(faultKey(l))), unsure = gone.filter(l => partial && l.startsWith("Surfaces"));
  return { closed: gone.filter(l => !unsure.includes(l)), opened: now.filter(l => !b.has(faultKey(l))), kept: [...now, ...unsure] };
}

// Names sharing a stem from 2 copies are one line: `cube* ×300` for numbered ones, `spike ×3` and `Mesh ×40` for the same
// name repeated (three spikes and two eyes each got a line, and sheets listed spike0 … spike9: build-review-1, #81)
const group = <T extends { name: string }>(xs: T[]) => {
  const stem = (n: string) => n.replace(/\[\d+\]$|\d+$/, ""), count = new Map<string, number>(), by = new Map<string, T[]>();
  for (const x of xs) count.set(stem(x.name), (count.get(stem(x.name)) ?? 0) + 1);
  for (const x of xs) {
    const s = stem(x.name), k = count.get(s)! >= 2 ? `:${s}` : `=${by.size}`; // in order of first appearance
    by.has(k) ? by.get(k)!.push(x) : by.set(k, [x]);
  }
  return [...by].map(([k, v]) => ({ name: k.startsWith("=") ? v[0]!.name : `${k.slice(1)}${v.some(x => x.name !== k.slice(1)) ? "*" : ""} ×${v.length}`, all: v }));
};

// Three or more parts of one named object are one entry, `kart1: 60 parts`: a kart racer's look listed 50+ never-visible
// parts per kart and its sheets hundreds that left the view (1c17107f). `rest` keeps the others for group().
const byObject = <T extends { name: string; group?: string }>(xs: T[]) => {
  const n = new Map<string, number>(), big = (x: T) => !!x.group && n.get(x.group)! >= 3;
  for (const x of xs) if (x.group) n.set(x.group, (n.get(x.group) ?? 0) + 1);
  return { objects: [...new Set(xs.filter(big).map(x => x.group!))].map(g => ({ name: g, all: xs.filter(x => x.group === g) })), rest: xs.filter(x => !big(x)) };
};

export function lookText(l: Look): string {
  const canvas = l.canvasSame ? [] : canvasText(l.canvas);
  if (!l.ids) return [`Picture: ${l.picture}`, ...pixelsText(l.pixels), ...staleText(l), ...canvas, "No three.js scene: a raw WebGL page gets the picture only, no object list."].join("\n");
  const pct = (c: number) => { const p = c * 100; return `${p === 0 ? "0" : p >= 10 ? p.toFixed(0) : +p.toPrecision(2)}%`; };
  const on = group(l.onScreen).map(({ name, all }) => {
    const box = all.reduce<OnScreen["bbox"]>((b, o) => [Math.min(b[0], o.bbox[0]), Math.min(b[1], o.bbox[1]), Math.max(b[2], o.bbox[2]), Math.max(b[3], o.bbox[3])], all[0]!.bbox);
    // a thin or long object's size and direction; a group gives min–max sizes, and a direction only when all share it (a6f6e9cf)
    const span = (k: 0 | 1) => { const v = all.map(o => o.extent![k]), lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? `${lo}` : `${lo}–${hi}`; };
    const runs = [...new Set(all.map(o => o.runs))], size = all.every(o => o.extent) ? ` ${span(0)} × ${span(1)} units${runs.length === 1 && runs[0] ? `, ${runs[0]}` : ""}` : "";
    return `${name} ${pct(all.reduce((s, o) => s + o.coverage, 0))} [${box.join(", ")}]${size}${all.some(o => o.approximate) ? " approximate (a sprite or its own shader: see the picture)" : ""}`;
  });
  // hidden objects (visible false on it or a parent) and ones drawn by their own vertex shader or see-through get a line each, by name only
  const kept = l.neverVisible.filter(o => o.where !== "hidden" && o.where !== "own shader");
  const only = (where: NeverVisible["where"]) => group(l.neverVisible.filter(o => o.where === where)).map(g => g.name);
  const hidden = only("hidden"), shader = only("own shader");
  const keptBy = byObject(kept), never = [...group(keptBy.rest).map(({ name, all }) => {
    const sizes = [...new Set(all.map(o => o.size))], wheres = [...new Set(all.map(o => o.where))], overs = [...new Set(all.flatMap(o => o.over ?? []))];
    return `${name} (${sizes.length > 1 ? `${Math.min(...sizes)}–${Math.max(...sizes)}` : sizes[0]} units, ${wheres.join(" or ")}${overs.length ? `, behind ${overs.slice(0, 2).join(" or ")}` : ""})`;
  }), ...keptBy.objects.map(({ name, all }) => {
    // parts covered by their own object's parts are by design: named after the ones something else covers
    const names = group([...all.filter(o => !o.own), ...all.filter(o => o.own)]).map(g => g.name), wheres = [...new Set(all.map(o => o.where))];
    const behind = [...all.some(o => o.own) ? [`${name}'s own parts`] : [], ...new Set(all.flatMap(o => !o.own && o.over || []))].slice(0, 3);
    return `${name}: ${all.length} parts (${names.slice(0, 4).join(", ")}${names.length > 4 ? ", …" : ""}), ${wheres.join(" or ")}${behind.length ? `, behind ${behind.join(" or ")}` : ""}`;
  })];
  // fault lines the last look already printed word for word cost ~110 tokens a look; say once that they are still open
  const known = Object.values(l.known ?? {}).reduce((a, b) => a + b, 0), faults = faultLines(l), kinds = [l.setup?.length && "Lighting", l.surfaces?.length && "Surfaces", surfaceText(l.surface).length && "Surface"].filter(Boolean);
  const fault = [...l.faultsSame ? [`${kinds.join(", ")}: the same ${faults.length > 1 ? `${faults.length} lines` : "line"} as the last look, still open.`] : faults,
    ...known ? [`Known, intentional (window.__game.intentional): ${known} line${known > 1 ? "s" : ""} left out (${Object.entries(l.known!).map(([k, n]) => `"${k}" ${n}`).join(", ")}).`] : []];
  const DEPTH = 0.03; // a first guess: far must come out at least this much lighter or paler than near to read as distance
  const d = l.depth, p = (x: number) => `${Math.round(x * 100)}%`;
  const depth = d ? [`Depth: the nearest third of objects brightness ${p(d.near[0])}, colour ${p(d.near[1])}; the farthest third ${p(d.far[0])}, colour ${p(d.far[1])}.${d.far[0] - d.near[0] < DEPTH && d.near[1] - d.far[1] < DEPTH && !d.fog
    ? " Far objects are no lighter or paler than near ones, and there is no fog: depth does not read. Add scene.fog in the background's colour, or lighten distant colour." : ""}`] : [];
  const folded = foldedText(l), leftBy = byObject(l.left ?? []);
  const left = [...leftBy.rest.map(o => `${o.name} (${o.where})`), ...leftBy.objects.map(({ name, all }) => `${name}: ${all.length} parts (${[...new Set(all.map(o => o.where))].join(" or ")})`)];
  return [`Picture: ${l.picture}`, ...folded.length ? folded : pixelsText(l.pixels), ...staleText(l), ...depth, ...canvas, ...fault, ...l.unchecked ?? [], ...(l.closed ?? []).map(f => `Closed since the last look: ${f}`), ...edgeText(l.edge), ...coversText(l.covers),
    ...(l.veil ? [`The picture is ${l.veil}, over the canvas: Surface, Depth, Stands out and the objects' hues are not judged under it; On screen and Never visible come from the scene behind it.`] : []), ...seamText(l.seam), ...subjectText(l.subject, !!folded.length), `On screen (${l.onScreen.length}):`, ...on.slice(0, 40),
    ...(on.length > 40 ? [`… ${on.length - 40} more`] : []),
    `Never visible: ${never.slice(0, 50).join(", ") || "none"}${never.length > 50 ? `, … ${never.length - 50} more` : ""}`,
    ...(l.left?.length ? [`Left the view (an earlier look saw them): ${left.slice(0, 10).join(", ")}${left.length > 10 ? ", …" : ""}`] : []),
    ...(hidden.length ? [`Hidden by the game (visible false on it or a parent): ${hidden.slice(0, 20).join(", ")}${hidden.length > 20 ? `, … ${hidden.length - 20} more` : ""}`] : []),
    ...(shader.length ? [`Not found by the ID image (their own vertex shader places them, or they are see-through; see the picture): ${shader.slice(0, 20).join(", ")}${shader.length > 20 ? `, … ${shader.length - 20} more` : ""}`] : []),
    ...(kept.some(o => o.where === "in view") ? ["In view but no pixel: too small for the scene (check its size against the scene), hidden behind something, or not drawn."] : [])].join("\n");
}

/** One moment of a sheet: the page reloaded, `state` set, `steps` played as `interact` plays them, then `frames` stepped. */
export interface SheetItem { label?: string; state?: Record<string, unknown>; steps?: Step[]; frames?: number }
export const SHEET_MAX = 9;

// Runs in the page: lays the screenshots out in a grid of cells half the largest's size, each picture fitted into its
// cell and labelled in its corner.
export const COMPOSE = `(async (shots, labels) => {
  const imgs = await Promise.all(shots.map(s => createImageBitmap(new Blob([Uint8Array.from(atob(s), c => c.charCodeAt(0))], { type: "image/png" }))));
  // up to 3 in one row (3 in a 2 × 2 grid left a black quarter), and each label in a strip above its picture, never over
  // it (labels covered the game's own score: opinion-4, feel-3)
  const cols = imgs.length <= 3 ? imgs.length : Math.ceil(Math.sqrt(imgs.length)), rows = Math.ceil(imgs.length / cols);
  const w = Math.round(Math.max(...imgs.map(i => i.width)) / 2), h = Math.round(Math.max(...imgs.map(i => i.height)) / 2), c = document.createElement("canvas");
  const fs = Math.max(12, Math.round(h / 22)), lh = fs + 12;
  c.width = w * cols; c.height = (h + lh) * rows;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = fs + "px sans-serif"; ctx.textBaseline = "top";
  imgs.forEach((img, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * (h + lh);
    const k = Math.min(w / img.width, h / img.height);
    ctx.fillStyle = "#fff"; ctx.fillText(labels[i], x + 6, y + 6, w - 12);
    ctx.drawImage(img, x + (w - img.width * k) / 2, y + lh + (h - img.height * k) / 2, img.width * k, img.height * k);
  });
  return c.toDataURL("image/png").split(",")[1];
})`;

/** Saves `look-<n>-sheet.png`: up to SHEET_MAX moments of the game in one grid, each from a freshly reloaded page, so
    stages, levels or states set through setState (a camera the game exposes too) are compared in one picture instead of
    a screenshot script of the agent's own (two AA-3D cells built one). A moment past puppeteer's 180 s, or not started
    after 8 min, is left out and named in `missed`. Leaves the game reloaded at its first frame. */
export function sheet(game: Game, items: SheetItem[]): Promise<{ picture: string; labels: string[]; missed: string[]; cells: { label: string; look: Look }[] }> {
  return game.queue(async () => {
    if (!items.length || items.length > SHEET_MAX) throw new Error(`look: a sheet takes 1 to ${SHEET_MAX} moments`);
    const shots: string[] = [], labels: string[] = [], missed: string[] = [], cells: { label: string; look: Look }[] = [], start = Date.now(), said = new Set(lastHint.get(game));
    let failed: unknown;
    for (const [i, it] of items.entries()) {
      const label = it.label ?? (it.state ? JSON.stringify(it.state).slice(0, 60) : String(i + 1));
      // each moment caught on its own lost only that one; 8 min keeps the sheet under limited()'s 10 min cap
      if (Date.now() - start > 8 * 60_000) { missed.push(`${label} (not run: the sheet passed 8 min)`); continue; }
      try {
        await game.reload();
        if (it.state && !await gameUp(game, ["setState"])) throw new Error(`no window.__game.setState ${GAME_LATE}`);
        if (it.state) await game.page.evaluate(st => { const g = (window as any).__game; if (!g?.setState) throw new Error("the page has no window.__game.setState"); g.setState(st); }, it.state as any);
        if (it.steps?.length) await act(game, it.steps);
        // at least one frame, so the state is drawn; ten per evaluate, as act() steps them
        for (let left = Math.max(1, Math.floor(it.frames ?? 1)); left > 0; left -= 10) await game.page.evaluate(`__clock.step(${Math.min(left, 10)})`);
        // a look, not a bare screenshot, so each moment gets its lines (sheet returned a picture and nothing else: opinion-3, opinion-4)
        const l = await look(game);
        shots.push(readFileSync(l.picture).toString("base64"));
        labels.push(label); cells.push({ label, look: l });
      } catch (e) {
        if (!/timed out/.test(String((e as Error)?.message))) throw e;
        failed = e; missed.push(`${label} (past 180 s)`);
      }
    }
    if (!shots.length) throw failed;
    await game.reload();
    // only their Lighting lines are in the reply, so the next look prints its fault lines in full; their camera hints are not either,
    // so the hint said before the sheet stays the one said (a sheet cleared it and the hint repeated: build-review-1, #80)
    lastFaults.delete(game); lastHint.set(game, said); lastNumbers.delete(game);
    const run = runs.get(game) ?? { n: 0, all: new Set<string>(), seen: new Set<string>(), where: new Map() };
    runs.set(game, run);
    const picture = join(game.runDir, `look-${++run.n}-sheet.png`);
    writeFileSync(picture, Buffer.from(await game.page.evaluate(`${COMPOSE}(${JSON.stringify(shots)}, ${JSON.stringify(labels)})`) as string, "base64"));
    return { picture, labels, missed, cells };
  });
}

/** A `look` `viewports` item as a page viewport: a preset name (VIEWPORTS) or [width, height, dpr]. */
export function toViewport(v: string | number[]): { width: number; height: number; deviceScaleFactor: number } {
  const [width, height, dpr = 1] = typeof v === "string" ? VIEWPORTS[v] ?? [] : Array.isArray(v) ? v : [];
  if (!([width, height].every(n => Number.isInteger(n) && n! >= 200 && n! <= 4096) && typeof dpr === "number" && dpr >= 1 && dpr <= 4))
    throw new Error(`look: viewport ${JSON.stringify(v)} is not ${Object.keys(VIEWPORTS).join(", ")} or [width, height, dpr] (whole CSS pixels from 200 to 4096, DPR from 1 to 4)`);
  return { width: width!, height: height!, deviceScaleFactor: dpr };
}

/** Saves `look-<n>-viewports.png`: the page at each viewport, each on a fresh reload at that size and DPR, in one labelled
    grid, with each one's look (subject share, objects on screen, Canvas line). Leaves the page at its own size, reloaded at
    its first frame. */
export function viewports(game: Game, items: (string | number[])[]): Promise<{ picture: string; cells: { label: string; look: Look }[] }> {
  return game.queue(async () => {
    if (!Array.isArray(items) || !items.length || items.length > SHEET_MAX) throw new Error(`look: viewports takes 1 to ${SHEET_MAX} viewports`);
    const sizes = items.map(toViewport), r = game.resized, own = { ...game.page.viewport()!, ...r?.back }, cells: { label: string; look: Look }[] = [], said = new Set(lastHint.get(game));
    game.resized = undefined; // an interact resize is undone here, by hand: reload() would put a cell of the same width and height back to the opened size (dev #116)
    try {
      for (const [i, v] of sizes.entries()) {
        await game.page.setViewport({ ...own, ...v });
        await game.reload();
        cells.push({ label: `${typeof items[i] === "string" ? `${items[i]} ` : ""}${v.width}x${v.height}@${v.deviceScaleFactor}`, look: await look(game) });
      }
    } finally {
      await game.page.setViewport(own);
      await game.reload();
      lastFaults.delete(game); lastHint.set(game, said); lastNumbers.delete(game); // as a sheet
    }
    const picture = cells[cells.length - 1]!.look.picture.replace(/\.png$/, "-viewports.png");
    const shots = cells.map(c => readFileSync(c.look.picture).toString("base64"));
    writeFileSync(picture, Buffer.from(await game.page.evaluate(`${COMPOSE}(${JSON.stringify(shots)}, ${JSON.stringify(cells.map(c => c.label))})`) as string, "base64"));
    return { picture, cells };
  });
}

/** One line per sheet moment: the subject's share, what is on screen, the world's edge, objects that left the view and
    the Pixels numbers with their notes; under it, each Lighting line no earlier moment had (numbers blanked, as faultsSame).
    A sheet of two blown-out moments read as the picture only, and the agent judged exposure by eye (#39). */
export function sheetText(cells: { label: string; look: Look }[]): string[] {
  const said = new Set<string>(), pc = (x: number) => `${Math.round(x * 100)}%`;
  return cells.flatMap(({ label, look: l }) => {
    const s = l.subject && !("absent" in l.subject) ? `subject ${l.subject.name} ${+(l.subject.share * 100).toPrecision(2)}%; ` : "";
    const names = group(l.onScreen).map(g => g.name), p = l.pixels, notes = p ? pixelNotes(p) : [], left = byObject(l.left ?? []);
    const lighting = (l.setup ?? []).filter(f => { const k = faultKey(f); return !said.has(k) && !!said.add(k); });
    return [`${label}: ${s}on screen: ${names.slice(0, 8).join(", ") || "nothing"}${names.length > 8 ? `, … ${names.length - 8} more` : ""}${l.edge ? `; world's edge ${Math.round(l.edge.share * 100)}% of the picture` : ""}${l.left?.length ? `; left the view: ${[...group(left.rest).map(g => g.name), ...left.objects.map(o => `${o.name}: ${o.all.length} parts`)].join(", ")}` : ""}` +
      (p ? `; pixels: brightness ${pc(p.brightness)}, colour saturation ${pc(p.saturation)}, ${pc(p.black)} near black, ${pc(p.blown)} blown out${notes.length ? `. ${notes.join(" ")}` : ""}` : ""),
      ...lighting.map(f => `  ${f}`)];
  });
}

/** One line per viewports cell: its label, the subject's share, how many objects are on screen and which ones another
    cell shows that this one does not, and its Canvas line. */
export function viewportsText(cells: { label: string; look: Look }[]): string[] {
  // a count alone hid which object a phone cut off (opinion-7: 4 of 5 found the template's coin off a portrait phone)
  const all = new Set(cells.flatMap(c => c.look.onScreen.map(o => o.name)));
  return cells.map(({ label, look: l }) => {
    const s = l.subject && !("absent" in l.subject) ? `subject ${l.subject.name} ${+(l.subject.share * 100).toPrecision(2)}%` : "no subject";
    const here = new Set(l.onScreen.map(o => o.name)), missing = [...all].filter(n => !here.has(n));
    // past 5 names they are a crowd's edge (a cube field at another aspect), not one object a phone cut off
    const off = !missing.length ? "" : missing.length <= 5 ? `; not on screen here: ${missing.join(", ")}` : `; ${missing.length} objects another cell shows are not on screen here`;
    return `${label}: ${s}, ${l.onScreen.length} on screen${off}. ${canvasText(l.canvas).join("")}`.trim();
  });
}

/** Saves `look-<n>-scroll.png`: the page scrolled to each stop (0..1 of its scroll range), each on a fresh reload, in one
    labelled grid, with each one's look and the main view's camera: its position and the direction it looks along (a plain
    camera has no target; a look direction is what it has). Leaves the page reloaded at its first frame. */
export function scrollSweep(game: Game, stops: number[]): Promise<{ picture: string; cells: { label: string; text: string; look: Look }[] }> {
  return game.queue(async () => {
    if (!Array.isArray(stops) || !stops.length || stops.length > SHEET_MAX || !stops.every(p => typeof p === "number" && p >= 0 && p <= 1))
      throw new Error(`look: scroll takes 1 to ${SHEET_MAX} stops from 0 to 1, as in [0, 0.25, 0.5, 0.75, 1]`);
    const cells: { label: string; text: string; look: Look }[] = [], said = new Set(lastHint.get(game));
    try {
      for (const p of stops) {
        await game.reload();
        const at = (await play(game, [{ scroll: { progress: p } }]))!.split("; ")[0]!.replace("Scroll: ", "");
        const l = await look(game), cam = await game.page.evaluate(`(() => { const c = __harness.main()?.[1].camera, e = c?.matrixWorld.elements, r = n => +n.toFixed(2);
          if (!e) return null; const k = Math.hypot(e[8], e[9], e[10]) || 1; return [[e[12], e[13], e[14]].map(r), [-e[8] / k, -e[9] / k, -e[10] / k].map(r)]; })()`) as [number[], number[]] | null;
        const view = cam ? `camera [${cam[0].join(", ")}] looking along [${cam[1].join(", ")}]` : "no three.js camera", names = group(l.onScreen).map(g => g.name);
        cells.push({ label: `${Math.round(p * 100)}%: ${view}`, look: l,
          text: `${at}: ${view}; on screen: ${names.slice(0, 10).join(", ") || "nothing"}${names.length > 10 ? `, … ${names.length - 10} more` : ""}` });
      }
    } finally { await game.reload(); lastFaults.delete(game); lastHint.set(game, said); lastNumbers.delete(game); } // as a sheet
    const picture = cells[cells.length - 1]!.look.picture.replace(/\.png$/, "-scroll.png");
    const shots = cells.map(c => readFileSync(c.look.picture).toString("base64"));
    writeFileSync(picture, Buffer.from(await game.page.evaluate(`${COMPOSE}(${JSON.stringify(shots)}, ${JSON.stringify(cells.map(c => c.label))})`) as string, "base64"));
    return { picture, cells };
  });
}

/** zoom()'s refusal of a box not inside a page of this size, or "": the server also refuses one before the queue (checkArgs). */
export const zoomOutside = ([x, y, right, bottom]: number[], view: { width: number; height: number }) =>
  [x, y, right, bottom].every(n => Number.isFinite(n)) && right! - x! >= 1 && bottom! - y! >= 1 && x! >= 0 && y! >= 0 && right! <= view.width && bottom! <= view.height
    ? "" : `look: zoom is [left, top, right, bottom] inside the ${view.width} × ${view.height} page`;

/** Saves `look-<n>-zoom.png`: the box [left, top, right, bottom] of the page (in the picture's pixels, as look lists
    boxes, so one pastes straight in: opinion-3 read width and height, #54) enlarged up to 4× to fit 1280 × 800, after
    look()'s first frame and redraw, for detail a whole picture shows too small: AA-3D agents wrote crop scripts of their
    own for it (21 crops in one aurora cell). With `cam`, the page is drawn from there first, as look's camera (#125). `frame`
    is the live page's, which the reply names: an agent zoomed boxes read off a sheet into a crop of wall (dev #117). */
export function zoom(game: Game, [x, y, right, bottom]: number[], cam?: Cam): Promise<{ picture: string; scale: number; frame: number }> {
  return game.queue(() => keepSeed(game, async () => {
    const { page } = game;
    const view = page.viewport() ?? { width: 1280, height: 800 }, width = right! - x!, height = bottom! - y!, outside = zoomOutside([x!, y!, right!, bottom!], view);
    if (outside) throw new Error(outside);
    await page.evaluate(FIRST); // before the game's first frame only stage()'s bake has drawn: a blank zoom (opinion-3, #50)
    const scale = +Math.max(1, Math.min(4, 1280 / width, 800 / height)).toFixed(2);
    const run = runs.get(game) ?? { n: 0, all: new Set<string>(), seen: new Set<string>(), where: new Map() };
    runs.set(game, run);
    const picture = join(game.runDir, `look-${++run.n}-zoom.png`);
    const restore = cam && await placeCam(game, cam);
    let frame: number;
    try {
      frame = await page.evaluate(`${REDRAW(!!cam)}\n${FRAME}`) as number;
      // a clip is in the document's coordinates, the box in the picture's (#193). puppeteer's default captureBeyondViewport
      // stays, as false ignores the scale: it re-renders HTML at the scale (sharp HUD text) through a resize of the page to
      // 1 × 1 and back, which moves a scrolled page's scroll, put back after
      const [left, top] = await page.evaluate("[scrollX, scrollY]") as number[];
      await page.screenshot({ path: picture, clip: { x: x! + left!, y: y! + top!, width, height, scale: scale / (view.deviceScaleFactor ?? 1) } }); // enlarged from the picture, not the device pixels
      await page.evaluate(`scrollTo(${left}, ${top})`);
    } finally { await restore?.(); }
    return { picture, scale, frame };
  }));
}

// look's `at` in the page (#160): the ID image ignores shader discards and dither, so in the 2026-10-24 scene loops agents
// hid each mesh in turn and read the pixel (about 809 evals). Here the page's own shaders decide, for one page point: the
// last frame is drawn again (DRAW, post-processing included) with objects hidden and the canvas pixel read in the same task,
// which WebGL keeps until the task ends. An object is hidden by turning its layers off for one redraw, so its children still
// draw (`visible` would hide them with it), and put back before the read.
const PROBE = `(async (pt, url) => { ${VIEW}
  const c = r.domElement, rect = c.getBoundingClientRect(), persp = !!camera.isPerspectiveCamera;
  const gl = r.isWebGLRenderer || !r.backend?.isWebGPUBackend ? r.getContext?.() : null; // WebGPURenderer on its WebGL 2 backend too
  const can = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  // the drawing buffer's pixel under the point (GL rows run bottom-up)
  const bx = Math.floor((pt[0] + 0.5 - rect.left) / rect.width * c.width), row = Math.floor((pt[1] + 0.5 - rect.top) / rect.height * c.height), by = c.height - 1 - row;
  if (!(bx >= 0 && row >= 0 && bx < c.width && row < c.height)) return { line: "off the canvas." };
  const all = [];
  scene.traverseVisible(o => { if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.layers.test(camera.layers) && [o.material].flat().some(m => m?.visible)) all.push(o); });
  // what rays through the pixel hit, nearest first: through its centre and its four 4× MSAA samples, which an object's edge
  // can cover without the centre. A point or a line counts only as far from the ray as it draws (a point's radius in pixels
  // from its size, attenuated as three draws it; a line's one pixel)
  const T = window.__threeRuntime?.THREE ?? await import(url).catch(() => null), hits = [];
  // the world matrices the redraw will use, as render() brings them up to date, so a ray meets what is drawn
  if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
  if (!camera.parent && camera.matrixWorldAutoUpdate !== false) camera.updateMatrixWorld();
  if (T?.Raycaster) {
    const ray = new T.Raycaster(), k = (persp ? 2 * Math.tan(camera.fov * Math.PI / 360) : camera.top - camera.bottom) / camera.zoom / c.height; // a pixel's width, per unit of distance when perspective
    const reach = (o, d) => { const m = [o.material].flat()[0], size = m?.size ?? 1;
      return o.isPoints && persp && m?.sizeAttenuation ? k * size * c.height / 4 : k * (persp ? d : 1) * (o.isPoints ? Math.max(1, size / 2) : 1); };
    for (const [dx, dy] of [[0, 0], [-0.125, -0.375], [0.375, -0.125], [-0.375, 0.125], [0.125, 0.375]]) {
      ray.setFromCamera({ x: (bx + 0.5 + dx) / c.width * 2 - 1, y: (by + 0.5 + dy) / c.height * 2 - 1 }, camera);
      for (const o of all) {
        const got = [], thin = o.isPoints || o.isLine;
        if (thin) ray.params.Points.threshold = ray.params.Line.threshold = reach(o, camera.far);
        try { o.raycast(ray, got); } catch {}
        for (const x of got) if (!thin || (x.distanceToRay ?? ray.ray.distanceToPoint(x.point)) <= reach(o, x.distance)) hits.push(Object.assign(x, { edge: !!(dx || dy) }));
      }
    }
    hits.sort((a, b) => a.distance - b.distance);
  }
  // one per object, in the order of its nearest hit, told by its centre hit when it has one
  const first = new Map(), mid = new Map();
  for (const x of hits) { if (!first.has(x.object)) first.set(x.object, x); if (!x.edge && !mid.has(x.object)) mid.set(x.object, x); }
  const cand = [...first.keys()].map(o => mid.get(o) ?? first.get(o));
  const named = o => { for (let a = o; a && a !== scene; a = a.parent) if (a.name) return a.name; return o.type; };
  const label = x => named(x.object) + (x.object.isInstancedMesh && x.instanceId !== undefined ? "[" + x.instanceId + "]" : "");
  const entry = (x, i) => (i ? i === 1 ? "behind it " : "then " : "") + label(x) + (x.distance === undefined ? ", distance unknown (no ray hits it: its shader places its vertices)"
    : " " + +x.distance.toPrecision(3) + " m" + (i ? "" : " at [" + [x.point.x, x.point.y, x.point.z].map(v => +v.toFixed(2)).join(", ") + "]"));
  if (!can) return { line: cand.length ? cand.slice(0, 6).map(entry).join("; ") + "." : "a ray through it hits nothing.", untested: true };
  // the pixel with \`hide\` hidden, each set drawn once, through a 3 × 3 pixel scissor around it on WebGLRenderer (a render
  // target keeps its own, so passes still draw whole); 8 s of drawing at most, well inside guarded()'s bound
  const px = new Uint8Array(4), seen = new Map(), t0 = __clock.realNow(), STOP = {}, cut = !!r.isWebGLRenderer, pr = cut ? r.getPixelRatio() : 1;
  const at = hide => {
    const set = [...new Set(hide)], key = set.map(o => o.id).sort((a, b) => a - b).join();
    if (seen.has(key)) return seen.get(key);
    if (__clock.realNow() - t0 > 8000) throw STOP;
    const masks = set.map(o => o.layers.mask), box = cut && r.getScissor({ copy(v) { return Object.assign(this, v); } }), test = cut && r.getScissorTest();
    for (const o of set) o.layers.mask = 0;
    try {
      if (cut) { r.setScissorTest(true); r.setScissor((bx - 1) / pr, (by - 1) / pr, 3 / pr, 3 / pr); }
      (window.__threeRuntime?.originals ?? (f => f()))(() => ${DRAW}); // the runtime's auto-instancing draws its grouped originals, so hiding one hides it
    } finally {
      set.forEach((o, i) => { o.layers.mask = masks[i]; });
      if (cut) { r.setScissor(box.x, box.y, box.z, box.w); r.setScissorTest(test); }
    }
    const was = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.readPixels(bx, by, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, was);
    seen.set(key, [...px]);
    return seen.get(key);
  };
  // H: the layers found so far, hidden from then on; B: the background (every object hidden); P: the pixel with H hidden
  const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 8), H = [], layers = [], quiet = new Map(), done = new Set();
  let B, P, end;
  try {
    B = at(all); P = at([]);
    for (;;) {
      if (!differs(P, B)) { end = layers.length ? "background beyond" : "background"; break; }
      if (layers.length === 6) { end = "more behind"; break; }
      // the nearest object a ray hits whose hiding changes the pixel; the ones in front of it draw nothing here
      const open = cand.filter(x => !H.includes(x.object) && !done.has(x.object)), tried = [];
      let found = null;
      for (const x of open) { if (differs(at([...H, x.object]), P)) { found = x; break; } tried.push(x); quiet.set(x.object, x); }
      if (found) for (const x of tried) done.add(x.object);
      else {
        // none changes it alone: a stack of one colour (hiding the front shows the same colour) or an object no ray hits
        // (one its own shader places). The shortest start of [hits, objects with a shader of their own, the rest] whose
        // hiding changes the pixel ends at one that draws there (hiding all of it leaves the background, which differs),
        // found by doubling, then halving
        const own = o => [o.material].flat().some(m => m?.isShaderMaterial || (m && Object.hasOwn(m, "onBeforeCompile")));
        const order = [...open.map(x => x.object), ...all.filter(o => !H.includes(o) && !open.some(x => x.object === o)).sort((a, b) => own(b) - own(a))];
        if (!order.length) { end = "background beyond"; break; } // every object hidden and still not the background: a frame that draws differently each time
        let lo = 0, hi = 1;
        while (hi < order.length && !differs(at([...H, ...order.slice(0, hi)]), P)) { lo = hi; hi = Math.min(2 * hi, order.length); }
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (differs(at([...H, ...order.slice(0, m)]), P)) hi = m; else lo = m; }
        let o = order[hi - 1];
        // in a stack, the front is the nearest member that keeps the pixel with the rest of the stack hidden
        if (hi <= open.length) for (let i = 0; i < hi - 1; i++) if (!differs(at([...H, ...order.slice(0, hi).filter((_, j) => j !== i)]), P)) { o = order[i]; break; }
        found = open.find(x => x.object === o) ?? { object: o };
      }
      layers.push(found); H.push(found.object); quiet.delete(found.object);
      P = at(H);
    }
  } catch (e) { if (e !== STOP) throw e; end = "more not checked (8 s of drawing)"; }
  // a centre hit that left the pixel as it was draws nothing there: for certain once in front of a layer, or once the background was reached
  const sure = /^background/.test(end), notes = [...new Set([...quiet.values()].filter(x => !x.edge && (sure || done.has(x.object)))
    .map(x => label(x) + " draws nothing here (" + ([x.object.material].flat()[0]?.transparent ? "see-through, or its shader discards" : "its shader discards") + ")"))];
  return { line: [...layers.map(entry), end].join("; ") + "." + notes.map(n => " " + n + ".").join(""), drew: seen.size > 0 };
})`;
const PROBE_FN = new Function(`return ${PROBE}`)();

/** `look` `at`: for each point [x, y] in the live page's pixels (as look lists boxes), a line of what the page's own shaders
    draw there, nearest first, each with its distance from the camera (the first with its world point), down to the
    background, and the objects a ray hits there that draw nothing (a part a shader discards). A point outside the page is
    refused before any page work. With `cam`, from there as look's camera. On WebGPU the canvas cannot be read in the task
    that drew it, so a point lists what a ray hits and the reply says the shaders were not tested. */
export function probe(game: Game, points: number[][], cam?: Cam): Promise<string[]> {
  if (!Array.isArray(points) || !points.length || points.length > 8) throw new Error("look: at takes 1 to 8 points [x, y]");
  inside("at", points, game.page.viewport() ?? { width: 1280, height: 800 });
  return game.queue(() => keepSeed(game, async () => {
    const { page } = game, restore = cam && await placeCam(game, cam);
    let drew = false;
    try {
      if (!cam) await page.evaluate(FIRST);
      const { views, revision, webgpu } = await page.evaluate(`({ views: __harness.views.size, revision: String(__harness.revision), webgpu: !!__harness.main()?.[1].renderer.isWebGPURenderer })`) as
        { views: number; revision: string; webgpu: boolean };
      if (!views) throw new Error(NOT_DRAWN);
      const url = threeUrl(game, revision, webgpu), lines: string[] = [];
      let untested = false;
      for (const p of points) { // an evaluate each, so a slow page answers guarded()'s ping between points
        const r = await page.evaluate(PROBE_FN, p, url) as { line: string; drew?: boolean; untested?: boolean };
        drew ||= !!r.drew; untested ||= !!r.untested;
        lines.push(`At (${p.join(", ")}): ${r.line}`);
      }
      if (untested) lines.push("WebGPU: its canvas cannot be read in the task that drew it, so each point lists what a ray through it hits, nearest first, untested by the page's shaders: a part they discard is listed, and an object only its shader places is missed.");
      return lines;
    } finally {
      await restore?.();
      if (drew) await page.evaluate(DRAW).catch(() => {}); // the canvas holds the last test's draw: the frame again, as look draws it
    }
  }));
}

/** Saves `look-<n>-opening.png`: what a player sees in the first seconds, in real time (the page reloaded unpaused, its
    clock running from navigation), at about `at` seconds after load in one labelled grid; then reloads it paused at its
    first frame. `open` pauses at frame 0, so agents never saw a loading screen or a dim intro a player meets first,
    and in AA-3D full-1 a first frame behind one tended to lose the vote (4 votes against 1). `msPerFrame` is the real
    time per frame drawn from the first picture to the last (a software renderer took 730 ms a frame: report 7b22b0d6). */
export function opening(game: Game, at = [0.5, 2, 5]): Promise<{ picture: string; labels: string[]; msPerFrame: number }> {
  return game.queue(async () => {
    const shots: string[] = [], labels: string[] = [], t0 = Date.now(), drawn: [number, number][] = [];
    try {
      await game.reload({ paused: false });
      for (const s of at) {
        const wait = t0 + s * 1000 - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        labels.push(`${((Date.now() - t0) / 1000).toFixed(1)} s after load`);
        drawn.push([await game.page.evaluate("__harness.frameNo ?? 0") as number, Date.now()]);
        shots.push(Buffer.from(await screenshot(game.page)).toString("base64"));
      }
    } finally { await game.reload({ paused: true }); }
    const [[f0, w0], [f1, w1]] = [drawn[0]!, drawn[drawn.length - 1]!];
    // 0 when under 2 frames were drawn: a page that draws on demand is idle, not slow
    const msPerFrame = f1 - f0 < 2 ? 0 : Math.round((w1 - w0) / (f1 - f0));
    const run = runs.get(game) ?? { n: 0, all: new Set<string>(), seen: new Set<string>(), where: new Map() };
    runs.set(game, run);
    const picture = join(game.runDir, `look-${++run.n}-opening.png`);
    writeFileSync(picture, Buffer.from(await game.page.evaluate(`${COMPOSE}(${JSON.stringify(shots)}, ${JSON.stringify(labels)})`) as string, "base64"));
    return { picture, labels, msPerFrame };
  });
}

const CHANNEL = 8; // a channel must differ by more than this to count: edge and precision noise stays below it

/** RGB(A) bytes of an 8-bit, non-interlaced RGB or RGBA PNG (what Chrome's screenshots and screencast frames are), from its path or bytes. */
export function decodePng(path: string | Buffer): { w: number; h: number; bpp: number; px: Uint8Array } {
  const b = typeof path === "string" ? readFileSync(path) : path;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), type = b[25];
  if (b[24] !== 8 || (type !== 2 && type !== 6) || b[28]) throw new Error(`look: unsupported PNG ${typeof path === "string" ? path : "frame"}`);
  const idat: Buffer[] = [];
  for (let i = 8; i + 8 <= b.length; i += 12 + b.readUInt32BE(i)) {
    if (b.toString("latin1", i + 4, i + 8) === "IDAT") idat.push(b.subarray(i + 8, i + 8 + b.readUInt32BE(i)));
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = type === 6 ? 4 : 3, stride = w * bpp, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!, src = y * (stride + 1) + 1, row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp]! : 0, up = y ? px[row - stride + x]! : 0, c = x >= bpp && y ? px[row - stride + x - bpp]! : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? up : c) : 0;
      px[row + x] = (raw[src + x]! + pred) & 255;
    }
  }
  return { w, h, bpp, px };
}

// zlib.crc32 needs Node 20.15, and the stable build runs on 20.11
const CRC = Int32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n; });

/** An 8-bit RGB PNG of `rgb` (w × h × 3 bytes), unfiltered. */
function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(data.length + 12);
    b.writeUInt32BE(data.length); b.write(type, 4, "latin1"); data.copy(b, 8);
    let c = -1;
    for (let i = 4; i < data.length + 8; i++) c = CRC[(c ^ b[i]!) & 255]! ^ c >>> 8;
    b.writeInt32BE(~c, data.length + 8);
    return b;
  };
  const head = Buffer.alloc(13), raw = Buffer.alloc(h * (w * 3 + 1)); // each row: filter byte 0, then its pixels
  head.writeUInt32BE(w); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** [left, top, right, bottom] of the page (`view`, its size) or of the zoom `box`, once no point of `what` is outside it: a
    point outside is refused before the page is touched, never read off the edge: a zoom read its points in the enlarged
    picture's own pixels and clamped the ones outside it (#155). */
function inside(what: string, points: number[][], view: { width: number; height: number }, box?: number[]): [number, number, number, number] {
  const [l = 0, t = 0, r = view.width, b = view.height] = box ?? [];
  const out = points.find(([x, y]) => !(x! >= l && x! < r && y! >= t && y! < b));
  if (out) throw new Error(`look: ${what} (${out.join(", ")}) is outside ${box ? `the zoom box [${box.join(", ")}]` : `the ${r} × ${b} page`}`);
  return [l, t, r, b];
}

/** The reader of the reply line for colours at `points` [x, y] in the page's pixels, each the mean of 5 × 5 pixels as
    `reference` gives them (colour reads went through Python in 35 of 79 scene-loop sessions), from a picture of the whole
    page (`view`, its size) or, with `box` [left, top, right, bottom], of that part of it enlarged (a zoom's). */
export function colours(points: number[][], view: { width: number; height: number }, box?: number[]): (png: string) => string {
  const [l, t, r, b] = inside("sample", points, view, box);
  return png => {
    const { w, h, bpp, px } = decodePng(png), sx = w / (r - l), sy = h / (b - t);
    // the window's corner: centred on the page pixel's centre in the picture, kept inside it
    const corner = (v: number, o: number, s: number, n: number) => Math.min(Math.max(0, Math.round((v - o + 0.5) * s - 2.5)), n - 5);
    return `Colours (5 × 5 mean, in the page's pixels): ${points.map(([x, y]) => {
      const x0 = corner(x!, l, sx, w), y0 = corner(y!, t, sy, h), s = [0, 0, 0];
      for (let j = y0; j < y0 + 5; j++) for (let i = x0; i < x0 + 5; i++) for (let c = 0; c < 3; c++) s[c] += px[(j * w + i) * bpp + c]!;
      return `(${x}, ${y}) #${s.map(v => Math.round(v / 25).toString(16).padStart(2, "0")).join("")}`;
    }).join(", ")}.`;
  };
}

/** Share of pixels (0..1) whose red, green or blue differs by more than 8 between two PNGs; 1 when their sizes differ.
    With `out`, also writes there `b` dimmed to grey with the differing pixels red. */
export function pictureDiff(a: string, b: string, out?: string): number {
  const p = decodePng(a), q = decodePng(b);
  if (p.w !== q.w || p.h !== q.h) return 1;
  const rgb = out ? new Uint8Array(p.w * p.h * 3) : null;
  let n = 0;
  for (let i = 0; i < p.w * p.h; i++) {
    let hit = false;
    for (let c = 0; c < 3; c++) if (Math.abs(p.px[i * p.bpp + c]! - q.px[i * q.bpp + c]!) > CHANNEL) { hit = true; n++; break; }
    if (rgb) {
      const j = i * q.bpp, grey = (q.px[j]! + q.px[j + 1]! + q.px[j + 2]!) / 9;
      rgb[i * 3] = hit ? 255 : grey; rgb[i * 3 + 1] = rgb[i * 3 + 2] = hit ? 0 : grey;
    }
  }
  if (out) writeFileSync(out, encodePng(p.w, p.h, rgb!));
  return n / (p.w * p.h);
}

/** What a baseline was taken at, kept beside its picture as `<name>.json`. */
export interface Baseline { saved: string; frame: number; width: number; height: number; dpr: number; scroll: [number, number]; fingerprint: string }
const AT = `({ frame: ${FRAME}, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scroll: [scrollX, scrollY] })`;
export const baselinePath = (cwd: string, name: string) => {
  if (!/^[\w-]{1,64}$/.test(name)) throw new Error("look: a baseline name is up to 64 letters, digits, - or _");
  return join(harnessDir(cwd), "baselines", name);
};

/** look(), then keeps its picture as `<cwd>/paprika3d/baselines/<name>.png` with what it was taken at. */
export function saveBaseline(game: Game, cwd: string, name: string): Promise<{ look: Look; file: string }> {
  return game.queue(async () => {
    const base = baselinePath(cwd, name), l = await look(game);
    const at: Baseline = { saved: new Date().toISOString(), ...await game.page.evaluate(AT) as Omit<Baseline, "saved" | "fingerprint">, fingerprint: fingerprint(cwd) };
    mkdirSync(join(base, ".."), { recursive: true });
    copyFileSync(l.picture, `${base}.png`);
    writeFileSync(`${base}.json`, JSON.stringify(at));
    return { look: l, file: `${base}.png` };
  });
}

/** look() at the frame the baseline `name` was saved at (the page reloaded and stepped there unless it is at that frame
    now), and the Compare line: the share of pixels that differ, with the diff picture `look-<n>-diff.png`. */
export function compareBaseline(game: Game, cwd: string, name: string): Promise<{ look: Look; text: string }> {
  return game.queue(async () => {
    const base = baselinePath(cwd, name);
    let b: Baseline;
    try { b = JSON.parse(readFileSync(`${base}.json`, "utf8")); }
    catch { throw new Error(`look: no baseline named ${name}; save one first with \`look\` { save: "${name}" }`); }
    const now = await game.page.evaluate(AT) as Baseline;
    if (now.frame !== b.frame) { await game.reload(); await play(game, [{ wait: b.frame }]); }
    const l = await look(game), of = `${name} (saved ${b.saved.slice(0, 10)}, frame ${b.frame}, ${b.width}x${b.height}@${b.dpr})`;
    if (now.width !== b.width || now.height !== b.height || now.dpr !== b.dpr)
      return { look: l, text: `Compare: the page is ${now.width}x${now.height}@${now.dpr} but ${of} was taken at another size, so no pixel diff; open the page at size [${b.width}, ${b.height}]${b.dpr === 1 ? "" : ` with dpr ${b.dpr}`} to compare.` };
    const diff = l.picture.replace(/\.png$/, "-diff.png");
    return { look: l, text: `Compare: ${+(pictureDiff(`${base}.png`, l.picture, diff) * 100).toPrecision(2)}% of pixels differ from ${of}; diff at ${diff}` };
  });
}
