/**
 * Validates sample-project/ against the content schemas, including
 * cross-reference checks. Exits non-zero on any error.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateProject } from '@slash/schema';

const root = fileURLToPath(new URL('../sample-project/', import.meta.url));
const json = async (path) => JSON.parse(await readFile(root + path, 'utf8'));

const story = await json('story.json');
const scenes = {};
for (const node of story.scenes ?? []) {
  for (const entry of [node, ...(node.viewpoints ?? [])]) {
    scenes[entry.id] = await json(entry.path);
  }
}

const result = validateProject({
  project: await json('project.json'),
  story,
  scenes,
  assetIndex: await json('assets/index.json'),
  state: await json('state.json'),
});

if (result.valid) {
  console.log(`sample-project OK (${Object.keys(scenes).length} scenes)`);
} else {
  console.error(`sample-project has ${result.errors.length} error(s):`);
  for (const e of result.errors) console.error(`  ${e.path}: ${e.message}`);
  process.exit(1);
}
