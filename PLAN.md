# Slash — Implementation Plan

Plan for implementing the spec in `spec.md`. Decisions confirmed with the project owner:

- **3D stack:** Three.js. "Vanilla JavaScript" means no UI framework (no React/Vue); rendering is delegated to Three.js.
- **Architecture:** Fully client-side. Editor and runtime are static web apps; projects live as JSON + asset files on the user's disk (File System Access API) and export as a self-contained bundle.
- **AI features:** Designed for from day one (structured, machine-readable JSON everywhere), but actual generation APIs (image-to-3D, story generation) are wired in a later milestone. External model import ships first.
- **First milestone:** Vertical slice — scroll-driven runtime + minimal editor + export.

Additional decisions made in this plan:

- **Language:** Plain JavaScript (ES modules) with JSDoc type annotations. No TypeScript compile step; `tsc --checkJs` can be run for type checking without changing the language.
- **Tooling:** Vite for dev server and builds. One workspace, three packages.

---

## 1. Architecture

Three strictly separated parts, matching the spec's Data Separation principle:

```
packages/
  schema/    Content data format: JSON Schemas + validation + shared constants.
             No dependency on Three.js, the editor, or the runtime.
  runtime/   Loads content data, renders, plays, handles input.
             Depends on: schema, Three.js. Never on editor.
  editor/    Authoring UI. Produces content data; embeds the runtime for preview.
             Depends on: schema, runtime (for preview only), Three.js.
```

The dependency rule is one-way: `editor → runtime → schema`. The runtime must build and run with the editor package deleted.

### Content data format

A **project** is a directory:

```
project/
  project.json        Manifest: title, entry story, settings, render style
  story.json          Story graph: scenes, ordering, branches, viewpoints
  scenes/<id>.json    Per-scene: stage refs, actors, camera track, tracks, events
  assets/
    index.json        Asset registry: id, type, source file, modular slots, tags
    models/…          glTF/GLB (+ VRM for characters later)
    audio/…
    textures/…
  state.json          State schema: flags, items, counters, initial values
```

All IDs are stable strings. Every file is JSON validated by `packages/schema`. This is the AI surface: an LLM that can read the schemas can generate or modify any part of a project.

### Story Progress model (the core abstraction)

One scalar drives everything, independent of input method:

- Each scene has a **progress axis** `t ∈ [0, 1]`.
- **Tracks** map progress to values: camera track, transform tracks, animation-weight tracks, effect tracks, audio tracks. Tracks are keyframe lists `{t, value, easing}`.
- **Events** have triggers (`progress >= x`, tap, swipe, state condition) and actions (play animation, move camera, set state, change scene, play sound). Both are data — a registry maps action `type` strings to implementations.
- **Input drivers** produce progress deltas: scroll driver, swipe driver (horizontal → viewpoint switch), tap driver, and an auto-play driver (progress advances by time). Interactive Mode and Playback Mode differ only in which driver is active — the Story Progress system is shared, exactly as the spec requires.
- **Story graph**: vertical progression = ordered scene list per branch; horizontal switching = viewpoint variants of the same span. Branch selection is an event action that sets the next scene.

---

## 2. Milestones

### M0 — Foundation (small)

- Vite workspace, three packages, lint/format, `npm run dev` for editor and a standalone runtime demo page.
- `packages/schema`: initial JSON Schemas for project/story/scene/asset-index/state + a validator (`ajv` or hand-rolled to stay dependency-light) + doc comments so schemas are self-describing for AI.
- A hand-written sample project (one stage, one character, two scenes) used as the fixture for everything that follows.

**Done when:** sample project validates; empty Three.js canvas renders in both apps.

### M1 — Runtime vertical slice

The runtime plays the hand-written sample end to end.

- Content loader: fetch project → validate → resolve asset refs → load glTF (GLTFLoader, with DRACO/meshopt decoders wired but optional).
- Scene graph assembly: stage + actors placed from scene JSON.
- Story Progress core: progress state, track sampler (keyframes + easing), scene transitions.
- Scroll input driver (desktop wheel + mobile touch, with inertia/damping) mapped to progress.
- Camera track playback (position/look-at/FOV keyframes).
- Transform tracks and glTF animation-clip playback (idle loops + progress-scrubbed actions via `AnimationMixer`).
- Event system v1: progress triggers + tap trigger; actions: play animation, set state (in-memory), change scene, log.
- Mobile-safe defaults: capped pixel ratio, `visibilitychange` pause, resize handling.

