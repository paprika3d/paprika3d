// The lighting setup faults `look` names from the live scene: the three.js settings that flatten or blacken a picture
// whatever the scene holds (no tone mapping, mistagged texture colour spaces, metal with nothing to reflect, shadow
// casters outside the shadow camera). Each check has its own try, so one odd material never drops the rest; on either
// renderer (WebGL or WebGPU), which share toneMapping, texture colorSpace and LightShadow.

/** A page function from a set of materials to the colour-space `Lighting: ...` lines; needs no frame drawn, so `open`
    runs it too (COLOUR_SPACES). */
const COLOUR = `(mats) => {
  const out = [], colour = new Set(), data = new Set();
  for (const m of mats) {
    for (const k of ["map", "emissiveMap"]) { const t = m[k]; if (t?.isTexture && !t.isRenderTargetTexture && t.colorSpace !== "srgb") colour.add(t); }
    for (const k of ["normalMap", "roughnessMap", "metalnessMap", "aoMap"]) { const t = m[k]; if (t?.isTexture && t.colorSpace === "srgb") data.add(t); }
  }
  if (colour.size) out.push(\`Lighting: \${colour.size} colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.\`);
  if (data.size) out.push(\`Lighting: \${data.size} data textures (normal, roughness, metalness, ao) tagged sRGB: set texture.colorSpace = NoColorSpace.\`);
  return out;
}`;

/** Runs in the page; the colour-space lines for the main scene's visible materials. */
export const COLOUR_SPACES = `(() => {
  const mats = new Set();
  window.__harness.mainScene()?.traverseVisible(o => { for (const m of [o.material].flat()) if (m) mats.add(m); });
  return (${COLOUR})(mats);
})()`;

