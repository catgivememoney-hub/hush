import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  World, U, sky, terrain, pathSampler, ribbon, ferns, clumps, rocks, branchTree, glowSprite,
  rain, mist, water, boundary, fireflies, pbr, cardMat, Merger, mat4, taperedTube,
  wetRipples, windSway, hangSway, clamp, mix, smooth, fbm, rng, grass, mossTop, card,
} from './world.js';
import { modelInstances, placeModel } from './models.js';
import { hearthFire, candleFlame, logGeometry, endGrain } from './fire.js';
import { tropicalPlants, palms, buttress, lianas, hangingVines, splashes, groundLayer, canopy } from './jungle.js';

/* ---------- sounds (CC0, Freesound) — streamed from Freesound's CDN, so the repo stays tiny ---------- */
const OGG = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
const fsnd = (id, user) => `https://cdn.freesound.org/previews/${String(id).slice(0, 3)}/${id}_${user}-hq.${OGG ? 'ogg' : 'mp3'}`;
export const SOUNDS = {
  rain: { url: fsnd(349328, 1812925), title: 'Amazon Jungle Afternoon Shower', by: 'trundlefly', page: 'https://freesound.org/people/trundlefly/sounds/349328/' },
  fire: { url: fsnd(610766, 4759831), title: 'Fireplace Fire', by: 'shaunhillyard', page: 'https://freesound.org/people/shaunhillyard/sounds/610766/' },
};