**Done when:** on desktop and a phone browser, scrolling moves the story through both sample scenes with camera direction, an animated character, and a tap-triggered event.

### M2 — Editor vertical slice

Author the same kind of content without hand-editing JSON.

- Shell: vanilla JS UI (panels: hierarchy, viewport, inspector, timeline strip along the progress axis). No framework; small component helpers + CSS.
- Project open/save via File System Access API; drag-and-drop fallback + zip download for browsers without it (Safari).
- Asset import: drop glTF/GLB → registered in `assets/index.json`, thumbnails, listed in an asset panel. (This panel is where AI generation plugs in later.)
- Scene authoring: place stage/props/characters, transform gizmos (`TransformControls`), inspector editing of transforms and materials' basic props.
- Camera authoring: fly the viewport camera, "set keyframe at current progress" workflow; progress scrubber to preview tracks.
- Event authoring: form-based trigger/action editor driven by the schema (schema-driven forms keep editor and data format in lockstep).
- Preview: embed the actual runtime in an iframe/panel fed the in-memory project — interactive scroll, plus a mobile-viewport toggle.
- Export: write a runtime bundle (content JSON + assets + runtime JS/HTML) as a directory or zip that runs on any static host.

**Done when:** a new user can import a model, build a two-scene scrollable story, preview it, and export a working static site without touching JSON.

### M3 — Story systems

- State system: schema-defined flags/items/counters, persistence (localStorage in runtime), state-condition triggers, state-dependent scene variations.
- Branching: story graph editor (list/graph view), choice UI primitive (selectable characters/objects → branch), different outcomes.
- Horizontal viewpoints: swipe driver + viewpoint variants of a scene span; editor UI to author per-viewpoint tracks.
- Playback Mode: auto-play driver, per-scene pacing curves, play/pause UI.
- Audio: BGM per scene with crossfade, SFX as event action, ambient loops; Web Audio, unlocked on first gesture.
- Game-like features from spec: revisiting scenes, hidden elements (state-gated visibility), story loops.

### M4 — Look & feel

- Rendering styles: default "realistic toon" (custom `MeshToonMaterial`-derived or `onBeforeCompile` ramp shading + outline pass), plus realistic/low-poly presets; style is a project-level setting per spec.
- Post-processing chain: bloom, vignette, color grading (LUT), fog — configured in project.json, toggleable per scene.
- Effects system: particle system (GPU points-based) with presets (rain, snow, sparks, fog volumes), authored as tracks/events.
- Lighting authoring: light objects in scenes, light-parameter tracks (time-of-day style transitions).

### M5 — Performance & optimization

- Export-time pipeline (runs in the browser as part of Export): duplicate asset removal, Draco/meshopt compression, KTX2 texture compression, audio compression.
- Loading: manifest-driven preload of first scene, lazy load of later scenes/assets, streaming order derived from the story graph, loading progress UI.
- VAT baking: bake skeletal/morph animation to vertex animation textures for crowd/background actors; runtime VAT material. Authoring data keeps bones/morphs (editable); VAT is a runtime artifact only, honoring the spec's authoring/runtime split and mesh constraints (no vertex count/topology changes).
- Budgets & instrumentation: frame-time HUD in preview, per-scene triangle/texture budgets surfaced in the editor.

**Status (implemented):** export pipeline ships reachable-asset pruning, SHA-256 content dedupe, and meshopt compression (gltf-transform `dedup/prune/reorder/quantize` + `EXT_meshopt_compression`; encoder wasm is embedded so it runs fully client-side). DRACO and KTX2/basis are out for now — their encoders require external wasm binaries. Audio ships as-authored. Loading: scenes build lazily ahead of the scroll frontier (the M3 frontier margin doubles as streaming order), with a boot overlay and an in-flow "Loading…" indicator when scroll outruns a scene build. Stats readout (fps/triangles/draw calls) in the preview HUD and demo (`?stats`); triangle budget surfaced in the editor's scene inspector.

**Deferred: VAT baking.** There is no rigged/skinned fixture asset in the repo yet, so baking code could not be exercised end to end; per the risk note above, plain glTF clip playback covers current needs. Revisit when a skinned character asset lands (bake to float position textures at export, VAT material in runtime).

### M6 — AI integration

