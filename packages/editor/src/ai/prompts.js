import { schemas } from '@slash/schema';

/**
 * Prompt construction for AI scene/story generation. Pure module.
 *
 * The generation contract is an "envelope": the model returns JSON
 *   { "scenes": [SceneDoc, ...], "state": { "flags": {...}, "counters": {...} } }
 * Scenes are validated against the real scene schema and cross-referenced
 * against the project before anything is applied (see envelope.js).
 */

/** Project facts the model needs to generate valid content. */
export function projectContext(docs) {
  return {
    assets: docs.assetIndex.assets.map((a) => ({
      id: a.id,
      type: a.type,
      kind: a.kind,
      name: a.name,
      tags: a.tags,
    })),
    stateKeys: [
      ...Object.keys(docs.state.flags ?? {}),
      ...Object.keys(docs.state.counters ?? {}),
    ],
    sceneIds: docs.story.scenes.flatMap((s) => [s.id, ...(s.viewpoints ?? []).map((v) => v.id)]),
    title: docs.project.title,
  };
}

export const SYSTEM_PROMPT = `You are a scene author for Slash, a scroll-driven 3D story engine.
You write scene documents (JSON) that a validator checks strictly against a JSON Schema.
Respond with a single JSON object and nothing else — no prose, no markdown fences.`;

/**
 * @param {ReturnType<typeof projectContext>} context
 * @param {string} userPrompt
 */
export function buildScenesPrompt(context, userPrompt) {
  return `Project: "${context.title}"

Existing assets you may reference (use ONLY these asset ids):
${JSON.stringify(context.assets, null, 2)}

Existing state keys: ${JSON.stringify(context.stateKeys)}
Existing scene ids (do not reuse): ${JSON.stringify(context.sceneIds)}

The scene document JSON Schema (follow it exactly):
${JSON.stringify(schemas.scene, null, 2)}

Task: ${userPrompt}

Return a single JSON object of this shape:
{
  "scenes": [ <one or more scene documents following the schema above> ],
  "state": { "flags": { "<newKey>": {"initial": false, "description": "..."} }, "counters": {} }
}

Rules:
- "formatVersion" is 1 on every scene.
- Scene "id" values: lowercase kebab-case, new (not in the existing list), unique.
- "stage.assetId" and every actor "assetId" must be ids from the asset list above.
- Camera needs "position" and "lookAt" tracks with keyframes at t=0 and t=1 minimum;
  progress t runs 0..1 over the scene's scroll. Positions are meters; characters are ~1.7m tall.
- Events may only reference state keys that exist or that you add under "state".
- Scenes are appended to the story in array order (first scene follows the current story).
- Aim for atmosphere: use lights, fog ("environment"), and effects where they serve the story.
- The "state" field is optional; include it only when your events need new keys.`;
}
