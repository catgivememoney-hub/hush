// Procedural hearth fire: shader flames, charred logs with glowing cracks, coal bed,
// rising embers, spark bursts and a flickering shadow-casting light.
// Everything is computed from noise every frame, so nothing ever visibly repeats
// and it costs zero bytes of video.
import * as THREE from 'three';
import { U, glowSprite, rng, pbr } from './world.js';
import { card } from './textures.js';

/* ---------- shared GLSL ---------- */
const NOISE = /* glsl */`
  float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vn3(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x), mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x), mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
  vec3 fireRamp(float h){
    vec3 c = mix(vec3(0.25, 0.015, 0.0), vec3(1.0, 0.22, 0.02), smoothstep(0.0, 0.35, h));
    c = mix(c, vec3(1.0, 0.55, 0.12), smoothstep(0.3, 0.65, h));
    c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.62, 0.95, h));
    return c;
  }
`;

/* ---------- smooth flicker shared by light, glow and flames ---------- */
function flickerFn(seed = 0) {
  // sum of incommensurate sines + slow wander: organic, never periodic in practice
  return (t) => {
    const a = Math.sin(t * 7.3 + seed) * 0.5 + Math.sin(t * 12.9 + seed * 2.1) * 0.3 + Math.sin(t * 23.1 + seed * 3.7) * 0.15;
    const slow = Math.sin(t * 0.37 + seed) * 0.5 + Math.sin(t * 0.91 + seed * 1.3) * 0.5;
    return 0.86 + a * 0.06 + slow * 0.07;
  };
}

/* =========================================================
   Flame tongues — cylindrical billboards, noise-shaped
   ========================================================= */