/** Runs in the page; returns up to 4 `Lighting: ...` lines, none for a scene set up as fx.js stage() sets one up. */
export const SETUP = `(() => {
  // the same as VIEW in look.ts: the game's scene, the renderer and camera that last drew it, or \`look\`'s stand-in camera
  const h = window.__harness, [scene, { renderer: r, camera: c0 }] = h.main(), camera = h.lookCam?.from === c0 ? h.lookCam.to : c0;
  const out = [], mats = new Set(), meshes = [], lights = [];
  scene.traverseVisible(o => {
    for (const m of [o.material].flat()) if (m) mats.add(m);
    if (o.isLight && o.castShadow && o.shadow?.camera && !o.isPointLight) lights.push(o); // a point light's shadow is a cube, not one camera
    if (o.castShadow && o.geometry) meshes.push(o);
  });
  // only lit materials go past 1 and clip; a frame drawn into a render target is a post chain, whose OutputPass
  // tone-maps (\`open\` checks the source for it), and so is a RenderPipeline with outputColorTransform false whose
  // output has no renderOutput() left to the renderer's tone mapping: the page's own curve (dev #114). renderOutput(x)
  // with no tone mapping of its own, three's documented form, reads renderer.toneMapping, so that frame keeps the line.
  const lit = m => m.isMeshStandardMaterial || m.isMeshStandardNodeMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshToonMaterial;
  const defers = node => { const seen = new Set(), walk = n => { if (!n || seen.has(n)) return false; seen.add(n);
    if (n.isRenderOutputNode && n.getToneMapping?.() == null) return true; for (const c of n.getChildren?.() ?? []) if (walk(c)) return true; return false; };
    return walk(node); };
  const own = e => { if (e.target) return true; const m = e.scene?.material;
    return m?.contextNode?.value?.renderPipeline?.outputColorTransform === false && !defers(m.fragmentNode); };
  try { if (r.toneMapping === 0 && !h.frame.some(own) && [...mats].some(lit))
    out.push("Lighting: no tone mapping (renderer.toneMapping is NoToneMapping): bright colours clip to white; ACESFilmicToneMapping, AgXToneMapping or NeutralToneMapping avoid it, and ACES also mutes saturated colours, which a bright stylised look may not want."); } catch {}
  try { out.push(...(${COLOUR})(mats)); } catch {}
  try { if (!scene.environment && !scene.environmentNode) {
    const n = [...mats].filter(m => (m.isMeshStandardMaterial || m.isMeshStandardNodeMaterial) && !m.envMap && m.metalness >= 0.5).length;
    if (n) out.push(\`Lighting: \${n} metallic materials with no environment map (scene.environment unset): metal reflects nothing and draws black. Bake a RoomEnvironment through PMREMGenerator, or call stage() from fx.js.\`);
  } } catch {}
  for (const light of lights) try {
    const sc = light.shadow.camera, v = camera.position.clone();
    light.updateMatrixWorld(); light.target?.updateMatrixWorld(); light.shadow.updateMatrices(light); // as the next shadow render places it
    const Box3 = (meshes[0]?.geometry.boundingBox ?? meshes[0]?.geometry.computeBoundingBox(), meshes[0]?.geometry.boundingBox?.constructor);
    if (!Box3) break;
    // only a caster whose missing shadow shows: on screen, and no farther from the eye than the far edge of the shadowed
    // area. A shadow camera that follows the player (gpu-4x4-5 kart: "67 of 181") leaves distant scenery out, as it should.
    camera.updateMatrixWorld();
    // distances across the light only, with mid at the eye's own light depth: the box centre (NDC z 0) sat 18-20 units
    // under the ground and stretched reach to ~87 units for a ±34 box (natural-1, #88)
    const eye = v.clone().setFromMatrixPosition(camera.matrixWorld), dir = sc.getWorldDirection(v.clone());
    const UP = camera.up.clone().normalize(), ground = p => { const d = p.clone().sub(eye); return d.sub(UP.clone().multiplyScalar(d.dot(UP))).length(); }; // camera.up: a z-up game too
    const across = p => { p.sub(eye); return p.sub(dir.clone().multiplyScalar(p.dot(dir))).length(); }; // changes p
    const mid = v.clone().set(0, 0, Math.min(1, Math.max(-1, eye.clone().project(sc).z))).unproject(sc);
    const reach = across(mid) + v.clone().set(1, 1, 0).unproject(sc).distanceTo(v.clone().set(-1, -1, 0).unproject(sc)) / 2;
    // which world axis a caster falls out on: the shadow camera's right and up axes, named by their largest component
    const right = v.clone().setFromMatrixColumn(sc.matrixWorld, 0), up = v.clone().setFromMatrixColumn(sc.matrixWorld, 1);
    const axis = d => { const k = ["x", "y", "z"].reduce((a, b) => Math.abs(d[a]) >= Math.abs(d[b]) ? a : b); return \`\${d[k] < 0 ? "-" : "+"}\${k}\`; };
    let off = 0; const names = new Map(); // caster name → which way it falls out
    for (const o of meshes) {
      const box = new Box3().setFromObject(o);
      // and along the ground: under a low sun behind a chase camera, "across" drops the distance down the road, and a
      // billboard 152 units ahead of a 110-unit box counted (report 6ea6c65f)
      const c = box.isEmpty() ? null : box.clampPoint(eye, v.clone());
      if (!c || ground(c) > reach || across(c) > reach) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, far = 0, a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, front = 0;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        const p = v.clone().applyMatrix4(camera.matrixWorldInverse);
        if (p.z < 0) { front++; p.applyMatrix4(camera.projectionMatrix); a0 = Math.min(a0, p.x); a1 = Math.max(a1, p.x); b0 = Math.min(b0, p.y); b1 = Math.max(b1, p.y); }
        v.project(sc);
        if (v.z > 1) far++;
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      if (!front || a1 < -1 || a0 > 1 || b1 < -1 || b0 > 1) continue; // off screen
      const side = far === 8 ? "beyond its far plane" : x1 < -1 ? \`past its \${axis(right.clone().negate())} edge\` : x0 > 1 ? \`past its \${axis(right)} edge\` : y1 < -1 ? \`past its \${axis(up.clone().negate())} edge\` : y0 > 1 ? \`past its \${axis(up)} edge\` : "";
      if (side) { off++; let n = o; while (n && !n.isScene && !n.name) n = n.parent; const name = n && !n.isScene ? n.name : o.type; if (!names.has(name)) names.set(name, side); }
    }
    // the camera itself, so the agent sees why without an eval (a tester's agent, 2026-10-20): its extent, where it sits and the way it points
    const r1 = n => Math.round(n * 10) / 10, p3 = p => \`(\${r1(p.x)}, \${r1(p.y)}, \${r1(p.z)})\`, from = p3(v.clone().setFromMatrixPosition(sc.matrixWorld));
    const extent = \`\${sc.isOrthographicCamera ? \`covers \${r1(sc.right - sc.left)} × \${r1(sc.top - sc.bottom)} units across\` : \`is a \${Math.round(sc.fov)}° cone\`}, from \${r1(sc.near)} to \${r1(sc.far)} units in front of \${from} along \${p3(dir)}\`;
    if (off) out.push(\`Lighting: shadow light "\${light.name || light.type}": \${off} shadow casters on screen are outside its shadow camera (no shadow): \${[...names].slice(0, 3).map(([n, w]) => \`\${n} (\${w})\`).join(", ")}. It \${extent}. Widen light.shadow.camera, move the light and its target with the player, or stage().fit(object) from fx.js.\`);
  } catch {}
  return out.slice(0, 4);
})()`;
