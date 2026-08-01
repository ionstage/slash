import Anthropic from '@anthropic-ai/sdk';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SYSTEM_PROMPT, buildScenesPrompt, projectContext } from './prompts.js';
import { parseJsonResponse } from './envelope.js';

/**
 * Provider-agnostic generation. Each provider implements
 *   generate(kind, params) → { envelope } (kind 'scenes')
 *                          | { file: File } (kind 'model')
 * params: { prompt, docs, imageFile?, apiKey?, onStatus? }
 *
 * API keys are entered by the user and stored in localStorage only
 * (see panel.js); nothing is sent anywhere except the chosen provider.
 */

const claudeProvider = {
  id: 'claude',
  label: 'Claude API',
  kinds: ['scenes'],
  needsKey: true,
  keyHint: 'Anthropic API key (sk-ant-…)',

  async generate(kind, { prompt, docs, apiKey, onStatus }) {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    onStatus?.('Asking Claude…');
    try {
      const response = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildScenesPrompt(projectContext(docs), prompt) }],
      });
      if (response.stop_reason === 'refusal') {
        throw new Error('Claude declined this request');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Response was truncated (max_tokens) — try a smaller request');
      }
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      return { envelope: parseJsonResponse(text) };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('Invalid Anthropic API key');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Rate limited — try again shortly');
      if (err instanceof Anthropic.APIError) throw new Error(`Claude API error: ${err.message}`);
      throw err;
    }
  },
};

const MESHY_BASE = 'https://api.meshy.ai/openapi/v1';

const meshyProvider = {
  id: 'meshy',
  label: 'Meshy (image → 3D)',
  kinds: ['model'],
  needsKey: true,
  keyHint: 'Meshy API key',
  experimental: true,

  async generate(kind, { imageFile, apiKey, onStatus }) {
    if (!imageFile) throw new Error('Drop an image to convert to 3D');
    const dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });

    onStatus?.('Submitting to Meshy…');
    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const submit = await fetch(`${MESHY_BASE}/image-to-3d`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image_url: dataUri, should_texture: true }),
    });
    if (!submit.ok) throw new Error(`Meshy error ${submit.status}: ${await submit.text()}`);
    const { result: taskId } = await submit.json();

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const poll = await fetch(`${MESHY_BASE}/image-to-3d/${taskId}`, { headers });
      if (!poll.ok) throw new Error(`Meshy poll error ${poll.status}`);
      const task = await poll.json();
      onStatus?.(`Meshy: ${task.status.toLowerCase()} ${task.progress ?? ''}%`);
      if (task.status === 'SUCCEEDED') {
        onStatus?.('Downloading model…');
        const glb = await fetch(task.model_urls.glb);
        if (!glb.ok) throw new Error('Failed to download the generated model');
        const name = imageFile.name.replace(/\.[^.]+$/, '') + '.glb';
        return { file: new File([await glb.blob()], name) };
      }
      if (task.status === 'FAILED') {
        throw new Error(`Meshy generation failed: ${task.task_error?.message ?? 'unknown error'}`);
      }
    }
    throw new Error('Meshy generation timed out');
  },
};

/**
 * Offline provider: deterministic scene generation and a real procedural
 * GLB (via GLTFExporter), so the whole insert/import pipeline works with
 * no network or keys — and serves as the test double.
 */
const mockProvider = {
  id: 'mock',
  label: 'Built-in (offline)',
  kinds: ['scenes', 'model'],
  needsKey: false,

  async generate(kind, { prompt, docs }) {
    if (kind === 'model') return { file: await exportProceduralModel(prompt) };
    return { envelope: mockEnvelope(docs, prompt) };
  },
};

export function mockEnvelope(docs, prompt) {
  const context = projectContext(docs);
  const stage = context.assets.find((a) => a.type === 'stage') ?? context.assets[0];
  const character = context.assets.find((a) => a.type === 'character');
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 3)
      .join('-') || 'generated';
  const scene = {
    formatVersion: 1,
    id: slug,
    name: prompt.slice(0, 40) || 'Generated scene',
    scrollLength: 3,
    stage: { assetId: stage.id },
    actors: character
      ? [
          {
            id: 'hero',
            assetId: character.id,
            transform: { position: [0, 0, 2], rotation: [0, 180, 0] },
            tracks: {
              position: [
                { t: 0, value: [0, 0, 2] },
                { t: 1, value: [0, 0, -6], easing: 'easeInOut' },
              ],
            },
          },
        ]
      : [],
    camera: {
      fov: 50,
      tracks: {
        position: [
          { t: 0, value: [0, 1.8, 7] },
          { t: 1, value: [1.5, 2.2, -2], easing: 'easeInOut' },
        ],
        lookAt: [
          { t: 0, value: [0, 1.2, 0] },
          { t: 1, value: [0, 1.2, -6], easing: 'easeInOut' },
        ],
      },
    },
    events: [
      {
        id: 'generated-note',
        trigger: { type: 'progress', at: 0.5 },
        actions: [{ type: 'log', message: `Generated from prompt: ${prompt.slice(0, 60)}` }],
      },
    ],
  };
  return { scenes: [scene] };
}

async function exportProceduralModel(prompt) {
  // Deterministic "crystal" from the prompt hash — a stand-in for a real
  // image-to-3D result that still exercises the full GLB import path.
  let hash = 0;
  for (const ch of prompt) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (hash % 360) / 360;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.6, 0.55) }),
  );
  mesh.scale.set(1, 1 + (hash % 5) / 4, 1);
  mesh.name = 'generated-crystal';

  const buffer = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(mesh, resolve, reject, { binary: true });
  });
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'generated';
  return new File([buffer], `${slug}.glb`);
}

export const providers = [mockProvider, claudeProvider, meshyProvider];
