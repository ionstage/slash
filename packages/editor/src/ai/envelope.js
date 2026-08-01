import { validateProject } from '@slash/schema';
import { uniqueId } from '../project-store.js';

/**
 * Generation envelope handling: parse the model's JSON, merge it into a
 * *clone* of the project, and validate the result. Nothing touches the
 * real store unless the merged project is fully valid — generated content
 * is a draft that must pass the same validation as hand-authored content.
 */

/** Extract a JSON object from model output (tolerates markdown fences). */
export function parseJsonResponse(text) {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object found in the response');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Merge an envelope into a cloned project and validate.
 *
 * @param {any} docs Current project documents (not mutated).
 * @param {{ scenes?: any[], state?: {flags?: object, counters?: object} }} envelope
 * @returns {{ ok: boolean, errors: {path: string, message: string}[], docs?: any, addedSceneIds?: string[] }}
 */
export function mergeEnvelope(docs, envelope) {
  if (!Array.isArray(envelope?.scenes) || envelope.scenes.length === 0) {
    return { ok: false, errors: [{ path: 'envelope', message: 'no "scenes" array in response' }] };
  }
  const merged = JSON.parse(JSON.stringify(docs));

  for (const [group, def] of Object.entries(envelope.state ?? {})) {
    if (group !== 'flags' && group !== 'counters') continue;
    for (const [key, value] of Object.entries(def ?? {})) {
      (merged.state[group] ??= {})[key] ??= value;
    }
  }

  const addedSceneIds = [];
  const taken = new Set(Object.keys(merged.scenes));
  for (const scene of envelope.scenes) {
    if (typeof scene?.id !== 'string') {
      return { ok: false, errors: [{ path: 'envelope/scenes', message: 'scene without an id' }] };
    }
    const id = uniqueId(scene.id, taken); // auto-rename collisions
    taken.add(id);
    scene.id = id;
    merged.scenes[id] = scene;
    addedSceneIds.push(id);
  }

  // Splice the new chain in after the current last story node.
  const last = merged.story.scenes.at(-1);
  const tailNext = last?.next ?? null;
  if (last) last.next = addedSceneIds[0];
  addedSceneIds.forEach((id, i) => {
    merged.story.scenes.push({
      id,
      path: `scenes/${id}.json`,
      next: addedSceneIds[i + 1] ?? tailNext,
    });
  });

  const result = validateProject(merged);
  if (!result.valid) return { ok: false, errors: result.errors };
  return { ok: true, errors: [], docs: merged, addedSceneIds };
}
