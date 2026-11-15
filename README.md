# Slash

A scroll-driven 3D story runtime. It plays **one continuous vertical world**:
as you scroll down, the camera descends through a world that is fixed in space,
so environments stream past with parallax while the characters travel through
it and stay framed — like an attraction where the stage moves and the
characters ride through it. See `spec.md` for the vision and for the
move-the-camera vs. move-the-world rationale.

Horizontal swipes turn the view: the camera orbits a circular path around what
it is looking at, at its current height, so you can spin the world like a
turntable and see the scene from another side. Rotation and descent are
independent but not exclusive — a gesture's horizontal component turns while its
vertical component scrolls, in the same swipe.

**Turning is continuous under the finger and discrete at rest.** The drag tracks
1:1, and on release the view settles onto the nearest angle the author
configured (`rotation.steps`) — a flick carries past several, a gentle release
falls back to the one it came from. Steps are absolute angles and need not be
evenly spaced, so they are the framings a stage was composed for rather than a
mechanical division of the circle. Configure none and rotation is free.

**Scrolling is the browser's own.** The page really scrolls: a spacer gives the
document the story's height, the canvas is pinned in front of it, and the
runtime reads the scroll position rather than driving it. Momentum, the ends,
the scrollbar and every accessibility affordance a native scroller carries come
with it; the cost is that the vertical feel is the platform's, which is the
trade being made.

**Current scope.** The project is a polished runtime focused on scroll
behavior and scroll↔world synchronization. Its two inputs are vertical scroll
and horizontal swipe rotation; the world is otherwise **passive** (no taps,
events, or state). The authoring editor, character-viewpoint switching, the
state/event system, audio, AI generation, and the export pipeline are deferred;
git history preserves the earlier scene/story model.

## Structure

- `packages/schema` — content data format: JSON Schemas + dependency-free validator. The AI-facing surface.
- `packages/runtime` — loads and plays content. Depends on schema + Three.js only.
  The input→world mapping is the pure module `src/world-map.js`; the player is `src/world-player.js`.
  The two input drivers are `src/scroll.js` (the vertical axis — a reader over the browser's scrolling, with no input listeners of its own) and `src/swipe.js` (rotation, including the settle onto configured steps).
- `sample-project/` — hand-written fixture project (`world.json`) used to develop and test everything.
- `docs/ai-authoring.md` — the content model explained for LLMs; usable as a system prompt for agentic authoring.

## Verifying the scroll and rotation behavior

Run `npm run dev:runtime` and open `/?sync&stats`. The `sync` overlay reports
`units` (viewport-heights scrolled), global progress `g`, camera descent
(`travel`, metres), `camera.y`, the swipe rotation `yaw` — plus `→ <angle>`
while it is settling onto a step — and each parallax layer's live Y offset, so
the continuous travel and per-layer parallax are directly observable.

Swipe (or drag, or press ← / →) and watch `yaw` change while `camera.y` and
every layer offset stay put; let go and watch it land on one of the sample's
configured steps (`0, 40, 180, 300`). Throw it hard and it passes several;
release it gently and it falls back. Swipe diagonally and watch both axes move
at once.

The vertical axis takes whatever your browser's scrolling takes — a drag, the
wheel, the scrollbar, ↑ / ↓, PageUp / PageDown, space, Home / End — with the
platform's own momentum and end behaviour, none of it reimplemented here.

## Commands

```sh
npm install
npm run validate      # validate sample-project against the schemas
npm run dev:runtime   # runtime demo: plays sample-project (scroll to advance, swipe to turn)
npm run build         # build the runtime
npm run test          # unit tests
npm run lint
```

## License

MIT — see `LICENSE`.

The runtime bundles [Three.js](https://github.com/mrdoob/three.js) (MIT,
Copyright 2010-2024 Three.js Authors), including the meshoptimizer decoder
(MIT, Copyright 2016-2022 Arseny Kapoulkine).
