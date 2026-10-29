// The modelling page's one script (geo/dist/studio.js, loaded by src/model.ts into a page of the shared Chrome): a scene that
// stays between `model_run` calls, as Blender's does between execute-code calls, with three, geo and the file bridge in the
// code's scope, and the four-view picture `model_look` returns. three is bundled here (not the game's copy): this page
// loads no game. The scene is saved to the project after each run that changed it and loaded back on a new page.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { bake } from "../../fx/src/bake.ts";
import { geo, scatter } from "./index.ts";

type Bridge = { __studioRead(path: string): Promise<string>; __studioWrite(path: string, b64: string): Promise<string> };
type Stats = { meshes: { triangles: number; closed: boolean; openEdges: number; parts: number; volume?: number; genus?: number; bounds: { size: number[]; min: number[]; max: number[] }; attributes: string[]; instances?: number }[] };
const w = window as unknown as Window & Bridge & { __harness: { mainScene(): THREE.Scene; stats(t: unknown, o?: unknown): Stats } };

const scene = new THREE.Scene();
w.__harness = { mainScene: () => scene } as never; // inject/geometry.js adds stats() to it, as on a game page
const r = (v: number, k = 3) => +v.toFixed(k);
const b64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const parse = (buf: ArrayBuffer) => loader.parseAsync(buf, "");

/** `object` (the scene by default) as a GLB under the project: its bytes and triangles. */
async function save(path: string, object: THREE.Object3D = scene) {
  if (!object?.isObject3D) throw new Error(`save: pass an Object3D to write (or nothing, for the whole scene), got ${typeof object}`);
  const glb = await bake(object);
  let triangles = 0;
  object.traverse(o => { const g = (o as THREE.Mesh).geometry; if ((o as THREE.Mesh).isMesh && g) triangles += Math.floor((g.index?.count ?? g.attributes.position!.count) / 3) * ((o as THREE.InstancedMesh).count ?? 1); });
  return { saved: await w.__studioWrite(path, b64(glb)), bytes: glb.byteLength, triangles };
}

/** A .glb in the project (an `asset_search` pick, a model saved before), added to the scene; returns its root, named after the file. */
async function load(path: string) {
  if (!/\.glb$/i.test(path)) throw new Error(`load reads a .glb file, got ${path}`);
  // GLTFExporter wraps an object that is not a scene in one named AuxScene: load gives back the object itself
  const top = (await parse(bytes(await w.__studioRead(path)))).scene, root = top.children.length === 1 ? top.children[0]! : top;
  if (!root.name || /^(AuxScene|Scene)$/.test(root.name)) root.name = path.split("/").pop()!.replace(/\.glb$/i, "");
  scene.add(root);
  return root;
}

const clear = () => { for (const c of [...scene.children]) c.removeFromParent(); for (const k of Object.keys(scene.userData)) delete scene.userData[k]; };

/** What changed in the scene, cheaply: every object's name, place and parts (geometry and material versions, colour). */
function signature(): string {
  const out: unknown[] = [JSON.stringify(scene.userData)];
  scene.traverse(o => {
    const m = o as THREE.Mesh, g = m.geometry, mats = [m.material].flat().filter(Boolean) as THREE.MeshStandardMaterial[];
    o.updateMatrix();
    out.push(o.uuid, o.name, o.parent?.uuid, o.visible, ...o.matrix.elements.map(v => r(v, 5)), g?.uuid, (g?.attributes.position as THREE.BufferAttribute | undefined)?.version, g?.index?.count,
      (o as THREE.InstancedMesh).instanceMatrix?.version, ...mats.flatMap(x => [x.uuid, x.version, x.color?.getHex(), x.roughness, x.metalness, x.opacity, x.map?.uuid]));
  });
  return out.join(",");
}

/** The scene saved after a changing run, to paprika3d/model/scene.glb, so a new page (a restart, Chrome closed) starts from it. */
// Each object's own name rides in its glTF extras: GLTFLoader renames a repeated name (a second "block" came back "block_1").
async function keep(before: string, file: string) {
  if (signature() === before) return false;
  const copy = scene.clone(); // clone() copies userData, so the names go on the copy only
  copy.traverse(o => { o.userData.__name = o.name; });
  await w.__studioWrite(file, b64(await bake(copy)));
  return true;
}

