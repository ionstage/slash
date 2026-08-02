import { validateDocument, validateProject, migrateScenes, migrateStory } from '@slash/schema';

/**
 * Load and validate a whole project from a base URL (a directory containing
 * project.json, story.json, scenes/, assets/).
 *
 * @param {string} [baseUrl]
 * @returns {Promise<{
 *   baseUrl: string,
 *   project: any, story: any, scenes: Record<string, any>,
 *   assetIndex: any,
 * }>}
 */
export async function loadProject(baseUrl = '/') {
  const json = async (path) => {
    const url = baseUrl + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    return res.json();
  };

  const [rawStory, project, assetIndex] = await Promise.all([
    json('story.json'),
    json('project.json'),
    json('assets/index.json'),
  ]);

  // Upgrade the story before validating — scene fetching walks its entries.
  const story = migrateStory(rawStory);
  const storyCheck = validateDocument('story', story);
  if (!storyCheck.valid) throw invalidError('story.json', storyCheck.errors);

  const rawScenes = {};
  await Promise.all(
    story.scenes.map(async (entry) => {
      rawScenes[entry.id] = await json(entry.path);
    }),
  );
  // Upgrade older scene documents (e.g. v1 camera tracks) before validating.
  const scenes = migrateScenes(rawScenes);

  const result = validateProject({ project, story, scenes, assetIndex });
  if (!result.valid) throw invalidError('project', result.errors);

  return { baseUrl, project, story, scenes, assetIndex };
}

function invalidError(what, errors) {
  const lines = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
  return new Error(`Invalid ${what}:\n${lines}`);
}
