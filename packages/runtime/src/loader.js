import { validateDocument, validateProject, migrateScenes } from '@slash/schema';

/**
 * Load and validate a whole project from a base URL (a directory containing
 * project.json, story.json, scenes/, assets/, state.json).
 *
 * @param {string} [baseUrl]
 * @returns {Promise<{
 *   baseUrl: string,
 *   project: any, story: any, scenes: Record<string, any>,
 *   assetIndex: any, state: any,
 * }>}
 */
export async function loadProject(baseUrl = '/') {
  const json = async (path) => {
    const url = baseUrl + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    return res.json();
  };

  const [project, story, assetIndex, state] = await Promise.all([
    json('project.json'),
    json('story.json'),
    json('assets/index.json'),
    json('state.json'),
  ]);

  // Validate the story alone first: scene fetching walks its entries.
  const storyCheck = validateDocument('story', story);
  if (!storyCheck.valid) throw invalidError('story.json', storyCheck.errors);

  const rawScenes = {};
  await Promise.all(
    story.scenes
      .flatMap((entry) => [entry, ...(entry.viewpoints ?? [])])
      .map(async (entry) => {
        rawScenes[entry.id] = await json(entry.path);
      }),
  );
  // Upgrade older scene documents (e.g. v1 camera tracks) before validating.
  const scenes = migrateScenes(rawScenes);

  const result = validateProject({ project, story, scenes, assetIndex, state });
  if (!result.valid) throw invalidError('project', result.errors);

  return { baseUrl, project, story, scenes, assetIndex, state };
}

function invalidError(what, errors) {
  const lines = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
  return new Error(`Invalid ${what}:\n${lines}`);
}
