// Procedural hearth fire: shader flames, charred logs with glowing cracks, coal bed,
// rising embers, spark bursts and a flickering shadow-casting light.
// Everything is computed from noise every frame, so nothing ever visibly repeats
// and it costs zero bytes of video.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { U, glowSprite, rng, pbr, fbm, pbrSet, taperedTube } from './world.js';
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
    c = mix(c, vec3(1.0, 0.8, 0.45), smoothstep(0.72, 1.0, h));
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
function flames(world, tongues, { intensity = 1.35 } = {}) {
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
        // rising turbulence, faster and finer higher up
        float n1 = fbm3(vec3(x * 3.0, y * 2.2 - t * 1.9, t * 0.4 + vSeed * 13.0));
        float n2 = fbm3(vec3(x * 6.5 + 3.0, y * 5.0 - t * 3.3, t * 0.7 + vSeed * 5.0));
        float turb = n1 * 0.65 + n2 * 0.35;
        // the body sways and splits as it climbs
        float xs = x + (n1 - 0.5) * 0.42 * y + (n2 - 0.5) * 0.08;
        float width = 0.4 * pow(1.0 - y, 0.85) * (0.75 + 0.25 * (1.0 - y)) + 0.03;
        float body = 1.0 - smoothstep(0.0, width, abs(xs));
        // erode with noise: the tip tears into licks and wisps
        float n3 = vn3(vec3(x * 4.0, y * 3.0 - t * 2.4, t * 0.9 + vSeed));
        float heat = body * (1.2 - y * 1.1) - (1.0 - turb) * 0.55 * (0.25 + y) - (1.0 - n3) * 0.25 * y;
        heat = clamp(heat * 1.2, 0.0, 1.0) * smoothstep(0.0, 0.08, y) * smoothstep(1.0, 0.8, y);
        float a = smoothstep(0.0, 0.85, heat);
        vec3 col = fireRamp(heat * 0.78 + 0.05);
        // cleaner, bluish combustion right at the wood
        col = mix(col, col * vec3(0.6, 0.7, 1.3), smoothstep(0.1, 0.0, y) * 0.5);
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
      uPx: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uPx; uniform vec3 uC; uniform vec2 uSpread, uRise;
      varying float vA, vHeat;
      float hh(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float life = 1.6 + aSeed.x * 2.6;
        float ph = uTime / life + aSeed.y * 7.0;
        float cyc = floor(ph), f = fract(ph);
        float r1 = hh(cyc * 12.9 + aSeed.z * 91.0), r2 = hh(cyc * 78.2 + aSeed.w * 37.0), r3 = hh(cyc * 3.7 + aSeed.x * 17.0);
        // only some cycles produce a visible ember: sparse and irregular
        float alive = step(0.72, r3);
        vec3 p = uC + vec3((r1 - 0.5) * uSpread.x, 0.0, (r2 - 0.5) * uSpread.y);
        float h = mix(uRise.x, uRise.y, r3) * f;
        p.y += h;
        p.x += sin(f * 6.0 + r1 * 20.0 + uTime * 1.3) * 0.08 * f + (r2 - 0.5) * 0.25 * f * f;
        p.z += cos(f * 5.0 + r2 * 20.0 + uTime) * 0.05 * f;
        vA = alive * smoothstep(0.0, 0.08, f) * pow(1.0 - f, 2.0) * (0.55 + 0.45 * sin(uTime * (9.0 + aSeed.y * 14.0) + aSeed.x * 60.0));
        vHeat = 1.0 - f;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (1.1 + aSeed.z * 1.3) * (2.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA, vHeat;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
        float a = smoothstep(0.25, 0.0, d) * vA;
        vec3 col = mix(vec3(0.9, 0.12, 0.01), vec3(1.0, 0.55, 0.16), vHeat * vHeat);
        gl_FragColor = vec4(col * a * 2.4, a);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = 9;
  world.scene.add(p);
  world.onUpdate(() => { m.uniforms.uPx.value = world.renderer.getPixelRatio(); });
  return p;
}

/* =========================================================
   Sparks from a popping log: short motion-blurred streaks (head + tail a few ms
   behind on the same path), each with its own life, drag and flutter
   ========================================================= */
function sparks(world, { count = 26 } = {}) {
  const pos = new Float32Array(count * 6), aS = new Float32Array(count * 8), aEnd = new Float32Array(count * 2);
  const R = rng(17);
  for (let i = 0; i < count; i++) { const sd = [R(), R(), R(), R()]; aS.set([...sd, ...sd], i * 8); aEnd.set([0, 1], i * 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(aS, 4));
  g.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: U.time, uT0: { value: -99 }, uP: { value: new THREE.Vector3() }, uN: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute float aEnd; uniform float uTime, uT0, uN; uniform vec3 uP;
      varying float vA, vHeat;
      vec3 path(float t){
        // launched mostly upward and a little toward the room, slowed by air drag, lifted by the draught
        vec3 v0 = vec3((aSeed.x - 0.5) * 1.1, 1.1 + aSeed.y * 1.6, (aSeed.z - 0.3) * 0.8);
        float k = 2.6 + aSeed.w * 2.0;                     // drag
        vec3 p = v0 * (1.0 - exp(-k * t)) / k;
        p.y += 0.35 * t * t - 0.0;                         // updraught beats gravity for tiny sparks
        p.x += sin(t * (9.0 + aSeed.y * 8.0) + aSeed.x * 20.0) * 0.025 * t;
        p.z += cos(t * (7.0 + aSeed.z * 6.0) + aSeed.w * 20.0) * 0.02 * t;
        return uP + p;
      }
      void main(){
        float life = 0.35 + aSeed.w * 0.8;
        float t = uTime - uT0 - aSeed.x * 0.06;
        float on = step(0.0, t) * step(t, life) * step(aSeed.y, uN);
        float tt = max(t - aEnd * 0.022, 0.0);
        vec3 p = path(tt);
        float f = clamp(t / life, 0.0, 1.0);
        vA = on * (1.0 - f) * (1.0 - f) * (1.0 - aEnd * 0.85) * (0.7 + 0.3 * sin(uTime * 60.0 + aSeed.z * 30.0));
        vHeat = 1.0 - f;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA, vHeat;
      void main(){ vec3 c = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.72, 0.35), vHeat); gl_FragColor = vec4(c * vA * 3.0, vA); }`,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 9;
  world.scene.add(l);
  return {
    fire(p, k) { m.uniforms.uT0.value = U.time.value; m.uniforms.uP.value.copy(p); m.uniforms.uN.value = k < 0.6 ? 0.06 + Math.random() * 0.08 : 0.4 + Math.random() * 0.3; },
  };
}

/* =========================================================
   Cast-iron material: pitted, sooty, a little rust where it's cool,
   heat-blued/dull red where it sits in the coals
   ========================================================= */
let ironSet = null;
function ironTex() {
  if (ironSet) return ironSet;
  ironSet = pbrSet(256, (u, v) => {
    const big = fbm(u * 4, v * 4, 4, 4, 401), fine = fbm(u * 32, v * 32, 32, 3, 402);
    const pits = Math.pow(Math.max(0, fbm(u * 24, v * 24, 24, 2, 403) - 0.62) * 3, 2);
    const rust = Math.max(0, big - 0.6) * 2.2 * (0.6 + fine * 0.6);
    const soot = fbm(u * 8, v * 8, 8, 3, 404);
    const b = 0.055 + fine * 0.035 - pits * 0.03 + soot * 0.02;
    return {
      h: fine * 0.5 - pits * 0.8 + big * 0.2,
      r: b + rust * 0.18, g: b * 0.97 + rust * 0.08, b: b * 0.95 + rust * 0.03,
      rough: 0.62 + fine * 0.2 + rust * 0.25 + pits * 0.1,
    };
  }, 3.2);
  return ironSet;
}
export function ironMaterial(center, { repeat = [1, 1] } = {}) {
  const T = ironTex();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 1, envMapIntensity: 0.6 });
  for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = T[k].clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); m[k] = t; }
  m.normalScale = new THREE.Vector2(1.2, 1.2);
  const uC = { value: center.clone() };
  m.onBeforeCompile = (s) => {
    s.uniforms.uC = uC; s.uniforms.uTime = U.time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vIW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vIW; uniform vec3 uC; uniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 d = vIW - uC;
          float hot = (1.0 - smoothstep(0.0, 0.32, length(d * vec3(1.0, 2.2, 1.6)))) * smoothstep(0.12, -0.04, d.y);
          float pulse = 0.85 + 0.15 * sin(uTime * 0.7 + vIW.x * 9.0);
          totalEmissiveRadiance += vec3(0.55, 0.09, 0.01) * hot * hot * 0.9 * pulse;
        }`);
  };
  m.customProgramCacheKey = () => 'castiron';
  return m;
}

