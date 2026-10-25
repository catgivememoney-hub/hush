# The Hearth Room — Atmosphere Bible

Everything needed to rebuild the feeling of the **壁炉 Fireplace** room from the Hush project, in this engine or any other.
Every number below is the value actually used in the shipped scene (Three.js r160, verified on an RTX 5070 at 1440p).

- Live: https://catgivememoney-hub.github.io/hush/#s1
- Source: https://github.com/catgivememoney-hub/hush, room in `scenes.js` → `buildHearth()`, fire in `fire.js`
- Reference frames: `docs/hearth/*.jpg` (rendered on the target GPU)

---

## 0. How to hand this to the next model

Paste this, with this file and the four reference images attached:

> I'm building a game and want one room to feel **exactly** like the attached reference: a closed, wood-panelled room at night lit almost only by a wood fire. `HEARTH_ATMOSPHERE.md` is the full spec from a working build: layout in metres, every light with colour and intensity, materials, the procedural fire, camera feel, colour grade and sound mix. Match the **measured targets in §2** first (brightness and palette), then the **light hierarchy in §4**. Read **§11 (what broke it)** before writing the fire. My engine is: **[Three.js / Unity HDRP / Unreal 5 / Godot 4]**. Port the values using **§12**, and show me a render from the spawn point (§3) before adding anything new.

---

## 1. The feeling

**A small, warm, nearly-dark room where the fire is the only thing alive.** You stand a few metres back from a brick fireplace. Everything you can see is lit *by the fire*, so everything moves with it: shadows of the chair legs breathe across the rug, the brick inside the firebox glows orange, and the far corners fall away into near-black. Nothing is cold, nothing is bright except the flames, and nothing repeats.

The seven things that make it work, in order of importance:

1. **One light source, and it breathes.** The fire lights the whole room through a wide cone out of the firebox mouth. All other lights are tiny and low (candles, an oil lamp). Ambient is close to zero.
2. **Darkness is part of the composition.** Median screen brightness is only about 5% (see §2). Corners and the ceiling edges sit in shadow. Don't "fix" the dark.
3. **Moving shadows.** The fire light's position drifts a few centimetres and its intensity flickers, so furniture shadows sway. This is the single biggest "alive" cue.
4. **The fire is never a loop.** Flames, coal glow and embers are noise-driven every frame. Sound is a long real recording, crossfaded so the loop point never shows.
5. **Warm-only palette.** Deep reds, browns, amber, with yellow-white only at the flame core. No blue anywhere in the room.
6. **Real, worn materials.** Scanned worn floorboards, plaster, red brick, dark wood panelling, cast iron. Everything is matte to satin; only brass and the hearth stones catch a highlight.
7. **Soft eyes.** Gentle depth of field focused on what you look at, slight bloom on flames, film grain, vignette. It reads like a quiet camera, not a game.

---

## 2. Measured targets (match these first)

Measured from the reference frames (0–255 luma, sRGB):

| Frame | Median luma | 90th pct | 99th pct | Mean |
|---|---|---|---|---|
| `01-spawn-view.jpg` (standing, facing the fire) | **12** | 60 | 181 | 24 |
| `02-corner-view.jpg` (by the oil lamp, looking at the fire) | **9** | 49 | 112 | 18 |
| `03-fire-closeup.jpg` (crouched at the hearth) | 31 | 164 | 249 | 59 |

**Rule of thumb:** half the screen is darker than luma 12. Only the flames, candle tips and lamp go above ~180.

Dominant palette of the spawn view (share of pixels):

| Colour | Share | Where it lives |
|---|---|---|
| `#000000` / `#050101` / `#110102` | ~35% | corners, under furniture, ceiling edges |
| `#1f0303` / `#240a06` | ~23% | panelling, shadowed floor |
| `#3b0f09` | 13% | lit walls far from the fire |
| `#551d0e` | 15% | rug, brick, near walls |
| `#9c4c21` | 9% | hearth, firelit floor, chair edges |
| flame core | <2% | `#fac251` → `#d05f1f` (from the close-up) |

---

## 3. Space and layout

Units: metres. Y up. The fire wall is at −Z; the viewer spawns facing it.

