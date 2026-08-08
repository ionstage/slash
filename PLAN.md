# Slash — Implementation Plan

Plan for implementing the spec in `spec.md`.

**Where the build stands (2026-08):** a narrowed **runtime** that plays one
continuous vertical world — the camera dollies down through a world fixed in
space, with parallax layers and camera-following actors — driven by two input
axes that are deliberately _not_ symmetrical. The vertical axis is the
browser's own scrolling, which the runtime only reads; the horizontal axis is
the runtime's, and it turns the view, settling onto angles the author
configured. The editor, AI generation, export pipeline, and the
state/event/audio/branching systems were built and then removed from the
current scope; they live in git history and in `spec.md` as vision.

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

Feel knobs live in the data: `travelPerUnit` (how far the camera descends per
viewport-height — the one scroll knob left, now that the browser owns the rest),
`rotation.degreesPerWidth` (how far a full-width drag turns) and
`rotation.steps` (the angles the view comes to rest on; the sample uses the
irregular `[0, 40, 180, 300]` precisely so irregular spacing is exercised by
default rather than only in tests).

## 4. The model

Two scalars drive everything. The mapping is pure and unit-tested in
`runtime/src/world-map.js` (no Three.js):

```
units  = scrollTop / viewportHeight      read off the browser's own scrolling
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

### Input: one axis delegated, one owned

**Vertical (`scroll.js`) — the browser's.** A spacer `(length + 1)` viewport-
heights tall gives the document its scroll range; the canvas host is pinned
`position: fixed` in front of it; `units` is read back as
`scrollTop / viewportHeight`. The driver registers **no input listeners at
all** — momentum, the rubber-band at the ends, keyboard paging, the scrollbar
and stopping a coast on contact are the platform's. The spacer is re-measured
each frame against the story length and the live viewport height, because a
mobile toolbar collapsing mid-scroll genuinely changes the latter.

**Horizontal (`swipe.js`) — ours,** because there is nothing native to delegate
rotation to. Under the finger, `yaw` tracks 1:1 after an 8 px deadband. Off the
finger, one integrator settles it:

```
landing = yaw + omega * COAST_TAU        where a free coast would have stopped
target  = nearest configured step to landing
yaw    += (target - yaw) * (1 - exp(-dt / COAST_TAU))
```

Exponential easing toward a fixed target _is_ exponential velocity decay, so
with `target` at the unsnapped landing point this is exactly a free coast;
snapping only moves where that same curve terminates. **A flick and a settle are
therefore one mechanism, not a coast plus a correction** — a hard throw passes
several steps, a gentle release falls back to the one it came from, and with no
steps configured the landing point is used unsnapped and rotation is free.

The step search runs modulo a full turn but returns an **absolute** angle, so
settling never unwinds accumulated turns (at 725° with a step at 0°, the view
lands on 720°). Steps are absolute angles and may be **irregularly spaced**;
`[0, 40, 180, 300]` is as valid as four even quarters, and "nearest" is by
angular distance, so an off-front step can win from further away than an even
spacing would allow.

Inputs: the vertical axis takes whatever the browser takes. Rotation takes
touch/mouse/pen drag, trackpad `deltaX` (settled after a pause, since a wheel
gesture has no release event) and ← / →, which move one step at a time when
steps are configured and turn at a constant rate while held when they are not.

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
| **V**  | The application owns scrolling; the page never scrolls                         | Reversed by D                          |
| **D**  | Scrolling delegated back to the browser; rotation detented onto authored steps | In force                               |

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
ours), and let engine heuristics claim a gesture mid-flight. One gesture
decomposition fed two identical integrators. Reversed by D.

**D — delegate the scroll axis, detent the rotation axis.** Two changes, one
theme: hand back what the platform does well, and spend the authoring effort
where it is the product.

_Scrolling returns to the browser._ V's three arguments were all true and none
of them was worth the bill. Reimplementing a scroller means reimplementing it
_everywhere_ — every engine difference becomes a bug filed against us rather
than a platform behaviour, and every convention a viewer already has configured
(a scrollbar to drag, assistive settings that apply to native scrollers, the
device's own momentum) has to be rebuilt or is simply lost. The symmetry V
bought was elegant but internal; nobody scrolling the story could see it. So
`scroll.js` is a reader again: a spacer, a pinned canvas, `scrollTop /
viewportHeight`, and no input listeners. Of V's three arguments only "an engine
can claim a gesture mid-flight" survives as a real problem, and it was already
solved independently — fingers are read from touch events, which keep arriving
through an engine's takeover.

_Rotation gains detents._ R's free turntable let the viewer rest anywhere, which
made the authoring problem unbounded: every one of 360° had to hold up. Now the
view **settles onto the nearest configured step** on release, so an author
composes a finite set of shots and the angles between them only have to survive
being passed through. Steps are **absolute angles with no requirement to be
evenly spaced**, which is what makes them compositional rather than mechanical —
a front, a three-quarter view 40° off it, and something round the back is a
legitimate set. Snapping reuses R's coast rather than bolting a correction onto
the end of it: the coast's landing point is snapped, so a flick still carries in
proportion to its throw. Free rotation remains available by configuring no steps
— it is the same code path with the snap step skipped.

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
- **Only a gesture that actually turned the view may snap it.** The settle is
  triggered from the horizontal deadband having been crossed, not from the
  gesture ending. Otherwise every vertical scroll touch would end by yanking the
  view onto the nearest step — most visible when the author has not put a step
  at 0°, where simply scrolling would swing the framing off the front.
- **The snap target is the coast's landing point, not the current angle.**
  Snapping where the finger let go would make every flick identical; snapping
  where the coast _would have_ stopped is what preserves throw strength. It also
  means the two behaviours share one integrator instead of sequencing a coast
  into a correction, which is what keeps the motion single and un-stuttered.
- **Step search is modulo a turn but returns an absolute angle.** Candidates are
  drawn from the turn the angle falls in plus its two neighbours — enough to
  cover every step within half a turn either way, and it keeps accumulated turns
  rather than unwinding to a canonical 0–360°.
- **`touch-action: pan-y` on the canvas host** is what makes both halves of a
  diagonal gesture live: the browser takes the vertical axis and keeps
  dispatching `touchmove` for the horizontal one.
- **Touch is read from touch events, not pointer events.** Pointer events are
  the fragile reader (a browser that claims a gesture fires `pointercancel`);
  touch events keep being dispatched regardless. This is what makes the
  horizontal axis survive an engine committing the gesture to native scrolling
  — the one V-era argument that still bites under delegated scrolling. Mouse and
  pen stay on pointer events.
- **`#app` is `100vh`, not `100svh`/`100lvh`.** `svh` leaves blank space on iOS
  when the toolbar is up; the runtime does its own debounced resize handling
  (`viewer.js`) for toolbar changes instead. Safari fires several intermediate
  resizes during a toolbar collapse, hence the debounce — and under native
  scrolling those collapses happen _during_ a gesture, so the spacer is
  re-measured against the live viewport height every frame.
