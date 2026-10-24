// Rainforest building blocks: painted leaf atlases (broad leaves & palm fronds),
// procedural tropical plants, palms, buttress roots, lianas and rain splash rings.
import * as THREE from 'three';
import { U, Merger, mat4, rng, pbr, windSway, translucent, foliageNormals, alphaShadow, taperedTube, hangSway, mossTop } from './world.js';
import { phTex } from './textures.js';

/* ---------- painted leaf textures (colour + alpha in one, mipmapped) ---------- */
function leafCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const cache = {};
/** broad tropical leaf (elephant-ear / banana-like), tip at the top, petiole at the bottom */
export function broadLeafTex(kind = 0) {
  const key = 'broad' + kind;
  if (cache[key]) return cache[key];
  const R = rng(17 + kind);
  cache[key] = leafCanvas(512, 1024, (g, w, h) => {
    const cx = w / 2;
    const outline = () => {
      g.beginPath();
      g.moveTo(cx, h * 0.985);
      if (kind === 0) { // heart-shaped (alocasia)
        g.bezierCurveTo(w * 0.02, h * 0.98, -w * 0.02, h * 0.45, cx - w * 0.02, h * 0.02);
        g.lineTo(cx + w * 0.02, h * 0.02);
        g.bezierCurveTo(w * 1.02, h * 0.45, w * 0.98, h * 0.98, cx, h * 0.985);
      } else { // long paddle (banana / heliconia)
        g.bezierCurveTo(w * 0.1, h * 0.92, w * 0.04, h * 0.3, cx, h * 0.01);
        g.bezierCurveTo(w * 0.96, h * 0.3, w * 0.9, h * 0.92, cx, h * 0.985);
      }
      g.closePath();
    };
    g.clearRect(0, 0, w, h);
    g.save(); outline(); g.clip();
    const grd = g.createLinearGradient(0, 0, w, 0);
    const base = kind === 0 ? [44, 78, 30] : [52, 88, 28];
    grd.addColorStop(0, `rgb(${base[0] * 0.7},${base[1] * 0.75},${base[2] * 0.7})`);
    grd.addColorStop(0.5, `rgb(${base[0] * 1.15},${base[1] * 1.12},${base[2] * 1.05})`);
    grd.addColorStop(1, `rgb(${base[0] * 0.7},${base[1] * 0.75},${base[2] * 0.7})`);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // mottling
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '20,40,10' : '120,150,60'},${0.03 + R() * 0.05})`; g.beginPath(); g.arc(R() * w, R() * h, 4 + R() * 26, 0, 7); g.fill(); }
    // lateral veins
    g.strokeStyle = 'rgba(170,200,110,0.35)'; g.lineWidth = 2.2;
    for (let y = h * 0.06; y < h * 0.95; y += h * (kind === 0 ? 0.055 : 0.022)) {
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(cx, y + h * 0.02);
        g.quadraticCurveTo(cx + s * w * 0.25, y - h * 0.01, cx + s * w * 0.52, y - h * (kind === 0 ? 0.09 : 0.03));
        g.stroke();
      }
    }
    // tears along the edge of banana leaves
    if (kind === 1) { g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 9; i++) { const y = h * (0.15 + R() * 0.7), s = R() < 0.5 ? -1 : 1; g.lineWidth = 3 + R() * 3; g.beginPath(); g.moveTo(cx + s * w * 0.6, y - h * 0.04); g.lineTo(cx + s * w * (0.08 + R() * 0.25), y); g.stroke(); } g.globalCompositeOperation = 'source-over'; }
    // edge browning
    const eg = g.createRadialGradient(cx, h * 0.5, w * 0.15, cx, h * 0.5, w * 0.7);
    eg.addColorStop(0.7, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(90,70,20,0.35)');
    g.fillStyle = eg; g.fillRect(0, 0, w, h);
    g.restore();
    // midrib
    g.strokeStyle = 'rgba(190,215,140,0.75)'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(cx, h * 0.985); g.quadraticCurveTo(cx + 3, h * 0.5, cx, h * 0.04); g.stroke();
  });
  return cache[key];
}

/** pinnate palm frond, base at the bottom */
export function frondTex() {
  if (cache.frond) return cache.frond;
  const R = rng(29);
  cache.frond = leafCanvas(512, 1024, (g, w, h) => {
    const cx = w / 2;
    g.clearRect(0, 0, w, h);
    for (let y = h * 0.96; y > h * 0.03; y -= 9 + R() * 4) {
      const t = 1 - y / h; // 0 base → 1 tip
      const len = w * 0.5 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.92) * (0.85 + R() * 0.2);
      for (const s of [-1, 1]) {
        const ex = cx + s * len, ey = y - h * 0.07 * (0.6 + t);
        const gr = g.createLinearGradient(cx, y, ex, ey);
        gr.addColorStop(0, 'rgb(70,96,36)'); gr.addColorStop(1, R() < 0.12 ? 'rgb(120,110,50)' : 'rgb(52,84,30)');
        g.strokeStyle = gr; g.lineWidth = 6 + R() * 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * len * 0.5, y - h * 0.015, ex, ey); g.stroke();
      }
    }
    g.strokeStyle = 'rgb(120,120,70)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, h * 0.02); g.stroke();
  });
  return cache.frond;
}

function leafMaterial(map, color = 0xffffff, { wind = 0.03, base = 0.5 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.42, metalness: 0, color });
  windSway(m, wind, base);
  translucent(m, 0x5a7a22, 1.2);
  return m;
}

/** a bent, midrib-folded strip from origin along +Y */
function leafStrip(len, wid, droop = 0.35, fold = 0.18, segs = 10) {
  const g = new THREE.PlaneGeometry(wid, len, 4, segs);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = y / len;
    // arc forward/down along its length, V-fold across the midrib
    p.setZ(i, Math.sin(t * 1.2) * droop * len * t - Math.abs(x) * fold);
    p.setY(i, y * (1 - droop * 0.35 * t * t));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Clumps of big-leaved tropical plants (merged per species → a handful of draw calls).
 * places [{x,z,s,ry}]
 */
export function tropicalPlants(world, places, { kind = 0, color = 0xffffff, leaves = [5, 9], size = [1.1, 1.8] } = {}) {
  const R = rng(101 + kind);
  const M = new Merger();
  const mat = leafMaterial(broadLeafTex(kind), color, { wind: 0.035, base: 0.3 });
  const stemMat = new THREE.MeshStandardMaterial({ color: kind === 0 ? 0x4a5a2a : 0x5a6a30, roughness: 0.6 });
  windSway(stemMat, 0.02, 0.3);
  const ratio = kind === 0 ? 0.62 : 0.34;
  for (const P of places) {
    const n = leaves[0] + Math.floor(R() * (leaves[1] - leaves[0] + 1));
    const y0 = world.heightAt(P.x, P.z) - 0.02;
    const sc = P.s ?? 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.6 + (P.ry ?? 0);
      const len = (size[0] + R() * (size[1] - size[0])) * sc;
      const stemH = (kind === 0 ? 0.5 + R() * 0.8 : 0.9 + R() * 1.4) * sc;
      const tilt = 0.25 + R() * 0.35;
      // petiole
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.sin(a) * tilt * stemH * 0.4, stemH * 0.6, Math.cos(a) * tilt * stemH * 0.4), new THREE.Vector3(Math.sin(a) * tilt * stemH, stemH, Math.cos(a) * tilt * stemH)];
      const sg = taperedTube(pts, 6, (t) => 0.018 * sc * (1.3 - t * 0.6), 1, 1, 6);
      M.add(sg, mat4(P.x, y0, P.z), stemMat);
      // blade: leans out from the petiole tip and droops
      const g = leafStrip(len, len * ratio, kind === 0 ? 0.25 : 0.4, kind === 0 ? 0.12 : 0.22);
      const out = 0.9 + R() * 0.5; // angle from vertical
      const mm = new THREE.Matrix4().makeRotationX(out).premultiply(new THREE.Matrix4().makeRotationY(a));
      mm.setPosition(P.x + pts[2].x, y0 + pts[2].y, P.z + pts[2].z);
      M.add(g, mm, mat);
    }
  }
  const meshes = M.build(world.scene);
  meshes.forEach((m) => { if (m.material === mat) alphaShadow(m); });
  return meshes;
}

/** curved-trunk palms with a crown of fronds */
export function palms(world, places, { height = [6, 11] } = {}) {
  const R = rng(203);
  const M = new Merger();
  const trunk = pbr('bark', [1, 4], { color: 0x8a7e6a, normalScale: new THREE.Vector2(1.5, 1.5) }, 'bark_platanus');
  mossTop(trunk, 0.35, [0.08, 0.12, 0.05]);
  const frond = leafMaterial(frondTex(), 0xd8e0c8, { wind: 0.05, base: 2.5 });
  for (const P of places) {
    const y0 = world.heightAt(P.x, P.z) - 0.2;
    const H = (height[0] + R() * (height[1] - height[0])) * (P.s ?? 1);
    const lean = new THREE.Vector3((R() - 0.5) * 0.5, 1, (R() - 0.5) * 0.5).normalize();
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(lean.x * H * t * t * 0.6, H * t, lean.z * H * t * t * 0.6)); }
    const tg = taperedTube(pts, 12, (t) => 0.2 * (1.25 - t * 0.5) + (t < 0.05 ? 0.12 * (1 - t / 0.05) : 0), 1, 3, 2, 0.04, P.x);
    M.add(tg, mat4(P.x, y0, P.z), trunk);
    world.collideCyl(P.x, y0, P.z, 0.22, 2.5);
    const top = pts[pts.length - 1];
    const n = 9 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.4;
      const len = 3 + R() * 1.6;
      const g = leafStrip(len, len * 0.42, 0.55 + R() * 0.25, 0.06, 12);
      const up = i % 3 === 0 ? 0.5 : 1.0 + R() * 0.45; // a few younger fronds stand up
      const mm = new THREE.Matrix4().makeRotationX(up).premultiply(new THREE.Matrix4().makeRotationY(a));
      mm.setPosition(P.x + top.x, y0 + top.y - 0.1, P.z + top.z);
      M.add(g, mm, frond);
    }
  }
  const meshes = M.build(world.scene);
  meshes.forEach((m) => { if (m.material === frond) alphaShadow(m); });
}

/** plank-buttress roots flaring from the base of a giant tree */
export function buttress(world, x, z, r, { fins = 5, height = 2.2, reach = 2.2, seed = 1, material } = {}) {
  const R = rng(seed);
  const y0 = world.heightAt(x, z) - 0.15;
  const M = new Merger();
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * Math.PI * 2 + R() * 0.7;
    const h = height * (0.6 + R() * 0.6), L = reach * (0.6 + R() * 0.7);
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(L, 0);
    s.quadraticCurveTo(L * 0.25, h * 0.12, 0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.16 + R() * 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
    g.translate(r * 0.6, 0, -0.1);
    // uv: world-ish scale so bark texels match the trunk
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5, uv.getY(k) * 0.5);
    const m = mat4(x, y0, z, a);
    M.add(g, m, material);
    // collider: a thin box along the fin
    const cg = new THREE.BoxGeometry(L * 0.7, h * 0.6, 0.3).translate(r * 0.6 + L * 0.35, h * 0.3, 0);
    world.collide(cg, m); cg.dispose();
  }
  M.build(world.scene);
}

/** lianas: thick woody vines from the canopy, sagging to the ground or between trunks */
export function lianas(world, anchors, { seed = 5 } = {}) {
  const R = rng(seed);
  const mat = pbr('bark', [1, 6], { color: 0x5a5244, normalScale: new THREE.Vector2(1.2, 1.2) }, 'bark_brown_02');
  mossTop(mat, 0.5, [0.08, 0.12, 0.05]);
  const M = new Merger();
  for (const [a, b] of anchors) {
    const pts = [];
    const sag = 1.5 + R() * 3;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      p.x += Math.sin(t * 9 + seed) * 0.12; p.z += Math.cos(t * 7 + seed) * 0.12;
      pts.push(p);
    }
    const r0 = 0.03 + R() * 0.04;
    M.add(taperedTube(pts, 6, (t) => r0 * (1 - t * 0.3), 1, 4, 2, 0.15, seed), null, mat);
  }
  M.build(world.scene, { cast: true });
}

/** hanging aerial roots / thin vines as swaying cards */
export function hangingVines(world, tops, { color = 0x6a8040 } = {}) {
  const tex = frondTex();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a22, roughness: 0.8 });
  hangSway(mat, 0.12);
  const M = new Merger();
  const R = rng(77);
  for (const p of tops) {
    const l = 3 + R() * 9;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(p.x + Math.sin(t * 4 + p.x) * 0.15, p.y - l * t, p.z + Math.cos(t * 3 + p.z) * 0.15)); }
    const g = taperedTube(pts, 4, () => 0.008 + R() * 0.006, 1, 1, 2);
    // hangSway keys off uv.y as distance from the anchor
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - Math.min(1, (p.y - g.attributes.position.getY(i)) / l));
    M.add(g, null, mat);
  }
  M.build(world.scene, { cast: false });
  return tex;
}

/**
 * Rain splash rings on the ground and water around the viewer.
 * heightFn: (x,z) → ground height (water level already folded in); baked to a texture.
 */
export function splashes(world, heightFn, { count = 900, box = 18, size = 200, res = 1, color = 0xc8d0d0 } = {}) {
  const n = Math.round(size / res) + 1;
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[j * n + i] = heightFn(-size / 2 + i * res, -size / 2 + j * res);
  const ht = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
  ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
  const base = new THREE.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = base.index; ig.attributes.position = base.attributes.position; ig.attributes.uv = base.attributes.uv;
  const seeds = new Float32Array(count * 4); const R = rng(9);
  for (let i = 0; i < count; i++) seeds.set([R() * box, R() * box, R(), R()], i * 4);
  ig.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  ig.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uH: { value: null }, uSize: { value: size }, uColor: { value: new THREE.Color(color) } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      attribute vec4 aSeed; uniform float uTime, uBox, uSize; uniform vec3 uCam; uniform sampler2D uH;
      varying vec2 vUv; varying float vF, vA;
      void main(){
        float life = 0.45 + aSeed.w * 0.35;
        float ph = uTime / life + aSeed.z * 9.0;
        float cyc = floor(ph); vF = fract(ph);
        vec2 jit = vec2(fract(sin(cyc * 12.9 + aSeed.x) * 437.5), fract(sin(cyc * 78.2 + aSeed.y) * 437.5)) * 3.0;
        vec2 p = mod(aSeed.xy + jit - uCam.xz + uBox * 0.5, uBox) - uBox * 0.5 + uCam.xz;
        float y = texture2D(uH, (p + uSize * 0.5) / uSize).r + 0.02;
        float r = 0.02 + vF * (0.07 + aSeed.w * 0.07);
        vec3 w = vec3(p.x, y, p.y) + position * r * 2.0;
        vUv = uv;
        float d = distance(w, uCam);
        vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d));
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uColor; varying vec2 vUv; varying float vF, vA;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.07, 0.0, abs(r - 0.8)) + smoothstep(0.5, 0.0, r) * (1.0 - vF) * 0.25;
        float a = ring * (1.0 - vF) * (1.0 - vF) * vA * 0.13;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = U.time; m.uniforms.uH.value = ht;
  const mesh = new THREE.Mesh(ig, m); mesh.frustumCulled = false; mesh.renderOrder = 4;
  world.scene.add(mesh);
  world.onUpdate((dt, ctx) => m.uniforms.uCam.value.copy(ctx.camera.position));
  world.disposables.push(ht);
  return mesh;
}

/**
 * Paint a second ground material (e.g. trail mud) into the terrain through a soft baked mask,
 * so the trail has no hard ribbon edge. `carrier` is a pbr() material whose maps are used.
 */
export function groundLayer(world, material, carrier, maskFn, { size = 220, res = 0.5, scale = 0.45, wet = 0.35 } = {}) {
  const n = Math.round(size / res) + 1;
  const data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[j * n + i] = Math.round(255 * Math.max(0, Math.min(1, maskFn(-size / 2 + i * res, -size / 2 + j * res))));
  const mask = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;
  world.disposables.push(mask);
  const U2 = { uL2: { value: carrier.map }, uL2N: { value: carrier.normalMap }, uMask: { value: mask } };
  world.onUpdate(() => { U2.uL2.value = carrier.map; U2.uL2N.value = carrier.normalMap; });
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    Object.assign(s.uniforms, U2);
    if (!s.vertexShader.includes('vGL')) {
      s.vertexShader = 'varying vec3 vGL;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGL = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = 'varying vec3 vGL;\n' + s.fragmentShader;
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uL2, uL2N, uMask;
        float layerK(){
          float k = texture2D(uMask, (vGL.xz + ${(size / 2).toFixed(1)}) / ${size.toFixed(1)}).r;
          // break the edge up so it frays into the leaf litter
          float nn = fract(sin(dot(floor(vGL.xz * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
          return smoothstep(0.15, 0.85, k + (nn - 0.5) * 0.25);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lk = layerK();
        vec4 l2 = texture2D(uL2, vGL.xz * ${scale.toFixed(3)});
        diffuseColor.rgb = mix(diffuseColor.rgb, l2.rgb * vec3(0.8, 0.76, 0.7), lk);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${(1 - wet).toFixed(2)} * roughnessFactor, lk);`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => key + 'layer';
  return mask;
}

