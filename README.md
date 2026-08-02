# Slash

A scroll-driven 3D story runtime. Scrolling down advances the story; content
(camera, characters, lighting, effects) is driven in lockstep with the scroll
position. See `spec.md` for the vision.

**Current scope.** The project has been narrowed to a polished runtime focused
on scroll behavior and scroll↔content synchronization, playing a single
**linear** story path. Scenes are passive — scrolling is the only input. The
authoring editor, seamless transitions (crossfade/camera/continuity),
horizontal viewpoint switching, branching, the state/event system, audio, AI
generation, and the export pipeline are deferred; git history preserves them.

## Structure

- `packages/schema` — content data format: JSON Schemas + dependency-free validator. The AI-facing surface.
- `packages/runtime` — loads and plays content. Depends on schema + Three.js only.
- `sample-project/` — hand-written fixture project used to develop and test everything.
- `docs/ai-authoring.md` — the content model explained for LLMs; usable as a system prompt for agentic authoring.

## Commands

```sh
npm install
npm run validate      # validate sample-project against the schemas
npm run dev:runtime   # runtime demo: plays sample-project (scroll to advance)
npm run build         # build the runtime
npm run test          # unit tests
npm run lint
```
