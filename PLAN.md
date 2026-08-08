# Slash — Implementation Plan

Plan for implementing the spec in `spec.md`.

**Where the build stands (2026-08):** a narrowed **runtime** that plays one
continuous vertical world — the camera dollies down through a world fixed in
space, with parallax layers and camera-following actors — driven by two input
axes the application owns end to end (vertical scroll, horizontal rotation).
The page never scrolls natively. The editor, AI generation, export pipeline,
and the state/event/audio/branching systems were built and then removed from
the current scope; they live in git history and in `spec.md` as vision.

Sections 1–4 describe what exists now, section 5 the compressed history of how
it got here, sections 6–7 the decisions and verification behind the current
build, and sections 8–9 the open work and remaining risks.

---

## 1. Foundations (decisions in force)

- **3D stack:** Three.js. "Vanilla JavaScript" means no UI framework; rendering
  is delegated to Three.js.
- **Architecture:** fully client-side. Content is JSON + asset files; no server.
- **Language:** plain JavaScript (ES modules) with JSDoc types. No TypeScript
  compile step; `tsc --checkJs` can type-check without changing the language.
- **Tooling:** Vite dev server and build; npm workspaces.
- **Data separation:** every part of a project is machine-readable JSON
  validated by `packages/schema`. This is the AI surface — an LLM that can read
  the schemas can generate or modify a project. It is why AI generation can be
  deferred without being designed out.
- **Dependency rule, one-way:** `runtime → schema`. The schema package never
  depends on Three.js.

## 2. Packages

```
packages/
  schema/    JSON Schemas + validator + migrations. No Three.js.
  runtime/   Loads a project, builds the world, renders, handles input.
```

`packages/editor` existed through M2–N4 and was removed with the S/W narrowing.

Scripts: `npm run dev:runtime`, `build`, `validate`, `test`, `lint`, `format`.

## 3. Content format

```
project/
  project.json      Manifest: title, render style, post-processing settings
  world.json        The world: length, camera, parallax layers, objects,
                    actors, lights, effects  (formatVersion: 3)
  assets/
    index.json      Asset registry: id, type, source file, tags
    models/…        glTF/GLB
```

The sample project is `sample-project/` ("The Moonlit Descent"): 4 parallax
layers, landmarks at known depths, two camera-following actors, a continuous
dusk→night atmosphere. It is the fixture for `npm run validate` and for every
manual drive.

Feel knobs live in the data: `travelPerUnit` (scroll) and
`rotation.degreesPerWidth` (swipe).

## 4. The model

Two scalars drive everything. The mapping is pure and unit-tested in
`runtime/src/world-map.js` (no Three.js):

```
travel = units * travelPerUnit           camera descent in metres
g      = clamp(units / length, 0, 1)     global progress for all tracks
camera = travelPoint(−travel) + offset   camera dolly (+ drift over g)
camera = orbit(camera, lookAt, yaw)      horizontal turn about the vertical axis
layerY = −(1 − parallax) * travel        per-layer parallax offset
rigY   = −travel                         traveler rig rides the camera
```

`layerY` is chosen so a layer's apparent rise-rate equals its `parallax`
(`1` = world-fixed, `→0` = rides the camera). `orbit` rotates about the vertical
axis through the (drifted) look-at point, so **axis independence is structural,
not a convention**: a rotation about a vertical axis cannot change a Y
coordinate, and `travel`, `layerY`, `rigY` and every `g`-keyed track never see
`yaw`.

### Input: the application owns both axes

`scroll.js` and `swipe.js` are input drivers; the page has no scroll range,
no scrollbar and no spacer. Off the finger, one integrator moves each axis:

```
position += (target - position) * (1 - exp(-dt / tau))
```

Exponential easing toward a fixed target _is_ exponential velocity decay, so
the same line smooths a discrete wheel click (short `tau`) and coasts a flick to
rest (long `tau`, target thrown `v * tau` ahead so the coast starts at exactly
the release velocity). Both axes settle with the same shape.

Impulses carry a **kind** (`wheel`, `page`, `key`, `flick`, `drag`). The same
kind accumulates onto the running target; a new kind rebases the target onto the
current position and takes over, so a wheel click during a coast cancels the
coast instead of inheriting its distant target. Under the finger nothing is
integrated — position tracks 1:1 after an 8 px deadband.

Inputs: touch, mouse/pen drag, wheel (cancelled, except ctrl+wheel which is left
to browser zoom), ↑/↓, PageUp/PageDown, space, Home/End; ← / → and trackpad
`deltaX` turn the view.

## 5. History — the five reworkings

Each series replaced part of the one before it. Summaries only; the code is the
detail, and the reversed designs are in git history.

