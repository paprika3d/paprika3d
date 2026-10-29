// stage: the first-load setup every three.js page hand-writes, in one call: a renderer with sRGB output, ACES tone mapping
// and a pixel ratio capped at 2; a studio environment (a lit box baked through PMREMGenerator, a stand-in for
// RoomEnvironment at a fifth of its size) or a flat colour one; a key light whose shadow camera fits the content; a ground
// that only shows shadows (or a solid colour); a camera (near 0.1, far 1000 until `fit`); and a resize that follows the container. `fit(object or Box3)`
// frames the camera on content from the direction it already looks along, sizes the key light's shadow to it and puts
// the ground under it; it returns the content's centre. Pass the content, not the scene. Nothing here reads
// `Math.random` or starts a render loop. Orbit controls are two lines of your own, so a game does not pay for them:
//   import { OrbitControls } from "three/addons/controls/OrbitControls.js";
//   const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(fit(product));
//
//   const { renderer, scene, camera, fit } = stage(); scene.add(product); fit(product);
//   renderer.setAnimationLoop(() => renderer.render(scene, camera));
import { ACESFilmicToneMapping, BackSide, Box3, BoxGeometry, Color, DirectionalLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, ShadowMaterial, Vector3, WebGLRenderer, type ColorRepresentation, type Object3D } from "three";

export type StageOptions = {
  env?: ColorRepresentation | false; // default: the studio box
  exposure?: number; // tone mapping exposure, default 1
  key?: number; // key light intensity, default 1.5; 0 for none (a closed room lights itself)
  shadow?: boolean; // default true
  ground?: ColorRepresentation | false; // default: a shadow catcher
  background?: ColorRepresentation | null; // default 0xe8e8e8; null is transparent
  fit?: Object3D | Box3;
};

export function stage(container: HTMLElement = document.body, o: StageOptions = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.shadowMap.enabled = o.shadow ?? true;
  renderer.domElement.style.display = "block"; // inline leaves a descender gap that grows an auto-height container
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  if (o.background !== null) scene.background = new Color(o.background ?? 0xe8e8e8);
  if (o.env !== false) {
    const env = new Scene();
    if (o.env != null) env.background = new Color(o.env);
    else { // a grey room with a big soft panel above and two side strips: studio light, as RoomEnvironment gives
      env.add(new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial({ color: 0x777777, side: BackSide })));
      for (const [w, h, d, x, y, z, k] of [[6, 0.1, 6, 0, 4.9, 0, 4], [0.1, 4, 6, -4.9, 1, 0, 6], [0.1, 4, 3, 4.9, 1, 2, 3], [4, 3, 0.1, 0, 1, -4.9, 2]]) {
        const m = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color: new Color().setScalar(k) }));
        m.position.set(x, y, z); env.add(m);
      }
    }
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose();
  }

  const camera = new PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.set(3, 2.5, 5); camera.lookAt(0, 0, 0);
  const key = new DirectionalLight(0xffffff, o.key ?? 1.5);
  key.castShadow = renderer.shadowMap.enabled && key.intensity > 0;
  key.position.set(3, 6, 4); key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 4; key.shadow.bias = -0.0005;
  scene.add(camera); if (key.intensity) scene.add(key, key.target);
  const ground = o.ground === false ? null
    : new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), o.ground == null ? new ShadowMaterial({ opacity: 0.3 }) : new MeshStandardMaterial({ color: o.ground }));
  if (ground) { ground.name = "ground"; ground.receiveShadow = true; ground.scale.setScalar(100); scene.add(ground); }

  const fit = (content: Object3D | Box3, margin = 1.2) => {
    const parent = ground?.parent; ground?.removeFromParent(); // keep it out of the content's box
    const box = content instanceof Box3 ? content : new Box3().setFromObject(content);
    if (ground && parent) parent.add(ground); // only if the game kept it
    if (box.isEmpty()) return box.getCenter(new Vector3()); // e.g. a model still loading: keep the last framing
    const c = box.getCenter(new Vector3()), r = box.getSize(new Vector3()).length() / 2 || 1;
    const half = Math.min(camera.fov / 2, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * 180 / Math.PI);
    const d = r * margin / Math.sin(half * Math.PI / 180);
    camera.position.copy(c).addScaledVector(camera.getWorldDirection(new Vector3()), -d);
    camera.near = d / 100; camera.far = d * 10; camera.updateProjectionMatrix(); camera.lookAt(c);
    key.target.position.copy(c); key.position.set(3, 6, 4).setLength(r * 3).add(c);
    Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r, far: r * 5 }).updateProjectionMatrix();
    if (ground) { ground.position.set(c.x, box.min.y, c.z); ground.scale.setScalar(r * 40); }
    return c;
  };

  const resize = () => {
    const body = container === document.body, w = body ? innerWidth : container.clientWidth, h = body ? innerHeight : container.clientHeight;
    if (!w || !h) return; // hidden or not laid out yet
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize); new ResizeObserver(resize).observe(container); resize();
  if (o.fit) fit(o.fit);
  return { renderer, scene, camera, key, ground, fit };
}
