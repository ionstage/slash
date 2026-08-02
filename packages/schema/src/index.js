import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import worldSchema from '../schemas/world.schema.json' with { type: 'json' };
import assetIndexSchema from '../schemas/asset-index.schema.json' with { type: 'json' };
import { validate } from './validator.js';

export { validate };
export { migrateWorld } from './migrate.js';

/** All content schemas, keyed by document kind. */
export const schemas = {
  project: projectSchema,
  world: worldSchema,
  assetIndex: assetIndexSchema,
};

export const FORMAT_VERSION = 3;

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
 * cross-references (world → layers, world → assets).
 *
 * @param {{
 *   project: unknown,
 *   world: unknown,
 *   assetIndex: unknown,
 * }} docs
 * @returns {{ valid: boolean, errors: ValidationError[] }} errors have paths
 *   prefixed with the document name, e.g. "world.json/objects/0".
 */
export function validateProject(docs) {
  /** @type {ValidationError[]} */
  const errors = [];

  const collect = (file, result) => {
    for (const e of result.errors) errors.push({ path: `${file}${e.path}`, message: e.message });
  };

  collect('project.json', validateDocument('project', docs.project));
  collect('world.json', validateDocument('world', docs.world));
  collect('assets/index.json', validateDocument('assetIndex', docs.assetIndex));

  if (errors.length > 0) return { valid: false, errors };

  // Cross-reference checks (only meaningful once documents are shape-valid).
  const world = /** @type {any} */ (docs.world);
  const assetIndex = /** @type {any} */ (docs.assetIndex);

  const assets = new Map(assetIndex.assets.map((a) => [a.id, a]));
  const layerIds = new Set(world.layers.map((l) => l.id));

  const err = (path, message) => errors.push({ path, message });

  if (world.layers.length !== layerIds.size) err('world.json/layers', 'duplicate layer ids');
  if (assetIndex.assets.length !== assets.size)
    err('assets/index.json/assets', 'duplicate asset ids');

  const objectIds = new Set();
  for (const [i, obj] of (world.objects ?? []).entries()) {
    if (objectIds.has(obj.id)) err(`world.json/objects/${i}/id`, `duplicate object id "${obj.id}"`);
    objectIds.add(obj.id);
    if (!layerIds.has(obj.layer))
      err(`world.json/objects/${i}/layer`, `unknown layer "${obj.layer}"`);
    if (!assets.has(obj.assetId))
      err(`world.json/objects/${i}/assetId`, `unknown asset "${obj.assetId}"`);
  }

  const actorIds = new Set();
  for (const [i, actor] of (world.actors ?? []).entries()) {
    if (actorIds.has(actor.id)) err(`world.json/actors/${i}/id`, `duplicate actor id "${actor.id}"`);
    actorIds.add(actor.id);
    if (!assets.has(actor.assetId))
      err(`world.json/actors/${i}/assetId`, `unknown asset "${actor.assetId}"`);
  }

  const env = world.environment ?? {};
  const effectIds = new Set((env.effects ?? []).map((e) => e.id));
  if ((env.effects ?? []).length !== effectIds.size)
    err('world.json/environment/effects', 'duplicate effect ids');
  const lightIds = new Set((env.lights ?? []).map((l) => l.id));
  if ((env.lights ?? []).length !== lightIds.size)
    err('world.json/environment/lights', 'duplicate light ids');

  for (const a of assetIndex.assets) {
    if (a.kind === 'gltf' && !a.source)
      err(`assets/index.json/${a.id}`, 'kind "gltf" requires "source"');
    if (a.kind === 'primitive' && !a.primitive)
      err(`assets/index.json/${a.id}`, 'kind "primitive" requires "primitive"');
  }

  return { valid: errors.length === 0, errors };
}
