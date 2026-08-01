# Authoring Slash content with AI

Slash is AI-native: every piece of content is plain, schema-validated JSON.
This document is the guide an LLM (or a human) needs to generate or modify
a project. It is suitable for use as a system prompt for agentic authoring.

## Project layout

```
project/
  project.json        Manifest: title, render style (toon/outline/post), settings
  story.json          Story graph: ordered scene nodes, branches, viewpoints
  scenes/<id>.json    One scene per file
  assets/index.json   Asset registry (models, primitives, audio)
  assets/…            Binary files referenced by the registry
  state.json          Flags / counters with initial values
```

The authoritative schemas live in `packages/schema/schemas/*.schema.json` —
every field carries a `description`. Validate with `@slash/schema`:
`validateProject({project, story, scenes, assetIndex, state})` checks each
document *and* all cross-references (asset ids, scene ids, state keys,
effect targets). Generated content must pass this before it is usable.

## The mental model

- A **scene** plays over a progress axis `t ∈ [0,1]`, driven by scrolling
  (or auto-play). Everything animated is a **track**: keyframes
  `{t, value, easing}` (easing on a keyframe shapes the segment *into* it).
- The **camera** needs `position` and `lookAt` vec3 tracks (meters;
  characters ≈ 1.7 m tall). `scrollLength` sets pacing in viewport-heights.
- **Events** are `{trigger, actions}`: triggers `progress` / `tap` /
  `state`; actions `playAnimation`, `setState`, `gotoScene`, `playSound`,
  `setVisible`, `setEffect`, `log`. An optional `when` condition gates any
  event on state.
- **Story flow**: nodes in `story.json` chain via `next`; `branches`
  (`when {key, equals} → next`) pick state-dependent outcomes and are
  evaluated before `next`. `viewpoints` are horizontal variants of a node
  (swipe switches; vertical progress is shared). `gotoScene` enables loops
  and revisits.
- **State** (`state.json`): declare every flag/counter an event references.
  `visibleWhen` on an actor makes it a hidden element tied to state.
- **Atmosphere**: per-scene `lights` (ambient/directional/point, with
  intensity/color/position tracks), `environment.fog`, and `effects`
  (particle presets: rain, snow, sparks, fireflies — toggleable via the
  `setEffect` action). Project-level `renderStyle` sets toon/realistic
  style, outlines, bloom and vignette.

## Rules for generated content

1. `formatVersion: 1` on every document.
2. Ids are lowercase kebab-case (`^[a-z][a-z0-9-]*$`) and unique in scope.
3. Reference only asset ids present in `assets/index.json`. When a needed
   model does not exist, add a `kind: "primitive"` asset (box, sphere,
   capsule, plane, cylinder + color) as a placeholder — primitives are
   fully playable.
4. Reference only state keys declared in `state.json` (add new ones there).
5. Keep scenes scannable: 2–6 actors, one clear camera move, events that
   advance the story. Atmosphere (fog, lights, one effect) over clutter.

## Generation envelope (editor AI panel)

The editor's ✨ AI panel expects generation output as a single JSON object:

```json
{
  "scenes": [ { …scene document… } ],
  "state": { "flags": { "newKey": {"initial": false} }, "counters": {} }
}
```

Scenes are appended to the story in order (spliced after the current last
node), state additions are merged, and the whole merged project is
validated before anything is applied.