- Everything before this is prep: schemas are documented and validated, projects are plain JSON, the asset panel has an import pipeline.
- Provider-agnostic generation interface in the editor: `generate(kind, params) → asset/JSON` with pluggable providers (image-to-3D: Meshy/Tripo/etc.; story & scene generation: Claude API). API keys stored locally by the user.
- Story/scene generation: prompt → validated story/scene JSON (schema-constrained generation), inserted as a draft the author refines.
- Image-to-3D: image drop → provider call → glTF import through the existing pipeline.
- A `docs/ai-authoring.md` that documents the schemas for LLM consumption (also usable as a system prompt / CLAUDE.md for agentic authoring).

---

## 3. Key risks

- **Scroll input feel** is the product. Prototype the scroll→progress mapping (damping, snap points, iOS momentum quirks) in M1 week one; everything else layers on top of it.
- **File System Access API** is Chromium-only; Safari/Firefox authors get the zip fallback. Acceptable for a developer-oriented editor, but verify early.
- **VAT baking in-browser** (M5) is the most technically uncertain piece; if it stalls, plain glTF animation with instancing covers most stories.
- **Schema churn**: the content format will change through M1–M3. Add a `formatVersion` field and simple migration functions from the start so sample projects don't rot.

## 4. Suggested first steps

1. M0 scaffold + schema package + sample project fixture.
2. M1 scroll driver + track sampler prototype against the fixture (the riskiest, most product-defining code).
3. Grow the runtime until the fixture plays fully, then start the editor shell.

---

# N-series — Native scroll & connected stages

The content specification was updated after M6. Four changes to the model:

- **Native scrolling.** The runtime uses the browser's native scroll instead of hijacking wheel/touch into a virtual, damped `units` value (`packages/runtime/src/scroll.js`). Browser momentum provides the feel.
- **Vertically connected stages.** The story is a vertically stacked sequence the viewer descends through. Some stages are independent; others transition seamlessly, with objects or characters continuing from one stage into the next so a boundary can feel like one continuous environment.
- **Comic-panel viewpoints.** Each section only needs to work from one intended camera viewpoint — a fully realized 3D stage framed like a comic panel — rather than authored camera keyframe tracks that must hold up from every angle.
- **Restrained character motion.** Characters move _through_ the connected environments; animation is subtle, idle-led, not free per-actor choreography.

Preserved from M1–M6: the story graph, dynamic path, event/state/effects/audio systems, **horizontal-swipe viewpoint switching, and branching**. Native vertical scroll is the primary navigation; horizontal viewpoints and branches remain.

Decisions confirmed with the project owner:

- **Structure:** vertically stacked stages — some independent, some seamless (carried objects/characters cross the seam).
- **Transitions:** author-selectable **per boundary** (hard cut, cross-fade, camera movement, object continuity, extensible).
- **Viewpoints & branching:** retained; vertical scroll is primary but not exclusive.

Decisions made in this plan:

- **Transitions live on the edge, not the section.** A section reached from multiple predecessors (branching, `gotoScene`) can have a different transition each way, and object continuity needs both sides of the seam. Placing the transition on the source→target edge is the only representation that covers both.
- **`continuity` does not enforce world-space welding.** Carried objects move in a shared offset space; the author aligns the seam visually via an `offset`. This matches the existing spec's "physical consistency is not required" and keeps each stage authorable in its own coordinate space.
- **Editor exposes transitions on the story-graph edge UI**, not the section inspector, mirroring where they live in data.

## N.1 The per-boundary transition (core new abstraction)

Story edges today are the string `next` and each `branches[].next` (`packages/schema/schemas/story.schema.json`). Bumped to `formatVersion: 2`, an optional `transition` attaches to each edge:

```jsonc
// a story-graph entry
"next": "shrine",                                  // still valid → default (cut)
"transition": { "type": "crossfade", "span": 0.5 },// applies to the `next` edge
"branches": [
  { "when": {…}, "next": "cave", "transition": { "type": "cut" } }
]
```

Transition `type` is the author-selectable dial:

