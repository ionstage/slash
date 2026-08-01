import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import storySchema from '../schemas/story.schema.json' with { type: 'json' };
import sceneSchema from '../schemas/scene.schema.json' with { type: 'json' };
import assetIndexSchema from '../schemas/asset-index.schema.json' with { type: 'json' };
import stateSchema from '../schemas/state.schema.json' with { type: 'json' };
import { validate } from './validator.js';

export { validate };
export { migrateScene, migrateScenes } from './migrate.js';

/** All content schemas, keyed by document kind. */
export const schemas = {
  project: projectSchema,
  story: storySchema,
  scene: sceneSchema,
  assetIndex: assetIndexSchema,
  state: stateSchema,
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
 * cross-references (story→scenes, scenes→assets, events→state and scenes).
 *
 * @param {{
 *   project: unknown,
 *   story: unknown,
 *   scenes: Record<string, unknown>,  // keyed by scene id
 *   assetIndex: unknown,
 *   state: unknown,
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
  collect('state.json', validateDocument('state', docs.state));
  for (const [id, scene] of Object.entries(docs.scenes)) {
    collect(`scenes/${id}.json`, validateDocument('scene', scene));
  }

  if (errors.length > 0) return { valid: false, errors };

  // Cross-reference checks (only meaningful once documents are shape-valid).
  const story = /** @type {any} */ (docs.story);
  const assetIndex = /** @type {any} */ (docs.assetIndex);
  const state = /** @type {any} */ (docs.state);

  const allSceneEntries = story.scenes.flatMap((s) => [s, ...(s.viewpoints ?? [])]);
  const sceneIds = new Set(allSceneEntries.map((s) => s.id));
  const nodeIds = new Set(story.scenes.map((s) => s.id));
  const assets = new Map(assetIndex.assets.map((a) => [a.id, a]));
  const stateKeys = new Set([
    ...Object.keys(state.flags ?? {}),
    ...Object.keys(state.counters ?? {}),
  ]);

  const err = (path, message) => errors.push({ path, message });
  const checkStateKey = (path, key) => {
    if (!stateKeys.has(key)) err(path, `unknown state key "${key}"`);
  };

  if (allSceneEntries.length !== sceneIds.size) err('story.json/scenes', 'duplicate scene ids');
  if (assetIndex.assets.length !== assets.size) err('assets/index.json/assets', 'duplicate asset ids');
  if (!nodeIds.has(story.start)) err('story.json/start', `unknown scene "${story.start}"`);
  for (const [i, s] of story.scenes.entries()) {
    // next/branches must point at story nodes (not viewpoint variants).
    if (s.next != null && !nodeIds.has(s.next))
      err(`story.json/scenes/${i}/next`, `unknown scene "${s.next}"`);
    for (const [j, branch] of (s.branches ?? []).entries()) {
      if (!nodeIds.has(branch.next))
        err(`story.json/scenes/${i}/branches/${j}/next`, `unknown scene "${branch.next}"`);
      checkStateKey(`story.json/scenes/${i}/branches/${j}/when/key`, branch.when.key);
    }
    for (const entry of [s, ...(s.viewpoints ?? [])]) {
      if (!(entry.id in docs.scenes))
        err(`story.json/scenes/${i}`, `scene file for "${entry.id}" not provided`);
    }
  }
  for (const a of assetIndex.assets) {
    if ((a.kind === 'gltf' || a.kind === 'audio') && !a.source)
      err(`assets/index.json/${a.id}`, `kind "${a.kind}" requires "source"`);
    if (a.kind === 'primitive' && !a.primitive)
      err(`assets/index.json/${a.id}`, 'kind "primitive" requires "primitive"');
  }
  const checkAudioRef = (path, id) => {
    if (!assets.has(id)) err(path, `unknown asset "${id}"`);
    else if (assets.get(id).kind !== 'audio') err(path, `asset "${id}" is not an audio asset`);
  };

  for (const [id, sceneDoc] of Object.entries(docs.scenes)) {
    const scene = /** @type {any} */ (sceneDoc);
    const file = `scenes/${id}.json`;
    if (scene.id !== id) err(`${file}/id`, `scene id "${scene.id}" does not match story entry "${id}"`);
    if (!assets.has(scene.stage.assetId))
      err(`${file}/stage/assetId`, `unknown asset "${scene.stage.assetId}"`);
    if (scene.audio?.bgm) checkAudioRef(`${file}/audio/bgm`, scene.audio.bgm);
    if (scene.audio?.ambient) checkAudioRef(`${file}/audio/ambient`, scene.audio.ambient);
    const effectIds = new Set((scene.effects ?? []).map((e) => e.id));
    if ((scene.effects ?? []).length !== effectIds.size)
      err(`${file}/effects`, 'duplicate effect ids');
    const actorIds = new Set();
    for (const [i, actor] of (scene.actors ?? []).entries()) {
      if (actorIds.has(actor.id)) err(`${file}/actors/${i}/id`, `duplicate actor id "${actor.id}"`);
      actorIds.add(actor.id);
      if (!assets.has(actor.assetId))
        err(`${file}/actors/${i}/assetId`, `unknown asset "${actor.assetId}"`);
      if (actor.visibleWhen) checkStateKey(`${file}/actors/${i}/visibleWhen/key`, actor.visibleWhen.key);
    }
    for (const [i, event] of (scene.events ?? []).entries()) {
      const at = `${file}/events/${i}`;
      if (event.trigger.type === 'tap' && event.trigger.target && !actorIds.has(event.trigger.target))
        err(`${at}/trigger/target`, `unknown actor "${event.trigger.target}"`);
      if (event.trigger.type === 'state') checkStateKey(`${at}/trigger/key`, event.trigger.key);
      if (event.when) checkStateKey(`${at}/when/key`, event.when.key);
      for (const [j, action] of event.actions.entries()) {
        if (action.type === 'playAnimation' && !actorIds.has(action.target))
          err(`${at}/actions/${j}/target`, `unknown actor "${action.target}"`);
        if (action.type === 'setVisible' && !actorIds.has(action.target))
          err(`${at}/actions/${j}/target`, `unknown actor "${action.target}"`);
        if (action.type === 'gotoScene' && !nodeIds.has(action.scene))
          err(`${at}/actions/${j}/scene`, `unknown scene "${action.scene}"`);
        if (action.type === 'setState' && !stateKeys.has(action.key))
          err(`${at}/actions/${j}/key`, `unknown state key "${action.key}"`);
        if (action.type === 'playSound') checkAudioRef(`${at}/actions/${j}/asset`, action.asset);
        if (action.type === 'setEffect' && !effectIds.has(action.target))
          err(`${at}/actions/${j}/target`, `unknown effect "${action.target}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