```
            BACK WALL (z = -4.0)   — brick chimney breast 2.2 w × 0.6 d, full height
   ┌───────────────[▓▓▓ FIREBOX ▓▓▓]──────[logs]──┐
   │ nightstand+lamp     hearth slab               │
   │ (-2.3,-2.45)                                  │
   │       armchair    ▭ rug 2.6×1.8 ▭   rocker    │   room 6.4 W × 8.0 D × 3.1 H
   │      (-1.3,-1.55)   coffee table  (1.35,-1.6) │
 L │                        (0,-1.45)              │ R   (R wall: framed picture at z 0.3)
   │ bookshelf (xL+0.32, 0.9)            ottoman   │
   │                       ● SPAWN (0.15, 0.9)     │       (2.3, 0.9) + books
   │ grandfather clock (xL+0.42, 2.6)              │
   └─────────────────────────────────[door x=1.8]──┘
            FRONT WALL (z = +4.0)
```

**Room shell**
- 6.4 × 8.0 m floor, 3.1 m ceiling. Four solid walls (closed room, no window).
- Ceiling beams 0.22 × 0.18 m every 1.6 m across the width.
- Wainscot: 0.95 m dark panelling with a top rail (0.06), skirting (0.12) and vertical stiles about every 0.7 m. Crown moulding 0.1 m.
- Panelled door on the front wall at x = 1.8, with a brass knob.

**Fireplace**
- Chimney breast: 2.2 m wide, 0.6 m deep, floor to ceiling, red brick.
- Firebox opening: **1.02 w × 0.86 h, 0.56 deep, sill at 0.12 m**. The interior is darker sooty brick, with the side walls angled 0.12 rad.
- A soldier-course brick lintel (9 bricks) over the opening.
- Raised hearth slab: stone, 2.5 × 0.62 m, 0.1 m tall.
- Mantel shelf at **1.34 m**, 2.54 m long, 0.32 deep, on two corbels.
- Log store: about 18 rounds stacked 5 rows high, right of the breast.

**Spawn:** standing at (0.15, 0, 0.9), yaw ≈ 0 (facing the fire), pitch −0.12 rad (slightly down). The fire sits about 4.6 m ahead and slightly below eye level. **This framing is the reference shot.**

**Furniture**
- Two chairs face the fire, angled in. The coffee table sits between them on the rug.
- Mantel, left to right: two candlesticks (lit), the mantel clock in the centre, a vase. A picture hangs above at 1.72 m.

Models are Poly Haven scans, all CC0:

| Prop | Poly Haven ID | Scale | Notes |
|---|---|---|---|
| Armchair | `ArmChair_01` | 1.0 | turned to face the fire |
| Rocking chair | `Rockingchair_01` | 1.0 | turned to face the fire |
| Coffee table | `CoffeeTable_01` | 0.72 | candle + `tea_set_01` (0.55) on top |
| Nightstand | `ClassicNightstand_01` | 1.0 | `vintage_oil_lamp` (0.9) on top |
| Bookshelf | `wooden_bookshelf_worn` | 1.0 | left wall |
| Grandfather clock | `vintage_grandfather_clock_01` | 1.0 | left wall, ticks (§9) |
| Ottoman | `Ottoman_01` | 0.95 | + `book_encyclopedia_set_01` (0.8) |
| Mantel clock | `mantel_clock_01` | 1.0 | centre of the mantel |
| Vase | `antique_ceramic_vase_01` | 0.75 | right end of the mantel |
| Picture over mantel | `hanging_picture_frame_02` | 1.1 | |
| Picture on right wall | `hanging_picture_frame_03` | 1.0 | where the window used to be |
| Candlesticks | `wooden_candlestick` | 1.0 / 0.8 | wax candles on top |

All props are tinted `#b4aca0` (about 70% albedo) so they never look brighter than the room.

---

## 4. Light — the heart of it

There are **two real light contributors** (the fire's room cone and the fire's interior light) plus small accents. The intensities are Three.js physical units with the decay values listed; port them as **ratios** (§12).