- **Schema churn is managed by `formatVersion` + migrations** (`migrate.js`),
  kept in lockstep with the sample project so fixtures do not rot.

## 7. Verification

`npm test` (57), `npm run validate`, `npm run lint`, `npm run build` all green.

**Scroll driver (9 tests).** Deliberately a small surface now — the handover, not
the feel: units read as `scrollTop / viewportHeight`, the document flipped to
scrollable with `pan-y` on the host and its canvases, the spacer sized
`(length + 1) × vh` so the bottom of the document is exactly the end of the
story, resized when the story or the viewport changes and _not_ rewritten
otherwise, `jumpTo`, and the document restored plus the spacer removed on
dispose. The harness throws if the driver so much as calls `addEventListener`,
which is the delegation stated as an assertion.

**Swipe driver (25 tests).** The gesture rules as before (deadband, 1:1 drag,
`degreesPerWidth` scaling, touch surviving a `pointercancel` mid-scroll, a fresh
contact taking over a stranded gesture, the stale-release rule, free rotation
unbounded and persistent), plus the snap: a release settling onto the nearest
step, a gentle release falling back to the step it came from, a flick carrying
past two intervening steps, turns preserved rather than unwound (704° → 720°,
not → 0°), irregular spacing making a 300° step win from −35° where an even
quarter would not, a cancelled gesture resting on a step without a throw, arrow
keys walking irregular intervals one at a time, a trackpad gesture settling once
its stream goes quiet, and — the rule that is easiest to get wrong — a purely
vertical scroll gesture never dragging the view onto a step.

**Browser-verified** (Chromium, `?sync` overlay, sample project's
`steps: [0, 40, 180, 300]` at `degreesPerWidth: 180`):

- The page scrolls natively: one spacer, `scrollHeight` exactly
  `(14 + 1) × 800 = 12000`, `touch-action: pan-y` computed on `#app`,
  `html { overflow: visible }`; `scrollTo(0, 3.5 vh)` gives `units 3.5` and
  `travel 21 m` (= 3.5 × `travelPerUnit` 6).
- A slow 400 px drag right reaches −55.1° under the finger and rests at exactly
  **−60.0°** — the 300° step, reached the short way round.
