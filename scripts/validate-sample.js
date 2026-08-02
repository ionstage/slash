/**
 * Validates sample-project/ against the content schemas, including
 * cross-reference checks. Exits non-zero on any error.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateProject } from '@slash/schema';

const root = fileURLToPath(new URL('../sample-project/', import.meta.url));
const json = async (path) => JSON.parse(await readFile(root + path, 'utf8'));

const world = await json('world.json');

const result = validateProject({
  project: await json('project.json'),
  world,
  assetIndex: await json('assets/index.json'),
});

if (result.valid) {
  const objects = (world.objects ?? []).length;
  const actors = (world.actors ?? []).length;
  console.log(`sample-project OK (${world.layers.length} layers, ${objects} objects, ${actors} actors)`);
} else {
  console.error(`sample-project has ${result.errors.length} error(s):`);
  for (const e of result.errors) console.error(`  ${e.path}: ${e.message}`);
  process.exit(1);
}