function flames(world, tongues, { intensity = 1.7 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1); base.translate(0, 0.5, 0);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = base.index; ig.attributes.position = base.attributes.position; ig.attributes.uv = base.attributes.uv;
  const a = new Float32Array(tongues.length * 4), b = new Float32Array(tongues.length * 3);
  tongues.forEach((t, i) => { a.set([t.x, t.y, t.z, t.seed], i * 4); b.set([t.w, t.h, t.k ?? 1], i * 3); });
  ig.setAttribute('aPos', new THREE.InstancedBufferAttribute(a, 4));
  ig.setAttribute('aSize', new THREE.InstancedBufferAttribute(b, 3));
  ig.instanceCount = tongues.length;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.time, uI: { value: intensity }, uFlick: { value: 1 }, uGust: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 aPos; attribute vec3 aSize; uniform float uTime, uGust;
      varying vec2 vUv; varying float vSeed, vK;
      void main(){
        vUv = uv; vSeed = aPos.w; vK = aSize.z;
        vec3 c = aPos.xyz;
        vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4));
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        float y = position.y;
        // the tip leans and licks sideways a little
        float lick = sin(uTime * 2.3 + aPos.w * 11.0) * 0.06 + sin(uTime * 5.1 + aPos.w * 3.0) * 0.03 + uGust * 0.05;
        vec3 w = c + right * (position.x * aSize.x + lick * y * y * aSize.y) + vec3(0.0, y * aSize.y, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uI, uFlick; varying vec2 vUv; varying float vSeed, vK;
      ${NOISE}
      void main(){
        float t = uTime;
        float x = vUv.x - 0.5, y = vUv.y;
        // domain-warped noise rising upward
        vec3 q = vec3(x * 2.6, y * 1.9 - t * 1.7, t * 0.45 + vSeed * 13.0);
        float w = fbm3(q * 0.8 + vec3(0.0, -t * 0.4, 0.0));
        float n = fbm3(q + vec3(w * 1.4, w * 0.6, 0.0));
        float n2 = vn3(vec3(x * 7.0, y * 6.0 - t * 4.2, t + vSeed * 5.0));
        float hw = mix(0.46, 0.05, pow(y, 0.75));
        float d = abs(x + (n - 0.5) * 0.28 * y) / hw;
        float heat = (1.0 - d) * 1.25 - y * 0.95 + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.3;
        heat *= smoothstep(0.0, 0.07, y) * smoothstep(1.0, 0.7, y);
        heat = clamp(heat, 0.0, 1.0);
        float a = smoothstep(0.04, 0.42, heat);
        // soft blue-ish base where combustion is cleanest
        vec3 col = fireRamp(heat * 0.95 + 0.05) ;
        col = mix(col, col * vec3(0.55, 0.6, 1.25), smoothstep(0.12, 0.0, y) * 0.6);
        float k = uI * uFlick * vK;
        gl_FragColor = vec4(col * a * k, a);
      }`,
  });
  const mesh = new THREE.Mesh(ig, m);
  mesh.frustumCulled = false; mesh.renderOrder = 8;
  world.scene.add(mesh);
  return mesh;
}

/* =========================================================
   Embers — stateless particles: each cycle re-rolls its own path
   ========================================================= */
function embers(world, center, { count = 140, spread = [0.55, 0.22], rise = [0.8, 2.2] } = {}) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  const R = rng(91);
  for (let i = 0; i < count; i++) seeds.set([R(), R(), R(), R()], i * 4);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: U.time, uC: { value: center.clone() }, uSpread: { value: new THREE.Vector2(...spread) }, uRise: { value: new THREE.Vector2(...rise) },
      uPx: { value: 1 }, uBurstT: { value: -99 }, uBurstP: { value: center.clone() },
    },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uPx, uBurstT; uniform vec3 uC, uBurstP; uniform vec2 uSpread, uRise;
      varying float vA, vHeat;
      float hh(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float life = 1.6 + aSeed.x * 2.6;
        float ph = uTime / life + aSeed.y * 7.0;
        float cyc = floor(ph), f = fract(ph);
        float r1 = hh(cyc * 12.9 + aSeed.z * 91.0), r2 = hh(cyc * 78.2 + aSeed.w * 37.0), r3 = hh(cyc * 3.7 + aSeed.x * 17.0);
        // only some cycles produce a visible ember: sparse and irregular
        float alive = step(0.55, r3);
        vec3 p = uC + vec3((r1 - 0.5) * uSpread.x, 0.0, (r2 - 0.5) * uSpread.y);
        float h = mix(uRise.x, uRise.y, r3) * f;
        p.y += h;
        p.x += sin(f * 6.0 + r1 * 20.0 + uTime * 1.3) * 0.08 * f + (r2 - 0.5) * 0.25 * f * f;
        p.z += cos(f * 5.0 + r2 * 20.0 + uTime) * 0.05 * f;
        // spark burst from a popping log
        float bt = uTime - uBurstT;
        float inBurst = step(aSeed.w, 0.28) * step(0.0, bt) * step(bt, 1.4);
        if (inBurst > 0.5) {
          float bf = bt / 1.4;
          vec3 dir = normalize(vec3(aSeed.x - 0.5, 0.9 + aSeed.y, aSeed.z - 0.5) + vec3(0.0, 0.0, 0.35));
          p = uBurstP + dir * (1.6 + aSeed.y * 1.8) * bt - vec3(0.0, 1.6 * bt * bt, 0.0);
          f = bf; alive = 1.0;
        }
        vA = alive * smoothstep(0.0, 0.06, f) * (1.0 - f) * (0.6 + 0.4 * sin(uTime * 30.0 + aSeed.x * 60.0));
        vHeat = 1.0 - f;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (2.2 + aSeed.z * 2.8) * (2.0 / max(0.3, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA, vHeat;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
        float a = smoothstep(0.25, 0.0, d) * vA;
        vec3 col = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.7, 0.3), vHeat);
        gl_FragColor = vec4(col * a * 5.0, a);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = 9;
  world.scene.add(p);
  world.onUpdate(() => { m.uniforms.uPx.value = world.renderer.getPixelRatio(); });
  return p;
}

/* =========================================================
   Charred log material: bark that blackens and glows in cracks near the heat
   ========================================================= */
export function emberMaterial(base, { center, radius = 0.6, glow = 1, allChar = false } = {}) {
  // mutate in place: the Poly Haven maps are swapped into this same material when they arrive
  const m = base;
  m.userData.ember = { uC: { value: center.clone() }, uR: { value: radius }, uGlow: { value: glow }, uAll: { value: allChar ? 1 : 0 } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.ember, { uTime: U.time });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEW; varying vec3 vEN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 ew = modelMatrix * vec4(transformed, 1.0);\n #ifdef USE_INSTANCING\n ew = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\n #endif\n vEW = ew.xyz; vEN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vEW; varying vec3 vEN; uniform vec3 uC; uniform float uR, uGlow, uAll, uTime;
        ${NOISE}
        float emberHeat(){
          vec3 d = vEW - uC;
          float near = 1.0 - smoothstep(0.0, uR, length(d * vec3(1.0, 1.6, 1.3)));
          float low = smoothstep(0.35, -0.05, d.y);
          float facing = clamp(dot(normalize(vEN), normalize(-d + vec3(0.0, -0.15, 0.0))) * 0.5 + 0.6, 0.0, 1.0);
          return max(clamp(near * (0.55 + 0.45 * low) * facing * 1.5, 0.0, 1.0), uAll);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float eh = emberHeat();
        float charK = smoothstep(0.05, 0.6, eh);
        // alligator-skin char: dark cells with fissures
        float cell = vn3(vEW * 26.0), cell2 = vn3(vEW * 61.0 + 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.02, 0.018) * (0.6 + cell * 0.8), charK);
        // white ash dusting on top surfaces
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.38) * (0.7 + cell2 * 0.3), charK * smoothstep(0.6, 0.95, vEN.y) * smoothstep(0.55, 0.75, cell2) * 0.6);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float eh2 = emberHeat();
          float rid = 1.0 - abs(vn3(vEW * 22.0 + vec3(0.0, uTime * 0.03, 0.0)) * 2.0 - 1.0);
          float rid2 = 1.0 - abs(vn3(vEW * 48.0 + 7.0) * 2.0 - 1.0);
          float crack = pow(rid, 9.0) * 0.8 + pow(rid2, 14.0) * 0.5;
          float breathe = 0.65 + 0.35 * fbm3(vEW * 3.0 + vec3(0.0, 0.0, uTime * 0.35));
          float core = smoothstep(0.55, 1.0, eh2);
          vec3 ec = fireRamp(0.25 + breathe * 0.35 + core * 0.2);
          totalEmissiveRadiance += ec * (crack * smoothstep(0.25, 0.85, eh2) * 5.0 + core * core * 0.7 * breathe) * uGlow;
        }`);
  };
  m.customProgramCacheKey = () => 'ember' + (allChar ? 1 : 0);
  return m;
}

