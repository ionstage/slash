import { el, replaceChildren } from './dom.js';

/**
 * Left panel: scene list, active-scene object list, asset registry with
 * drag-and-drop glTF import.
 */
export function createHierarchy(elements, store, { toast }) {
  const { sceneList, objectList, assetList, dropZone, stateList, stateAdd } = elements;

  function renderScenes() {
    if (!store.docs) return replaceChildren(sceneList, []);
    const rows = [];
    for (const entry of store.docs.story.scenes) {
      rows.push(
        el(
          'div.row' + (entry.id === store.activeSceneId ? '.active' : ''),
          { onclick: () => store.setActiveScene(entry.id) },
          [
            el('span.grow', {}, store.docs.scenes[entry.id]?.name ?? entry.id),
            el('button.mini', {
              textContent: '⇄',
              title: 'Add viewpoint variant',
              onclick: (e) => {
                e.stopPropagation();
                store.addViewpoint(entry.id);
              },
            }),
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
      );
      for (const vp of entry.viewpoints ?? []) {
        rows.push(
          el(
            'div.row.indent' + (vp.id === store.activeSceneId ? '.active' : ''),
            { onclick: () => store.setActiveScene(vp.id) },
            [
              el('span.tag', {}, '⇄'),
              el('span.grow', {}, store.docs.scenes[vp.id]?.name ?? vp.id),
              el('button.mini', {
                textContent: '×',
                title: 'Delete viewpoint',
                onclick: (e) => {
                  e.stopPropagation();
                  store.removeViewpoint(entry.id, vp.id);
                },
              }),
            ],
          ),
        );
      }
    }
    replaceChildren(sceneList, rows);
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
          el('span.grow', { title: asset.kind === 'primitive' ? asset.primitive.shape : asset.source },
            asset.name ?? asset.id),
          asset.kind !== 'audio'
            ? el('button.mini', {
                textContent: '+',
                title: 'Place in scene',
                onclick: () => store.addActor(asset.id),
              })
            : null,
        ]),
      ),
    );
  }

  function renderState() {
    if (!store.docs) return replaceChildren(stateList, []);
    const state = store.docs.state;
    const rows = [];
    for (const [group, keys] of [
      ['flags', state.flags ?? {}],
      ['counters', state.counters ?? {}],
    ]) {
      for (const [key, def] of Object.entries(keys)) {
        rows.push(
          el('div.row', {}, [
            el('span.grow.mono', {}, key),
            group === 'flags'
              ? el('input', {
                  type: 'checkbox',
                  checked: def.initial,
                  title: 'Initial value',
                  onchange: (e) => {
                    def.initial = e.target.checked;
                    store.touch('project', { source: 'state-panel' });
                  },
                })
              : el('input', {
                  type: 'number',
                  value: def.initial,
                  title: 'Initial value',
                  style: 'width: 52px',
                  onchange: (e) => {
                    def.initial = Number(e.target.value);
                    store.touch('project', { source: 'state-panel' });
                  },
                }),
            el('button.mini', {
              textContent: '×',
              onclick: () => {
                delete state[group][key];
                store.touch('project');
              },
            }),
          ]),
        );
      }
    }
    replaceChildren(stateList, rows);
  }

  // State key creation: name input + flag/counter buttons.
  const nameInput = stateAdd.querySelector('input');
  const addKey = (group, initial) => {
    const key = nameInput.value.trim();
    if (!/^[a-z][a-zA-Z0-9_-]*$/.test(key)) return toast('State keys: lowercase start, e.g. "rangBell"');
    const state = store.docs.state;
    (state[group] ??= {})[key] = { initial };
    nameInput.value = '';
    store.touch('project');
  };
  stateAdd.querySelector('.add-flag').addEventListener('click', () => addKey('flags', false));
  stateAdd.querySelector('.add-counter').addEventListener('click', () => addKey('counters', 0));

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

  store.subscribe((type, meta) => {
    if (type === 'project') {
      renderScenes();
      renderObjects();
      renderAssets();
      if (meta.source !== 'state-panel') renderState();
    } else if (type === 'scene' || type === 'selection') {
      renderScenes();
      renderObjects();
    } else if (type === 'assets') {
      renderAssets();
    }
  });
}
