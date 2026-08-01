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
      el('h3', {}, 'Visible when'),
      conditionEditor(
        actor.visibleWhen,
        (cond) => {
          if (cond) actor.visibleWhen = cond;
          else delete actor.visibleWhen;
          touchScene();
        },
        'Always visible',
      ),
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
    const storyNode = store.docs.story.scenes.find((s) => s.id === scene.id);
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
      numberField('Camera FOV', scene.camera.viewpoint.fov ?? 50, (v) => {
        scene.camera.viewpoint.fov = v;
        touchScene();
      }),
      el('h3', {}, 'Audio'),
      audioSelect('BGM', scene, 'bgm'),
      audioSelect('Ambient', scene, 'ambient'),
      el('h3', {}, 'Camera viewpoint'),
      el('p.placeholder', {}, 'Frame the shot in the viewport, then “Capture viewpoint” below.'),
      viewpointReadout(scene.camera.viewpoint),
      el('h3', {}, 'Fog'),
      fogEditor(scene),
      el('h3', {}, 'Lights'),
      ...lightsEditor(scene),
      el('h3', {}, 'Effects'),
      ...effectsEditor(scene),
      ...(storyNode ? renderBranching(storyNode) : []),
      el('h3', {}, 'Events'),
      ...renderEvents(scene),
      el('h3', {}, 'Project style'),
      ...projectStyleEditor(),
      el('h3', {}, 'Performance'),
      performanceReadout(),
    ]);
  }

  // Mobile triangle budget; over it, scenes start dropping frames on
  // mid-range phones.
  const TRIANGLE_BUDGET = 300_000;

  function performanceReadout() {
    const { triangles, calls } = viewport.stats();
    const over = triangles > TRIANGLE_BUDGET;
    return el('div', {}, [
      el('p.mono' + (over ? '.warn' : ''), {},
        `≈ ${triangles.toLocaleString()} triangles · ${calls} draw calls`),
      over
        ? el('p.warn', {}, `Over the ${TRIANGLE_BUDGET.toLocaleString()}-triangle mobile budget.`)
        : null,
    ]);
  }

  function colorInput(value, onChange, title = 'color') {
    return el('input', {
      type: 'color',
      value,
      title,
      onchange: (e) => onChange(e.target.value),
    });
  }

  function smallNumber(value, onChange, { step = 0.1, width = 56, title = '' } = {}) {
    return el('input', {
      type: 'number',
      step: String(step),
      value,
      title,
      style: `width: ${width}px`,
      onchange: (e) => onChange(Number(e.target.value)),
    });
  }

  const rgbToHex = (rgb = [1, 1, 1]) =>
    '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const hexToRgb = (hex) =>
    [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 1000) / 1000);

  function fogEditor(scene) {
    const fog = scene.environment?.fog;
    if (!fog) {
      return el('div.row', {}, [
        el('span.placeholder.grow', {}, 'No scene fog (project default applies).'),
        el('button.mini', {
          textContent: '+',
          title: 'Add fog',
          onclick: () => {
            (scene.environment ??= {}).fog = { color: '#1a1a2e', near: 8, far: 40 };
            touchScene();
          },
        }),
      ]);
    }
    return el('div.row', {}, [
      colorInput(fog.color, (v) => {
        fog.color = v;
        touchScene();
      }),
      smallNumber(fog.near, (v) => {
        fog.near = v;
        touchScene();
      }, { step: 1, title: 'near' }),
      smallNumber(fog.far, (v) => {
        fog.far = v;
        touchScene();
      }, { step: 1, title: 'far' }),
      el('button.mini', {
        textContent: '×',
        title: 'Remove fog',
        onclick: () => {
          delete scene.environment.fog;
          if (Object.keys(scene.environment).length === 0) delete scene.environment;
          touchScene();
        },
      }),
    ]);
  }

  function lightsEditor(scene) {
    const lights = (scene.lights ??= []);
    const rows = lights.map((light, i) =>
      el('div.event-card', {}, [
        el('div.row', {}, [
          el(
            'select',
            {
              onchange: (e) => {
                light.type = e.target.value;
                touchScene();
              },
            },
            ['ambient', 'directional', 'point'].map((t) =>
              el('option', { value: t, selected: light.type === t }, t),
            ),
          ),
          colorInput(rgbToHex(light.color), (v) => {
            light.color = hexToRgb(v);
            touchScene();
          }),
          smallNumber(light.intensity ?? 1, (v) => {
            light.intensity = v;
            touchScene();
          }, { title: 'intensity' }),
          el('button.mini', {
            textContent: '×',
            onclick: () => {
              lights.splice(i, 1);
              if (lights.length === 0) delete scene.lights;
              touchScene();
            },
          }),
        ]),
        light.type !== 'ambient'
          ? el('div.row', {}, [
              el('span', {}, 'pos'),
              ...[0, 1, 2].map((axis) =>
                smallNumber((light.position ?? [0, 5, 0])[axis], (v) => {
                  light.position ??= [0, 5, 0];
                  light.position[axis] = v;
                  touchScene();
                }, { width: 52 }),
              ),
            ])
          : null,
      ]),
    );
    return [
      ...rows,
      el('button.mini-wide', {
        textContent: '+ light',
        onclick: () => {
          lights.push({
            id: uniqueId('light', new Set(lights.map((l) => l.id))),
            type: 'directional',
            color: [1, 1, 1],
            intensity: 1.5,
            position: [5, 10, 5],
          });
          touchScene();
        },
      }),
    ];
  }

  function effectsEditor(scene) {
    const effects = (scene.effects ??= []);
    const rows = effects.map((effect, i) =>
      el('div.event-card', {}, [
        el('div.row', {}, [
          el(
            'select',
            {
              onchange: (e) => {
                effect.preset = e.target.value;
                touchScene();
              },
            },
            ['rain', 'snow', 'sparks', 'fireflies'].map((p) =>
              el('option', { value: p, selected: effect.preset === p }, p),
            ),
          ),
          smallNumber(effect.count ?? 200, (v) => {
            effect.count = Math.round(v);
            touchScene();
          }, { step: 10, title: 'count' }),
          el('label.check', {}, [
            el('input', {
              type: 'checkbox',
              checked: effect.enabled !== false,
              onchange: (e) => {
                if (e.target.checked) delete effect.enabled;
                else effect.enabled = false;
                touchScene();
              },
            }),
            'on',
          ]),
          el('button.mini', {
            textContent: '×',
            onclick: () => {
              effects.splice(i, 1);
              if (effects.length === 0) delete scene.effects;
              touchScene();
            },
          }),
        ]),
        el('div.row', {}, [
          el('span', {}, 'pos'),
          ...[0, 1, 2].map((axis) =>
            smallNumber((effect.position ?? [0, 5, 0])[axis], (v) => {
              effect.position ??= [0, 5, 0];
              effect.position[axis] = v;
              touchScene();
            }, { width: 52 }),
          ),
        ]),
      ]),
    );
    return [
      ...rows,
      el('button.mini-wide', {
        textContent: '+ effect',
        onclick: () => {
          effects.push({
            id: uniqueId('effect', new Set(effects.map((e) => e.id))),
            preset: 'snow',
            count: 300,
          });
          touchScene();
        },
      }),
    ];
  }

  function projectStyleEditor() {
    const rs = (store.docs.project.renderStyle ??= {});
    const touchProject = () => store.touch('project', { source: 'inspector' });
    return [
      el('label.field', {}, [
        'Style',
        el(
          'select',
          {
            onchange: (e) => {
              rs.style = e.target.value;
              touchProject();
            },
          },
          ['toon', 'realistic', 'illustration', 'lowpoly'].map((s) =>
            el('option', { value: s, selected: (rs.style ?? 'toon') === s }, s),
          ),
        ),
      ]),
      el('div.row', {}, [
        el('label.check', {}, [
          el('input', {
            type: 'checkbox',
            checked: Boolean(rs.outline?.enabled),
            onchange: (e) => {
              (rs.outline ??= {}).enabled = e.target.checked;
              touchProject();
            },
          }),
          'outline',
        ]),
        colorInput(rs.outline?.color ?? '#000000', (v) => {
          (rs.outline ??= {}).color = v;
          touchProject();
        }),
        smallNumber(rs.outline?.thickness ?? 0.02, (v) => {
          (rs.outline ??= {}).thickness = v;
          touchProject();
        }, { step: 0.005, title: 'thickness' }),
      ]),
      el('div.row', {}, [
        el('label.check', {}, [
          el('input', {
            type: 'checkbox',
            checked: Boolean(rs.post?.bloom),
            onchange: (e) => {
              if (e.target.checked) ((rs.post ??= {}).bloom ??= { strength: 0.6, threshold: 0.8 });
              else delete rs.post.bloom;
              touchProject();
            },
          }),
          'bloom',
        ]),
        smallNumber(rs.post?.bloom?.strength ?? 0.6, (v) => {
          ((rs.post ??= {}).bloom ??= {}).strength = v;
          touchProject();
        }, { title: 'strength' }),
        smallNumber(rs.post?.bloom?.threshold ?? 0.8, (v) => {
          ((rs.post ??= {}).bloom ??= {}).threshold = v;
          touchProject();
        }, { title: 'threshold' }),
      ]),
      el('div.row', {}, [
        el('label.check', {}, [
          el('input', {
            type: 'checkbox',
            checked: Boolean(rs.post?.vignette),
            onchange: (e) => {
              if (e.target.checked) ((rs.post ??= {}).vignette ??= { strength: 0.35 });
              else delete rs.post.vignette;
              touchProject();
            },
          }),
          'vignette',
        ]),
        smallNumber(rs.post?.vignette?.strength ?? 0.35, (v) => {
          ((rs.post ??= {}).vignette ??= {}).strength = v;
          touchProject();
        }, { title: 'strength' }),
      ]),
      el('p.placeholder', {}, 'Post effects show in Preview and exports.'),
    ];
  }

  function audioSelect(label, scene, key) {
    const audioAssets = store.docs.assetIndex.assets.filter((a) => a.kind === 'audio');
    return el('label.field', {}, [
      label,
      el(
        'select',
        {
          onchange: (e) => {
            if (e.target.value) (scene.audio ??= {})[key] = e.target.value;
            else if (scene.audio) {
              delete scene.audio[key];
              if (Object.keys(scene.audio).length === 0) delete scene.audio;
            }
            touchScene();
          },
        },
        [
          el('option', { value: '', selected: !scene.audio?.[key] }, 'none'),
          ...audioAssets.map((a) =>
            el('option', { value: a.id, selected: scene.audio?.[key] === a.id }, a.name ?? a.id),
          ),
        ],
      ),
    ]);
  }

  // Branching lives on the story node (next + state-conditional branches).
  function renderBranching(node) {
    const sceneIds = store.docs.story.scenes.map((s) => s.id);
    const touchStory = () => store.touch('project', { source: 'inspector' });
    const nextSelect = (value, onChange, allowNull) =>
      el(
        'select',
        { onchange: (e) => onChange(e.target.value || null) },
        [
          allowNull ? el('option', { value: '', selected: value == null }, 'end of story') : null,
          ...sceneIds.map((id) => el('option', { value: id, selected: value === id }, id)),
        ].filter(Boolean),
      );
    return [
      el('h3', {}, 'Next scene'),
      el('div.row', {}, [
        nextSelect(node.next, (v) => {
          node.next = v;
          touchStory();
        }, true),
      ]),
      el('h3', {}, 'Branches'),
      ...(node.branches ?? []).map((branch, i) =>
        el('div.event-card', {}, [
          el('div.row', {}, [
            el('span', {}, 'when'),
            ...conditionInputs(branch.when, touchStory),
            el('button.mini', {
              textContent: '×',
              onclick: () => {
                node.branches.splice(i, 1);
                if (node.branches.length === 0) delete node.branches;
                touchStory();
              },
            }),
          ]),
          el('div.row', {}, [
            el('span', {}, '→'),
            nextSelect(branch.next, (v) => {
              branch.next = v;
              touchStory();
            }, false),
          ]),
        ]),
      ),
      el('button.mini-wide', {
        textContent: '+ branch',
        onclick: () => {
          const key = store.stateKeys()[0];
          if (!key) return;
          (node.branches ??= []).push({ when: { key, equals: true }, next: sceneIds[0] });
          touchStory();
        },
      }),
    ];
  }

  function conditionInputs(cond, onChange) {
    return [
      el(
        'select',
        {
          onchange: (e) => {
            cond.key = e.target.value;
            onChange();
          },
        },
        store.stateKeys().map((k) => el('option', { value: k, selected: cond.key === k }, k)),
      ),
      el('span', {}, '='),
      el('input', {
        value: JSON.stringify(cond.equals),
        title: 'true / false / number / "text"',
        style: 'width: 60px',
        onchange: (e) => {
          try {
            cond.equals = JSON.parse(e.target.value);
          } catch {
            cond.equals = e.target.value;
          }
          onChange();
        },
      }),
    ];
  }

  function conditionEditor(cond, apply, emptyLabel) {
    if (!cond) {
      return el('div.row', {}, [
        el('span.placeholder.grow', {}, emptyLabel),
        el('button.mini', {
          textContent: '+',
          title: 'Add condition',
          onclick: () => {
            const key = store.stateKeys()[0];
            if (key) apply({ key, equals: true });
          },
        }),
      ]);
    }
    return el('div.row', {}, [
      ...conditionInputs(cond, () => apply(cond)),
      el('button.mini', { textContent: '×', title: 'Remove condition', onclick: () => apply(null) }),
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
                const defaults = {
                  progress: { type: 'progress', at: 0.5 },
                  tap: { type: 'tap' },
                  state: { type: 'state', key: store.stateKeys()[0] ?? '', equals: true },
                };
                event.trigger = defaults[e.target.value];
                touchScene();
              },
            },
            ['progress', 'tap', 'state'].map((t) =>
              el('option', { value: t, selected: event.trigger.type === t }, `on ${t}`),
            ),
          ),
          ...triggerFields(event),
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

  function triggerFields(event) {
    const scene = store.activeScene();
    const actorIds = (scene.actors ?? []).map((a) => a.id);
    if (event.trigger.type === 'progress') {
      return [
        el('input', {
          type: 'number', step: '0.05', min: '0', max: '1',
          value: event.trigger.at,
          onchange: (e) => {
            event.trigger.at = Number(e.target.value);
            touchScene();
          },
        }),
      ];
    }
    if (event.trigger.type === 'tap') {
      return [
        el(
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
      ];
    }
    return conditionInputs(event.trigger, touchScene); // state trigger: key/equals
  }

  function actionRow(event, action, j, actorIds, sceneIds) {
    const audioIds = store.docs.assetIndex.assets.filter((a) => a.kind === 'audio').map((a) => a.id);
    const defaults = {
      log: { type: 'log', message: 'Hello' },
      setState: { type: 'setState', key: '', value: true },
      gotoScene: { type: 'gotoScene', scene: sceneIds[0] },
      playAnimation: { type: 'playAnimation', target: actorIds[0] ?? '', clip: '' },
      playSound: { type: 'playSound', asset: audioIds[0] ?? '' },
      setVisible: { type: 'setVisible', target: actorIds[0] ?? '', visible: true },
    };
    const fields = {
      log: [textInput(action, 'message')],
      setState: [textInput(action, 'key'), jsonInput(action, 'value')],
      gotoScene: [idSelect(action, 'scene', sceneIds)],
      playAnimation: [idSelect(action, 'target', actorIds), textInput(action, 'clip')],
      playSound: [idSelect(action, 'asset', audioIds), checkbox(action, 'loop')],
      setVisible: [idSelect(action, 'target', actorIds), checkbox(action, 'visible')],
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

  function checkbox(target, key) {
    return el('label.check', {}, [
      el('input', {
        type: 'checkbox',
        checked: Boolean(target[key]),
        onchange: (e) => {
          target[key] = e.target.checked;
          touchScene();
        },
      }),
      key,
    ]);
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

  function viewpointReadout(viewpoint) {
    return el('div', {}, [
      vecField('Position', viewpoint.position, (v) => {
        viewpoint.position = v;
        touchScene();
      }),
      vecField('Target', viewpoint.target, (v) => {
        viewpoint.target = v;
        touchScene();
      }),
    ]);
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
