import { validateProject, migrateScenes, migrateStory } from '@slash/schema';

/**
 * The editor's central state: the five content documents, binary asset
 * files, selection, active scene and dirty tracking. Panels mutate the
 * documents directly, then call `touch()` so every other panel re-renders.
 *
 * Event types emitted to subscribers:
 *  - 'project'   structural change (open/new, scene added/switched) — rebuild everything
 *  - 'scene'     active scene content changed (transforms, tracks, events)
 *  - 'assets'    asset index or files changed
 *  - 'selection' selected object changed
 * meta.source identifies the origin so a panel can skip reacting to its
 * own writes (e.g. the viewport ignores gizmo-originated 'scene' events).
 */
export function createProjectStore() {
  const listeners = new Set();

  const store = {
    docs: null,
    /** @type {Map<string, Blob>} binary files keyed by assets/-relative path (e.g. "models/x.glb") */
    files: new Map(),
    dirHandle: null,
    dirty: false,
    activeSceneId: null,
    /** @type {{kind: 'actor'|'stage', id?: string} | null} */
    selection: null,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(type, meta = {}) {
      for (const fn of listeners) fn(type, meta);
    },
    touch(type = 'scene', meta = {}) {
      this.dirty = true;
      this.emit(type, meta);
    },

    loadBundle({ project, story, scenes, assetIndex, state }, files = new Map(), dirHandle = null) {
      // Upgrade older documents (v1 camera tracks, missing edge transitions).
      this.docs = { project, story: migrateStory(story), scenes: migrateScenes(scenes), assetIndex, state };
      this.files = files;
      this.dirHandle = dirHandle;
      this.dirty = false;
      this.activeSceneId = story.start;
      this.selection = null;
      this.emit('project');
    },

    newProject() {
      this.loadBundle(defaultProject());
      this.dirty = true;
    },

    activeScene() {
      return this.docs?.scenes[this.activeSceneId] ?? null;
    },
    setActiveScene(id) {
      this.activeSceneId = id;
      this.selection = null;
      this.emit('project');
    },
    select(selection) {
      this.selection = selection;
      this.emit('selection');
    },

    /** The scene-schema id pattern all generated ids must satisfy. */
    addScene() {
      const { story, scenes } = this.docs;
      const id = uniqueId('scene', new Set(story.scenes.map((s) => s.id)));
      const stageAsset =
        this.docs.assetIndex.assets.find((a) => a.type === 'stage') ??
        this.docs.assetIndex.assets[0];
      scenes[id] = defaultScene(id, stageAsset.id);
      if (story.scenes.length > 0) story.scenes[story.scenes.length - 1].next = id;
      story.scenes.push({ id, path: `scenes/${id}.json`, next: null });
      this.touch('project');
      this.setActiveScene(id);
    },

    removeScene(id) {
      const { story, scenes } = this.docs;
      if (story.scenes.length <= 1) return;
      const idx = story.scenes.findIndex((s) => s.id === id);
      const removed = story.scenes[idx];
      story.scenes.splice(idx, 1);
      for (const entry of story.scenes) {
        if (entry.next === id) entry.next = removed.next === id ? null : removed.next;
        entry.branches = entry.branches?.filter((b) => b.next !== id);
        if (entry.branches?.length === 0) delete entry.branches;
      }
      if (story.start === id) story.start = story.scenes[0].id;
      delete scenes[id];
      for (const vp of removed.viewpoints ?? []) delete scenes[vp.id];
      if (!(this.activeSceneId in scenes)) this.activeSceneId = story.start;
      this.selection = null;
      this.touch('project');
    },

    /** Add a horizontal viewpoint variant to a story node, seeded from its base scene. */
    addViewpoint(nodeId) {
      const { story, scenes } = this.docs;
      const node = story.scenes.find((s) => s.id === nodeId);
      if (!node) return;
      const taken = new Set(Object.keys(scenes));
      const id = uniqueId(`${nodeId}-view`, taken);
      const copy = JSON.parse(JSON.stringify(scenes[nodeId]));
      copy.id = id;
      copy.name = `${scenes[nodeId].name ?? nodeId} (viewpoint)`;
      scenes[id] = copy;
      (node.viewpoints ??= []).push({ id, path: `scenes/${id}.json` });
      this.touch('project');
      this.setActiveScene(id);
    },

    removeViewpoint(nodeId, vpId) {
      const { story, scenes } = this.docs;
      const node = story.scenes.find((s) => s.id === nodeId);
      if (!node) return;
      node.viewpoints = (node.viewpoints ?? []).filter((v) => v.id !== vpId);
      if (node.viewpoints.length === 0) delete node.viewpoints;
      delete scenes[vpId];
      if (this.activeSceneId === vpId) this.activeSceneId = nodeId;
      this.selection = null;
      this.touch('project');
    },

    stateKeys() {
      return [
        ...Object.keys(this.docs.state.flags ?? {}),
        ...Object.keys(this.docs.state.counters ?? {}),
      ];
    },

    addActor(assetId) {
      const scene = this.activeScene();
      scene.actors ??= [];
      const id = uniqueId(assetId, new Set(scene.actors.map((a) => a.id)));
      scene.actors.push({ id, assetId, transform: { position: [0, 0, 0] } });
      this.touch('scene');
      this.select({ kind: 'actor', id });
    },

    removeActor(id) {
      const scene = this.activeScene();
      scene.actors = (scene.actors ?? []).filter((a) => a.id !== id);
      if (this.selection?.kind === 'actor' && this.selection.id === id) this.selection = null;
      this.touch('scene');
      this.emit('selection');
    },

    actor(id) {
      return (this.activeScene()?.actors ?? []).find((a) => a.id === id);
    },

    /** Register a dropped model file as a new gltf asset. */
    addAssetFile(fileName, blob) {
      const source = `models/${fileName}`;
      this.files.set(source, blob);
      const taken = new Set(this.docs.assetIndex.assets.map((a) => a.id));
      const id = uniqueId(slugify(fileName.replace(/\.(glb|gltf)$/i, '')), taken);
      this.docs.assetIndex.assets.push({ id, name: fileName, type: 'prop', kind: 'gltf', source });
      this.touch('assets');
      return id;
    },

    validate() {
      return validateProject(this.docs);
    },
  };

  return store;
}