| # | Light | Type | Colour | Intensity | Range / decay | Position → target | Shadows |
|---|---|---|---|---|---|---|---|
| 1 | **Room spill** (the main light) | Spot, cone 1.25 rad, penumbra 0.9 | `#ff9048` | **22 × flicker** | 16 m / 1.35 | inside the firebox mouth (0, 0.5, z = back of box + 0.14) → (0, 0.6, 3 m into the room) | **yes**, 2048², radius 5, bias −0.0006 |
| 2 | Fire interior | Point | `#ff8f45` | 2.4 × flicker | 10 m / 1.6 | 0.3 m above the logs; **drifts ±5 cm** (§10) | yes, 1024², radius 6 |
| 3 | Coal-bed fill | Point | `#ff6a28` | 0.8 × flicker₂ | 4 m / 2 | low, at the front of the fire | no |
| 4 | Up-light on the breast | Point | `#ff8040` | 2.2 × flicker | 9 m / 1.3 | (0, 1.9, 0.9 m in front of the breast) | no |
| 5 | Oil lamp | Point | `#ffb070` | 1.3 ± 3% slow wobble | 5 m / 2 | on the nightstand, +0.42 m | no |
| 6 | Candles (2 of 3 lit) | Point | `#ffa058` | 0.5 × own flicker | 3.5 m / 2 | flame tip | no |
| 7 | Ambient | Hemisphere | sky `#34343e` / ground `#1c120a` | 0.66 | — | — | — |
| 8 | Reflections | Env map (PMREM) | dark warm room `#120c08` + a hot strip `#ff7a30`×3 low ahead | env intensity 0.25 | — | — | — |

**Rules that keep it right**
- **Ambient stays near black.** The hemisphere light only stops pure-black crush. If the room looks evenly lit, ambient is too high.
- **The room is lit through the firebox mouth.** Light #1 sits *inside* the opening, so the brick jambs and lintel cut its cone. That produces the soft-edged pool on the hearth and floor, and lets the walls fall off naturally.
- **Lights #1–#4 flicker together** off one shared function (§10). The lamp and candles flicker on their own, much more gently.
- **Firelit surfaces are orange, not white.** Even the hearth stones peak around `#d05f1f`.
- **Small glow sprites** (additive, soft): over the fire (1.1 m, opacity 0.16 × flicker), the lamp (0.5 m, 0.35), and each candle (0.22 m, 0.45).

**Fog:** exponential, colour `#0a0806`, density 0.012. The background is `#050403`. This barely tints the far wall and adds depth without haze.

---

## 5. The fire (all procedural, zero video)

Source: `fire.js` → `hearthFire()`. The fire bed is 0.82 × 0.38 m, centred in the firebox.

**Flames.** There are 10 camera-facing billboard "tongues": 8 tall ones across the bed (0.3–0.46 m wide, 0.36–0.82 m tall, tallest in the middle) and 2 low, wide licks along the coals. Each fragment:
1. Builds rising turbulence from two fBm noises (`y·2.2 − t·1.9` and finer `y·5 − t·3.3`).
2. Shapes a body that narrows with height. The body's centre line sways with the noise (`0.42·y`), so the tip tears into licks.
3. Computes heat = body × (1.2 − 1.1y), minus noise erosion that grows with height.
4. Converts heat to colour with a **fire ramp**: `#400400` → `#ff3805` → `#ff8c1f` → `#ffcc73` (white-yellow only at the very top of the ramp). The base gets a faint blue tint where combustion is clean.
5. Uses alpha = smoothstep(0, 0.85, heat), additive blending, intensity 1.35.

Each tongue's tip also leans sideways (`sin(t·2.3)` + `sin(t·5.1)`), plus a slow shared "draught" gust.

**Logs.** Four logs on the grate: two base logs, one crossing on top, one split piece. Each is a deformed cylinder (bark bumps) with end-grain caps. Their **ember material**:
- Bark blackens toward the heat centre into alligator-skin char, with white ash dusting on upward faces.
- Emissive *cracks* use ridged noise (`pow(1 − |2n − 1|, 9)`). They glow only where hot, and breathe slowly.

**Coals.** About 150 rounded lumps (1.2–3.4 cm). They are built from a **welded** icosahedron (subdivided 3×) with smooth sine displacement, in 3 shapes, placed without overlapping inside the grate. The material is near-black `#0b0a0a`, roughness 0.97, with **fine** glowing fissures (crack frequency 3.2×), a deep-red hue and a small breathing core glow.

**Ash bed.** A smooth mound (cubic falloff, 3 cm peak) with gentle low-frequency noise, under a speckled grey texture. It picks up only a faint ember glow.

