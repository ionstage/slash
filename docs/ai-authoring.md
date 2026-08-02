# Authoring Slash content with AI

Slash is AI-native: every piece of content is plain, schema-validated JSON.
This document is the guide an LLM (or a human) needs to generate or modify
a project. It is suitable for use as a system prompt for agentic authoring.

## Project layout

```
project/
  project.json        Manifest: title, render style (toon/outline/post), settings
  story.json          Story: a single linear chain of scenes (`next` links)
  scenes/<id>.json    One scene per file
  assets/index.json   Asset registry (models, primitives)
  assets/…            Binary files referenced by the registry
```

The authoritative schemas live in `packages/schema/schemas/*.schema.json` —
every field carries a `description`. Validate with `@slash/schema`:
`validateProject({project, story, scenes, assetIndex})` checks each document
_and_ all cross-references (asset ids, scene ids, effect ids). Generated
content must pass this before it is usable.

## The mental model

- The story is a **single linear chain** of scenes the viewer descends by
  **native vertical scroll** — scrolling down advances the story. Progress is
  measured in viewport-heights. Scenes are **passive**: scrolling is the only
  input (no taps, events, state, or branching).
- A **scene** plays over a progress axis `t ∈ [0,1]`, driven by scrolling.
  Everything animated is a **track**: keyframes `{t, value, easing}` (easing on
  a keyframe shapes the segment _into_ it). Actor `tracks` animate
  position/rotation/scale over `t`; `idleClip` loops a glTF animation.
- The **camera** is one held `viewpoint` (`position` + `target`, meters;
  characters ≈ 1.7 m tall) — frame each section like a comic panel from that
  single shot. Optional `camera.drift` adds restrained offset tracks over `t`.
  `scrollLength` sets pacing in viewport-heights.
- **Story flow**: scenes in `story.json` chain via `next` (a scene id, or
  `null` to end). Each seam into the next section is an instant `cut`.
- **Atmosphere**: per-scene `lights` (ambient/directional/point, with
  intensity/color/position tracks), `environment.fog`, and `effects`
  (particle presets: rain, snow, sparks, fireflies — animated over `t` via an
  `intensity` track). Project-level `renderStyle` sets toon/realistic style,
  outlines, bloom and vignette.

## Rules for generated content

1. `formatVersion: 2` on every scene and on `story.json`; `1` on the other
   documents.
2. Ids are lowercase kebab-case (`^[a-z][a-z0-9-]*$`) and unique in scope.
3. Reference only asset ids present in `assets/index.json`. When a needed
   model does not exist, add a `kind: "primitive"` asset (box, sphere,
   capsule, plane, cylinder + color) as a placeholder — primitives are
   fully playable.
4. Keep scenes scannable: 2–6 actors and one clear camera viewpoint.
   Atmosphere (fog, lights, one effect) over clutter.
5. Restrained character motion: characters move _through_ the stage led by
   idle animation and gentle position tracks — a slow walk, a turn, a drift —
   not busy per-actor choreography. Let the held viewpoint and `camera.drift`
   carry the shot.
