// Stale three.js for `open`'s reply: the project's three against the current release, an EffectComposer with no
// OutputPass, and the removed API its source uses. Agents write three.js from a model trained on an older release, so
// they reach for API that is gone and then debug the symptom. Release numbers are from three's own builds (the
// @deprecated markers and when each name left them).
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { sourceFiles } from "./fingerprint.ts";

/** Each row: the pattern (the reply names its first group, or else the whole match), when it went, and what to use. */
export const STALE: [RegExp, string, string][] = [
  [/\bTHREE\.Geometry\b/g, "removed in r125", "BufferGeometry"],
  [/\b(sRGBEncoding|outputEncoding)\b/g, "deprecated in r152 and removed in r162", "colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)"],
  [/\buseLegacyLights\b/g, "deprecated in r155 and removed in r165", "nothing: remove it and retune light intensities (legacy lights were scaled by π)"],
  [/\bphysicallyCorrectLights\b/g, "deprecated in r150 and removed in r160", "nothing: lights are physically correct by default since r155"],
  [/\bexamples\/js\//g, "removed in r148", "the ES modules in three/addons/ (examples/jsm/)"],
  // R3F 9 dropped the per-element prop types; only an import from the package counts, since a game may name its own MeshProps
  [/import\s+(?:type\s+)?\{[^}]*?\b(\w*(?:Mesh|Group|Object3D|Light|Material|Geometry|Camera|Points|Line)Props|Object3DNode)\b[^}]*\}\s*from\s*["']@react-three\/fiber["']/g,
    "removed in React Three Fiber 9", "ThreeElements['mesh'] (and so on for each element)"],
];

const CODE = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".vue", ".svelte"]);
const MAP = /["']three["']\s*:\s*["'][^"']*?three@([\w.^~-]+)/; // an import map's "three": ".../three@0.160.0/..."
const minor = (v: unknown) => Number(String(v ?? "").match(/^\D*0\.(\d+)/)?.[1]) || 0;
const json = (p: string) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return undefined; } };

/** The current three.js release: scripts/build-plugin.ts writes it into the bundle; from source, the repo's own three. */
export const CURRENT = minor(process.env.PAPRIKA3D_THREE) || minor(json(resolve(import.meta.dirname, "../node_modules/three/package.json"))?.version);

/** One line per use of removed API in `src` ("src/main.js:12 uses sRGBEncoding, ..."). */
export function lintText(path: string, src: string): string[] {
  return STALE.flatMap(([re, went, use]) => [...src.matchAll(re)].map(m =>
    `${path}:${src.slice(0, m.index).split("\n").length} uses ${m[1] ?? m[0]}, ${went}: use ${use}`));
}

/** `open`'s stale three.js lines: the installed release when older than the current one (from node_modules, else
    package.json, else an import map), an EffectComposer with no OutputPass, then up to 5 uses of removed API. None for a project on current three. */
export function staleThree(cwd: string): string[] {
  const hits: string[] = [];
  let mapped = 0, composer = false, output = false;
  sourceFiles(cwd, (path, binary) => {
    if (binary || !CODE.has(extname(path).toLowerCase())) return;
    const src = readFileSync(join(cwd, path), "utf8");
    if (path.endsWith(".html")) mapped ||= minor(src.match(MAP)?.[1]);
    composer ||= /\bEffectComposer\b/.test(src);
    output ||= /\bOutputPass\b/.test(src);
    hits.push(...lintText(path, src));
  });
  const pkg = json(join(cwd, "package.json"));
  const have = minor(json(join(cwd, "node_modules/three/package.json"))?.version) || minor(pkg?.dependencies?.three ?? pkg?.devDependencies?.three) || mapped;
  const old = have && have < CURRENT ? [`three r${have} installed (current r${CURRENT}).`] : [];
  const pass = composer && !output ? ["EffectComposer without an OutputPass: since r155 tone mapping and the output colour space apply only on the screen pass, so add new OutputPass() as the last pass."] : [];
  return [...old, ...pass, ...hits.slice(0, 5), ...hits.length > 5 ? [`and ${hits.length - 5} more uses of removed three.js API`] : []];
}
