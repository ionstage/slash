import { el, replaceChildren } from '../dom.js';
import { providers } from './providers.js';
import { mergeEnvelope } from './envelope.js';

const KEYS_STORAGE = 'slash:ai:keys';

/**
 * The ✨ AI dialog: pick a provider, describe what you want (or drop an
 * image for 3D models), and generated content lands in the project as a
 * draft — scenes are appended to the story, models join the asset panel.
 * API keys are typed by the user and kept in localStorage only.
 */
export function createAiPanel(elements, store, { toast }) {
  const { overlay, body, btnClose } = elements;
  let providerId = 'mock';
  let kind = 'scenes';
  let imageFile = null;
  let busy = false;

  const loadKeys = () => {
    try {
      return JSON.parse(localStorage.getItem(KEYS_STORAGE) ?? '{}');
    } catch {
      return {};
    }
  };
  const saveKey = (id, value) => {
    const keys = loadKeys();
    if (value) keys[id] = value;
    else delete keys[id];
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  };

  function provider() {
    return providers.find((p) => p.id === providerId);
  }

  function render() {
    const p = provider();
    if (!p.kinds.includes(kind)) kind = p.kinds[0];
    const status = el('p.ai-status');

    replaceChildren(body, [
      el('label.field', {}, [
        'Provider',
        el(
          'select',
          {
            onchange: (e) => {
              providerId = e.target.value;
              render();
            },
          },
          providers.map((prov) =>
            el(
              'option',
              { value: prov.id, selected: prov.id === providerId },
              prov.label + (prov.experimental ? ' — experimental' : ''),
            ),
          ),
        ),
      ]),
      p.needsKey
        ? el('label.field', {}, [
            'API key (stored only in this browser)',
            el('input', {
              type: 'password',
              value: loadKeys()[p.id] ?? '',
              placeholder: p.keyHint,
              onchange: (e) => saveKey(p.id, e.target.value.trim()),
            }),
          ])
        : null,
      el('label.field', {}, [
        'Generate',
        el(
          'select',
          {
            onchange: (e) => {
              kind = e.target.value;
              render();
            },
          },
          [
            p.kinds.includes('scenes')
              ? el('option', { value: 'scenes', selected: kind === 'scenes' }, 'Scenes from a prompt')
              : null,
            p.kinds.includes('model')
              ? el('option', { value: 'model', selected: kind === 'model' }, '3D model asset')
              : null,
          ].filter(Boolean),
        ),
      ]),
      el('label.field', {}, [
        'Prompt',
        el('textarea', {
          id: 'ai-prompt',
          rows: 4,
          placeholder:
            kind === 'model'
              ? 'Describe the model (and drop an image below for image→3D providers)'
              : 'e.g. A midnight forest clearing where the traveler meets a fox spirit; snow; a tap on the fox continues the story',
        }),
      ]),
      kind === 'model'
        ? el('label.field', {}, [
            `Image ${imageFile ? `— ${imageFile.name}` : '(for image→3D)'}`,
            el('input', {
              type: 'file',
              accept: 'image/*',
              onchange: (e) => {
                imageFile = e.target.files[0] ?? null;
              },
            }),
          ])
        : null,
      el('div.row', {}, [
        el('button', {
          textContent: busy ? 'Generating…' : 'Generate',
          disabled: busy,
          onclick: () => generate(),
        }),
      ]),
      status,
    ]);
  }

  async function generate() {
    const prompt = body.querySelector('#ai-prompt')?.value.trim() ?? '';
    const p = provider();
    if (!store.docs) return toast('Open a project first');
    if (!prompt && kind === 'scenes') return toast('Describe what to generate');
    const apiKey = loadKeys()[p.id];
    if (p.needsKey && !apiKey) return toast('Enter your API key first');

    busy = true;
    render();
    const statusEl = body.querySelector('.ai-status');
    const onStatus = (text) => (statusEl.textContent = text);
    try {
      const result = await p.generate(kind, { prompt, docs: store.docs, imageFile, apiKey, onStatus });
      if (result.envelope) {
        const merged = mergeEnvelope(store.docs, result.envelope);
        if (!merged.ok) {
          statusEl.textContent =
            'Generated content failed validation:\n' +
            merged.errors.slice(0, 6).map((e) => `${e.path}: ${e.message}`).join('\n');
          return;
        }
        Object.assign(store.docs, merged.docs);
        store.touch('project');
        store.setActiveScene(merged.addedSceneIds[0]);
        toast(`Added ${merged.addedSceneIds.length} scene(s): ${merged.addedSceneIds.join(', ')}`);
        close();
      } else if (result.file) {
        const id = store.addAssetFile(result.file.name, result.file);
        toast(`Imported generated model as "${id}"`);
        close();
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = String(err.message ?? err);
    } finally {
      busy = false;
      const promptValue = prompt;
      render();
      const promptField = body.querySelector('#ai-prompt');
      if (promptField) promptField.value = promptValue;
    }
  }

  function open() {
    overlay.hidden = false;
    render();
  }
  function close() {
    overlay.hidden = true;
  }
  btnClose.addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { open };
}