- The same drag thrown hard travels on from −60° to **−320°** (the 40° step, one
  turn down), passing −180° on the way: the flick carries.
- `ArrowLeft` from −320° steps to **−180°**, one configured step, not a fixed
  increment.
- A real CDP-injected diagonal drag moves **both axes within the same gesture** —
  `scrollY` 29 → 69 → 109 while `yaw` goes −10.1° → −15.8° → −21.4° — and on
  release the rotation settles to exactly **0°** while `travel`, `camera.y` and
  every layer offset stay put. This is the axis-independence claim measured
  against real browser input rather than synthesised events.
- The `?sync` overlay reads `yaw -59.7° → -60°` mid-settle and `yaw -60.0°` at
  rest; per-layer offsets match `−(1−parallax)·travel` exactly.

**Not verifiable here: how it feels.** Software rendering gives ~224 ms frames
on desktop and ~382 ms on the emulated phone, so smoothness and the choice of
time constants cannot be judged in this environment — only that the values are
correct and `dt`-driven. Nor is the browser's *own* scroll feel observable here,
which is now most of the vertical axis.

**Harness notes.** Synthetic `TouchEvent`s dispatched from inside the page
reach our listeners but **do not drive native scrolling** — only real input
does — so a synthesised diagonal shows rotation with `scrollY` stuck at 0 and
proves nothing about the vertical axis. Use CDP `Input.dispatchTouchEvent` for
anything involving native scroll. It round-trips at ~1.1 s per event in this
container, so it cannot express velocity (the R-series mistook this for CDP
producing no fling — it was never dispatched) and
`Input.synthesizeScrollGesture` delivers no moves; but for "do both axes move at
once", velocity is not needed. For anything velocity-dependent, dispatch from
inside the page in a single task with a busy-wait between events, then read the
progress payload after yielding to a rendered frame.

## 8. Open work

**Runtime**

- **Feel tuning on real hardware.** The scroll axis is the browser's again, so
  what is left to tune is rotation: `COAST_TAU` (0.22 s) and `COAST_MAX`, which
  together set how far a hard throw carries and therefore how many steps it
  passes — the constant most entangled with a world's step spacing.
- **`prefers-reduced-motion` shortening the settle**, unbuilt. Less pressing
  than it was (the scroll axis now honours whatever the platform honours), but
  the rotation settle is still an animation the runtime chose.
- **Steps and the initial angle.** `yaw` starts at 0 whether or not 0 is a
  configured step, so a world whose steps omit the front opens off-detent until
  the first gesture. Snapping on load would be worse (the camera would swing
  during the boot fade); the practical answer is an authoring lint, which does
  not exist yet.
- **A scroll-position indicator.** Nothing shows how far through the story the
  viewer is (`?sync` is a debug readout, not that). Cheaper than it was: with a
  real scroller there is a real scrollbar on desktop, so this is now mainly a
  mobile question.
- **Origin rebasing** for very long worlds (camera coordinates grow); fine at
  sample scale.
- **Lazy streaming by depth** — the whole world loads up front.

**Authoring (was M2/N4; removed with the narrowing)**

- The editor itself: framing a viewpoint, placing objects into layers,
  scrubbing progress, previewing, exporting.
- **Rotation-aware composition tooling** — nothing warns an author that a stage
  is a flat frontage that turning reveals as empty. Steps make this tractable
  for the first time: the tool would render each configured step rather than
  sweep a continuum, so "preview every viewpoint" is now a finite operation.

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

- **Scroll feel is the product, and it is the browser's again.** The risk has
  inverted rather than gone: differences between engines are now expected
  behaviour we cannot fix, and what has to be checked is that the _world_ still
  reads well under each platform's momentum and rubber-band — not that our
  arithmetic matches. Needs a session on real hardware either way.
- **`touchmove` reaching us during a native scroll** is the single
  engine-sensitive dependency the whole horizontal axis rests on, and delegating
  the scroll axis put it back in the critical path. `touch-action: pan-y` plus
  reading fingers from touch events is the mitigation, verified on Chromium;
  re-verify first on any engine where turning stalls mid-scroll.
- **Step spacing interacts with flick strength.** Steps closer together than a
  hard throw's reach mean a flick routinely overshoots several of them. That is
  the intended behaviour, but it makes `COAST_MAX` a knob authors feel without
  being able to set — worth revisiting if a world wants many fine steps.
- **Migration churn.** `formatVersion` is at 3 after two model rewrites; keep
  the sample project and migrations in lockstep.
- **Dual-cost rendering is gone** with scenes, but a long world still loads up
  front — the cost moves to first load rather than the seams.