/* =========================================================
   Charred log material: bark that blackens and glows in cracks near the heat
   ========================================================= */
export function emberMaterial(base, { center, radius = 0.6, glow = 1, allChar = false, crack = 1, core = 0.7, hue = 0 } = {}) {
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
          float rid = 1.0 - abs(vn3(vEW * ${(22 * crack).toFixed(1)} + vec3(0.0, uTime * 0.03, 0.0)) * 2.0 - 1.0);
          float rid2 = 1.0 - abs(vn3(vEW * ${(48 * crack).toFixed(1)} + 7.0) * 2.0 - 1.0);
          float crack = pow(rid, 9.0) * 0.8 + pow(rid2, 14.0) * 0.5;
          float breathe = 0.65 + 0.35 * fbm3(vEW * 3.0 + vec3(0.0, 0.0, uTime * 0.35));
          float core = smoothstep(0.55, 1.0, eh2);
          vec3 ec = fireRamp(${(0.25 - hue).toFixed(2)} + breathe * 0.35 + core * 0.2);
          totalEmissiveRadiance += ec * (crack * smoothstep(0.25, 0.85, eh2) * 5.0 + core * core * ${core.toFixed(2)} * breathe) * uGlow;
        }`);
  };
  m.customProgramCacheKey = () => `ember${allChar ? 1 : 0}_${crack}_${core}_${hue}`;
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

  /* cast-iron grate: front-to-back bars, a curved front basket, turned andirons */
  const iron = ironMaterial(c.clone().add(new THREE.Vector3(0, 0.04, 0)), { repeat: [2, 2] });
  const grate = new THREE.Group();
  const addM = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(g, iron); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); grate.add(m); return m; };
  const barG = new RoundedBoxGeometry(0.02, 0.022, depth + 0.06, 2, 0.006);
  for (let i = 0; i < 8; i++) addM(barG, -width / 2 + 0.04 + i * (width - 0.08) / 7, 0.07, 0);
  // side rails
  for (const xx of [-width / 2, width / 2]) addM(new RoundedBoxGeometry(0.024, 0.03, depth + 0.08, 2, 0.008), xx, 0.07, 0);
  // front basket: three bowed bars rising in front of the logs, and a back rail
  for (let k = 0; k < 3; k++) {
    const y = 0.085 + k * 0.045, bow = 0.018 + k * 0.006;
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3((t - 0.5) * width, y, depth / 2 + 0.02 + Math.sin(t * Math.PI) * bow)); }
    grate.add(new THREE.Mesh(taperedTube(pts, 8, () => 0.0085, 1, 6, 6), iron));
  }
  for (let i = 0; i < 8; i++) { const x = -width / 2 + 0.04 + i * (width - 0.08) / 7; addM(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 8), x, 0.13, depth / 2 + 0.03 + Math.sin((x / width + 0.5) * Math.PI) * 0.024); }
  addM(new RoundedBoxGeometry(width, 0.022, 0.024, 2, 0.007), 0, 0.075, -depth / 2 - 0.02);
  // legs: short splayed cast feet
  const footG = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.02, 0), new THREE.Vector2(0.022, 0.008), new THREE.Vector2(0.011, 0.02), new THREE.Vector2(0.01, 0.06), new THREE.Vector2(0.0, 0.062)], 14);
  for (const xx of [-width / 2 + 0.01, width / 2 - 0.01]) for (const zz of [-depth / 2, depth / 2 - 0.01]) addM(footG, xx, 0.0, zz);
  // andirons: turned posts with a collar and ball finial, on arched feet
  const andG = new THREE.LatheGeometry([
    [0, 0], [0.034, 0], [0.036, 0.012], [0.02, 0.022], [0.016, 0.05], [0.019, 0.12], [0.014, 0.19], [0.024, 0.205], [0.024, 0.215], [0.012, 0.23], [0.012, 0.25], [0.026, 0.27], [0.03, 0.295], [0.024, 0.318], [0.008, 0.33], [0, 0.332],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  for (const xx of [-width / 2 + 0.03, width / 2 - 0.03]) {
    addM(andG, xx, 0, depth / 2 + 0.05);
    addM(new RoundedBoxGeometry(0.03, 0.02, depth * 0.9, 2, 0.007), xx, 0.035, 0.0);   // log bar running back
  }
  grate.position.copy(c);
  grate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  S.add(grate);

  /* ash bed: soft, smooth drifts (no spiky noise) */
  const ashC = document.createElement('canvas'); ashC.width = ashC.height = 256;
  const ag = ashC.getContext('2d');
  ag.fillStyle = '#4a4744'; ag.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 40 + R() * 80; ag.fillStyle = `rgba(${v},${v * 0.97},${v * 0.93},${0.25 + R() * 0.4})`; ag.beginPath(); ag.arc(R() * 256, R() * 256, 0.4 + R() * 1.3, 0, 7); ag.fill(); }
  for (let i = 0; i < 260; i++) { ag.fillStyle = `rgba(14,12,11,${0.4 + R() * 0.5})`; ag.beginPath(); ag.arc(R() * 256, R() * 256, 0.6 + R() * 2.4, 0, 7); ag.fill(); }
  const ashT = new THREE.CanvasTexture(ashC); ashT.colorSpace = THREE.SRGBColorSpace; ashT.wrapS = ashT.wrapT = THREE.RepeatWrapping; ashT.repeat.set(2, 1.2); ashT.anisotropy = 8;
  const ashMat = emberMaterial(new THREE.MeshStandardMaterial({ map: ashT, roughness: 1, color: 0x9a9690 }), { center: c.clone().add(new THREE.Vector3(0, 0.03, 0)), radius: 0.34, glow: 0.35 });
  const ashGeo = new THREE.PlaneGeometry(width + 0.3, depth + 0.25, 48, 24); ashGeo.rotateX(-Math.PI / 2);
  const ap = ashGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const x = ap.getX(i), z = ap.getZ(i);
    const mound = Math.max(0, 1 - Math.hypot(x / (width * 0.62), z / (depth * 0.72)));
    ap.setY(i, 0.008 + mound * mound * (3 - 2 * mound) * 0.03 + (fbm(x * 9 + 4, z * 9 + 2, 64, 3, 405) - 0.5) * 0.008);
  }
  ashGeo.computeVertexNormals();
  const ash = new THREE.Mesh(ashGeo, ashMat); ash.position.copy(c); ash.receiveShadow = true; S.add(ash);

  /* coals: rounded, lumpy chunks (welded vertices + smooth noise, so no cracked facets) */
  const coalVariants = [0, 1, 2].map((v) => {
    let g = new THREE.IcosahedronGeometry(1, 3);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position, ph = [R() * 6, R() * 6, R() * 6, R() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + Math.sin(x * 2.3 + ph[0]) * 0.16 + Math.sin(y * 3.1 + z * 1.7 + ph[1]) * 0.12 + Math.sin(z * 4.7 + x * 2.2 + ph[2]) * 0.07 + Math.sin((x + y + z) * 7.1 + ph[3]) * 0.03;
      p.setXYZ(i, x * k, y * k * (0.55 + v * 0.08), z * k * (0.85 + v * 0.1));
    }
    g.computeVertexNormals();
    return g;
  });
  const coalMat = emberMaterial(new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.97 }), { center: c.clone().add(new THREE.Vector3(0, 0.04, 0)), radius: 0.5, glow: 1.0, crack: 3.2, core: 0.12, hue: 0.1 });
  const dm = new THREE.Object3D();
  const placed = [];
  coalVariants.forEach((geo, v) => {
    const N = 60, im = new THREE.InstancedMesh(geo, coalMat, N);
    let n = 0;
    for (let tries = 0; n < N && tries < 2000; tries++) {
      const a = R() * 6.28, rr = Math.sqrt(R());
      const x = Math.cos(a) * rr * width * 0.42, z = Math.sin(a) * rr * depth * 0.4 - depth * 0.06;   // stay within the grate
      const sz = (0.012 + R() * 0.022) * (1 - rr * 0.35);
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < (q[2] + sz) * 0.8)) continue;
      placed.push([x, z, sz]);
      const mound = Math.max(0, 1 - Math.hypot(x / (width * 0.62), z / (depth * 0.72)));
      dm.position.set(c.x + x, c.y + 0.006 + mound * mound * (3 - 2 * mound) * 0.03 + sz * 0.3, c.z + z);
      dm.rotation.set((R() - 0.5) * 0.6, R() * 6.28, (R() - 0.5) * 0.6); dm.scale.setScalar(sz); dm.updateMatrix();
      im.setMatrixAt(n++, dm.matrix);
    }
    im.count = n; im.castShadow = true; im.receiveShadow = true; S.add(im);
  });

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
  for (let i = 0; i < 8; i++) {
    const t = i / 7, mid = 1 - Math.abs(t - 0.5) * 2;
    tongues.push({ x: c.x + (t - 0.5) * width * 0.7 + (R() - 0.5) * 0.06, y: c.y + 0.12 + R() * 0.05, z: c.z + (R() - 0.5) * depth * 0.45, seed: R() * 10, w: 0.3 + R() * 0.16, h: 0.36 + mid * 0.34 + R() * 0.12, k: 0.55 + R() * 0.3 });
  }
  // low, wide licks along the coal bed
  tongues.push({ x: c.x - 0.12, y: c.y + 0.06, z: c.z + 0.07, seed: 3.3, w: 0.5, h: 0.2, k: 0.5 });
  tongues.push({ x: c.x + 0.15, y: c.y + 0.06, z: c.z - 0.04, seed: 7.7, w: 0.46, h: 0.18, k: 0.45 });
  const fl = flames(world, tongues);
  const em = embers(world, c.clone().add(new THREE.Vector3(0, 0.25, 0)), { spread: [width * 0.7, depth * 0.6] });
  const sp = sparks(world);

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
      sp.fire(new THREE.Vector3(c.x + (R() - 0.5) * width * 0.6, c.y + 0.2 + R() * 0.1, c.z + (R() - 0.3) * depth * 0.4), k);
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