| Series | What it did                                                                    | Fate                                   |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------- |
| **M**  | Foundation → runtime → editor → story systems → look → optimization → AI       | Editor/export/AI removed from scope    |
| **N**  | Native browser scroll; comic-panel camera viewpoints; per-boundary transitions | Superseded by W (world) and V (scroll) |
| **S**  | Stripped audio, branching, state, events, playback mode                        | In force                               |
| **W**  | One continuous vertical world replaces the scene slideshow                     | In force                               |
| **R**  | Horizontal swipe rotates the view around the content                           | In force                               |
| **V**  | The application owns scrolling; the page never scrolls                         | In force                               |

**M0–M6 — the original build.** Vite workspace + schema package + sample
fixture; a runtime playing scroll-driven scenes (loader, track sampler, camera
tracks, glTF clips, events); an editor (hierarchy/viewport/inspector/timeline,
File System Access API, transform gizmos, schema-driven event forms, embedded
preview, static-site export); story systems (state, branching, viewpoints,
playback mode, audio); look & feel (toon/realistic/low-poly styles,
post-processing, particle effects, light tracks); and optimization (export-time
pruning + SHA-256 dedupe + meshopt compression, lazy scene streaming, stats
HUD). AI generation (M6) reached the provider-interface and
`docs/ai-authoring.md` stage. DRACO and KTX2 were skipped — their encoders need
external wasm binaries. VAT baking was deferred for want of a skinned fixture.
Of this, what survives in the current build is the schema/validator/migration
spine, the viewer, tracks, effects, post-processing, render styles, the stats
and sync overlays, and `docs/ai-authoring.md`.

**N — native scroll and connected stages.** Replaced virtual damped scrolling
with the browser's own, replaced authored camera keyframes with held
"comic panel" viewpoints, and put transitions on the story-graph _edge_ rather
than the section (a section reached from two predecessors needs a different
transition each way). Implemented cut/crossfade/camera/continuity, including
carrying an actor across a seam. Both halves were later reversed: W removed
scenes and therefore seams, V removed native scroll.

**S — narrow to a pure scroll runtime.** Removed audio, branching, `gotoScene`,
and with them the state and event systems those existed to serve; also the
restart control, the progress bar and playback mode. Scenes became fully
passive. Effects that had waited on `setEffect` flipped to always-on — the one
behavioral change. The editor package went with this narrowing.

**W — the continuous vertical world.** The S-series played a slideshow of held
panels with instant cuts; it did not feel like scrolling. Replaced by one
continuous world: **the camera moves down and the world stays fixed** (real
perspective parallax for free, stable authoring coordinates), a single freeform
track (`world.json`, no scenes or stations), objects placed at absolute `worldY`
inside parallax layers, and persistent characters that ride the descending rig
so they stay framed while landmarks stream past. `story`/`scene` schemas and
`player.js`/`scene-player.js`/`transitions.js` were deleted.

**R — horizontal rotation.** Swipes turn the view around the content at its
current height. The **camera orbits**, not the world — consistent with W, so
objects keep true world coordinates and the rig needs no special handling. Free
drag with momentum, any resting angle, unbounded and persistent. Camera-following
actors stay world-oriented, so turning walks the viewer around the traveler
rather than pinning it to the screen.

**V — the application owns scrolling.** The escape hatch R's risk note had
named, taken deliberately. Native scrolling made the feel a per-platform
accident, made the two axes different kinds of thing (one the browser's, one
ours), and let engine heuristics claim a gesture mid-flight. Now one gesture
decomposition feeds two identical integrators. Cost accepted: momentum, end
clamping and keyboard paging are ours to maintain, and native-scroller
conventions (a scrollbar, and whatever assistive settings apply to native
scrollers) no longer come for free.

## 6. Decisions worth not re-litigating

- **A gesture is decomposed, never classified.** Horizontal and vertical
  movement may occur simultaneously; the same gesture scrolls and turns in the
  same frame. What stays separate is what each component controls — `yaw`
  reaches only `cameraPose`, and only through `orbit`.
- **The horizontal axis is always live.** A scroll in progress never suspends
  turning, under the finger or coasting. A fresh single-finger `touchstart`
  always takes over the gesture, so a dropped `touchend` cannot silently kill
  turning for the session. The 8 px wobble deadband is per gesture and per axis,
  so it never accumulates into a block.
- **Touching stops the inertia** — contact sets `target = position` before the
  drag has moved a pixel. Same rule the browser used to apply; now ours.
- **The ends are walls, not brakes.** No rubber-band, no spring-back, no
  deceleration into a boundary. This requires clamping the **position**, not the
  target: a clamped target shortens a throw aimed past an end, so the ease
  decelerates into the boundary instead of hitting it (~4 s to settle where it
  should take ~0.35 s). With the target unclamped, arrival collapses the target
  onto the clamped position, which both ends the motion and keeps a reversal
  instant. Tests must distinguish _arriving_ from _easing in_ — both end at the
  same number — by asserting the position is exactly at the boundary within
  0.5 s.
- **Touch is read from touch events, not pointer events.** Pointer events are
  the fragile reader (a browser that claims a gesture fires `pointercancel`);
  touch events keep being dispatched regardless. Mouse and pen stay on pointer
  events. The two drivers own disjoint `overscroll-behavior` longhands so
  neither strands the other's value on dispose.
