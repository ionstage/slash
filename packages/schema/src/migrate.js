/**
 * Content-format migrations. Old projects are upgraded to the current format
 * on load, so the runtime and validator only ever deal with the latest shape.
 * Migrations are pure and return new objects.
 *
 * The content model was reshaped to a single continuous vertical world
 * (`world.json`, formatVersion 3); the earlier scene/story chain is not
 * forward-migrated. `migrateWorld` is the hook for future world upgrades.
 */

/**
 * Upgrade a world document to the current format version. A no-op for worlds
 * already at the current version — the seam for future migrations.
 * @param {any} world
 * @returns {any}
 */
export function migrateWorld(world) {
  return world;
}
