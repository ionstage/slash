# Slash

Web-based authoring tool for scroll-driven 3D story experiences. See `spec.md` for the vision and `PLAN.md` for the implementation plan.

## Structure

- `packages/schema` — content data format: JSON Schemas + dependency-free validator. The AI-facing surface.
- `packages/runtime` — loads and plays content. Depends on schema + Three.js only; never on the editor.
- `packages/editor` — authoring UI. Embeds the runtime for its viewport and preview.
- `sample-project/` — hand-written fixture project used to develop and test everything.
- `docs/ai-authoring.md` — the content model explained for LLMs; usable as a system prompt for agentic authoring. The editor's ✨ AI panel generates scenes (Claude API or built-in offline provider) and 3D assets (Meshy image→3D, experimental).

## Commands

```sh
npm install
npm run validate      # validate sample-project against the schemas
npm run dev:runtime   # runtime demo: plays sample-project (scroll to advance)
npm run dev:editor    # editor shell
npm run build         # build both apps
npm run lint
```