- **`#app` is `100vh`, not `100svh`/`100lvh`.** `svh` leaves blank space on iOS
  when the toolbar is up; the runtime does its own debounced resize handling
  (`viewer.js`) for toolbar changes instead. Safari fires several intermediate
  resizes during a toolbar collapse, hence the debounce.
- **Position is viewport-relative**, so a device rotation preserves the story
  position exactly — where a `scrollTop` no longer meant the same thing.
- **Schema churn is managed by `formatVersion` + migrations** (`migrate.js`),
  kept in lockstep with the sample project so fixtures do not rot.

## 7. Verification

`npm test` (64), `npm run validate`, `npm run lint`, `npm run build` all green.
25 of the tests are the scroll driver: drag mapping and deadband, wheel
smoothing and unit conversion, clamping, resize invariance, the flick coast
decelerating to a stop, the stale-release rule, contact killing a coast,
kind-takeover, keys, the document left unscrollable and restored on dispose, and
two that run both drivers on one harness to assert a diagonal gesture moves both
axes while pure gestures move only their own.

Browser-verified (Chromium desktop and Pixel 7 emulation, `?sync` overlay):
a 500 px wheel moves the story exactly `deltaY / innerHeight`; a drag is exactly
1:1 less the 8 px deadband; a flick's coast is measurable and the stale-release
rule suppresses it; a finger landing mid-coast freezes it on contact; a throw at
a boundary is at the end on the first frame with no bank and reverses instantly;
`End`/`Home` land exactly on the ends; one diagonal flick moves both axes while
`scrollY` stays 0 with no spacer and no scroll range; per-layer HUD offsets match
`−(1−parallax)·travel` exactly.

**Not verifiable here: how it feels.** Software rendering gives ~224 ms frames
on desktop and ~382 ms on the emulated phone, so smoothness and the choice of
time constants cannot be judged in this environment — only that the values are
correct and `dt`-driven.

**Harness notes.** `Input.dispatchTouchEvent` round-trips at ~1.1 s per event in
this container, so hand-stepped CDP gestures cannot express velocity (the
R-series mistook this for CDP producing no fling — it was never dispatched), and
`Input.synthesizeScrollGesture` delivers no moves. What works: dispatch the
gesture from inside the page in a single task with a busy-wait between events,
then read the progress payload after yielding to a rendered frame, or isolate a
component by differencing two gestures.

## 8. Open work

**Runtime**

- **Feel tuning on real hardware.** The constants are a considered first cut.
  Most likely to want adjustment: `TAU.flick` (0.55 s) and `FLICK_MAX`, which
  together set how far a hard throw travels.
- **Accessibility of a non-native scroller.** No scrollbar and no native scroll
  range, so scroll-to-position and some switch/pointer aids no longer apply. The
  keyboard axis is the mitigation so far; `prefers-reduced-motion` shortening
  the coast is the obvious next step, unbuilt.
- **A scroll-position indicator.** Nothing shows how far through the story the
  viewer is (`?sync` is a debug readout, not that).
- **Origin rebasing** for very long worlds (camera coordinates grow); fine at
  sample scale.
- **Lazy streaming by depth** — the whole world loads up front.

**Authoring (was M2/N4; removed with the narrowing)**

- The editor itself: framing a viewpoint, placing objects into layers,
  scrubbing progress, previewing, exporting.
- **Rotation-aware composition tooling** — nothing warns an author that a stage
  is a flat frontage that turning reveals as empty.

**Deferred from M5/M6**

- **VAT baking** — no rigged/skinned fixture asset exists yet, so baking could
  not be exercised end to end; plain glTF clip playback covers current needs.
  Revisit when a skinned character lands.
- **DRACO / KTX2 compression** — encoders require external wasm binaries.
- **AI generation** — provider-agnostic `generate(kind, params)` in the editor
  (image-to-3D, story generation), keys stored locally. The schemas and
  `docs/ai-authoring.md` are the prep work, already done.

**Vision, not scheduled** (in `spec.md`, removed from the build): horizontal
character-viewpoint switching — which would now collide with rotation and needs
a different gesture or a mode — branching, state, events, audio, playback mode.

## 9. Risks

- **Scroll feel is the product**, and it is now entirely our arithmetic — every
  platform difference is a bug rather than a browser behavior. Needs a session
  on real hardware.
- **`touchmove` during our own gesture handling** no longer depends on engine
  scroll heuristics (V removed that dependency), but touch behavior remains the
  most engine-sensitive surface in the codebase; re-verify on any engine where
  turning or scrolling stalls.
- **Migration churn.** `formatVersion` is at 3 after two model rewrites; keep
  the sample project and migrations in lockstep.
- **Dual-cost rendering is gone** with scenes, but a long world still loads up
  front — the cost moves to first load rather than the seams.