async function restore(data: string) {
  const root = (await parse(bytes(data))).scene;
  root.traverse(o => { if (typeof o.userData.__name === "string") o.name = o.userData.__name; delete o.userData.__name; });
  Object.assign(scene.userData, root.userData);
  for (const c of [...root.children]) scene.add(c);
  return scene.children.length;
}

const deg = (v: number) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10;
const vec = (v: THREE.Vector3 | number[]) => `[${(Array.isArray(v) ? v : v.toArray()).map(x => r(x)).join(", ")}]`;
const hex = (c?: THREE.Color) => c ? "#" + c.getHexString() : "";
const matText = (m: THREE.MeshStandardMaterial) => [m.name || m.type, hex(m.color), m.roughness != null ? `roughness ${r(m.roughness, 2)}` : "", m.metalness != null ? `metalness ${r(m.metalness, 2)}` : "",
  m.transparent ? `opacity ${r(m.opacity, 2)}` : ""].filter(Boolean).join(" ");

/** One line per object in the scene (or under `name`), with each mesh's measurements; with `name`, that object in full. */
function summary(name?: string): string {
  const root = name ? scene.getObjectByName(name) : scene;
  if (!root) throw new Error(`no object named "${name}" in the modelling scene; its objects: ${scene.children.map(c => c.name || c.type).join(", ") || "none"}`);
  const lines: string[] = [], MAX = 60;
  let count = 0;
  const visit = (o: THREE.Object3D, depth: number) => {
    if (o !== scene) {
      if (++count > MAX) return;
      const m = o as THREE.Mesh, parts = [`${"  ".repeat(depth - (name ? 0 : 1))}${o.name || "(unnamed)"} ${o.type}`, `at ${vec(o.position)}`];
      if (o.rotation.x || o.rotation.y || o.rotation.z) parts.push(`turned ${vec([deg(o.rotation.x), deg(o.rotation.y), deg(o.rotation.z)])}°`);
      if (!o.scale.equals(new THREE.Vector3(1, 1, 1))) parts.push(`scale ${vec(o.scale)}`);
      if (!o.visible) parts.push("hidden");
      if (m.isMesh && m.geometry?.attributes.position) {
        const s = w.__harness.stats(m).meshes[0]!, mats = [m.material].flat() as THREE.MeshStandardMaterial[];
        parts.push(mats.map(matText).join(" + "), `${s.triangles.toLocaleString("en-US")} tri${s.instances != null ? ` × ${s.instances} instances` : ""}`, `size ${s.bounds.size.join(" × ")}`,
          s.closed ? `closed, volume ${s.volume}, genus ${s.genus}` : `open (${s.openEdges} open edges)`, s.parts > 1 ? `${s.parts} parts` : "");
        if (name && o === root) {
          parts.push(`\n  bounds ${vec(s.bounds.min)} to ${vec(s.bounds.max)}, attributes ${s.attributes.join(" ")}`);
          for (const x of mats) parts.push(`\n  material ${matText(x)}${["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"].filter(k => (x as never)[k]).map(k => ` ${k}`).join("")}${x.emissive?.getHex() ? ` emissive ${hex(x.emissive)}` : ""}, side ${["front", "back", "double"][x.side]}`);
        }
      } else if (o.children.length) parts.push(`${o.children.length} children`);
      lines.push(parts.filter(Boolean).join(", ").replace(/, \n/g, "\n"));
    }
    for (const c of o.children) visit(c, depth + 1);
  };
  visit(root, 0);
  if (count > MAX) lines.push(`… ${count - MAX} more objects: model_look { object } lists one of them`);
  return lines.join("\n") || "The modelling scene is empty.";
}

let renderer: THREE.WebGLRenderer | undefined, env: THREE.Texture | undefined;
export interface View { label: string; position: number[]; lookAt?: number[] }

