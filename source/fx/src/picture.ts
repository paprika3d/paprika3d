// The camera a reference picture was taken or painted from (its entry in refs/cameras.json) and the maps between the
// picture's pixels and the world, for building the scene a picture shows where it stands: in the 2026-10-24 scene loops
// all eight sessions wrote these by hand (a pixel to a ray at a depth, a point to a pixel, a wider fov on a taller canvas).
import { Matrix4, PerspectiveCamera, Vector3 } from "three";

export type PictureView = {
  position: number[]; lookAt?: number[];
  /** vertical field of view in degrees; three's default (50) when left out */ fov?: number;
  /** the picture's size in pixels, which `at`, `ground` and `px` count in; a 1 × 1 picture when left out */ size?: [number, number];
};

/** The picture's camera and its pixel maps, from the pose in `v` (the pose is kept, so moving `camera` later changes none of them). */
export function picture(v: PictureView) {
  const [W, H] = v.size ?? [1, 1], fov = v.fov ?? 50;
  const camera = new PerspectiveCamera(fov, W / H, 0.01, 1000);
  camera.position.fromArray(v.position); camera.lookAt(...((v.lookAt ?? [0, 0, 0]) as [number, number, number])); camera.updateMatrixWorld();
  const M = camera.matrixWorld.clone(), Mi = new Matrix4().copy(M).invert(), eye = new Vector3().setFromMatrixPosition(M);
  const forward = new Vector3(0, 0, -1).transformDirection(M), f = H / 2 / Math.tan(fov * Math.PI / 360); // f: focal length in picture pixels
  const dir = (px: number, py: number) => new Vector3((px - W / 2) / f, (H / 2 - py) / f, -1).transformDirection(M);
  return {
    camera,
    /** the world point under picture pixel (px, py), `depth` metres in front of the camera along its view direction */
    at(px: number, py: number, depth: number) { const d = dir(px, py); return eye.clone().addScaledVector(d, depth / d.dot(forward)); },
    /** the world point under picture pixel (px, py) on the horizontal plane at height `y` (the ground), or null above the horizon */
    ground(px: number, py: number, y = 0) { const d = dir(px, py), t = (y - eye.y) / d.y; return t > 0 ? eye.clone().addScaledVector(d, t) : null; },
    /** the picture pixel [px, py] under a world point, or null behind the camera */
    px(point: Vector3 | number[]) {
      const p = (point instanceof Vector3 ? point.clone() : new Vector3().fromArray(point)).applyMatrix4(Mi);
      return p.z < 0 ? [W / 2 + f * p.x / -p.z, H / 2 - f * p.y / -p.z] : null;
    },
    /** sets `cam` (the picture's camera unless given) to show the whole picture's frame on a canvas of width × height: the
     * picture's own view at its aspect, otherwise the same frame with room beside or above it; call it again on resize */
    fit(width: number, height: number, cam: PerspectiveCamera = camera) {
      cam.aspect = width / height;
      cam.fov = cam.aspect >= W / H ? fov : Math.atan(Math.tan(fov * Math.PI / 360) * (W / H) / cam.aspect) * 360 / Math.PI;
      cam.updateProjectionMatrix(); return cam;
    },
  };
}