**Grate (cast iron).** 8 square bars front-to-back, side rails, a back rail, and a **bowed 3-bar front basket** with 8 short uprights. It stands on 4 turned cast feet, with **two turned andirons** (collar plus ball finial) at the front. The material is a procedural cast-iron set: pitting, soot, rust in the cool areas, metalness 0.7, roughness about 0.6–0.9. Its **emissive goes dull red** where the iron sits in the coals.

**Embers.** 140 tiny points rise 0.8–2.2 m, and only about 28% are alive in any cycle. They are 1.1–2.4 px, twinkle, fade quadratically, and shift from yellow to red as they cool.

**Sparks (on a wood pop).** Short **line-segment streaks**: each has a head and a tail sampled 22 ms behind on the same path, so they read as motion blur.
- Launched mostly upward with air drag (k = 2.6–4.6) and a gentle updraught, with small flutter.
- Each lives 0.35–1.15 s.
- A small pop releases about 6–14% of 26 sparks; a big crack releases about 40–70%.
- Every pop also spikes the light briefly (+35%, decaying in about ⅙ s).

---

## 6. Materials

All from Poly Haven (CC0, 1k sets: diffuse, normal, roughness), over procedural fallbacks.

| Surface | Poly Haven texture | Tint | Roughness | Tiling |
|---|---|---|---|---|
| Floor | `wood_floor_worn` | `#b09a84` | 0.55 | 4 × 5 |
| Walls & ceiling | `painted_plaster_wall` | `#c8b8a0` | 1.0 | 2 × 1.2 |
| Wainscot panels | `dark_wooden_planks` | `#6a5240` | 0.5 | 3 × 0.6 |
| Trim, mantel, door details | `dark_wooden_planks` | `#3e2e22` | 0.45 | 1 × 1 |
| Ceiling beams | `wood_planks_dirt` | `#5a4434` | 0.7 | 0.5 × 3 |
| Chimney breast | `red_brick_03` | `#b29888` | 1.0 | 2.2 × 2.4 |
| Firebox interior | `red_brick_03` | `#3a2c26` (sooty) | 1.0 | 1.1 × 0.9 |
| Hearth slab | `stone_tiles_02` | `#6e6a66` | 0.9 | 1.5 × 0.6 |
| Rug | `fabric_pattern_07` | `#a87862` | 0.95 | 1 × 1 |
| Logs / log store | `bark_brown_02` | `#7a6a5a` / `#8a7a68` | — | — |
| Brass (door knob) | — | `#b08a4a` | 0.3, metal 0.9 | — |

**Principle:** albedos are pulled down (tints of 40–80%) so the fire can be the brightest thing. Satin surfaces (floor, panels, trim) pick up moving orange highlights from the flicker, which adds a lot of life.

---

## 7. Camera and body feel

| Setting | Value |
|---|---|
| Field of view | **72°** vertical, near plane 0.05 m |
| Eye height | **1.62 m** standing; crouch lowers it **0.55 m** (toggle on C) |
| Walk / fast walk | **2.5 / 4.8 m/s**; crouch halves the speed |
| Acceleration | exponential, rate 10/s (12/s to stop) — soft starts and stops |
| Look smoothing | exponential, rate 28/s (slightly weighted mouse) |
| Head bob | vertical 0.045 m at twice the step frequency, sideways 0.03 m; amplitude scales with speed up to 1.6× |
| Roll | 0.018 rad when strafing, 0.0025 per unit of look speed, 0.006 rad with each step |
| Breathing (always on) | vertical 0.006 m sine, about 5.7 s period |
| Landing | spring dip, stiffness 90, damping 12 |
| Physics | capsule radius 0.32; gravity 18 m/s²; jump 5.4 m/s; furniture has colliders |
| Footsteps | wood thump on the floor, stone on the hearth (§9) |
| Focus | auto: raycast from the crosshair, eased at 5/s (see §8) |

**Intro:** the camera glides in over 3.4 s from 1.4 m behind and 0.9 m above the spawn, fading up from black with blur clearing. On the landing screen, the camera drifts slowly around the spawn (±0.35 m, ±0.12 rad).

---

## 8. Image pipeline (post-processing)

Order: **render → depth of field → bloom → output (ACES) → FXAA → colour grade**.

