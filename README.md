# 静 Hush — rain & fire

Two walkable, first-person ambient scenes built with Three.js, made to run in the background:

- **雨林 Rainforest** — a creek trail under a dripping canopy in a heavy tropical shower.
- **壁炉 Fireplace** — a quiet room with a wood fire, rain running down the window.

Click a scene to enter. **WASD** walk · **Shift** faster · **mouse** look · **H** hide the interface · **Esc** menu (graphics, sound, scene).
Add `?lite` to the URL for lighter foliage on smaller GPUs.

## How it stays small

- **The fire is procedural.** Flames, glowing log cracks, coals, embers and the flickering light are computed from noise every frame, so they never visibly loop and cost no video files.
- **Sounds stream from Freesound's CDN** and are crossfaded with an equal-power fade a few seconds before each pass ends, so there is no audible seam. Random wood pops are synthesized on top and spark the fire visually in sync.
- **Models and textures load at runtime from Poly Haven.**

## Credits (all CC0)

- Sound: [Amazon Jungle Afternoon Shower](https://freesound.org/people/trundlefly/sounds/349328/) by trundlefly
- Sound: [Fireplace Fire](https://freesound.org/people/shaunhillyard/sounds/610766/) by shaunhillyard
- Scanned models & textures: [Poly Haven](https://polyhaven.com)
- Engine: based on the scene engine from [umbra](https://github.com/catgivememoney001-ui/umbra)
