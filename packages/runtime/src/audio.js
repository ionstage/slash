/**
 * Web Audio playback: BGM and ambient loops with crossfade, one-shot SFX.
 * The AudioContext unlocks on the first user gesture (browser autoplay
 * policy); anything requested before that starts once unlocked.
 */

const FADE_SECONDS = 1.2;

/**
 * @param {{ assets: Array<any> }} assetIndex
 * @param {(source: string) => string} resolveAsset
 */
export function createAudioSystem(assetIndex, resolveAsset) {
  const byId = new Map(assetIndex.assets.map((a) => [a.id, a]));
  /** @type {AudioContext | null} */
  let ctx = null;
  const buffers = new Map();
  // Channels: current loop per role, so scene changes can crossfade.
  const channels = { bgm: null, ambient: null };
  const pending = [];

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      for (const fn of pending.splice(0)) fn();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  function whenUnlocked(fn) {
    if (ctx) fn();
    else pending.push(fn);
  }

  async function buffer(assetId) {
    const def = byId.get(assetId);
    if (!def || def.kind !== 'audio') {
      console.warn(`[slash] audio: unknown audio asset "${assetId}"`);
      return null;
    }
    if (!buffers.has(assetId)) {
      buffers.set(
        assetId,
        fetch(resolveAsset(def.source))
          .then((res) => res.arrayBuffer())
          .then((data) => ctx.decodeAudioData(data))
          .catch((err) => {
            console.warn(`[slash] audio: failed to load "${assetId}":`, err);
            return null;
          }),
      );
    }
    return buffers.get(assetId);
  }

  async function startLoop(role, assetId, volume) {
    const old = channels[role];
    if (old?.assetId === assetId) return;
    if (old) {
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_SECONDS);
      setTimeout(() => old.source.stop(), FADE_SECONDS * 1000 + 100);
      channels[role] = null;
    }
    if (!assetId) return;
    const buf = await buffer(assetId);
    if (!buf || channels[role]?.assetId === assetId) return;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + FADE_SECONDS);
    source.connect(gain).connect(ctx.destination);
    source.start();
    channels[role] = { assetId, source, gain };
  }

  return {
    /** Crossfade the background music channel to `assetId` (or null to stop). */
    setBgm(assetId) {
      whenUnlocked(() => startLoop('bgm', assetId ?? null, 0.5));
    },
    /** Crossfade the environment-sound channel. */
    setAmbient(assetId) {
      whenUnlocked(() => startLoop('ambient', assetId ?? null, 0.35));
    },
    /** Fire-and-forget sound effect. */
    playSfx(assetId, { loop = false } = {}) {
      whenUnlocked(async () => {
        const buf = await buffer(assetId);
        if (!buf) return;
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.loop = loop;
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        source.connect(gain).connect(ctx.destination);
        source.start();
      });
    },
    dispose() {
      ctx?.close();
    },
  };
}