- **`cut`** — hard boundary, instant swap (today's behavior; the migration default).
- **`crossfade`** — both stages rendered across the band, opacity blended.
- **`camera`** — camera eases from section N's viewpoint to N+1's; stages may overlap in world space.
- **`continuity`** — named actors/props carry across, both stages coexist at authored vertical offsets so the object visibly crosses: `{ "type": "continuity", "carry": ["hero"], "offset": [0, -8, 0] }`.

`span` is how many scroll units the transition occupies, straddling the seam. Types map to implementations via a registry, mirroring the event-action dispatch in `packages/runtime/src/player.js` — new styles are drop-in.

## N.2 Runtime changes

1. **Native scroll DOM** (`viewer.js`, `demo.js`, rewritten `scroll.js`): canvas mounts `position: sticky` behind a tall spacer of height `totalUnits × viewportHeight`; `units = scrollY / viewportHeight`; the virtual damping/flick machinery is removed. The path still grows by appending spacer height below the frontier (`player.js` — the `FRONTIER_MARGIN` logic), so appends never move `scrollY`. `gotoScene` reroutes and story loops/revisits become explicit `scrollTo` calls rather than continuous height.

2. **Transition controller** (new, in `player.js`): a **band** around each seam where two path entries are live at once. Inside a band it keeps both `group`s in the scene, drives each section's camera viewpoint, and blends per the edge transition (opacity for `crossfade`, camera lerp for `camera`, offset positioning + carried-actor handoff for `continuity`). Outside a band it stays single-section and cheap, as today.

3. **Camera-as-panel** (`scene.schema.json`, `scene-player.js` camera block): `camera.viewpoint { position, target, fov }` replaces required `tracks`; optional `drift` for restrained in-section movement. The old `camera.tracks` shape is kept behind `formatVersion` for migration.

4. **Continuity actors**: a carried actor is instantiated once and reparented across the seam instead of duplicated — the "character moves through" case. The trickiest piece; scoped to its own milestone.

5. **Touch reconciliation**: native vertical scroll now consumes vertical touch, so the horizontal-swipe viewpoint detector (`switchViewpoint` in `player.js`) re-scopes to clearly-horizontal gestures; keyboard arrows already cover desktop.

## N.3 Milestones

### N0 — Native scroll spike (riskiest; do first)

Sticky canvas + spacer + `scrollY → units`, driving the _existing_ camera tracks unchanged. Prove the feel on desktop and iOS Safari before anything else layers on top.

**Done when:** the sample project plays end to end on native scroll on desktop and a phone, with no virtual-scroll code path.

### N1 — Camera-as-panel

Schema v2 `viewpoint` + migration from `camera.tracks`; hold-viewpoint runtime; port the sample project. Seams remain hard `cut`.

**Done when:** every sample section is authored as a single viewpoint and plays correctly; old-format scenes still load via migration.

### N2 — Transition controller + registry

Per-edge `transition` schema; `cut` / `crossfade` / `camera` implemented; dual-section band rendering.

**Done when:** an author can set a boundary's transition type in JSON and see cut, cross-fade, and camera-move seams in the sample.

### N3 — Continuity

`continuity` transition type, carried actors, vertical offset stacking, restrained-motion defaults documented in `docs/ai-authoring.md`.

**Done when:** a character walks from one stage into the next across a seam in the sample project.

### N4 — Editor

"Frame this panel" camera capture (replaces the keyframe workflow in `viewport.js` / `timeline.js` / `track-edit.js`), per-boundary transition picker in the story-graph UI, native-scroll preview (`preview-panel.js`).

**Done when:** a new user can frame each section, pick per-boundary transitions, and preview the real native-scroll feel without touching JSON.

### N5 — Reconcile & polish

Horizontal-swipe touch re-scoping, branching/loop scroll handling (`scrollTo` on reroute), export path verification, and updating `spec.md` + `docs/ai-authoring.md` to describe native scroll and comic-panel viewpoints.

## N.4 Key risks

- **Native scroll feel on iOS** is the product, again. Rubber-banding at the document ends, momentum, and dynamic spacer growth during branching all need to be verified on-device in N0 before the rest is built.
- **Dual-section rendering cost.** Transition bands render two stages at once; budget for the seam (the heaviest frames) and keep bands short. Continuity keeps both stages live longest.
- **Branching vs. a real document height.** Only appending height below the frontier keeps `scrollY` stable; reroutes and loops must be explicit `scrollTo`. Loops can otherwise imply unbounded document height.
- **Migration churn.** Camera (`viewpoint` vs `tracks`) and story edges (`transition`) both move to `formatVersion: 2`; keep the sample project and migrations in lockstep so fixtures don't rot.

---

# S-series — Narrow to a pure scroll runtime

The specification was simplified again (2026-08). Four features are removed
outright, taking their supporting systems with them:

- **No audio or music.** The audio system, scene `audio` blocks, the
  `playSound` event action, and audio assets all go.
- **No branching paths.** The story is a single linear chain of sections
  (`next` only). Conditional `next`, `branches`, and `gotoScene` are removed
  — and with them the **state** and **event** systems they existed to serve
  (confirmed with the owner: strip state + events entirely). Scenes become
  passive: scroll-driven tracks, camera viewpoint, idle/clip animation,
  lights and effects, nothing discrete.
- **No return-to-beginning.** The HUD restart control and the player's
  `reset()` are removed. The path only ever moves forward.
- **No progress bar.** Removed from the HUD.

Confirmed with the project owner:

- **Swipe to switch characters** (horizontal viewpoint switching) stays in
  the spec as an _allowed input_, but remains **unbuilt** — matching the
  current runtime. No runtime work now; it is a future milestone (swipe
  driver + viewpoint variants + dual render) if revisited.
- **State + events are stripped**, not just branch edges. Scenes are fully
  passive; tap does nothing.
- **Playback Mode (auto-play)** is removed too — the experience is manual
  scroll only.

Kept: native scroll + lazy streaming, camera viewpoint (+drift), actor
transform tracks, glTF idle/action clips, lights (with tracks), effects (now
always-on — no `setEffect` toggle), render styles + post-processing, and the
`?stats` / `?sync` debug overlays.

## What the runtime becomes

One scalar still drives everything: `units` (viewport-heights of scroll) →
per-section progress `t ∈ [0,1]` → camera, actor tracks, lights, effects.
The story is a deterministic linear chain resolved by `next`; the path still
appends lazily ahead of the scroll frontier to drive streaming/loading UX.

## Changes by area

### Content format — `packages/schema`

- `schemas/story.schema.json`: drop `branches` and per-edge `transition`;
  `next` is a plain linear link. Remove `$defs/condition` and
  `$defs/transition`.
- `schemas/scene.schema.json`: delete the `audio` block, the entire `events`
  block (all triggers + actions), and `visibleWhen` on actors. Remove
  `$defs/condition`. Effects lose the "toggled by events" note (always-on).
- `schemas/state.schema.json`: **deleted.**
- `schemas/asset-index.schema.json`: drop the `audio` asset `type`/`kind`
  and the audio `source` extensions (gltf only).
- `src/index.js`: remove the `state` schema registration.
- `src/validator.js`: drop `state` from `validateProject` and every
  cross-reference for branches, state keys, `gotoScene`, `setState`, audio
  refs, `visibleWhen`, and events.
- `src/migrate.js`: keep the camera track→viewpoint migration; update the
  doc comments (no more transitions/audio/events in the v2 shape).
- `scripts/validate-sample.js`: stop loading `state.json`.

### Runtime — `packages/runtime/src`

- **Delete** `audio.js`, `state.js`, `conditions.js`.
- `player.js`: remove the state store, audio system, `runEvent` + all event
  actions, tap raycasting, `resolveNextEdge` (→ resolve `next` directly),
  `jumpToScene`/`gotoScene`, auto-play, and `reset()`. Return API shrinks to
  `{ viewer, onProgress, dispose }`.
- `scene-player.js`: remove events, `handleTap`, `visibleWhen`, the
  `getState` dep, and `evalCondition`. Effects run always-on.
- `scroll.js`: remove `advance()` (auto-play's hook).
- `hud.js`: remove the progress bar, the ▶ play/pause button, and the ↺
  restart button. HUD = scene label + scroll hint + loading indicator, plus
  the optional `stats`/`sync` overlays.
- `loader.js`: stop fetching/returning `state.json`.
- `index.js`: drop the `evalCondition`/`resolveNext` exports.

### Sample project — `sample-project/`

- `state.json` deleted; `story.json` made linear (`meadow → shrine →
blessing`); scenes strip `audio`, `events`, `visibleWhen`; the
  `blessing-sparks` effect flips to always-on (it waited on `setEffect`);
  audio assets removed from `assets/index.json`; `assets/audio/*.wav` and
  `scripts/gen-audio.js` deleted.

### Docs / tests

- `spec.md`: delete Audio System; rewrite Story Branching → horizontal
  viewpoints only; remove State/Event systems and the loop/revisit parts of
  Game-like; drop audio from Playback/Story-Progress; update the scope
  banner.
- `README.md`, `docs/ai-authoring.md`: drop audio, branches, `gotoScene`,
  events/state, `playSound`; describe the linear scroll model.
- `packages/runtime/test/conditions.test.js` deleted; schema
  `validator.test.js` drops state/events/setState cases.

## S-series milestones (repo stays green at each step)

- **S1 — Data layer.** Schema + validator + migrations + sample project +
  schema tests. Gate: `npm run validate` passes on the linear, event-free
  sample.
- **S2 — Runtime core.** Delete audio/state/conditions; simplify
  player/scene-player/scroll/loader/index. Gate: `npm run test` +
  `npm run dev:runtime` scroll-through.
- **S3 — HUD.** Strip progress bar / restart / auto-play; verify minimal HUD
  and `?stats` / `?sync`.
- **S4 — Docs.** `spec.md`, `README.md`, `docs/ai-authoring.md`.
- **Verify.** `validate`, `test`, `lint`, `build`, and a manual scroll-through.

## S-series notes / risks

- **Fully static path.** With branching/goto/state gone the path is
  deterministic; lazy streaming is kept for the loading indicator rather than
  precomputing — smaller diff, same behavior.
- **Effects toggle loss** is the one behavioral change — any effect that was
  `enabled: false` waiting on `setEffect` must flip on (see the sample audit).

---

# W-series — Continuous vertical world (2026-08)

The scroll model was rethought (confirmed with the owner). The S-series played
a **slideshow of held camera panels**, one scene at a time with instant cuts —
it did not feel like scrolling. It is replaced by **one continuous vertical
world**: scrolling down dollies the camera through a world fixed in space, so
environments stream past with **parallax** while characters **persist in frame**
the whole scroll — an attraction where the stage moves and the characters travel
through it.

Confirmed decisions:

- **Move the camera down** (world fixed), not the world up. Rationale in
  `spec.md`: real perspective parallax for free + stable authoring coordinates.
  Persistent actors ride a rig that descends with the camera.
- **Single freeform track**: one `world.json` (no scenes/stations). Objects are
  placed at absolute `worldY` inside parallax layers.
- Persistent characters **travel through the world** (`follow: "camera"`),
  staying framed while landmarks stream past.

## The model

One scalar still drives everything: `units` (viewport-heights). Derived in the
pure module `runtime/src/world-map.js` (unit-tested, no Three.js):

```
travel = units * travelPerUnit          camera descent in metres
g      = clamp(units / length, 0, 1)    global progress for all tracks
camera = travelPoint(−travel) + offset  camera dolly (+ drift over g)
layerY = −(1 − parallax) * travel        per-layer parallax offset
rigY   = −travel                          traveler rig rides the camera
```

`layerY` is chosen so a layer's apparent rise-rate equals its `parallax`
(`1` = full/world-fixed, `→0` = rides the camera).

## Changes by area

- **schema**: new `schemas/world.schema.json` (`formatVersion: 3`); removed
  `story`/`scene` schemas. `index.js` registers `world`, `FORMAT_VERSION = 3`,
  `migrateWorld` stub. `validateProject({project, world, assetIndex})` rewritten
  (layer/object/actor/light/effect cross-refs).
- **runtime**: new `world-map.js` + `world-player.js` (layers, traveler rig,
  objects at `worldY`, camera-follow actors, continuous fog/lights/effects).
  `loader.js` loads `world.json`; `index.js`/`demo.js` use `createWorldPlayer`.
  Removed `player.js`, `scene-player.js`, `transitions.js`. HUD `?sync` overlay
  now reports `units`, `g`, `travel`, `camera.y`, and per-layer offsets.
- **sample** (`sample-project/world.json`, "The Moonlit Descent"): 4 parallax
  layers, landmarks at known depths (tree/forest/cliff/shrine/valley), two
  camera-following actors (traveler + companion), continuous dusk→night
  atmosphere. Added `ridge`/`hill`/`moon`/`pillar` primitives.
- **tests**: `world-map.test.js` (mapping formulas) + rewritten
  `validator.test.js`; `validate-sample.js` validates `world.json`.

## Verified

`npm test` (19), `npm run validate`, `npm run lint`, `npm run build` all green;
browser drive of the full descent confirmed continuous travel, per-layer
parallax divergence (HUD offsets match `−(1−parallax)·travel` exactly), the
traveler framed throughout while landmarks stream past, and `units`/`travel`
reaching the ends exactly (14/14, travel 84 m).

## Deferred

- **Origin rebasing** for very long worlds (camera coords grow); fine at sample
  scale.
- **Lazy streaming by depth** — the whole world loads up front (small sample).

---

# R-series — Horizontal rotation (2026-08)

The specification gained a second input axis: **horizontal swipes rotate the
content left or right around a circular path, centred on the content, at its
current vertical height**. Vertical scrolling keeps controlling vertical
movement exactly as before, and swipes must not affect vertical position.

Confirmed decisions:

- **Orbit the camera**, not the world — consistent with the W-series
  "move the camera, world fixed" decision. Objects keep true world coordinates,
  parallax layers and the rig need no special handling, and the result is
  visually identical to spinning the world.
- **Free drag + momentum**: the drag tracks the finger 1:1 and a flick coasts to
  a stop. Any resting angle; no stepping or snapping.
- **Camera-following actors stay world-oriented** — turning walks the viewer
  around the traveler and shows a different side, rather than pinning it to the
  screen. (Falls out for free: the rig does not rotate.)
- **Free 360°, persistent** — unbounded in both directions, and the angle stays
  where the viewer left it while scrolling continues.

## The model

A second scalar joins `units`, and enters the mapping in exactly one place:

```
yaw    = accumulated swipe rotation (radians, unbounded)
camera = orbit(cameraPos, lookAtPoint, yaw)     // horizontal circle, Y untouched
```

`orbit` rotates about the vertical axis through the camera's (drifted) look-at
point, so the pivot never moves, the radius is preserved, and the height is
returned unchanged. **Axis independence is structural, not a convention**: a
rotation about a vertical axis cannot change a Y coordinate, and `travel`,
`layerOffset`, `rigOffset` and every `g`-keyed track never see `yaw`.

## Changes by area

- **runtime**: new `swipe.js` input driver (pointer drag with axis locking,
  flick inertia, trackpad `deltaX`, ← / → keys) alongside `scroll.js`;
  `world-map.js` gains `orbit()` and a `yaw` argument on `cameraPose()`;
  `world-player.js` feeds `swipe.update(dt)` into the pose and reports `yaw` on
  the progress payload; HUD `?sync` overlay shows `yaw` (folded to ±180° plus a
  turn count) and the hint reads "Scroll ↓ · Swipe ↔ to turn".
- **schema**: optional `rotation.degreesPerWidth` on `world.json` (default 180)
  — the swipe-feel knob, mirroring `travelPerUnit` for scroll. No format bump:
  the field is additive and every existing world stays valid.
- **docs**: `spec.md` gains _Horizontal Rotation_ under the Stage System and
  rewrites _Horizontal Switching_ (the swipe axis now drives rotation; character
  viewpoint switching stays vision, unbuilt); `README.md` and
  `docs/ai-authoring.md` describe the second axis and the authoring implication
  (compose front-on, but surround the path — a half-turn must not reveal an
  empty side).

## Independent, not exclusive

Confirmed with the owner after the first cut: **axis separation is not
required — horizontal and vertical movement may occur simultaneously.** A
gesture is therefore never _classified_ as a scroll or a turn; it is
**decomposed**. Its vertical component scrolls natively while its horizontal
component turns the view, in the same gesture and the same frame. What stays
separate is what each component controls: `yaw` reaches only `cameraPose`, and
only through `orbit`, so the horizontal component still cannot move the world
vertically.

Making that work while keeping **native** vertical scroll is the whole design
constraint, and it drives one non-obvious choice:

- **Touch is read from touch events, not pointer events.** When the browser
  claims a gesture for native scrolling it fires `pointercancel` and no further
  pointer events arrive — so a pointer-based driver can only ever see gestures
  the browser declined to scroll. `touchmove`, by contrast, keeps being
  dispatched throughout a native scroll (this is exactly why passive listeners
  exist). Reading fingers from touch events gives the sideways travel while the
  browser keeps the vertical travel. Mouse and pen stay on pointer events, which
  the browser never claims.
- **Wheel events are never cancelled.** `preventDefault()` on a wheel event
  cancels the whole event, vertical component included, so the old
  `|deltaX| > |deltaY|` gate is gone. Horizontal deltas rotate; the same event
  keeps scrolling the page. Back-navigation on horizontal overscroll is
  neutralised with `overscroll-behavior-x: none` (set and restored by the
  driver) instead.
- **The remaining gates are noise gates, not axis gates.** A drag ignores its
  first 8 px of horizontal travel (hand wobble in a vertical scroll should not
  slowly spin the world), and wheels ignore 1 px per event of trackpad jitter.
  Neither looks at the vertical component.

**The horizontal axis is always live** (confirmed as a requirement by the
owner): a scroll in progress never suspends turning — under the finger or
coasting on inertia after the finger has lifted, and whichever direction the
gesture began in.

Confirmed with the owner on the one thing that cannot be had for free there:
every browser cancels its own scroll momentum the instant a finger touches
down, so a swipe landing mid-coast turns the view but ends the leftover
vertical motion. **The owner's call is to let the touch stop the coast** —
native behaviour everywhere, and the same contact is how a viewer stops a
coasting descent. Carrying the coast through the gesture would mean measuring
scroll velocity and hand-rolling the remaining momentum while the finger is
down; rejected as not worth the loss of tap-to-stop and the risk of visibly
fighting the browser.

Two things protect the always-live requirement beyond the touch-event choice
above:

- A fresh single-finger `touchstart` always takes over the gesture. A dropped
  `touchend` would otherwise leave the driver holding a gesture that has ended
  and silently kill turning for the rest of the session — the one way this
  requirement could fail without any visible error.
- The wobble deadband is measured per gesture and per axis, so it never
  accumulates into a block: it costs a fixed 8 px of sideways travel once.

The asymmetry runs the other way, and it is browser-imposed rather than ours:
with `touch-action: pan-y` the browser decides at the _start_ of a touch whether
that gesture may **scroll**. A gesture that begins horizontally will not scroll
even if it later turns vertical (the finger must be lifted first). Removing that
would mean taking over vertical scrolling by hand and losing native momentum —
the project's stated #1 product risk — so it is deliberately not done.

The whole approach rests on one engine behaviour: **`touchmove` keeps being
dispatched while the browser scrolls natively.** Verified on Chromium. An engine
that withheld those events during a scroll would freeze the horizontal axis
exactly while scrolling, and the only fix would be taking scrolling over
entirely (`touch-action: none` + hand-rolled momentum). Worth re-checking first
on any engine where turning appears to stall mid-scroll.

## Verified

`npm test` (36, incl. 13 gesture tests and 4 new mapping tests),
`npm run validate`, `npm run lint`, `npm run build` all green.

Desktop drive (Chromium, `?sync`): a rightward drag turned the view −58.4° with
`camera.y` and all four layer offsets **unchanged to the digit**; scrolling on
from there moved `camera.y` −21.6 → −39.6 with `yaw` held; a leftward drag
carried the view through the front and out to +60°; ← / → turned the view and
stopped dead on release.

Touch drive (Pixel 7 emulation, real `Input.dispatchTouchEvent` gestures) —
simultaneity confirmed on the platform that matters:

| gesture          | scrollY  | camera.y  | yaw        |
| ---------------- | -------- | --------- | ---------- |
| start            | 2517     | −15.6     | 0°         |
| diagonal swipe   | **2764** | **−17.4** | **−57.7°** |
| vertical swipe   | 3069     | −19.6     | −57.7°     |
| horizontal swipe | 3069     | −19.6     | −185.2°    |

One diagonal swipe moved both axes at once with native scrolling intact; the
pure gestures each moved only their own axis.

Always-live horizontal axis, same emulation, real touch gestures:

| path                                             | result                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| finger goes down, scrolls, _then_ moves sideways | yaw 0° → −83.9°, scroll ran on 2702 → 2762         |
| swipe during a browser-driven vertical animation | yaw −101.4° → −202.7° while scroll ran 1678 → 5034 |
| second finger mid-gesture, then the first lifts  | no stuck state                                     |
| plain horizontal drag after 10 mixed gestures    | Δyaw −101.4°                                       |

**Not verifiable in this environment: real touch inertia.** Touches dispatched
through CDP (`Input.dispatchTouchEvent`) leave no fling — a flick that moves the
page 400 px stops dead on lift, `scrollY` unchanged over the following 500 ms.
So any claim about a swipe landing _during a coast_ is untested here; the row
above substitutes a browser-driven smooth scroll, which is genuine vertical
motion in progress with no finger down, and turning works throughout it. What
can be said structurally is that the swipe driver never reads scroll state, so
there is nothing for a coasting page to gate. Confirming the real fling needs a
physical device.

## Deferred

- **Rotation-aware composition tooling** — nothing warns an author that a stage
  is a flat frontage that turning reveals as empty. An editor concern (N4/M2
  territory), not a runtime one.
- **Character-viewpoint switching** on the swipe axis (W/S-series deferral)
  would now collide with rotation; it needs a different gesture or a mode.