/** The scene (or one object) drawn from each view into one labelled grid, as a JPEG; the four views framed to its bounds when none are given. */
function picture(o: { object?: string; cameras?: View[]; size?: number }): string {
  const target = o.object ? scene.getObjectByName(o.object) : scene;
  if (!target) throw new Error(`no object named "${o.object}" in the modelling scene`);
  const box = new THREE.Box3().setFromObject(target);
  if (box.isEmpty()) throw new Error(o.object ? `${o.object} has nothing to draw` : "The modelling scene is empty: make something with model_run first");
  const c = box.getCenter(new THREE.Vector3()), ext = box.getSize(new THREE.Vector3()), rad = Math.max(ext.length() / 2, 1e-3);
  const cams: { label: string; cam: THREE.Camera }[] = [];
  if (o.cameras?.length) for (const v of o.cameras) {
    const cam = new THREE.PerspectiveCamera(45, 1, rad / 100, rad * 100 + 1000);
    cam.position.fromArray(v.position); cam.lookAt(new THREE.Vector3().fromArray(v.lookAt ?? c.toArray()));
    cams.push({ label: v.label, cam });
  } else {
    const ortho = (label: string, dir: number[], up: number[]) => {
      const k = rad * 1.1, cam = new THREE.OrthographicCamera(-k, k, k, -k, 0.01, rad * 10);
      cam.up.fromArray(up); cam.position.copy(c).addScaledVector(new THREE.Vector3().fromArray(dir), rad * 4); cam.lookAt(c);
      cams.push({ label, cam });
    };
    ortho("front (from +Z)", [0, 0, 1], [0, 1, 0]); ortho("right (from +X)", [1, 0, 0], [0, 1, 0]); ortho("top (from +Y)", [0, 1, 0], [0, 0, -1]);
    const cam = new THREE.PerspectiveCamera(35, 1, rad / 100, rad * 100);
    cam.position.copy(c).addScaledVector(new THREE.Vector3(1, 0.8, 1).normalize(), rad / Math.sin(THREE.MathUtils.degToRad(17.5)) * 1.05); cam.lookAt(c);
    cams.push({ label: "three-quarter", cam });
  }
  const cols = Math.ceil(Math.sqrt(cams.length)), rows = Math.ceil(cams.length / cols), side = Math.min(1568, o.size ?? 1024);
  const cell = Math.floor(side / cols), W = cell * cols, H = cell * rows;
  renderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.toneMapping = THREE.ACESFilmicToneMapping;
  env ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  // the studio light and grid stand in only while drawing, so the scene saved holds only what the code made
  const step = 10 ** Math.floor(Math.log10(Math.max(ext.x, ext.z, 1e-3))), span = Math.ceil(Math.max(ext.x, ext.z) * 1.5 / step + 2) * step;
  const grid = new THREE.GridHelper(span, Math.round(span / step), 0x8a8a8a, 0x4a4a4a);
  grid.position.set(Math.round(c.x / step) * step, Math.min(0, box.min.y), Math.round(c.z / step) * step);
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(c.x + rad * 2, c.y + rad * 3, c.z + rad * 1.5); key.target.position.copy(c);
  const was = { env: scene.environment, bg: scene.background };
  scene.environment = env; scene.background = new THREE.Color(0x2a2a2a); scene.add(grid, key, key.target);
  try {
    renderer.setScissorTest(true);
    cams.forEach(({ cam }, i) => {
      const x = (i % cols) * cell, y = H - (Math.floor(i / cols) + 1) * cell;
      renderer!.setViewport(x, y, cell, cell); renderer!.setScissor(x, y, cell, cell); renderer!.render(scene, cam);
    });
    renderer.setScissorTest(false);
  } finally { scene.remove(grid, key, key.target); scene.environment = was.env; scene.background = was.bg; }
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const g = out.getContext("2d")!;
  g.drawImage(renderer.domElement, 0, 0);
  g.font = `${Math.max(12, Math.round(cell / 32))}px sans-serif`; g.fillStyle = "#fff"; g.strokeStyle = "#555";
  cams.forEach(({ label }, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    g.fillText(`${label}  ·  grid ${step} m`, x + 8, y + Math.max(16, cell / 22));
    g.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  });
  return out.toDataURL("image/jpeg", 0.85).split(",")[1]!;
}

const started = geo();
/** What the code sees, and the page's own calls from src/model.ts. */
(window as unknown as { __studio: unknown }).__studio = {
  ready: started.then(() => true),
  scope: async () => ({ THREE, scene, geo: await started, scatter, find: (n: string) => scene.getObjectByName(n), stats: (t: unknown, o?: unknown) => w.__harness.stats(t, o), save, load, clear }),
  signature, keep, restore, summary, picture,
};