- **Tone mapping:** ACES Filmic, renderer exposure **1.35**, grade exposure **1.25**. Output in sRGB. Soft PCF shadows. Pixel ratio min(device, 2).
- **Depth of field:** gather blur with 40 golden-angle taps. Circle of confusion = |z − focus| / z × aperture (0.32); near objects blur 1.15× faster, far 0.8×. Max blur 7 px at 1080p (scales with height). Bright samples are weighted ×1.35 for slight bokeh. Focus = crosshair raycast distance, eased.
- **Bloom:** Unreal-style, strength **0.41** (0.55 × 0.75), radius 0.65, threshold 0.82. Only flames, candles and the lamp should bloom.
- **Colour grade:**

| Parameter | Value | What it does |
|---|---|---|
| Saturation | 0.8 | slightly muted overall |
| Saturation variance | 0.65 | warm highlights keep their colour; dark shadows desaturate |
| Contrast | 1.07 | around mid-grey |
| Shadow tint | (−0.1, +0.05, +0.25) × 0.12 | very slight cool lift in the darks, which deepens them |
| Highlight tint | (+0.3, +0.12, −0.15) × 0.12 | warm highlights |
| Vignette | 0.38 | |
| Film grain | 0.03 | animated, strongest in the midtones |
| Chromatic aberration | 0.6 | edges only, radial |
| Halation | 0.18 | red glow around anything above 0.62 |
| Fade | 0.02 | barely lifted blacks |
| Dither | ±½ of an 8-bit step | prevents banding in the dark gradients (important here) |

- A CSS film-grain overlay (opacity 0.035) also sits over the page.

---

## 9. Sound

**The recording is the soundscape.** Everything synthesized is quiet seasoning on top.

