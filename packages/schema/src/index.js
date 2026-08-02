import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import storySchema from '../schemas/story.schema.json' with { type: 'json' };
import sceneSchema from '../schemas/scene.schema.json' with { type: 'json' };
import assetIndexSchema from '../schemas/asset-index.schema.json' with { type: 'json' };
import { validate } from './validator.js';

export { validate };
export { migrateScene, migrateScenes, migrateStory } from './migrate.js';

/** All content schemas, keyed by document kind. */
export const schemas = {
  project: projectSchema,
  story: storySchema,
  scene: sceneSchema,
  assetIndex: assetIndexSchema,
};

export const FORMAT_VERSION = 1;

/**
 * @typedef {import('./validator.js').ValidationError} ValidationError
 */

/**
 * Validate a single content document.
 * @param {keyof typeof schemas} kind
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: ValidationError[] }}
 */
export function validateDocument(kind, data) {
  const schema = schemas[kind];
  if (!schema) throw new Error(`Unknown document kind: ${kind}`);
  return validate(schema, data);
}

/**
 * Validate a whole project: every document against its schema, plus
 * cross-references (story->scenes, scenes->assets).
 *
 * @param {{
 *   project: unknown,
 *   story: unknown,
 *   scenes: Record<string, unknown>,  // keyed by scene id
 *   assetIndex: unknown,
 * }} docs
 * @returns {{ valid: boolean, errors: ValidationError[] }} errors have paths
 *   prefixed with the document name, e.g. "story.json/scenes/0".
 */
export function validateProject(docs) {
  /** @type {ValidationError[]} */
  const errors = [];

  const collect = (file, result) => {
    for (const e of result.errors) errors.push({ path: `${file}${e.path}`, message: e.message });
  };

  collect('project.json', validateDocument('project', docs.project));
  collect('story.json', validateDocument('story', docs.story));
  collect('assets/index.json', validateDocument('assetIndex', docs.assetIndex));
  for (const [id, scene] of Object.entries(docs.scenes)) {
    collect(`scenes/${id}.json`, validateDocument('scene', scene));
  }

  if (errors.length > 0) return { valid: false, errors };

  // Cross-reference checks (only meaningful once documents are shape-valid).
  const story = /** @type {any} */ (docs.story);
  const assetIndex = /** @type {any} */ (docs.assetIndex);

  const nodeIds = new Set(story.scenes.map((s) => s.id));
  const assets = new Map(assetIndex.assets.map((a) => [a.id, a]));

  const err = (path, message) => errors.push({ path, message });

  if (story.scenes.length !== nodeIds.size) err('story.json/scenes', 'duplicate scene ids');
  if (assetIndex.assets.length !== assets.size)
    err('assets/index.json/assets', 'duplicate asset ids');
  if (!nodeIds.has(story.start)) err('story.json/start', `unknown scene "${story.start}"`);
  for (const [i, s] of story.scenes.entries()) {
    if (s.next != null && !nodeIds.has(s.next))
      err(`story.json/scenes/${i}/next`, `unknown scene "${s.next}"`);
    if (!(s.id in docs.scenes))
      err(`story.json/scenes/${i}`, `scene file for "${s.id}" not provided`);
  }
  for (const a of assetIndex.assets) {
    if (a.kind === 'gltf' && !a.source)
      err(`assets/index.json/${a.id}`, 'kind "gltf" requires "source"');
    if (a.kind === 'primitive' && !a.primitive)
      err(`assets/index.json/${a.id}`, 'kind "primitive" requires "primitive"');
  }

  for (const [id, sceneDoc] of Object.entries(docs.scenes)) {
    const scene = /** @type {any} */ (sceneDoc);
    const file = `scenes/${id}.json`;
    if (scene.id !== id)
      err(`${file}/id`, `scene id "${scene.id}" does not match story entry "${id}"`);
    if (!assets.has(scene.stage.assetId))
      err(`${file}/stage/assetId`, `unknown asset "${scene.stage.assetId}"`);
    const effectIds = new Set((scene.effects ?? []).map((e) => e.id));
    if ((scene.effects ?? []).length !== effectIds.size)
      err(`${file}/effects`, 'duplicate effect ids');
    const actorIds = new Set();
    for (const [i, actor] of (scene.actors ?? []).entries()) {
      if (actorIds.has(actor.id)) err(`${file}/actors/${i}/id`, `duplicate actor id "${actor.id}"`);
      actorIds.add(actor.id);
      if (!assets.has(actor.assetId))
        err(`${file}/actors/${i}/assetId`, `unknown asset "${actor.assetId}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}