/**
 * Closed canopy: clusters of scanned leaf cards (Poly Haven tree_small_02 atlas) high overhead,
 * instanced. Turns the open sky into a broken green ceiling with light coming through gaps.
 */
export function canopy(world, places, { color = 0x5a7444, y = [16, 28], size = [5, 8] } = {}) {
  const map = phTex('tree_small_02/tree_small_02_leaves_diff', true, 'jpg', 'leaves');
  const alpha = phTex('tree_small_02/tree_small_02_leaves_alpha', false, 'jpg', 'white');
  const mat = new THREE.MeshStandardMaterial({ map, alphaMap: alpha, alphaTest: 0.45, side: THREE.DoubleSide, color, roughness: 0.75 });
  windSway(mat, 0.02, 0.0); translucent(mat, 0x6a8a2a, 1.3);
  const R = rng(55);
  const parts = [];
  const rects = [[0.0, 0.0, 0.58, 0.5], [0.0, 0.5, 0.44, 1.0]];
  for (let k = 0; k < 14; k++) {
    const rect = rects[k % 2];
    const g = new THREE.PlaneGeometry(1, (rect[3] - rect[1]) / (rect[2] - rect[0]), 2, 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), (1 - rect[3]) + uv.getY(i) * (rect[3] - rect[1]));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI / 2 + (R() - 0.5) * 1.2, R() * 6.28, (R() - 0.5) * 0.8)));
    g.scale(0.55 + R() * 0.35, 0.55 + R() * 0.35, 0.55 + R() * 0.35);
    g.translate((R() - 0.5) * 0.9, (R() - 0.5) * 0.35, (R() - 0.5) * 0.9);
    // normals point up/out of the cluster so it lights as a mass
    const p = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i) * 1.6 + 0.4, p.getZ(i)).normalize(); nrm.setXYZ(i, v.x, v.y, v.z); }
    parts.push(g);
  }
  const geo = mergeAll(parts);
  const im = new THREE.InstancedMesh(geo, mat, places.length);
  const dm = new THREE.Object3D();
  places.forEach((P, i) => {
    const s = size[0] + R() * (size[1] - size[0]);
    dm.position.set(P.x, world.heightAt(P.x, P.z) + y[0] + R() * (y[1] - y[0]), P.z);
    dm.rotation.set(0, R() * 6.28, 0); dm.scale.set(s, s * (0.45 + R() * 0.3), s); dm.updateMatrix();
    im.setMatrixAt(i, dm.matrix);
    im.setColorAt(i, new THREE.Color().setHSL(0.24 + (R() - 0.5) * 0.04, 0.35, 0.38 + R() * 0.12));
  });
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
  alphaShadow(im);
  world.scene.add(im);
  return im;
}
function mergeAll(list) {
  let n = 0, idx = 0; for (const g of list) { n += g.attributes.position.count; idx += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), ind = new Uint32Array(idx);
  let o = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    const gi = g.index.array; for (let i = 0; i < gi.length; i++) ind[io + i] = gi[i] + o;
    o += g.attributes.position.count; io += gi.length; g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(ind, 1));
  return g;
}
