// A scene subtree as GLB bytes, for `eval { save }` to write into the project: a geo.js solid baked once (the page then
// loads the GLB and skips the 325 KB manifold wasm), a mesh with a painted canvas texture, a merged level.
// GLTFExporter comes from the page's own three/addons (the import map the skill asks for), loaded only when called.
import type { AnimationClip, Object3D } from "three";

/** `object` and its children as a GLB; the root keeps its world transform, so a baked piece loads where it stood. */
export async function bake(object: Object3D, o: { animations?: AnimationClip[] } = {}): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  object.updateWorldMatrix(true, false);
  const root = object.clone();
  object.matrixWorld.decompose(root.position, root.quaternion, root.scale);
  return await new GLTFExporter().parseAsync(root, { binary: true, animations: o.animations ?? [] }) as ArrayBuffer;
}
