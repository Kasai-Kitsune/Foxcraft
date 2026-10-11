# Worklog — Foxcraft (Minecraft Alpha clone with a fox protagonist)

Project: Early-alpha-style voxel sandbox ("Foxcraft") rendered with Three.js on Next.js 16.
All assets (block textures, fox skin, sounds, UI art) are procedurally generated at runtime.

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Project setup for Foxcraft — voxel game, all assets procedural, heavy alpha fog, fox player.

Work Log:
- Inspected scaffold: Next.js 16 + Tailwind 4 + shadcn present, dev server already running on :3000.
- Installed `three@0.186.1` and `@types/three@0.186.0`.
- Decided architecture (single cohesive engine built by main agent — tightly coupled game code is
  risky to parallelize across subagents):
  - `src/game/rng.ts` — seeded hashing/value noise (terrain, caves, ores, clouds)
  - `src/game/textures.ts` — 16x16 gritty pixel-art painters, atlas, cracks, fox skins, iso icons
  - `src/game/blocks.ts` — block registry (tiles, hardness, sounds)
  - `src/game/world.ts` — chunk store, worldgen (hills/lakes/caves/ores/trees), meshing w/ baked skylight
  - `src/game/player.ts` — AABB physics, swim, third/first-person camera, DDA raycast
  - `src/game/fox.ts` — box-model fox + walk/swim/mine animations + first-person paw
  - `src/game/particles.ts` — block-break particle pool (CPU-billboarded)
  - `src/game/audio.ts` — procedural WebAudio dig/place/break/step SFX
  - `src/game/game.ts` — orchestrator: loop, input, chunk streaming, fog modes, mining/placing, states
  - UI in `src/components/game/*`: title (dirt background, splash), loading bar, HUD (crosshair,
    hotbar, F3 debug), pause menu, touch controls. No footer (fullscreen game).
- No DB needed (authentic alpha: worlds are not saved).

Stage Summary:
- Deps ready; plan recorded; engine authoring starts next.

---
Task ID: 2-9 (engine), 3 (UI), 4 (QA), 5 (browser verification)
Agent: main (Z.ai Code)
Task: Build, integrate, and verify Foxcraft — full voxel game engine + UI.

Work Log:
- Wrote engine modules: rng.ts (seeded value noise/fbm), textures.ts (all 16x16 gritty
  painters, atlas, cracks, seamless clouds, fox skin set, iso block icons), blocks.ts,
  world.ts (chunk store, terrain/lakes/caves/ores/trees gen, meshing with baked skylight
  + directional face shading, DDA raycast), player.ts (AABB physics, swim, FP/TP camera),
  fox.ts (box-model fox + walk/swim/leap/mine animations + FP paw), particles.ts (pooled
  CPU-billboarded break particles), audio.ts (procedural WebAudio SFX), game.ts (loop,
  input, chunk streaming with time budget, fog modes sky/cave/water, mining/placing,
  states, HUD events).
- UI: TitleScreen (dirt bg, splash text, seed + fog picker), LoadingScreen (progress bar),
  Hud (crosshair, 9-slot hotbar with generated iso icons, item flash, F3 debug), PauseMenu,
  TouchControls (joystick/look/mine/place/jump), FoxGame shell; MC-style pixel CSS in
  globals.css; VT323 font via CSS import; page.tsx dynamic ssr:false.
- Fixes found during verification: missing imports (hash2p, getAtlas/getWaterCanvas),
  World seed type (string->strSeed), literal-type fields, React compiler lint rules
  (refs during render, prop mutation -> Game.setTouch* methods, setState-in-effect).
- Terrain tuning: retuned surfaceHeight (contrast-stretched fbm, base 30.2) -> ~14% water,
  real hills, beaches, mountains.
- Verified with agent-browser + VLM screenshot analysis: title flow, world gen, mining
  (block removed + particles), placing (incl. player-overlap rejection), movement+collision,
  pointer lock, pause/resume, fog cycling, swimming + underwater fog, camera modes (fox
  visible in TP, paw in FP), mobile viewport (title + hotbar fit), console error-free,
  tsc + eslint clean.

Stage Summary:
- Foxcraft Alpha 0.1.0 fully playable at "/" — all assets procedural, heavy alpha fog,
  fox protagonist, no external art/audio files. Dev server on :3000, no runtime errors.