/* ---------- helpers ---------- */
// ?lite trims the densest layers for weaker GPUs
const LITE = typeof location !== 'undefined' && /[?&]lite\b/.test(location.search);
const Q = (n) => (LITE ? Math.ceil(n * 0.4) : n);
function bake(fn, size, res, cx = 0, cz = 0) {
  const n = Math.ceil(size / res) + 1;
  const g = new Float32Array(n * n);
  const x0 = cx - size / 2, z0 = cz - size / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = fn(x0 + i * res, z0 + j * res);
  return (x, z) => {
    const fx = clamp((x - x0) / res, 0, n - 1.001), fz = clamp((z - z0) / res, 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = g[j * n + i], b = g[j * n + i + 1], c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function scatter(n, seed, area, ok, cx = 0, cz = 0, tries = 30) {
  const R = rng(seed), out = [];
  for (let i = 0; i < n; i++) for (let t = 0; t < tries; t++) {
    const x = cx + (R() - 0.5) * area, z = cz + (R() - 0.5) * area;
    if (!ok || ok(x, z, R)) { out.push({ x, z, s: 0.75 + R() * 0.5, ry: R() * 6.28 }); break; }
  }
  return out;
}
function keyLight(world, { color, intensity, dir, shadow = true, size = 32, map = 2048 }) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.userData.dir = new THREE.Vector3(...dir).normalize();
  if (shadow) {
    l.castShadow = true; l.shadow.mapSize.set(map, map);
    const c = l.shadow.camera; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 160;
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.04; l.shadow.radius = 4;
  }
  world.scene.add(l, l.target);
  world.sun = l;
  return l;
}
function hemi(world, skyC, ground, intensity) { world.scene.add(new THREE.HemisphereLight(skyC, ground, intensity * 2.2)); }
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

/* =========================================================
   1 · 雨林 — tropical rainforest creek in a heavy shower
   ========================================================= */
function buildRainforest(world) {
  const S = world.scene;
  world.fogColor = 0x4c584e;
  S.fog = new THREE.FogExp2(world.fogColor, 0.04);
  sky(world, { top: 0x4e5a52, horizon: 0x6e7a6e, bottom: 0x3c463e, clouds: 0.9 });
  hemi(world, 0x9aa89a, 0x2a2a1c, 0.75);
  keyLight(world, { color: 0xc4ccc0, intensity: 0.55, dir: [0.25, 1, 0.35], size: 36 });

  /* terrain: a creek cutting a shallow valley, a muddy trail along its east bank */
  const creek = pathSampler([[-10, -80], [-5, -48], [3, -22], [0, 2], [-7, 26], [-3, 52], [-9, 80]]);
  const trail = pathSampler([[4, -80], [6, -50], [10, -24], [7.5, 0], [2, 24], [5, 50], [1, 80]]);
  const WATER = -0.32;
  const H = bake((x, z) => {
    const cd = creek.dist(x, z)[0], td = trail.dist(x, z)[0];
    const hills = (fbm(x * 0.018 + 20, z * 0.018 + 7, 64, 4, 41) - 0.5) * 9 + smooth(10, 45, cd) * 3.5;
    const bumps = (fbm(x * 0.2, z * 0.2, 64, 3, 42) - 0.5) * 0.45;
    // the valley rises on every side so no horizon ever shows through the fog
    let h = hills + bumps + smooth(62, 104, Math.hypot(x, z)) * 16;
    // creek bed and soft banks
    const bed = -0.85 + (fbm(x * 0.3, z * 0.3, 64, 2, 43) - 0.5) * 0.15;
    h = mix(bed, h, smooth(2.0, 7.5, cd));
    // trail is flattened into the slope
    const th = mix(hills * 0.55 + 0.25, h, 0);
    h = mix(th + bumps * 0.3, h, smooth(1.4, 3.6, td));
    return h;
  }, 220, 1);
  world.heightAt = H;
  world.waterLevel = WATER;

  const ground = pbr('forestGround', [1, 1], { color: 0x9e9888 }, 'forest_leaves_02');
  wetRipples(ground, 0.5, 1.6);
  terrain(world, {
    size: 220, segs: 260, height: H, material: ground, collSegs: 120,
    colorFn: (x, z, y) => { const m = fbm(x * 0.06, z * 0.06, 64, 3, 44); const wet = smooth(0.2, -0.4, y); const c = 0.72 + m * 0.3 - wet * 0.3; return [c * 0.92, c, c * 0.86]; },
  });
  // muddy trail painted into the ground through a soft, frayed mask (no hard ribbon edges)
  const mud = pbr('mud', [1, 1], { color: 0x8a7a68, roughness: 0.55 }, 'brown_mud_leaves_01');
  groundLayer(world, ground, mud, (x, z) => 1 - smooth(0.7, 1.9, trail.dist(x, z)[0]) + (1 - smooth(0.0, 1.4, creek.dist(x, z)[0] - 2.2)) * 0.6, { scale: 0.42, wet: 0.45 });
  // puddles along the trail
  const pudM = new THREE.MeshStandardMaterial({ color: 0x15150f, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.78, polygonOffset: true, polygonOffsetFactor: -3 });
  wetRipples(pudM, 2.2, 2.4);
  { const R = rng(12); for (let i = 0; i < 26; i++) {
    const t = R(); const p = trail.curve.getPointAt(t), tg = trail.curve.getTangentAt(t);
    const off = (R() - 0.5) * 1.2;
    const x = p.x - tg.z * off, z = p.z + tg.x * off;
    const g = new THREE.CircleGeometry(0.35 + R() * 0.7, 28); g.rotateX(-Math.PI / 2); g.scale(1, 1, 0.45 + R() * 0.5);
    const m = new THREE.Mesh(g, pudM); m.position.set(x, H(x, z) + 0.05, z); m.rotation.y = Math.atan2(tg.x, tg.z) + (R() - 0.5) * 0.4; m.receiveShadow = true; S.add(m);
  } }
  water(world, { size: 200, y: WATER, color: 0x141c14, sun: new THREE.Vector3(0.25, 1, 0.35), sunColor: 0x3a4238, distortion: 1.4 });

  /* giants: emergent canopy trees with buttresses, moss and hanging strands */
  const bark = pbr('bark', [1, 1.4], { color: 0x9a9284, normalScale: new THREE.Vector2(1.8, 1.8) }, 'bark_brown_02');
  mossTop(bark, 0.7, [0.09, 0.13, 0.05]);
  const away = (x, z, a = 3.5, b = 6) => trail.dist(x, z)[0] > a && creek.dist(x, z)[0] > b;
  const giants = scatter(Q(64), 21, 140, (x, z) => away(x, z, 4.2, 6.5));
  const crowns = [];
  giants.forEach((p, i) => {
    const big = i < 22;
    const t = branchTree(world, p.x, p.z, {
      seed: 300 + i, height: big ? 30 + p.s * 6 : 20 + p.s * 6, trunkR: big ? 0.85 + p.s * 0.25 : 0.5 + p.s * 0.2, spread: 1.3, depth: 4, horizontal: 0.6,
      leaves: true, moss: true, leafColor: 0x5e7848, mossColor: 0x7e8a5a, barkColor: 0x8a8478, leafDensity: 9, ry: p.ry,
    });
    crowns.push(...t.leafPos.filter((_, k) => k % 3 === 0));
    if (big) buttress(world, p.x, p.z, 0.9 + p.s * 0.25, { fins: 4 + (i % 3), height: 2 + p.s, reach: 2 + p.s, seed: 70 + i, material: bark });
  });
  // roots spilling over the bank near the trail
  modelInstances(world, 'root_cluster_01', scatter(3, 23, 90, (x, z) => { const d = trail.dist(x, z)[0]; return d > 3 && d < 7; }), { scale: 1.1, sink: 0.15, tint: 0x9a9488, moss: 0.6, collide: 'auto' });

  // the canopy ceiling, thinner over the creek so a little sky shows along the water
  canopy(world, scatter(Q(420), 24, 170, (x, z, R) => creek.dist(x, z)[0] > 5 || R() < 0.25), { y: [15, 27], size: [5, 9] });
  canopy(world, scatter(Q(160), 25, 140, (x, z) => creek.dist(x, z)[0] > 3), { y: [9, 14], size: [3.5, 6], color: 0x52683e });

  /* lianas between neighbouring giants, and aerial roots dropping from the canopy */
  const anchors = [];
  for (let i = 0; i < giants.length; i++) {
    const a = giants[i];
    const b = giants.reduce((best, g) => (g !== a && Math.hypot(g.x - a.x, g.z - a.z) < Math.hypot(best.x - a.x, best.z - a.z) ? g : best), giants[(i + 1) % giants.length]);
    if (Math.hypot(b.x - a.x, b.z - a.z) > 22) continue;
    anchors.push([new THREE.Vector3(a.x, H(a.x, a.z) + 9 + (i % 5) * 2, a.z), new THREE.Vector3(b.x, H(b.x, b.z) + 6 + (i % 3) * 3, b.z)]);
    anchors.push([new THREE.Vector3(a.x + 0.6, H(a.x, a.z) + 14, a.z), new THREE.Vector3(a.x + 1.5 + (i % 4), H(a.x, a.z) - 0.1, a.z + 1.2)]);
  }
  lianas(world, anchors);
  hangingVines(world, crowns.slice(0, 160).map((p) => ({ x: p.x, y: p.y - 0.5, z: p.z })));

  /* mid-storey: palms and big-leaf plants */
  palms(world, scatter(34, 31, 120, (x, z) => away(x, z, 3.2, 4)), { height: [5, 10] });
  tropicalPlants(world, scatter(70, 32, 110, (x, z) => away(x, z, 2.4, 2.6)), { kind: 0, size: [0.8, 1.5], color: 0xe8f0dc });
  tropicalPlants(world, scatter(40, 33, 120, (x, z) => away(x, z, 3.5, 4)), { kind: 1, size: [1.4, 2.4], leaves: [5, 8], color: 0xe0ecd0 });
  // a lush border right along the trail, so you walk between leaves
  tropicalPlants(world, scatter(Q(110), 35, 140, (x, z) => { const d = trail.dist(x, z)[0]; return d > 1.7 && d < 5.5 && creek.dist(x, z)[0] > 2.4; }), { kind: 0, size: [0.7, 1.4], color: 0xeef4e2 });
  tropicalPlants(world, scatter(Q(50), 36, 140, (x, z) => { const d = trail.dist(x, z)[0]; return d > 2.6 && d < 7 && creek.dist(x, z)[0] > 3; }), { kind: 1, size: [1.3, 2.2], leaves: [5, 8], color: 0xe4eed4 });
  // creekside clumps right at the water's edge
  tropicalPlants(world, scatter(30, 34, 110, (x, z) => { const d = creek.dist(x, z)[0]; return d > 2.5 && d < 5 && trail.dist(x, z)[0] > 2; }), { kind: 0, size: [0.6, 1.1], color: 0xf0f4e0 });

  /* understorey: scanned plants (Poly Haven) */
  const under = (x, z) => away(x, z, 1.7, 2.3);
  modelInstances(world, 'fern_02', scatter(Q(650), 41, 130, under), { scale: 1.7, tint: 0xa8b494, wind: [0.04, 0.05], translucent: 0x5a7a2a, far: 38, sink: 0.04, onFail: () => ferns(world, scatter(300, 41, 130, under)) });
  modelInstances(world, 'calathea_orbifolia_01', scatter(Q(120), 42, 110, under), { scale: 1.3, tint: 0xb8c0a8, wind: [0.02, 0.05], translucent: 0x6a8a3a, far: 32, sink: 0.02, cast: false });
  modelInstances(world, 'anthurium_botany_01', scatter(Q(110), 43, 100, under), { scale: 1.4, tint: 0xb0b8a0, wind: [0.02, 0.05], translucent: 0x6a8a3a, far: 28, sink: 0.02, cast: false });
  modelInstances(world, 'shrub_04', scatter(Q(30), 44, 120, (x, z) => away(x, z, 2.5, 3)), { scale: 1.0, tint: 0x98a888, wind: [0.03, 0.05], translucent: 0x5a7a2a, far: 38, sink: 0.05 });
  modelInstances(world, 'pachira_aquatica_01', scatter(8, 45, 80, (x, z) => away(x, z, 3, 4)), { scale: 1.6, tint: 0xb0b8a0, wind: [0.015, 0.3], translucent: 0x6a8a3a, far: 40, sink: 0.02 });
  modelInstances(world, 'nettle_plant', scatter(Q(40), 46, 110, under), { scale: 1.1, tint: 0xa0ac90, wind: [0.03, 0.05], far: 24, sink: 0.02, cast: false });
  grass(world, scatter(Q(700), 47, 120, (x, z) => { const d = trail.dist(x, z)[0]; return d > 1.3 && d < 6 && creek.dist(x, z)[0] > 2.2; }), { height: [0.25, 0.7], blades: 18, color: 0x9aae80, dry: 0.15, spread: 0.2, near: 40 });
  clumps(world, scatter(300, 48, 110, under), { tex: 'fern', color: 0x6a8a52, w: 0.6, h: 0.8, sway: 0.06 });

  /* rocks & deadwood */
  modelInstances(world, 'rock_moss_set_01', scatter(40, 51, 120, (x, z) => { const d = creek.dist(x, z)[0]; return d < 6 && trail.dist(x, z)[0] > 2; }), { scale: 0.9, sink: 0.3, moss: 0.8, tint: 0xa8a49a, collide: 'auto', minCollide: 0.6, onFail: () => rocks(world, scatter(20, 51, 120, (x, z) => creek.dist(x, z)[0] < 6), { mossy: 0.8 }) });
  modelInstances(world, 'rock_moss_set_02', scatter(30, 52, 130, (x, z) => away(x, z, 2.5, 3)), { scale: 0.8, sink: 0.28, moss: 0.7, tint: 0xa8a49a, collide: 'auto', minCollide: 0.6 });
  modelInstances(world, 'boulder_01', scatter(4, 53, 90, (x, z) => creek.dist(x, z)[0] < 3.5), { scale: 1.3, sink: 0.35, moss: 0.85, tint: 0x8e8c84, collide: 'auto' });
  modelInstances(world, 'dead_tree_trunk_02', scatter(4, 54, 100, (x, z) => away(x, z, 3, 3)), { scale: 1.4, sink: 0.2, moss: 0.8, tint: 0x9a9488, collide: 'log', tilt: 0.05 });
  modelInstances(world, 'tree_stump_01', scatter(5, 55, 100, (x, z) => away(x, z, 3, 3)), { scale: 1.2, sink: 0.12, moss: 0.8, tint: 0x9a9488, collide: 'cyl' });

  /* weather */
  rain(world, { count: Q(20000), opacity: 0.4, speed: 14, box: 26, color: 0xbcc4c0, wind: [0.6, 0.2] });
  splashes(world, (x, z) => Math.max(H(x, z), WATER), { count: 1400, box: 20 });
  mist(world, { count: 60, area: 130, y: 0.5, size: [8, 16], color: 0x8a968c, opacity: 0.1 });
  mist(world, { count: 40, area: 150, y: 9, size: [22, 38], color: 0x7a867c, opacity: 0.08, heightVar: 10 });
  mist(world, { count: 30, area: 0, place: () => { const p = creek.curve.getPointAt(Math.random()); return [p.x, p.z]; }, y: 0.3, size: [6, 12], color: 0x9aa49a, opacity: 0.12, heightVar: 0.6 });
  fireflies(world, new THREE.Vector3(6, 0, 0), 40, 24, 0xc8ff80, [0.4, 2.2]);
  boundary(world, 0, 0, 78);

  const sp = trail.curve.getPointAt(0.42), tg = trail.curve.getTangentAt(0.42);
  world.spawn = { pos: new THREE.Vector3(sp.x, H(sp.x, sp.z) + 0.2, sp.z), yaw: Math.atan2(-tg.x, -tg.z) + 0.35, pitch: 0.05 };
  world.surface = (x, z, y) => (y < WATER + 0.05 ? 'water' : trail.dist(x, z)[0] < 1.2 ? 'mud' : 'leaves');
  world.ambience = { rain: 0.22, leafdrip: 0.55 };
  world.streams = [{ url: SOUNDS.rain.url, gain: 0.95, fallback: 'rain' }];
  // the creek murmurs where it is close
  for (let t = 0.05; t < 1; t += 0.11) { const p = creek.curve.getPointAt(t); world.sources.push({ type: 'stream', pos: new THREE.Vector3(p.x, WATER + 0.2, p.z) }); }
  world.tweak = { exposure: 1.05, bloom: 0.7, sat: 1.05 };
  world.wet = true;
}

/* =========================================================
   2 · 壁炉 — a quiet room with a wood fire, rain at the window
   ========================================================= */
function buildHearth(world, renderer) {
  const S = world.scene;
  world.fogColor = 0x0a0806;
  S.fog = new THREE.FogExp2(world.fogColor, 0.012);
  world.heightAt = () => 0;
  world.envIntensity = 0.25;
  S.background = new THREE.Color(0x050403);
  // warm, dim reflections: an environment made of a dark room with a glowing hearth in it
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: 0x120c08, side: THREE.BackSide })));
    const hot = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a30).multiplyScalar(3) }));
    hot.position.set(0, -1, -6); env.add(hot);
    const cold = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5a6a88).multiplyScalar(0.6) }));
    cold.position.set(6, 0.5, 0); cold.rotation.y = -Math.PI / 2; env.add(cold);
    const pm = new THREE.PMREMGenerator(renderer);
    S.environment = pm.fromScene(env, 0.03).texture;
    pm.dispose();
  }
  S.add(new THREE.HemisphereLight(0x34343e, 0x1c120a, 0.3));

  const W = 6.4, D = 8, Hh = 3.1;           // room
  const xL = -W / 2, xR = W / 2, zB = -D / 2, zF = D / 2;
  const M = new Merger();

  /* materials (Poly Haven sets over procedural fallbacks) */
  const floor = pbr('wood', [4, 5], { color: 0xb09a84, roughness: 0.55 }, 'wood_floor_worn');
  const plaster = pbr('plaster', [2, 1.2], { color: 0xc8b8a0 }, 'painted_plaster_wall');
  const panel = pbr('wood', [3, 0.6], { color: 0x6a5240, roughness: 0.5 }, 'dark_wooden_planks');
  const beamM = pbr('wood', [0.5, 3], { color: 0x5a4434, roughness: 0.7 }, 'wood_planks_dirt');
  const trim = pbr('wood', [1, 1], { color: 0x3e2e22, roughness: 0.45 }, 'dark_wooden_planks');
  const brick = pbr('brick', [2.2, 2.4], { color: 0xb29888 }, 'red_brick_03');
  const sooty = pbr('brick', [1.1, 0.9], { color: 0x3a2c26 }, 'red_brick_03');
  const hearthStone = pbr('stone', [1.5, 0.6], { color: 0x6e6a66, roughness: 0.9 }, 'stone_tiles_02');

  /* floor & ceiling */
  const fl = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), floor); fl.position.y = -0.05; fl.receiveShadow = true; S.add(fl);
  world.collideBox(0, -0.05, 0, W + 2, 0.1, D + 2);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), plaster); ceil.position.y = Hh + 0.05; ceil.receiveShadow = true; S.add(ceil);
  for (let z = zB + 0.9; z < zF; z += 1.6) M.add(new THREE.BoxGeometry(W, 0.22, 0.18), mat4(0, Hh - 0.11, z), beamM);

  /* walls with wainscot; right wall has a window opening */
  const win = { z0: -0.4, z1: 1.0, y0: 0.92, y1: 2.42 };
  const wallPiece = (w, h, d, x, y, z) => { M.add(new THREE.BoxGeometry(w, h, d), mat4(x, y, z), plaster); world.collideBox(x, y, z, w, h, d); };
  wallPiece(W, Hh, 0.2, 0, Hh / 2, zB - 0.1);
  wallPiece(W, Hh, 0.2, 0, Hh / 2, zF + 0.1);
  wallPiece(0.2, Hh, D, xL - 0.1, Hh / 2, 0);
  // right wall split around the window
  wallPiece(0.2, Hh, win.z0 - zB, xR + 0.1, Hh / 2, (zB + win.z0) / 2);
  wallPiece(0.2, Hh, zF - win.z1, xR + 0.1, Hh / 2, (zF + win.z1) / 2);
  wallPiece(0.2, win.y0, win.z1 - win.z0, xR + 0.1, win.y0 / 2, (win.z0 + win.z1) / 2);
  wallPiece(0.2, Hh - win.y1, win.z1 - win.z0, xR + 0.1, (Hh + win.y1) / 2, (win.z0 + win.z1) / 2);
  // wainscot panels + rails + skirting
  const wains = (len, x, z, ry, skip = null) => {
    M.add(new THREE.BoxGeometry(len, 0.95, 0.025), mat4(x, 0.475, z, ry), panel);
    M.add(new THREE.BoxGeometry(len, 0.06, 0.05), mat4(x, 0.97, z, ry), trim);
    M.add(new THREE.BoxGeometry(len, 0.12, 0.04), mat4(x, 0.06, z, ry), trim);
    const n = Math.floor(len / 0.7);
    for (let i = 1; i < n; i++) { const o = -len / 2 + i * len / n; if (skip && skip(o)) continue; M.add(new THREE.BoxGeometry(0.05, 0.8, 0.035), mat4(x + Math.cos(ry) * o, 0.5, z - Math.sin(ry) * o, ry), trim); }
  };
  wains(W, 0, zF - 0.012, Math.PI, (o) => Math.abs(o - 1.8) < 0.6);
  wains(D, xL + 0.012, 0, Math.PI / 2);
  wains(win.z0 - zB, xR - 0.012, (zB + win.z0) / 2, -Math.PI / 2);
  wains(zF - win.z1, xR - 0.012, (zF + win.z1) / 2, -Math.PI / 2);
  wains(win.z1 - win.z0, xR - 0.012, (win.z0 + win.z1) / 2, -Math.PI / 2);
  // back wall wainscot either side of the chimney breast
  wains(2.0, -2.2, zB + 0.012, 0); wains(2.0, 2.2, zB + 0.012, 0);
  // crown moulding
  for (const [len, x, z, ry] of [[W, 0, zB + 0.04, 0], [W, 0, zF - 0.04, 0], [D, xL + 0.04, 0, Math.PI / 2], [D, xR - 0.04, 0, Math.PI / 2]]) M.add(new THREE.BoxGeometry(len, 0.1, 0.08), mat4(x, Hh - 0.05, z, ry), trim);

  /* door on the front wall */
  M.add(new THREE.BoxGeometry(0.98, 2.12, 0.05), mat4(1.8, 1.06, zF - 0.03), panel);
  for (const yy of [0.55, 1.55]) M.add(new THREE.BoxGeometry(0.7, 0.7, 0.03), mat4(1.8, yy, zF - 0.065), trim);
  M.add(new THREE.BoxGeometry(1.16, 0.1, 0.07), mat4(1.8, 2.16, zF - 0.04), trim);
  for (const xx of [1.25, 2.35]) M.add(new THREE.BoxGeometry(0.09, 2.2, 0.07), mat4(xx, 1.1, zF - 0.04), trim);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.9, roughness: 0.3 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), brass); knob.position.set(1.42, 1.0, zF - 0.09); S.add(knob);

  /* chimney breast, firebox and hearth */
  const bw = 2.2, bd = 0.6, bz = zB + bd / 2;             // breast width/depth
  const fw = 1.02, fh = 0.86, fd = 0.56, fy = 0.12;       // firebox opening
  const front = zB + bd;
  // breast blocks around the opening
  M.add(new THREE.BoxGeometry((bw - fw) / 2, Hh, bd), mat4(-(fw + (bw - fw) / 2) / 2, Hh / 2, bz), brick);
  M.add(new THREE.BoxGeometry((bw - fw) / 2, Hh, bd), mat4((fw + (bw - fw) / 2) / 2, Hh / 2, bz), brick);
  M.add(new THREE.BoxGeometry(fw, Hh - fy - fh, bd), mat4(0, fy + fh + (Hh - fy - fh) / 2, bz), brick);
  M.add(new THREE.BoxGeometry(fw, fy, bd), mat4(0, fy / 2, bz), brick);
  world.collideBox(0, Hh / 2, bz, bw, Hh, bd);
  // firebox interior (sooty brick): back, sides angled slightly, ceiling, floor
  const fz = front - fd;
  M.add(new THREE.BoxGeometry(fw - 0.1, fh, 0.05), mat4(0, fy + fh / 2, fz - 0.025 + 0.06), sooty);
  for (const s of [-1, 1]) M.add(new THREE.BoxGeometry(0.05, fh, fd), mat4(s * (fw / 2 - 0.05), fy + fh / 2, fz + fd / 2, s * 0.12), sooty);
  M.add(new THREE.BoxGeometry(fw, 0.05, fd), mat4(0, fy + fh - 0.02, fz + fd / 2), sooty);
  M.add(new THREE.BoxGeometry(fw, 0.02, fd), mat4(0, fy - 0.005, fz + fd / 2), sooty);
  // arch lintel: soldier course over the opening
  for (let i = 0; i < 9; i++) M.add(new THREE.BoxGeometry(fw / 9 - 0.008, 0.16, 0.1), mat4(-fw / 2 + (i + 0.5) * fw / 9, fy + fh + 0.08, front + 0.01), brick);
  // raised hearth slab
  const hs = new THREE.Mesh(new RoundedBoxGeometry(bw + 0.3, 0.1, 0.62, 2, 0.02), hearthStone);
  hs.position.set(0, 0.05, front + 0.29); hs.castShadow = hs.receiveShadow = true; S.add(hs);
  world.collideBox(0, 0.05, front + 0.29, bw + 0.3, 0.1, 0.62);
  // keep the viewer out of the fire
  world.collideBox(0, 0.6, front - 0.2, fw, 1.2, 0.4);
  // mantel shelf with corbels
  const mantelY = 1.34;
  const mantel = new THREE.Mesh(new RoundedBoxGeometry(bw + 0.34, 0.1, 0.32, 2, 0.015), trim);
  mantel.position.set(0, mantelY, front + 0.1); mantel.castShadow = mantel.receiveShadow = true; S.add(mantel);
  world.collideBox(0, mantelY, front + 0.1, bw + 0.34, 0.1, 0.32);
  for (const xx of [-bw / 2 + 0.12, bw / 2 - 0.12]) M.add(new THREE.BoxGeometry(0.12, 0.26, 0.2), mat4(xx, mantelY - 0.18, front + 0.07), trim);
  M.add(new THREE.BoxGeometry(bw + 0.1, 0.06, 0.06), mat4(0, mantelY - 0.08, front + 0.01), trim);

  M.build(S);

  /* the fire */
  const fireC = new THREE.Vector3(0, fy + 0.005, fz + fd * 0.5 + 0.02);
  const fire = hearthFire(world, fireC, { width: 0.82, depth: 0.38 });
  world.fire = { pos: fire.light.position.clone(), pop: (k) => fire.pop(k) };
  // warm light spilling onto the hearth and floor right in front of the opening
  // the light the room actually receives: a wide warm cone from the mouth of the firebox,
  // casting the long soft furniture shadows; it breathes with the flames
  const spill = new THREE.SpotLight(0xff9048, 22, 16, 1.25, 0.9, 1.35);
  spill.position.set(0, 0.5, fz + 0.14); spill.target.position.set(0, 0.6, front + 3);
  spill.castShadow = true; spill.shadow.mapSize.set(2048, 2048); spill.shadow.bias = -0.0006; spill.shadow.normalBias = 0.02; spill.shadow.radius = 5;
  spill.shadow.camera.near = 0.1; spill.shadow.camera.far = 14;
  S.add(spill, spill.target);
  const up = new THREE.PointLight(0xff8040, 2.2, 9, 1.3); up.position.set(0, 1.9, front + 0.9); S.add(up);
  world.onUpdate(() => { const k = fire.flicker(); spill.intensity = 22 * k; up.intensity = 2.2 * k; });

  /* log store beside the hearth: stacked rounds with cut ends */
  {
    const barkL = pbr('bark', [1, 0.5], { color: 0x8a7a68 }, 'bark_brown_02');
    const endM = new THREE.MeshStandardMaterial({ map: endGrain(), roughness: 0.85 });
    const R = rng(66);
    let row = 0;
    for (let y = 0.075; row < 5; row++, y += 0.13) {
      const n = 4 - Math.floor(row / 2);
      for (let i = 0; i < n; i++) {
        const r = 0.055 + R() * 0.02;
        const g = logGeometry(0.42 + R() * 0.06, r, i + row * 7);
        const m = new THREE.Mesh(g, [barkL, endM, endM]);
        m.position.set(1.42 + i * 0.13 + (row % 2) * 0.065, y, zB + 0.32);
        m.rotation.set(0, Math.PI / 2 + (R() - 0.5) * 0.1, (R() - 0.5) * 0.05);
        m.castShadow = m.receiveShadow = true; S.add(m);
      }
    }
    world.collideBox(1.62, 0.35, zB + 0.32, 0.6, 0.7, 0.5);
  }

  /* window: frame, mullions, rainy glass, night outside */
  const wx = xR - 0.02, wz = (win.z0 + win.z1) / 2, wy = (win.y0 + win.y1) / 2, ww = win.z1 - win.z0, wh = win.y1 - win.y0;
  {
    const F = new Merger();
    F.add(new THREE.BoxGeometry(0.16, 0.08, ww + 0.2), mat4(wx - 0.02, win.y0 - 0.02, wz), trim);     // sill
    F.add(new THREE.BoxGeometry(0.26, 0.04, ww + 0.3), mat4(wx - 0.08, win.y0 + 0.02, wz), trim);
    F.add(new THREE.BoxGeometry(0.1, 0.08, ww + 0.16), mat4(wx, win.y1 + 0.02, wz), trim);
    for (const zz of [win.z0 - 0.04, win.z1 + 0.04]) F.add(new THREE.BoxGeometry(0.1, wh + 0.12, 0.08), mat4(wx, wy, zz), trim);
    F.add(new THREE.BoxGeometry(0.06, wh, 0.045), mat4(wx + 0.05, wy, wz), trim);
    F.add(new THREE.BoxGeometry(0.06, 0.045, ww), mat4(wx + 0.05, wy + wh * 0.12, wz), trim);
    F.build(S);
    const glass = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: U.time },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fb(vec2 p){ return n(p) * 0.5 + n(p * 2.1) * 0.3 + n(p * 4.3) * 0.2; }
        // the night outside, seen through wet glass (slightly smeared)
        vec3 outside(vec2 uv, float t){
          float sky = smoothstep(0.3, 1.0, uv.y);
          vec3 c = mix(vec3(0.018, 0.022, 0.03), vec3(0.05, 0.06, 0.08), sky);
          float edge = 0.5 + fb(vec2(uv.x * 6.0, 2.0)) * 0.32 + fb(vec2(uv.x * 22.0, 5.0)) * 0.08;
          float trees = smoothstep(0.03, -0.03, uv.y - edge);
          c = mix(c, vec3(0.008, 0.01, 0.012), trees * 0.9);
          float streak = smoothstep(0.93, 1.0, n(vec2(uv.x * 160.0 + uv.y * 5.0, uv.y * 4.0 + t * 10.0)));
          return c + streak * 0.012;
        }
        // beads of water: each refracts a flipped, brighter bit of the scene; a few slide down
        vec4 drops(vec2 uv, float t, float sc){
          vec2 g = uv * vec2(26.0, 15.0) * sc;
          vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float r = h(id + sc);
          float run = step(0.9, r);
          float y = run > 0.5 ? fract(-t * (0.04 + r * 0.08) + r) * 2.4 - 1.2 : 0.0;
          vec2 c = vec2((h(id + 3.1) - 0.5) * 0.55, (h(id + 7.7) - 0.5) * 0.55 + y);
          vec2 d = (f - c) * vec2(1.0, 0.8);
          float rad = 0.08 + r * 0.12;
          float bead = smoothstep(rad, rad * 0.7, length(d)) * step(0.4, r);
          float trail = run * smoothstep(0.03, 0.0, abs(f.x - c.x)) * smoothstep(c.y, c.y + 0.7, f.y) * 0.5;
          return vec4(d / rad, bead, trail);
        }
        void main(){
          vec2 uv = vUv;
          float t = uTime;
          vec4 a = drops(uv, t, 1.0), b = drops(uv + 0.37, t * 0.8, 1.7);
          vec4 dd = a.z > b.z ? a : b;
          float m = max(dd.z, max(a.w, b.w));
          // refraction: inside a bead the view flips and shifts
          vec2 ruv = uv - dd.xy * 0.03 * dd.z;
          vec3 col = outside(ruv, t);
          col = mix(col, outside(uv * vec2(1.0, -0.6) + vec2(0.0, 0.9), t) * 1.15 + 0.003, dd.z * 0.4);
          col *= 1.0 - m * 0.15;
          // a warm glint of the fire on the lower-left of each bead, a cool rim on the upper-right
          float glint = smoothstep(0.5, 0.95, dot(-dd.xy, normalize(vec2(-0.6, -0.8)))) * dd.z;
          col += vec3(0.32, 0.17, 0.07) * glint * 0.5;
          col += vec3(0.04, 0.05, 0.06) * smoothstep(0.7, 1.0, length(dd.xy)) * dd.z;
          col += vec3(0.02, 0.02, 0.024) * max(a.w, b.w);
          gl_FragColor = vec4(col, 0.97);
        }`,
    });
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glass);
    gp.position.set(xR + 0.06, wy, wz); gp.rotation.y = -Math.PI / 2; S.add(gp);
    // cold moonlight through the panes onto the floor (mullions cast real shadows)
    const moonL = new THREE.SpotLight(0x8a9ec8, 9, 16, 0.42, 0.6, 1.4);
    moonL.position.set(xR + 4, 4.6, wz + 0.6); moonL.target.position.set(0.6, 0, wz - 0.2);
    moonL.castShadow = true; moonL.shadow.mapSize.set(1024, 1024); moonL.shadow.bias = -0.0005; moonL.shadow.radius = 4;
    S.add(moonL, moonL.target);
    // curtains: heavy linen drapes either side, gently stirring
    const cloth = pbr('plaster', [1, 3], { color: 0x6a3a2c, roughness: 0.95, side: THREE.DoubleSide }, 'fabric_pattern_07');
    hangSway(cloth, 0.008);
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.55, 2.45, 22, 16);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const t = (1.225 - y) / 2.45; p.setZ(i, Math.sin(x * 34) * 0.035 * (0.6 + t) + Math.sin(x * 9) * 0.02); uv.setY(i, 1 - t); }
      g.computeVertexNormals();
      const c = new THREE.Mesh(g, cloth);
      c.position.set(xR - 0.12, 2.55 - 1.225, s < 0 ? win.z0 - 0.3 : win.z1 + 0.3); c.rotation.y = -Math.PI / 2;
      c.castShadow = c.receiveShadow = true; S.add(c);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, ww + 1.4, 10), brass); rod.rotation.x = Math.PI / 2; rod.position.set(xR - 0.12, 2.6, wz); S.add(rod);
    placeModel(world, 'potted_plant_04', { x: xR - 0.13, y: win.y0 + 0.04, z: wz + 0.35, ry: 0.6, s: 1.2, tint: 0xb8b8a8, wind: [0.005, 0.2] });
  }

  /* rug */
  const rugM = pbr('plaster', [1, 1], { color: 0xa87862, roughness: 0.95 }, 'fabric_pattern_07');
  const rug = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.012, 1.8, 2, 0.005), rugM); rug.position.set(0, 0.006, -1.45); rug.receiveShadow = true; S.add(rug);

  /* furniture & props (Poly Haven scans, CC0); +Z is each model's front */
  const props = { tint: 0xb4aca0 };
  const chairs = [[-1.3, -1.55], [1.35, -1.6]];
  placeModel(world, 'ArmChair_01', { x: chairs[0][0], y: 0, z: chairs[0][1], ry: face(...chairs[0], 0, fireC.z), s: 1, ...props, collide: 'box' });
  placeModel(world, 'Rockingchair_01', { x: chairs[1][0], y: 0, z: chairs[1][1], ry: face(...chairs[1], 0, fireC.z), s: 1, ...props, collide: 'box' });
  placeModel(world, 'CoffeeTable_01', { x: 0, y: 0, z: -1.45, ry: 0, s: 0.72, ...props, collide: 'box' }).then((g) => {
    if (!g) return;
    const top = g.userData.size.y;
    placeModel(world, 'tea_set_01', { x: 0.05, y: top, z: -1.45, ry: 0.4, s: 0.55, tint: 0xc0b8b0 });
    candleFlame(world, new THREE.Vector3(-0.32, top + 0.13, -1.5), { light: true });
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.6 }));
    wax.position.set(-0.32, top + 0.06, -1.5); wax.castShadow = true; S.add(wax);
  });
  placeModel(world, 'ClassicNightstand_01', { x: -2.3, y: 0, z: -2.45, ry: face(-2.3, -2.45, -1.3, -1.55), s: 1, ...props, collide: 'box' }).then((g) => {
    if (!g) return;
    const top = g.userData.size.y;
    placeModel(world, 'vintage_oil_lamp', { x: -2.3, y: top, z: -2.45, ry: 0.3, s: 0.9, tint: 0xc8c0b0 });
    // the lamp's own warm glow, turned low
    const l = new THREE.PointLight(0xffb070, 1.3, 5, 2); l.position.set(-2.3, top + 0.42, -2.45); S.add(l);
    const gs = glowSprite(0xffb070, 0.5, 0.35); gs.position.copy(l.position); S.add(gs);
    world.onUpdate(() => { const t = U.time.value; l.intensity = 1.3 * (0.94 + Math.sin(t * 3.1) * 0.03 + Math.sin(t * 7.7) * 0.02); });
  });
  placeModel(world, 'wooden_bookshelf_worn', { x: xL + 0.32, y: 0, z: 0.9, ry: Math.PI / 2, s: 1, ...props, collide: 'box' });
  placeModel(world, 'vintage_grandfather_clock_01', { x: xL + 0.42, y: 0, z: 2.6, ry: Math.PI / 2, s: 1, ...props, collide: 'box' });
  world.sources.push({ type: 'tick', pos: new THREE.Vector3(xL + 0.5, 1.5, 2.6), ref: 1 });
  placeModel(world, 'Ottoman_01', { x: 2.3, y: 0, z: 0.9, ry: -0.5, s: 0.95, ...props, collide: 'box' });
  placeModel(world, 'book_encyclopedia_set_01', { x: 2.3, y: 0.42, z: 0.9, ry: 0.9, s: 0.8, tint: 0xb0a898 });

  /* mantel dressing */
  const mTop = mantelY + 0.05, mz = front + 0.12;
  placeModel(world, 'mantel_clock_01', { x: 0, y: mTop, z: mz, ry: 0, s: 1, tint: 0xb8b0a4 });
  placeModel(world, 'antique_ceramic_vase_01', { x: 0.86, y: mTop, z: mz, ry: 0.4, s: 0.75, tint: 0xb8b0a8 });
  placeModel(world, 'hanging_picture_frame_02', { x: 0, y: 1.72, z: front + 0.02, ry: 0, s: 1.1, tint: 0xa8a098 });
  for (const xx of [-0.62, -0.82]) {
    placeModel(world, 'wooden_candlestick', { x: xx, y: mTop, z: mz, ry: 0, s: xx < -0.7 ? 1 : 0.8, tint: 0xa89888 }).then((g) => {
      if (!g) return;
      const h = g.userData.size.y;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.6 }));
      wax.position.set(xx, mTop + h + 0.04, mz); S.add(wax);
      candleFlame(world, new THREE.Vector3(xx, mTop + h + 0.088, mz), { light: xx < -0.7 });
    });
  }

  /* dust drifting in the firelight */
  dustMotesWarm(world, new THREE.Vector3(0, 1.2, -2.2), 1.8);

  world.spawn = { pos: new THREE.Vector3(0.15, 0.2, 0.9), yaw: -0.03, pitch: -0.12 };
  world.surface = (x, z) => (z < front + 0.6 && Math.abs(x) < bw / 2 + 0.15 ? 'stone' : 'wood');
  world.ambience = { windowrain: 0.5 };
  world.streams = [{ url: SOUNDS.fire.url, gain: 1.0, pos: fire.light.position.clone(), ref: 2.2, rolloff: 0.7, fallback: null }];
  world.tweak = { exposure: 1.25, bloom: 0.75 };
  world.indoor = true;
}

/** slow dust motes, lit warm, near the fire */
function dustMotesWarm(world, c, r) {
  const n = 160, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), s = new Float32Array(n);
  const R = rng(4);
  for (let i = 0; i < n; i++) { p.set([c.x + (R() - 0.5) * r * 2.4, c.y + (R() - 0.5) * r * 1.2, c.z + (R() - 0.5) * r * 2.4], i * 3); s[i] = R(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uFire: { value: world.fire ? world.fire.pos : c } },
    vertexShader: `attribute float aS; uniform float uTime; uniform vec3 uFire; varying float vA;
      void main(){ vec3 q = position + vec3(sin(uTime*0.07 + aS*40.0)*0.25, sin(uTime*0.05 + aS*23.0)*0.18, cos(uTime*0.06 + aS*31.0)*0.25);
        vec4 mv = viewMatrix * vec4(q,1.0); float d = distance(q, uFire);
        vA = (0.25 + 0.75 * smoothstep(3.5, 0.6, d)) * (0.5 + 0.5*sin(uTime*0.8 + aS*60.0));
        gl_PointSize = (0.6 + aS * 0.9) * (2.0 / max(0.6, -mv.z)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.0, dot(c,c)) * vA * 0.22; gl_FragColor = vec4(vec3(1.0, 0.75, 0.5) * a, a); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; world.scene.add(pts);
}

export const SCENES = [
  { id: 'rainforest', name: '雨林', en: 'Rainforest', thumb: 'thumbs/rainforest.jpg', build: buildRainforest, tint: ['#56625a', '#2a3428', '#9ab088'] },
  { id: 'hearth', name: '壁炉', en: 'Fireplace', thumb: 'thumbs/hearth.jpg', build: buildHearth, tint: ['#120c08', '#3a2416', '#ff9a50'] },
];

export function buildScene(index, renderer) {
  const world = new World(renderer);
  SCENES[index].build(world, renderer);
  return world;
}
