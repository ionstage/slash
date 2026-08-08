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

**The runtime does its own scrolling.** The page never scrolls natively — there
is no scrollbar and no scroll range. Both axes are read from the raw input
(touch, drag, wheel, keys) and integrated by the runtime, momentum and all, so
the feel is one design rather than whatever the viewer's browser does.

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
  The two input drivers are `src/scroll.js` (the vertical axis, and the runtime's own scrolling) and `src/swipe.js` (rotation).
- `sample-project/` — hand-written fixture project (`world.json`) used to develop and test everything.
- `docs/ai-authoring.md` — the content model explained for LLMs; usable as a system prompt for agentic authoring.

## Verifying the scroll and rotation behavior

Run `npm run dev:runtime` and open `/?sync&stats`. The `sync` overlay reports
`units` (viewport-heights scrolled), global progress `g`, camera descent
(`travel`, metres), `camera.y`, the swipe rotation `yaw`, and each parallax
layer's live Y offset — so the continuous travel and per-layer parallax are
directly observable. Swipe (or drag, or hold ← / →) and watch `yaw` change
while `camera.y` and every layer offset stay put; swipe diagonally and watch
both move at once.

The vertical axis takes a drag, the wheel, ↑ / ↓, PageUp / PageDown, space and
Home / End — all of it driven by the runtime, so a flick coasts and a coast
stops when you touch the world again.

## Commands

```sh
npm install
npm run validate      # validate sample-project against the schemas
npm run dev:runtime   # runtime demo: plays sample-project (scroll to advance, swipe to turn)
npm run build         # build the runtime
npm run test          # unit tests
npm run lint
```
