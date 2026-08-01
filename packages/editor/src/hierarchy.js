import { el, replaceChildren } from './dom.js';

/**
 * Left panel: scene list, active-scene object list, asset registry with
 * drag-and-drop glTF import.
 */
export function createHierarchy(elements, store, { toast }) {
  const { sceneList, objectList, assetList, dropZone } = elements;

  function renderScenes() {
    if (!store.docs) return replaceChildren(sceneList, []);
    replaceChildren(
      sceneList,
      store.docs.story.scenes.map((entry) =>
        el(
          'div.row' + (entry.id === store.activeSceneId ? '.active' : ''),
          { onclick: () => store.setActiveScene(entry.id) },
          [
            el('span.grow', {}, store.docs.scenes[entry.id]?.name ?? entry.id),
            store.docs.story.scenes.length > 1
              ? el('button.mini', {
                  textContent: '×',
                  title: 'Delete scene',
                  onclick: (e) => {
                    e.stopPropagation();
                    store.removeScene(entry.id);
                  },
                })
              : null,
          ],
        ),
      ),
    );
  }

  function renderObjects() {
    const scene = store.activeScene();
    if (!scene) return replaceChildren(objectList, []);
    const stageRow = el(
      'div.row' + (store.selection?.kind === 'stage' ? '.active' : ''),
      { onclick: () => store.select({ kind: 'stage' }) },
      [el('span.tag', {}, 'stage'), el('span.grow', {}, scene.stage.assetId)],
    );
    const actorRows = (scene.actors ?? []).map((actor) =>
      el(
        'div.row' +
          (store.selection?.kind === 'actor' && store.selection.id === actor.id ? '.active' : ''),
        { onclick: () => store.select({ kind: 'actor', id: actor.id }) },
        [
          el('span.grow', {}, actor.id),
          el('button.mini', {
            textContent: '×',
            title: 'Remove from scene',
            onclick: (e) => {
              e.stopPropagation();
              store.removeActor(actor.id);
            },
          }),
        ],
      ),
    );
    replaceChildren(objectList, [stageRow, ...actorRows]);
  }

  function renderAssets() {
    if (!store.docs) return replaceChildren(assetList, []);
    replaceChildren(
      assetList,
      store.docs.assetIndex.assets.map((asset) =>
        el('div.row', {}, [
          el('span.tag', {}, asset.type),
          el('span.grow', { title: asset.kind === 'gltf' ? asset.source : asset.primitive.shape },
            asset.name ?? asset.id),
          el('button.mini', {
            textContent: '+',
            title: 'Place in scene',
            onclick: () => store.addActor(asset.id),
          }),
        ]),
      ),
    );
  }

  // glTF import by drag & drop.
  for (const type of ['dragover', 'dragleave', 'drop']) {
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.classList.toggle('over', type === 'dragover');
    });
  }
  dropZone.addEventListener('drop', (e) => {
    if (!store.docs) return toast('Open a project first');
    for (const file of e.dataTransfer.files) {
      if (!/\.(glb|gltf)$/i.test(file.name)) {
        toast(`Skipped ${file.name}: only .glb/.gltf`);
        continue;
      }
      const id = store.addAssetFile(file.name, file);
      toast(`Imported ${file.name} as "${id}"`);
    }
  });

  store.subscribe((type) => {
    if (type === 'project') {
      renderScenes();
      renderObjects();
      renderAssets();
    } else if (type === 'scene' || type === 'selection') {
      renderScenes();
      renderObjects();
    } else if (type === 'assets') {
      renderAssets();
    }
  });
}