export function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(slug) ? slug : `m-${slug || 'model'}`;
}

function defaultScene(id, stageAssetId) {
  return {
    formatVersion: 2,
    id,
    name: id,
    scrollLength: 3,
    stage: { assetId: stageAssetId },
    actors: [],
    camera: {
      viewpoint: { position: [0, 2, 6], target: [0, 1, 0], fov: 50 },
    },
    events: [],
  };
}

function defaultProject() {
  return {
    project: {
      formatVersion: 1,
      id: 'untitled',
      title: 'Untitled Story',
      renderStyle: { style: 'toon', background: '#1a1a2e' },
      settings: { maxPixelRatio: 2 },
    },
    story: {
      formatVersion: 2,
      start: 'scene',
      scenes: [{ id: 'scene', path: 'scenes/scene.json', next: null }],
    },
    scenes: { scene: defaultScene('scene', 'ground') },
    assetIndex: {
      formatVersion: 1,
      assets: [
        {
          id: 'ground',
          name: 'Ground',
          type: 'stage',
          kind: 'primitive',
          primitive: { shape: 'plane', size: [30, 1, 30], color: '#3a5a40' },
        },
        {
          id: 'figure',
          name: 'Figure',
          type: 'character',
          kind: 'primitive',
          primitive: { shape: 'capsule', size: [0.6, 1.7, 0.6], color: '#e8b04b' },
        },
      ],
    },
    state: { formatVersion: 1 },
  };
}
