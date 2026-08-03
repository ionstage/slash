# Authoring Slash content with AI

Slash is AI-native: every piece of content is plain, schema-validated JSON.
This document is the guide an LLM (or a human) needs to generate or modify
a project. It is suitable for use as a system prompt for agentic authoring.

## Project layout

```
project/
  project.json        Manifest: title, render style (toon/post), settings
  world.json          The whole world: layers, objects, actors, atmosphere
  assets/index.json   Asset registry (models, primitives)
  assets/…            Binary files referenced by the registry
```

The authoritative schemas live in `packages/schema/schemas/*.schema.json` —
every field carries a `description`. Validate with `@slash/schema`:
`validateProject({project, world, assetIndex})` checks each document _and_ all
cross-references (asset ids, layer ids, object/actor/effect/light ids).
Generated content must pass this before it is usable.

## The mental model

- The experience is **one continuous vertical world**, not a sequence of
  scenes. The viewer descends it by **native vertical scroll** — scrolling down
  moves the camera down. The world is **passive**: scrolling is the only input
  (no taps, events, state, or branching).
- Scroll position is `units` (viewport-heights). Two derived scalars drive
  everything (see `packages/runtime/src/world-map.js`, the single source of
  truth):
  - `travel = units * travelPerUnit` — metres the **camera descends**. The
    camera is a dolly rig placed at `camera.offset` / `camera.target` relative
    to the descending point; `camera.drift` adds subtle motion over `g`.
  - `g = units / length` ∈ [0,1] — **global progress**, the axis all tracks
    (actor motion, fog, lights, effects) are keyframed against.
- The world is **fixed in space**; the camera moves *through* it. So place
  objects at their true `worldY` (metres) and let the descent reveal them. This
  is why authoring is WYSIWYG — an object at `worldY: -54` is passed at
  `units = 54 / travelPerUnit`.
- **Parallax layers**: every object belongs to a `layer` with a `parallax`
  factor. `parallax: 1` = true world space (streams past at full rate);
  `parallax → 0` = rides the camera and barely moves (distant sky/ridges).
  Order layers back-to-front. Perspective already gives natural parallax; the
  factor adds deliberate depth separation on top.
- **Persistent characters** are `actors`. `follow: "camera"` makes an actor ride
  the descending rig so it **stays framed the whole scroll while the world
  streams past** — the traveler travelling through the world. `follow: "world"`
  (default) anchors it at `worldY` and it is left behind as the camera passes.
  Actor `tracks` (position/rotation/scale, keyed over `g`) add sway, bob or
  drift; for camera-following actors the values are relative to the rig.
- **Atmosphere** is continuous over `g`: `environment.fog` (color/near/far
  tracks), `environment.lights` (ambient/directional/point, with
  intensity/color/position tracks; `follow: "camera"` keeps a key light on the
  traveler), and `environment.effects` (particle presets rain/snow/sparks/
  fireflies with an `intensity` track — these travel with the viewer).
  Project-level `renderStyle` sets toon/realistic style, bloom, vignette.

## Rules for generated content

1. `formatVersion: 3` on `world.json`; `1` on `project.json` and
   `assets/index.json`.
2. Ids are lowercase kebab-case (`^[a-z][a-z0-9-]*$`) and unique in scope.
3. Reference only asset ids present in `assets/index.json`, and only layer ids
   present in `world.layers`. When a needed model does not exist, add a
   `kind: "primitive"` asset (box, sphere, capsule, plane, cylinder + color) as
   a placeholder — primitives are fully playable.
4. Object placement: put lateral offset in `transform.position` (X/Z) and the
   vertical position in `worldY` (added to Y). Space landmarks a few `units`
   apart (`worldY` steps of a few × `travelPerUnit`) so the descent has rhythm.
5. Keep at least one `parallax: 1` layer (the path/ground the traveler passes)
   and one or two distant layers (`parallax` 0.05–0.4) for depth.
6. Give persistent `follow: "camera"` actors restrained motion — a gentle sway
   or bob over `g`, not busy choreography. Let the descent and parallax carry
   the shot.