| Layer | Source | Level | Notes |
|---|---|---|---|
| **Fire recording** | [Fireplace Fire — shaunhillyard](https://freesound.org/people/shaunhillyard/sounds/610766/) (CC0, 4:38, stereo 48 kHz) | **gain 2.7** | 3D at the fire; HRTF panner, inverse falloff, ref distance 3.5 m, rolloff 0.35 (so it fills the room) |
| Wood pops (synth) | filtered noise bursts | bus 0.28 | synced to the visual spark bursts |
| Grandfather clock | synth tick/tock | about 0.09 peak | 1 per second, alternating 2.5 kHz / 1.9 kHz, Q 9, 50 ms, 3D at the clock |
| Footsteps | synth | sfx bus | wood: 150 Hz thump + 300 Hz band (Q 6) + 1.8 kHz click; stone: 2.2 kHz band + 95 Hz thump |

Master chain: master gain 0.8 → compressor (threshold −18 dB, ratio 3) → output.

**Seamless loop (critical).**
- Two players alternate. **Nine seconds** before one ends, the other starts from 0, and they **equal-power crossfade** (sin/cos curves) over 8.5 s.
- Each visit starts at a **random offset**, so it never sounds the same twice.
- Stream the file; don't decode the whole thing up front.

**Pop synth recipe.**
- **Snap:** white noise → high-pass 900–2700 Hz → peaking EQ 2.5–5 kHz (Q 1.2). Attack 1.5 ms, decay 12–62 ms.
- **Heavy pop** (k > 0.6): add a sine sweep 180–300 Hz → 70 Hz over 60 ms.
- **Timing:** next event in 250 + rand × rand × 3800 ms, so pops are mostly close together with occasional long quiet stretches.
  - 12% chance: big pop plus a cluster of 1–4 small snaps, with a spark burst.
  - 43%: medium snap (30% of these also spark).
  - The rest: tiny ticks.

There is **no rain, wind or room-tone noise bed.** A hiss bed was tried and it buried the fire (see §11).

---

## 10. Everything that moves (all non-repeating)

**Fire flicker** (drives lights #1–#4, the glow sprite and flame brightness):
```
a    = 0.5·sin(7.3t + s) + 0.3·sin(12.9t + 2.1s) + 0.15·sin(23.1t + 3.7s)
slow = 0.5·sin(0.37t + s) + 0.5·sin(0.91t + 1.3s)
k    = 0.86 + 0.06·a + 0.07·slow   (+ 0.35·pop spike that decays at 6/s)
```
- The interior light (#2) wanders: x += 0.05·sin(1.7t) + 0.02·sin(4.3t); y += 0.03·sin(2.9t); z += 0.02·sin(1.1t).
- The fill (#3) uses a second flicker with a different seed.
- Candles run the same function at 1.6× speed with their own seeds.
- **Dust motes:** 160 tiny additive points drift slowly within about 1.8 m of the fire. They are brighter nearer the flame, fade in and out (0.8 rad/s), and stay barely visible (opacity about 0.22).
- **Coal / crack breathing:** fBm at 0.35 Hz across the surface.
- **Everything else is still.** Stillness makes the fire's motion read.

---

## 11. What broke the feeling (don't repeat these)

| Mistake | What it looked/sounded like | Fix |
|---|---|---|
| Fire point light too strong, or placed in front of the opening | Brick clipped to white; the hearth looked like a floodlight | Keep the strong light *inside* the firebox mouth and moderate (§4) |
| Narrow, spiky flame shapes | Looked like a gas stove or paper cut-outs | Fewer, wider, overlapping tongues; body narrows smoothly; noise erodes the tip |
| Coals made from an un-welded icosahedron with per-vertex random scale | Faces split into floating shards ("spiky dust") | Weld vertices first, then smooth sine displacement |
| Rough noisy ash mesh | Ridged, fake-looking floor | Smooth mound plus gentle low-frequency noise |
| Sparks as big round glowing dots thrown in an arc | Read as particles from a game | Thin short streaks with drag and updraft; few per small pop |
| Plain dark-grey metal grate | Looked like plastic | Pitted, sooty cast-iron texture plus dull-red heat glow where it touches coals |
| Hiss-based "rain at the window" bed | Static covering the fire recording | Removed. If ambience is added, use heavily low-passed **brown** noise, very quiet |
| Fire recording too quiet, falling off with distance | Fire felt far away | Gain 2.7, rolloff 0.35 |
| Bright ambient or bright env map | Flat, evenly lit "showroom" | Ambient 0.66 hemi, env 0.25, dark warm env map |
| Every shader compiling as a separate program | Freezes and tab crashes in big scenes | Cache shader programs by patch-parameter key |

---

## 12. Porting to another engine

Keep the **ratios**, not the raw numbers. Calibrate so the **spawn view matches §2** (median luma about 12, flames at 230–255, firelit hearth around `#9c4c21`–`#d05f1f`).

Relative light weights, taking the room spill as 1.0: fire interior ≈ 0.11, fill ≈ 0.04, breast up-light ≈ 0.10, oil lamp ≈ 0.06, each candle ≈ 0.02, ambient barely visible. The spill uses a ~70° half-angle cone with a very soft penumbra.

- **Unity (HDRP):**
  - Spill = Spot light (Physically Based), about 1600 K–1900 K warm colour, contact + soft shadows.
  - Flames = shader-graph billboards (additive) using the §5 recipe.
  - Embers/sparks = VFX Graph (sparks as stretched billboards by velocity).
  - Post: ACES, Bloom (threshold ~1.0), Physical DoF with auto-focus by raycast, Film Grain, Vignette, Chromatic Aberration, light Split Toning.
  - Audio: two AudioSources with scheduled crossfade.
- **Unreal 5:**
  - Spill = Spot Light with Lumen; fire interior = Point Light with **IES-free** flicker driven by a Material Parameter Collection.
  - Flames = Niagara sprite or a mesh with the noise material; sparks = Niagara ribbons or velocity-aligned sprites.
  - Post Process Volume: Filmic, Bloom, Cinematic DoF with a focus Blueprint, Grain, Vignette.
  - Audio: MetaSound with a crossfading looping player.
- **Godot 4:**
  - SpotLight3D / OmniLight3D with soft shadows; GPUParticles3D for embers and sparks.
  - Environment: ACES, glow, DoF via CameraAttributesPractical.
  - Audio: two AudioStreamPlayer3D nodes with a tween crossfade.
- **Three.js:** reuse this repo directly. `scenes.js buildHearth()` is the room; `fire.js` (fire, coals, grate, sparks); `audio.js` (streams, crossfade, crackle); `post.js` (DoF, grade); `player.js` (body feel); `models.js` / `textures.js` (Poly Haven loading).

---

## 13. Assets and licences

- **Sound:** "Fireplace Fire" by shaunhillyard, Freesound #610766. **CC0.**
- **Models and textures:** Poly Haven (polyhaven.com). **CC0.** IDs are listed in §3 and §6.
- **Everything else** (fire, coals, ash, grate textures, sparks, embers, dust, room geometry, sound synthesis) is procedural code in this repo.
