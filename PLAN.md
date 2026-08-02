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
