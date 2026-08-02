# Slash

A scroll-driven 3D story runtime. It plays **one continuous vertical world**:
as you scroll down, the camera descends through a world that is fixed in space,
so environments stream past with parallax while the characters travel through
it and stay framed — like an attraction where the stage moves and the
characters ride through it. See `spec.md` for the vision and for the
move-the-camera vs. move-the-world rationale.

**Current scope.** The project is a polished runtime focused on scroll
behavior and scroll↔world synchronization. The world is **passive** — vertical
scroll is the only input. The authoring editor, horizontal viewpoint switching,
the state/event system, audio, AI generation, and the export pipeline are
deferred; git history preserves the earlier scene/story model.

## Structure

- `packages/schema` — content data format: JSON Schemas + dependency-free validator. The AI-facing surface.
- `packages/runtime` — loads and plays content. Depends on schema + Three.js only.
  The scroll→world mapping is the pure module `src/world-map.js`; the player is `src/world-player.js`.
- `sample-project/` — hand-written fixture project (`world.json`) used to develop and test everything.
- `docs/ai-authoring.md` — the content model explained for LLMs; usable as a system prompt for agentic authoring.

## Verifying the scroll behavior

Run `npm run dev:runtime` and open `/?sync&stats`. The `sync` overlay reports
`units` (viewport-heights scrolled), global progress `g`, camera descent
(`travel`, metres), `camera.y`, and each parallax layer's live Y offset — so
the continuous travel and per-layer parallax are directly observable.

## Commands

```sh
npm install
npm run validate      # validate sample-project against the schemas
npm run dev:runtime   # runtime demo: plays sample-project (scroll to advance)
npm run build         # build the runtime
npm run test          # unit tests
npm run lint
```
