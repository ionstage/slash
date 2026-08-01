import { el, replaceChildren } from './dom.js';
import { uniqueId } from './project-store.js';
import { upsertKey } from './track-edit.js';

/**
 * Right panel. Context-sensitive: an actor or the stage when selected,
 * otherwise scene settings, camera keys and the event editor. Rerenders
 * wholesale on store changes — cheap at editor scale and keeps the code
 * declarative.
 */
export function createInspector(container, store, viewport) {
  function render() {
    if (!store.docs) return replaceChildren(container, el('p.placeholder', {}, 'Open a project.'));
    const scene = store.activeScene();
    if (store.selection?.kind === 'actor') {
      const actor = store.actor(store.selection.id);
      if (actor) return replaceChildren(container, renderActor(actor));
    }
    if (store.selection?.kind === 'stage') {
      return replaceChildren(container, renderStage(scene));
    }
    replaceChildren(container, renderScene(scene));
  }

  const touchScene = () => store.touch('scene', { source: 'inspector' });

  function renderActor(actor) {
    const transform = (actor.transform ??= {});
    return el('div', {}, [
      el('h2', {}, `Actor: ${actor.id}`),
      assetSelect(actor),
      transformFields(transform, touchScene),
      el('h3', {}, 'Position track'),
      el('div.row', {}, [
        el('button', {
          textContent: `Set position key @ ${viewport.progress.toFixed(2)}`,
          onclick: () => {
            const tracks = (actor.tracks ??= {});
            const object = [...(transform.position ?? [0, 0, 0])];
            upsertKey((tracks.position ??= []), viewport.progress, object);
            touchScene();
          },
        }),
      ]),
      keyList(actor.tracks?.position, () => {
        if (actor.tracks.position.length === 0) delete actor.tracks.position;
        touchScene();
      }),
    ]);
  }

  function renderStage(scene) {
    const transform = (scene.stage.transform ??= {});
    return el('div', {}, [
      el('h2', {}, 'Stage'),
      el('label.field', {}, [
        'Asset',
        el(
          'select',
          {
            value: scene.stage.assetId,
            onchange: (e) => {
              scene.stage.assetId = e.target.value;
              touchScene();
            },
          },
          store.docs.assetIndex.assets
            .filter((a) => a.type === 'stage' || a.id === scene.stage.assetId)
            .map((a) =>
              el('option', { value: a.id, selected: a.id === scene.stage.assetId }, a.name ?? a.id),
            ),
        ),
      ]),
      transformFields(transform, touchScene),
    ]);
  }

  function renderScene(scene) {
    return el('div', {}, [
      el('h2', {}, `Scene: ${scene.id}`),
      textField('Name', scene.name ?? '', (v) => {
        scene.name = v;
        touchScene();
      }),
      numberField('Scroll length (viewports)', scene.scrollLength ?? 3, (v) => {
        scene.scrollLength = v;
        touchScene();
      }),
      numberField('Camera FOV', scene.camera.fov ?? 50, (v) => {
        scene.camera.fov = v;
        touchScene();
      }),
      el('h3', {}, 'Camera keys'),
      el('p.placeholder', {}, 'Set keys from the timeline bar below.'),
      keyList(scene.camera.tracks.position, touchScene, (i) => {
        // Keep position and lookAt keys paired when deleting.
        scene.camera.tracks.lookAt.splice(i, 1);
      }),
      el('h3', {}, 'Events'),
      ...renderEvents(scene),
    ]);
  }

  function assetSelect(actor) {
    return el('label.field', {}, [
      'Asset',
      el(
        'select',
        {
          onchange: (e) => {
            actor.assetId = e.target.value;
            touchScene();
          },
        },
        store.docs.assetIndex.assets.map((a) =>
          el('option', { value: a.id, selected: a.id === actor.assetId }, a.name ?? a.id),
        ),
      ),
    ]);
  }

  function transformFields(transform, onChange) {
    const scaleArr = Array.isArray(transform.scale)
      ? transform.scale
      : [transform.scale ?? 1, transform.scale ?? 1, transform.scale ?? 1];
    return el('div', {}, [
      vecField('Position', transform.position ?? [0, 0, 0], (v) => {
        transform.position = v;
        onChange();
      }),
      vecField('Rotation °', transform.rotation ?? [0, 0, 0], (v) => {
        transform.rotation = v;
        onChange();
      }),
      vecField('Scale', scaleArr, (v) => {
        transform.scale = v[0] === v[1] && v[1] === v[2] ? v[0] : v;
        onChange();
      }),
    ]);
  }

  function renderEvents(scene) {
    const events = (scene.events ??= []);
    const actorIds = (scene.actors ?? []).map((a) => a.id);
    const sceneIds = store.docs.story.scenes.map((s) => s.id);

    const rows = events.map((event, i) =>
      el('div.event-card', {}, [
        el('div.row', {}, [
          el('span.grow.mono', {}, event.id),
          el('button.mini', {
            textContent: '×',
            onclick: () => {
              events.splice(i, 1);
              touchScene();
            },
          }),
        ]),
        el('div.row', {}, [
          el(
            'select',
            {
              onchange: (e) => {
                event.trigger =
                  e.target.value === 'progress'
                    ? { type: 'progress', at: 0.5 }
                    : { type: 'tap' };
                touchScene();
              },
            },
            ['progress', 'tap'].map((t) =>
              el('option', { value: t, selected: event.trigger.type === t }, `on ${t}`),
            ),
          ),
          event.trigger.type === 'progress'
            ? el('input', {
                type: 'number', step: '0.05', min: '0', max: '1',
                value: event.trigger.at,
                onchange: (e) => {
                  event.trigger.at = Number(e.target.value);
                  touchScene();
                },
              })
            : el(
                'select',
                {
                  onchange: (e) => {
                    if (e.target.value) event.trigger.target = e.target.value;
                    else delete event.trigger.target;
                    touchScene();
                  },
                },
                [
                  el('option', { value: '', selected: !event.trigger.target }, 'anywhere'),
                  ...actorIds.map((id) =>
                    el('option', { value: id, selected: event.trigger.target === id }, `on ${id}`),
                  ),
                ],
              ),
        ]),
        ...event.actions.map((action, j) => actionRow(event, action, j, actorIds, sceneIds)),
        el('button.mini-wide', {
          textContent: '+ action',
          onclick: () => {
            event.actions.push({ type: 'log', message: 'Hello' });
            touchScene();
          },
        }),
      ]),
    );

    return [
      ...rows,
      el('button.mini-wide', {
        textContent: '+ event',
        onclick: () => {
          events.push({
            id: uniqueId('event', new Set(events.map((e) => e.id))),
            trigger: { type: 'progress', at: 0.5 },
            actions: [{ type: 'log', message: 'Hello' }],
          });
          touchScene();
        },
      }),
    ];
  }

  function actionRow(event, action, j, actorIds, sceneIds) {
    const defaults = {
      log: { type: 'log', message: 'Hello' },
      setState: { type: 'setState', key: '', value: true },
      gotoScene: { type: 'gotoScene', scene: sceneIds[0] },
      playAnimation: { type: 'playAnimation', target: actorIds[0] ?? '', clip: '' },
    };
    const fields = {
      log: [textInput(action, 'message')],
      setState: [textInput(action, 'key'), jsonInput(action, 'value')],
      gotoScene: [idSelect(action, 'scene', sceneIds)],
      playAnimation: [idSelect(action, 'target', actorIds), textInput(action, 'clip')],
    };
    return el('div.row.action-row', {}, [
      el(
        'select',
        {
          onchange: (e) => {
            event.actions[j] = defaults[e.target.value];
            touchScene();
          },
        },
        Object.keys(defaults).map((t) =>
          el('option', { value: t, selected: action.type === t }, t),
        ),
      ),
      ...fields[action.type],
      el('button.mini', {
        textContent: '×',
        onclick: () => {
          event.actions.splice(j, 1);
          if (event.actions.length === 0) event.actions.push(defaults.log);
          touchScene();
        },
      }),
    ]);
  }

  function textInput(target, key) {
    return el('input.grow', {
      value: target[key] ?? '',
      placeholder: key,
      onchange: (e) => {
        target[key] = e.target.value;
        touchScene();
      },
    });
  }

  function jsonInput(target, key) {
    return el('input', {
      value: JSON.stringify(target[key]),
      title: 'true / false / number / "text"',
      onchange: (e) => {
        try {
          target[key] = JSON.parse(e.target.value);
        } catch {
          target[key] = e.target.value;
        }
        touchScene();
      },
    });
  }

  function idSelect(target, key, ids) {
    return el(
      'select',
      {
        onchange: (e) => {
          target[key] = e.target.value;
          touchScene();
        },
      },
      ids.map((id) => el('option', { value: id, selected: target[key] === id }, id)),
    );
  }

  function keyList(track, onChange, alsoDelete) {
    if (!track?.length) return el('p.placeholder', {}, 'No keys.');
    return el('div', {},
      track.map((key, i) =>
        el('div.row.mono', {}, [
          el('span.grow', {}, `t=${key.t}  [${key.value.map((v) => (+v).toFixed(1)).join(', ')}]`),
          el('button.mini', {
            textContent: '×',
            onclick: () => {
              track.splice(i, 1);
              alsoDelete?.(i);
              onChange();
            },
          }),
        ]),
      ),
    );
  }

  function textField(label, value, onChange) {
    return el('label.field', {}, [
      label,
      el('input', { value, onchange: (e) => onChange(e.target.value) }),
    ]);
  }

  function numberField(label, value, onChange) {
    return el('label.field', {}, [
      label,
      el('input', {
        type: 'number', step: '0.5',
        value,
        onchange: (e) => onChange(Number(e.target.value)),
      }),
    ]);
  }

  function vecField(label, values, onChange) {
    const inputs = values.map((v) =>
      el('input.vec', {
        type: 'number', step: '0.1', value: v,
        onchange: () => onChange(inputs.map((inp) => Number(inp.value))),
      }),
    );
    return el('label.field', {}, [label, el('div.vec-row', {}, inputs)]);
  }

  store.subscribe((type, meta) => {
    // Skip rerender while typing in our own fields except structural edits.
    if (type === 'scene' && meta.source === 'inspector') return render();
    render();
  });
  render();
}
