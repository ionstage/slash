import { validateProject, migrateWorld } from '@slash/schema';

/**
 * Load and validate a whole project from a base URL (a directory containing
 * project.json, world.json, assets/).
 *
 * @param {string} [baseUrl]
 * @returns {Promise<{
 *   baseUrl: string,
 *   project: any, world: any, assetIndex: any,
 * }>}
 */
export async function loadProject(baseUrl = '/') {
  const json = async (path) => {
    const url = baseUrl + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    return res.json();
  };

  const [rawWorld, project, assetIndex] = await Promise.all([
    json('world.json'),
    json('project.json'),
    json('assets/index.json'),
  ]);

  const world = migrateWorld(rawWorld);

  const result = validateProject({ project, world, assetIndex });
  if (!result.valid) throw invalidError('project', result.errors);

  return { baseUrl, project, world, assetIndex };
}

function invalidError(what, errors) {
  const lines = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
  return new Error(`Invalid ${what}:\n${lines}`);
}