/* =========================================================
   End-grain texture for cut log faces (growth rings, cracks)
   ========================================================= */
let endTex = null;
export function endGrain() {
  if (endTex) return endTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(5);
  g.fillStyle = '#2a1d14'; g.fillRect(0, 0, 256, 256);
  const rad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  rad.addColorStop(0, '#a88660'); rad.addColorStop(0.8, '#8a6a48'); rad.addColorStop(0.9, '#4a3424'); rad.addColorStop(1, '#2a1c12');
  g.fillStyle = rad; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  for (let r = 6; r < 112; r += 3 + R() * 4) {
    g.strokeStyle = `rgba(70,45,25,${0.25 + R() * 0.35})`; g.lineWidth = 0.6 + R() * 1.4;
    g.beginPath();
    for (let a = 0; a <= 6.3; a += 0.15) { const rr = r + Math.sin(a * 3 + r) * 1.5; const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 0; k < 4; k++) { const a = R() * 6.3; g.strokeStyle = 'rgba(25,15,8,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * (50 + R() * 60), 128 + Math.sin(a) * (50 + R() * 60)); g.stroke(); }
  endTex = new THREE.CanvasTexture(c); endTex.colorSpace = THREE.SRGBColorSpace; endTex.anisotropy = 8;
  return endTex;
}

/** a split/round log mesh: bark sides + end-grain caps; returns geometry */
export function logGeometry(len, r, seed = 1) {
  const g = new THREE.CylinderGeometry(r * (0.92 + (seed % 3) * 0.03), r, len, 20, 6, false);
  const p = g.attributes.position, R = rng(seed * 7 + 3);
  const bumps = Array.from({ length: 5 }, () => [R() * 6.28, R() * 0.12]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    let k = 1 + Math.sin(a * 5 + seed) * 0.03 + Math.sin(a * 11 + y * 3) * 0.015;
    for (const [ba, bs] of bumps) k += Math.exp(-Math.pow((a - ba + 9.42) % 6.28 - 3.14, 2) * 8) * bs * Math.exp(-Math.pow(y / len - (ba / 6.28 - 0.5), 2) * 20);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/* =========================================================
   Hearth assembly
   ========================================================= */
/**
 * Build the fire inside a firebox.
 * c: centre of the fire bed on the floor of the firebox; width/depth: bed size
 * Returns { light, center, pop(k) }
 */
export function hearthFire(world, c, { width = 0.8, depth = 0.4, shadow = true } = {}) {
  const S = world.scene;
  const R = rng(33);
  const bark = pbr('bark', [1, 0.6], { color: 0x7a6a5a, normalScale: new THREE.Vector2(1.6, 1.6) }, 'bark_brown_02');
  const center = c.clone().add(new THREE.Vector3(0, 0.12, 0));
  const logMat = emberMaterial(bark, { center, radius: 0.55 });
  const capMat = emberMaterial(new THREE.MeshStandardMaterial({ map: endGrain(), roughness: 0.9 }), { center, radius: 0.55 });

  /* iron grate */
  const iron = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.55, metalness: 0.85 });
  const grate = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, depth + 0.08, 8), iron);
    bar.rotation.x = Math.PI / 2; bar.position.set(-width / 2 + 0.05 + i * (width - 0.1) / 6, 0.075, 0); grate.add(bar);
  }
  for (const zz of [-depth / 2, depth / 2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, 0.022), iron); rail.position.set(0, 0.075, zz); grate.add(rail);
    for (const xx of [-width / 2 + 0.03, width / 2 - 0.03]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.075, 8), iron); leg.position.set(xx, 0.037, zz); grate.add(leg); }
  }
  // andiron fronts: upright posts with a ball finial
  for (const xx of [-width / 2 + 0.02, width / 2 - 0.02]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.28, 10), iron); post.position.set(xx, 0.14, depth / 2 + 0.02); grate.add(post);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), iron); ball.position.set(xx, 0.3, depth / 2 + 0.02); grate.add(ball);
  }
  grate.position.copy(c);
  grate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  S.add(grate);

  /* ash + coal bed */
  const ashC = document.createElement('canvas'); ashC.width = ashC.height = 128;
  const ag = ashC.getContext('2d');
  for (let i = 0; i < 2400; i++) { const v = 30 + R() * 70; ag.fillStyle = `rgb(${v},${v * 0.96},${v * 0.92})`; ag.fillRect(R() * 128, R() * 128, 1 + R() * 2, 1 + R() * 2); }
  const ashT = new THREE.CanvasTexture(ashC); ashT.colorSpace = THREE.SRGBColorSpace; ashT.wrapS = ashT.wrapT = THREE.RepeatWrapping; ashT.repeat.set(3, 2);
  const ashMat = emberMaterial(new THREE.MeshStandardMaterial({ map: ashT, roughness: 1, color: 0x8a8580 }), { center: c.clone().add(new THREE.Vector3(0, 0.05, 0)), radius: 0.45, glow: 0.5 });
  const ashGeo = new THREE.PlaneGeometry(width + 0.3, depth + 0.25, 24, 12); ashGeo.rotateX(-Math.PI / 2);
  const ap = ashGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) { const x = ap.getX(i), z = ap.getZ(i); ap.setY(i, 0.012 + Math.max(0, 0.035 * (1 - Math.hypot(x / (width * 0.6), z / (depth * 0.7)))) + R() * 0.006); }
  ashGeo.computeVertexNormals();
  const ash = new THREE.Mesh(ashGeo, ashMat); ash.position.copy(c); ash.receiveShadow = true; S.add(ash);
  // coals: small faceted lumps, glowing through
  const coalGeo = new THREE.IcosahedronGeometry(0.028, 1);
  { const p = coalGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.75 + R() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } coalGeo.computeVertexNormals(); }
  const coalMat = emberMaterial(new THREE.MeshStandardMaterial({ color: 0x222020, roughness: 0.9 }), { center: c.clone().add(new THREE.Vector3(0, 0.06, 0)), radius: 0.42, glow: 1.4 });
  const NC = 90, coals = new THREE.InstancedMesh(coalGeo, coalMat, NC);
  const dm = new THREE.Object3D();
  for (let i = 0; i < NC; i++) {
    const a = R() * 6.28, rr = Math.sqrt(R());
    dm.position.set(c.x + Math.cos(a) * rr * width * 0.48, c.y + 0.03 + R() * 0.02 + (i < 30 ? 0.05 : 0), c.z + Math.sin(a) * rr * depth * 0.55);
    dm.rotation.set(R() * 6, R() * 6, R() * 6); dm.scale.setScalar(0.6 + R() * 0.9); dm.updateMatrix();
    coals.setMatrixAt(i, dm.matrix);
  }
  coals.castShadow = true; coals.receiveShadow = true; S.add(coals);

  /* logs: two base logs on the grate, one crossing on top, a split piece */
  const logs = [
    { len: 0.62, r: 0.07, p: [0, 0.16, -0.07], ry: 0.06, rz: 0.04 },
    { len: 0.58, r: 0.065, p: [0.02, 0.15, 0.09], ry: -0.1, rz: -0.03 },
    { len: 0.55, r: 0.058, p: [-0.04, 0.27, 0.01], ry: 0.55, rz: 0.12 },
    { len: 0.42, r: 0.05, p: [0.12, 0.25, -0.02], ry: -0.75, rz: -0.25 },
  ];
  logs.forEach((L, i) => {
    const g = logGeometry(L.len, L.r, i + 2);
    const mesh = new THREE.Mesh(g, [logMat, capMat, capMat]);
    mesh.position.set(c.x + L.p[0], c.y + L.p[1], c.z + L.p[2]);
    mesh.rotation.set(0, L.ry, L.rz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    S.add(mesh);
  });

  /* flames */
  const tongues = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    tongues.push({ x: c.x + (t - 0.5) * width * 0.72 + (R() - 0.5) * 0.05, y: c.y + 0.17 + R() * 0.06, z: c.z + (R() - 0.5) * depth * 0.5, seed: R() * 10, w: 0.16 + R() * 0.12, h: 0.32 + R() * 0.34 * (1 - Math.abs(t - 0.5)), k: 0.7 + R() * 0.4 });
  }
  // a couple of low, wide licks along the coal bed
  tongues.push({ x: c.x - 0.1, y: c.y + 0.08, z: c.z + 0.06, seed: 3.3, w: 0.42, h: 0.16, k: 0.55 });
  tongues.push({ x: c.x + 0.14, y: c.y + 0.08, z: c.z - 0.05, seed: 7.7, w: 0.38, h: 0.14, k: 0.5 });
  const fl = flames(world, tongues);
  const em = embers(world, c.clone().add(new THREE.Vector3(0, 0.25, 0)), { spread: [width * 0.7, depth * 0.6] });

  /* light: one shadow-caster plus a soft low fill, both flickering independently */
  // inside the firebox: modest, so the brick glows orange instead of clipping to white
  const light = new THREE.PointLight(0xff8f45, 2.4, 10, 1.6);
  light.position.copy(c).add(new THREE.Vector3(0, 0.3, 0.1));
  if (shadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002; light.shadow.normalBias = 0.03; light.shadow.radius = 6;
    light.shadow.camera.near = 0.08; light.shadow.camera.far = 14;
  }
  S.add(light);
  const fill = new THREE.PointLight(0xff6a28, 0.8, 4, 2);
  fill.position.copy(c).add(new THREE.Vector3(0, 0.1, 0.32));
  S.add(fill);
  const glow = glowSprite(0xff7a30, 1.1, 0.16); glow.position.copy(c).add(new THREE.Vector3(0, 0.3, 0.05)); glow.renderOrder = 7; S.add(glow);
  world.lampLights.push({ pos: light.position.clone(), color: new THREE.Color(0xff8a40).multiplyScalar(0.5) });

  const f1 = flickerFn(1.3), f2 = flickerFn(4.1);
  const basePos = light.position.clone();
  let spike = 0;
  world.onUpdate((dt) => {
    const t = U.time.value;
    spike *= Math.exp(-dt * 6);
    const k = f1(t) + spike * 0.35;
    light.intensity = 2.4 * k; fill.intensity = 0.8 * f2(t);
    // the light's apparent centre wanders with the flames → shadows breathe
    light.position.set(basePos.x + Math.sin(t * 1.7) * 0.05 + Math.sin(t * 4.3) * 0.02, basePos.y + Math.sin(t * 2.9) * 0.03, basePos.z + Math.sin(t * 1.1) * 0.02);
    fl.material.uniforms.uFlick.value = 0.85 + (k - 0.86) * 1.4 + spike * 0.25;
    glow.material.opacity = 0.15 * k;
    fl.material.uniforms.uGust.value = Math.sin(t * 0.21) * Math.sin(t * 0.13);
  });

  return {
    light, center, flicker: () => light.intensity / 2.4,
    /** a log pops: light spike + spark burst. k 0..1 */
    pop(k = 1) {
      spike = Math.min(1.5, spike + k);
      const u = em.material.uniforms;
      u.uBurstT.value = U.time.value;
      u.uBurstP.value.set(c.x + (R() - 0.5) * width * 0.6, c.y + 0.22 + R() * 0.08, c.z + (R() - 0.3) * depth * 0.4);
    },
  };
}

/** a small candle flame (same flame shader, one tongue) with its own glow & light */
export function candleFlame(world, pos, { light = true } = {}) {
  const fl = flames(world, [{ x: pos.x, y: pos.y, z: pos.z, seed: Math.random() * 10, w: 0.022, h: 0.06, k: 1 }], { intensity: 3.2 });
  const glow = glowSprite(0xffa050, 0.22, 0.45); glow.position.copy(pos).y += 0.03; world.scene.add(glow);
  let l = null;
  if (light) { l = new THREE.PointLight(0xffa058, 0.5, 3.5, 2); l.position.copy(pos).y += 0.05; world.scene.add(l); }
  const f = flickerFn(Math.random() * 9);
  world.onUpdate(() => { const k = f(U.time.value * 1.6); fl.material.uniforms.uFlick.value = k; glow.material.opacity = 0.4 * k; if (l) l.intensity = 0.5 * k; });
  return fl;
}

export { card };
