// three.js's own devtools hook, injected before any page script runs.
// Every three build announces itself (register: revision) and each Scene and renderer it creates (observe)
// to window.__THREE_DEVTOOLS__ when that exists. Collecting them into window.__harness lets the harness
// find and inspect a game's scene without the game exporting anything.
// Each renderer's render (WebGLRenderer and WebGPURenderer) is wrapped to remember, per scene, the renderer and camera that last drew it
// (`views`; a render to the screen wins over one to a render target), and render and clear are wrapped to keep the
// last frame's top-level calls in order (`frame`: scene, camera, target, autoClear flags, tone mapping and output colour space, or a clear), so look()
// can draw that frame again, HUD and overlay scenes included. `raw` keeps the unwrapped render, so that redraw skips
// the runtime layer's switches; anything the harness draws itself runs with `depth` raised so it is not recorded.
// `audio` counts sounds started (Web Audio sources and media play()), for feel(); `sounds` holds the names fx.js's sfx
// pushes for those it started, in play order (build-review-1, #85).
// `loads` records the fetches three's FileLoader makes: models, textures and sounds by extension, and every failure, so
// a model that silently fails to load (no onError) is still reported by `open`.
// `gl` holds every canvas given a WebGL context, so a page drawing with raw WebGL (no three.js) can boot and be pictured.
(() => {
  const h = window.__harness = { revision: null, scenes: [], renderers: [], views: new Map(), raw: new Map(), frame: [], depth: 0, audio: 0, sounds: [], loads: [], gl: new Set() };
  // `perf` sizes the assets from Resource Timing, which keeps 250 entries by default: a Vite dev page's modules fill that first (#131)
  performance.setResourceTimingBufferSize?.(100_000);
  for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
    const f = C?.prototype?.getContext;
    if (f) C.prototype.getContext = function (type) { const c = f.apply(this, arguments); if (c && /webgl/i.test(type)) h.gl.add(this); return c; };
  }
  const ASSET = /\.(glb|gltf|usd[acz]?|bin|hdr|exr|ktx2|png|jpe?g|webp|mp3|ogg|wav)$/i, fetch0 = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input?.url ?? input), path = url.split(/[?#]/)[0], name = path.split("/").pop();
    return fetch0.call(this, input, init).then(res => {
      if (!res.ok || ASSET.test(path)) h.loads.push({ name, status: res.status, bytes: +res.headers.get("content-length") || null });
      return res;
    }, err => { h.loads.push({ name, status: 0, error: String(err?.message ?? err) }); throw err; });
  };
  for (const [C, m] of [[window.AudioBufferSourceNode, "start"], [window.OscillatorNode, "start"], [window.HTMLMediaElement, "play"]]) {
    const f = C?.prototype?.[m];
    if (f) C.prototype[m] = function () { h.audio++; return f.apply(this, arguments); };
  }
  // A new frame starts at the first top-level call after a microtask boundary (a new task) or once the clock has
  // moved (__clock.step(n) runs n frames in one task, each at its own virtual time).
  let open = false, at;
  const record = (e) => {
    const t = performance.now();
    if (!open || t !== at) { open = true; at = t; h.frame = []; h.frameInfo = { calls: 0, triangles: 0 }; h.frameNo = (h.frameNo ?? 0) + 1; queueMicrotask(() => { open = false; }); }
    h.frame.push(e);
    // `open` / `perf` `network`: real ms after navigation of the first render to the screen (not to a target)
    if (h.firstFrameAt === undefined && e.target === null) h.firstFrameAt = realNow();
  };
  // Real time (performance.now is the harness's clock) and a GPU sync: a 1-pixel clear and read of a framebuffer of the
  // harness's own waits for all the work queued before it. A read of the bound framebuffer did not: after a multisampled
  // target's resolve three binds none, and the canvas, unwritten yet, read at once, so the next pass took the scene's GPU
  // time (a 7.7 ms pass read 0.3, the 64×32 pass after it 7.8: #191); a multisampled or float one refused the read.
  const realNow = () => Performance.prototype.now.call(performance);
  const own = new WeakMap(), px = new Uint8Array(4);
  const sync = (r) => {
    const gl = r.getContext?.();
    if (typeof gl?.readPixels !== "function" || gl.isContextLost()) return;
    const two = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const binds = two ? [[gl.DRAW_FRAMEBUFFER, gl.DRAW_FRAMEBUFFER_BINDING], [gl.READ_FRAMEBUFFER, gl.READ_FRAMEBUFFER_BINDING]] : [[gl.FRAMEBUFFER, gl.FRAMEBUFFER_BINDING]];
    const was = binds.map(([, b]) => gl.getParameter(b)), scissor = gl.isEnabled(gl.SCISSOR_TEST), discard = two && gl.isEnabled(gl.RASTERIZER_DISCARD);
    const mask = gl.getParameter(gl.COLOR_WRITEMASK), colour = gl.getParameter(gl.COLOR_CLEAR_VALUE);
    let fb = own.get(gl);
    if (!fb || !gl.isFramebuffer(fb)) {
      const rb = gl.createRenderbuffer(), rb0 = gl.getParameter(gl.RENDERBUFFER_BINDING);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, two ? gl.RGBA8 : gl.RGBA4, 1, 1); gl.bindRenderbuffer(gl.RENDERBUFFER, rb0);
      own.set(gl, fb = gl.createFramebuffer()); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.disable(gl.SCISSOR_TEST); if (discard) gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // the page's state as it was: three's state cache holds these and does not read them back
    binds.forEach(([t], i) => gl.bindFramebuffer(t, was[i])); if (scissor) gl.enable(gl.SCISSOR_TEST); if (discard) gl.enable(gl.RASTERIZER_DISCARD);
    gl.colorMask(...mask); gl.clearColor(...colour);
  };
  // A WebGPU device has no blocking read: sync() waits on its queue (a promise), and passes are timed by timestamp queries.
  // A WebGPURenderer not initialised yet (a second one for thumbnails) has no device, and nothing to wait for: it threw,
  // which stopped `perf`'s frame stamps and its work.
  h.sync = () => Promise.all(h.renderers.map(r => r.backend?.isWebGPUBackend ? r.backend.device?.queue.onSubmittedWorkDone() : sync(r)));
  // `perf`'s passes on WebGPU: three writes a pair of timestamps per render pass once its backend tracks them (the
  // device asks for every feature the adapter has), keyed by uid in the order the passes ran; a top-level call keeps the
  // uids it added (a shadow map is a pass of its own), and gpuTimes() resolves them into each call's ms after the frames.
  const pool = (r) => r.backend?.isWebGPUBackend ? r.backend.timestampQueryPool?.render ?? null : null;
  const tracked = new Map(); // a game that tracks timestamps itself keeps them on
  h.track = (on) => {
    for (const r of h.renderers) if (r.backend?.isWebGPUBackend && r.hasFeature?.("timestamp-query")) {
      if (on) { tracked.set(r, r.backend.trackTimestamp); r.backend.trackTimestamp = true; }
      else if (tracked.has(r)) { r.backend.trackTimestamp = tracked.get(r); tracked.delete(r); }
    }
  };
  h.gpuTimes = async () => {
    for (const r of h.renderers) if (pool(r)) await r.resolveTimestampsAsync("render");
    for (const t of h.timing ?? []) if (t.uids) { t.ms = t.uids.reduce((s, [r, u]) => s + (pool(r)?.timestamps.get(u) ?? 0), 0); delete t.uids; }
  };
  // What a pass drew, for `perf`: the scene's name, "main scene", or the first object of a small scene (a
  // full-screen quad) or the object drawn alone (EffectComposer's quad) by its material's name or type. A ShaderPass
  // whose shader has no name is three's "unspecified": named by its uniforms, as five passes of the 2026-10-28 demo read alike.
  const matName = (m) => m.name && m.name !== "unspecified" ? m.name
    : [m.type, ...(m.uniforms ? [Object.keys(m.uniforms).filter(k => k !== "tDiffuse").slice(0, 3).join(", ")].filter(Boolean) : [])].join(" with uniforms ");
  const what = (o) => {
    if (o?.name) return o.name;
    if (o?.isScene && h.main()?.[0] === o) return "main scene";
    const one = o?.isScene ? (o.children.length <= 2 ? o.children[0] : null) : o;
    if (!one) return o?.isScene ? `scene of ${o.children.length} objects` : "object";
    const m = [one.material].flat()[0];
    return `${o?.isScene ? "scene: " : ""}${one.name || one.type}${m ? ` (${matName(m)})` : ""}`;
  };
  const watch = (r) => {
    const render = r.render, clear = r.clear;
    h.raw.set(r, render);
    r.render = function (scene, camera) {
      const target = r.getRenderTarget(), screen = target === null;
      if (scene?.isScene && (screen || !h.views.get(scene)?.screen)) h.views.set(scene, { renderer: r, camera, screen });
      if (h.skip && !h.depth) { // a frame `interact` or `eval` runs without drawing: what render does besides drawing,
        // except info.reset(), so info keeps the last drawn frame's counts (an observe() that reads them read 0 after an until)
        if (scene?.matrixWorldAutoUpdate) scene.updateMatrixWorld();
        if (camera?.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
        if (r.info?.render.frame !== undefined) r.info.render.frame++;
        return;
      }
      if (h.depth) return render.apply(this, arguments); // a render inside a render (Reflector, CubeCamera) is part of the outer one
      // `out`: a RenderPipeline draws its output quad with tone mapping off and the working colour space, and puts the
      // renderer's back after, so look's redraw of that quad encoded it to sRGB a second time (dev #120)
      record({ r, target, scene, camera, auto: [r.autoClear, r.autoClearColor, r.autoClearDepth, r.autoClearStencil], out: [r.toneMapping, r.outputColorSpace] });
      const t = h.timing ? realNow() : null;
      // three's WebGL info counts one render call at a time (autoReset), so a frame drawn in passes (bloom into render
      // targets, then a full-screen quad) would read as its last pass alone: frameInfo adds up the frame's top-level calls.
      // WebGPU's info is a running total over the animation frame, and its `calls` counts render calls since start.
      const i = r.info?.render, key = r.isWebGPURenderer ? "drawCalls" : "calls", c0 = i?.[key] ?? 0, t0 = i?.triangles ?? 0;
      const q = t !== null ? pool(r) : null, q0 = q?.queryOffsets.size ?? 0;
      h.depth++; window.__clock?.drawing(1); // what three makes while drawing takes no number from the game's Math.random
      try { return render.apply(this, arguments); } finally {
        h.depth--; window.__clock?.drawing(-1);
        const reset = r.isWebGLRenderer && r.info?.autoReset !== false; // info holds this call alone; otherwise a running total
        const calls = i ? (reset ? i[key] : i[key] - c0) : 0, triangles = i ? (reset ? i.triangles : i.triangles - t0) : 0;
        if (i && h.frameInfo) { h.frameInfo.calls += calls; h.frameInfo.triangles += triangles; }
        if (t !== null) { // `perf`'s passes: each top-level call timed to the end of its GPU work, or by its GPU timestamps
          sync(r);
          const p = pool(r), uids = p ? [...p.queryOffsets.keys()].slice(q ? q0 : 0).map(u => [r, u]) : null;
          h.timing.push({ frame: h.frameNo, pass: `${what(scene)} → ${target ? `${target.width}×${target.height}` : "screen"}`, ms: realNow() - t,
            calls, triangles, ...(uids ? { uids } : {}) });
        }
      }
    };
    r.clear = function (color = true, depth = true, stencil = true) {
      if (!h.depth) record({ r, target: r.getRenderTarget(), clear: [color, depth, stencil] });
      return clear.apply(this, arguments);
    };
  };
  // The game's main scene and the view that last drew it: a scene drawn to the screen beats one drawn only into a render
  // target (a RoomEnvironment baked by PMREMGenerator), then the scene with the most objects in its whole tree (a game
  // that groups everything under one root has few top-level children; an environment scene has many).
  const size = (s) => { let n = 0; s.traverse(() => { n++; }); return n; };
  const biggest = (list, scene) => { if (list.length < 2) return list[0]; let top, n = -1; for (const x of list) { const m = size(scene(x)); if (m > n) { n = m; top = x; } } return top; }; // one traversal each; the first of equals wins, as in a stable sort
  h.main = () => {
    const views = [...h.views], drawn = views.filter(([, v]) => v.screen);
    return biggest(drawn.length ? drawn : views, v => v[0]) ?? null;
  };
  // a view that never drew to the screen (stage()'s environment bake, before the game's first frame) is not the game's
  // scene: `eval`'s scene and find() read it after every open and reload (opinion-3, #50)
  h.mainScene = () => { const m = h.main(); return m?.[1].screen ? m[0] : biggest(h.scenes, s => s) ?? m?.[0]; };
  // Page elements over the game's canvas, which looks of the 3D scene never showed: a loading veil or title card dimming
  // the first frame lost 4 of 5 AA-3D votes, and an opacity-0 #loading div took an atlantis agent's clicks for 50 calls.
  // An 8 × 8 grid of points over the canvas: at each, the elements painted above it (pointer-events forced on for that
  // read, so a veil that lets clicks through still counts) that show something, and the element a click there reaches.
  h.canvas = () => h.main()?.[1].renderer.domElement ?? h.renderers[0]?.domElement ?? document.querySelector("canvas");
  const tag = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : e.classList[0] ? "." + e.classList[0] : ""}`;
  const label = (e) => {
    const text = (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${tag(e)}${text ? ` "${text}"` : ""}`;
  };
  const opacity = (e) => { let o = 1; for (let x = e; x instanceof Element; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
  // only rgba() has an alpha: rgb(0, 0, 0)'s last number is its blue, and a black loading veil read as transparent
  const alpha = (c) => c.startsWith("rgba(") ? +(c.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1) : c.startsWith("rgb(") ? 1 : 0;
  const shows = (e) => {
    const s = getComputedStyle(e);
    return s.visibility !== "hidden" && (alpha(s.backgroundColor) > 0.05 || s.backgroundImage !== "none" || s.backdropFilter !== "none"
      || (s.webkitBackdropFilter ?? "none") !== "none" || ["IMG", "VIDEO", "CANVAS", "svg"].includes(e.tagName));
  };
  h.hit = (x, y) => { // the element a pointer event at x, y reaches when it is not the canvas
    const c = h.canvas(), e = document.elementFromPoint(x, y);
    if (!c || !e || e === c || c.contains(e)) return null;
    // "" for a visible control the click was aimed at (a swatch button read as a failure four times, feel-8); an
    // invisible one is the trap this catches (an opacity-0 #loading div)
    const o = opacity(e);
    return o >= 0.1 && e.closest("button, a[href], input, select, textarea, label, [role=button]") ? "" : `${label(e)} (opacity ${+o.toFixed(2)})`;
  };
  // What a pointer at x, y (page pixels) is over in the scene: the nearest shown object the main view's camera sees there,
  // by its own name or its nearest named parent's, picked by the runtime layer's Raycaster, else one from `url` (look's three).
  h.pick = async (x, y, url) => {
    const [scene, v] = h.main() ?? [];
    if (!v?.screen) return null; // before the game's first frame the only view is stage()'s bake: "an unnamed Mesh" (opinion-4)
    const T = scene && (window.__threeRuntime?.THREE ?? await import(url).catch(() => null));
    if (!T) return null;
    const b = v.renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera({ x: (x - b.left) / b.width * 2 - 1, y: 1 - (y - b.top) / b.height * 2 }, v.camera);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const hit = ray.intersectObject(scene).find(i => shown(i.object));
    if (!hit) return "nothing in the scene";
    let o = hit.object, d = +hit.distance.toFixed(1);
    while (!o.name && o.parent && o.parent !== scene) o = o.parent;
    return o.name ? `${o.name} (${o.type}, ${d} units)` : `an unnamed ${hit.object.type} (${d} units)`;
  };
  // An N × M grid of points over the part of rect `b` inside the window, and a read with pointer-events forced on.
  const grid = (b, N = 8, M = N) => {
    const x0 = Math.max(0, b.left), y0 = Math.max(0, b.top), x1 = Math.min(innerWidth, b.right), y1 = Math.min(innerHeight, b.bottom), pts = [];
    if (x1 > x0 && y1 > y0) for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) pts.push([x0 + (i + 0.5) * (x1 - x0) / N, y0 + (j + 0.5) * (y1 - y0) / M]);
    return pts;
  };
  const forced = (f) => {
    const force = document.createElement("style");
    force.textContent = "* { pointer-events: auto !important }";
    document.head.append(force);
    try { return f(); } finally { force.remove(); }
  };
  h.covers = (n = 3) => {
    const c = h.canvas();
    if (!c?.isConnected) return [];
    const pts = grid(c.getBoundingClientRect());
    if (!pts.length) return [];
    const found = new Map(), at = (e) => found.get(e) ?? found.set(e, { over: 0, clicks: 0 }).get(e);
    for (const [x, y] of pts) { const e = document.elementFromPoint(x, y); if (e && e !== c && !c.contains(e)) at(e).clicks++; }
    forced(() => {
      for (const [x, y] of pts) {
        const stack = document.elementsFromPoint(x, y), k = stack.indexOf(c);
        for (const e of k < 0 ? [] : stack.slice(0, k)) if (shows(e) && opacity(e) > 0.05) at(e).over++;
      }
    });
    return [...found].map(([e, n]) => ({ e, over: n.over / pts.length, clicks: n.clicks / pts.length }))
      .filter(f => f.over >= 0.25 || f.clicks >= 0.25).sort((a, b) => b.over - a.over || b.clicks - a.clicks).slice(0, n)
      .map(({ e, over, clicks }) => {
        const s = getComputedStyle(e);
        return { what: label(e), over: +over.toFixed(2), clicks: +clicks.toFixed(2), opacity: +opacity(e).toFixed(2),
          background: alpha(s.backgroundColor) > 0.05 ? s.backgroundColor : s.backgroundImage !== "none" ? "an image" : s.backdropFilter !== "none" ? `backdrop-filter ${s.backdropFilter}` : null };
      });
  };
  // `look`'s seam, the page-canvas boundary both ways (`free(x, y)`: the look's ID image has no object at page point x, y).
  // Behind: only when the page shows through the canvas: a context with alpha, a clear alpha under 1, no scene background
  // and no CSS background on the canvas. Then, of an 8 × 8 grid over the canvas, the share where the scene draws nothing,
  // the background most of those points show (the first element behind the canvas with one, else the root's), and for
  // each text behind the canvas, the share of a 6 × 3 grid over its glyphs' box where it is behind the canvas and the scene
  // draws nothing there. Labels: every CSS2DObject's element (CSS2DRenderer), drei Html's (an absolute div positioned
  // by an inline translate3d, beside the canvas of a scene React Three Fiber made), and the page's own UI over the canvas
  // (below); off-screen is hidden by its renderer (behind the camera) or outside the canvas, cut off is partly past the
  // screen edge, and a label overlaps when its box meets another's. Boxes are page pixels, the picture's.
  h.seam = (free = () => true) => {
    const c = h.canvas(), [scene, v] = h.main() ?? [];
    if (!c?.isConnected || !v) return { behind: null, labels: null };
    const b = c.getBoundingClientRect(), r = v.renderer, ctx = r.getContext?.();
    const hex = (col) => col.startsWith("rgb") ? "#" + col.match(/[\d.]+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, "0")).join("") : col;
    const box = (q) => [Math.round(q.left), Math.round(q.top), Math.round(q.right) - 1, Math.round(q.bottom) - 1];
    let behind = null;
    if (ctx?.getContextAttributes?.()?.alpha && r.getClearAlpha() < 1 && !scene.background && alpha(getComputedStyle(c).backgroundColor) <= 0.05) behind = forced(() => {
      const pts = grid(b), bgs = new Map(), page = (e) => { const s = getComputedStyle(e); return alpha(s.backgroundColor) > 0.05 ? hex(s.backgroundColor) : s.backgroundImage !== "none" ? "an image" : null; };
      const root = [document.documentElement, document.body].find(e => e && page(e)), dflt = root ? `${page(root)} (${tag(root)})` : "#ffffff (the browser's default)";
      let open = 0;
      for (const [x, y] of pts) {
        if (!free(x, y)) continue;
        open++;
        const stack = document.elementsFromPoint(x, y), e = stack.slice(stack.indexOf(c) + 1).find(page), k = e ? `${page(e)} (${tag(e)})` : dflt;
        bgs.set(k, (bgs.get(k) ?? 0) + 1);
      }
      const texts = [], walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), range = document.createRange();
      for (let t, n = 0; (t = walk.nextNode()) && n < 500; n++) {
        const e = t.parentElement;
        if (!t.data.trim() || !e || c.contains(e) || ["SCRIPT", "STYLE"].includes(e.tagName) || opacity(e) <= 0.05 || getComputedStyle(e).visibility === "hidden") continue;
        range.selectNodeContents(t);
        let under = 0, shown = 0;
        for (const [x, y] of grid(range.getBoundingClientRect(), 6, 3)) {
          const stack = document.elementsFromPoint(x, y), i = stack.indexOf(c);
          if (i < 0 || stack.indexOf(e) <= i) continue;
          under++;
          if (free(x, y)) shown++;
        }
        if (under) texts.push({ what: label(e), shows: +(shown / under).toFixed(2) });
      }
      return { clear: +r.getClearAlpha().toFixed(2), open: +(open / pts.length).toFixed(2), background: [...bgs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dflt, texts: texts.slice(0, 3), more: Math.max(0, texts.length - 3) };
    });
    const els = new Map(), shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    for (const s of h.scenes) s.traverse(o => { if (o.isCSS2DObject && o.element && shown(o)) els.set(o.element, "CSS2DRenderer"); });
    if (scene.__r3f) for (const e of (c.parentElement?.parentElement ?? c.parentElement)?.querySelectorAll("div") ?? [])
      if (!els.has(e) && e.style.position === "absolute" && e.style.transform.startsWith("translate3d(") && !e.contains(c)) els.set(e, "drei Html");
    // the page's own HUD, menus and controls over the canvas: the outermost fixed or absolute elements with text or a control
    // in them that meet the canvas and show, under a quarter of it (a bigger one is a veil, `covers`); a label's renderer
    // layer holds labels, not UI
    const area = Math.max(1, b.width * b.height), ctl = "button, a[href], input, select, textarea, [role=button]";
    for (const e of document.body.querySelectorAll("*")) {
      if (els.has(e) || e === c || e.contains(c) || c.contains(e) || ["SCRIPT", "STYLE"].includes(e.tagName)) continue;
      const s = getComputedStyle(e);
      if (!["fixed", "absolute"].includes(s.position) || s.display === "none" || s.visibility === "hidden" || opacity(e) <= 0.1) continue;
      const q = e.getBoundingClientRect();
      if (q.right <= b.left || q.left >= b.right || q.bottom <= b.top || q.top >= b.bottom || q.width * q.height >= area / 4) continue;
      if (!(e.innerText || "").trim() && !e.matches(ctl) && !e.querySelector(ctl) && !e.onclick) continue;
      let inside = false;
      for (let a = e.parentElement; a && !inside; a = a.parentElement) inside = els.get(a) === "page";
      if (inside || [...els.keys()].some(l => e.contains(l))) continue;
      els.set(e, "page");
    }
    if (!els.size) return { behind, labels: null };
    const all = [...els].map(([e, via]) => {
      const q = e.getBoundingClientRect(), off = getComputedStyle(e).display === "none" || q.right <= b.left || q.left >= b.right || q.bottom <= b.top || q.top >= b.bottom;
      const cut = !off && (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight); // part of it past the screen edge
      return { e, q, via, off, cut, overlaps: false };
    });
    const on = all.filter(l => !l.off);
    for (let i = 0; i < on.length && i < 300; i++) for (let j = i + 1; j < on.length && j < 300; j++) {
      const p = on[i].q, q = on[j].q;
      if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) on[i].overlaps = on[j].overlaps = true;
    }
    const kinds = [...new Set(all.map(l => `${l.e.classList[0] ? "." + l.e.classList[0] : l.e.tagName.toLowerCase()} via ${l.via}`))];
    return { behind, labels: { count: all.length, kinds: kinds.slice(0, 3), overlap: on.filter(l => l.overlaps).length, off: all.length - on.length, cut: on.filter(l => l.cut).length,
      list: all.slice(0, 12).map(l => ({ what: label(l.e), box: l.off ? null : box(l.q), overlaps: l.overlaps, cut: l.cut })) } };
  };
  const hook = new EventTarget();
  hook.addEventListener("register", (e) => { h.revision = e.detail.revision; });
  hook.addEventListener("observe", (e) => {
    const o = e.detail;
    if (o.isScene) h.scenes.push(o);
    else if (o.isWebGLRenderer || o.isWebGPURenderer) {
      h.renderers.push(o);
      watch(o);
    }
  });
  window.__THREE_DEVTOOLS__ = hook;
})();
