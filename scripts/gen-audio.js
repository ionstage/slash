/**
 * Generates the sample project's audio fixtures (16-bit mono WAV):
 *   chime.wav — decaying bell strike (SFX for the shrine bell)
 *   wind.wav  — loopable filtered-noise wind bed (meadow ambient)
 * Run: node scripts/gen-audio.js
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const outDir = fileURLToPath(new URL('../sample-project/assets/audio/', import.meta.url));
mkdirSync(outDir, { recursive: true });

function wav(samples) {
  const data = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    data[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  }
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 2, 40);
  Buffer.from(data.buffer).copy(buf, 44);
  return buf;
}

// Bell chime: two inharmonic partials with exponential decay.
const chime = Array.from({ length: RATE * 1.4 }, (_, i) => {
  const t = i / RATE;
  const env = Math.exp(-3.2 * t);
  return env * (0.5 * Math.sin(2 * Math.PI * 880 * t) + 0.3 * Math.sin(2 * Math.PI * 1355 * t));
});
writeFileSync(outDir + 'chime.wav', wav(chime));

// Wind: low-passed noise with a slow swell, crossfaded into a seamless loop.
const N = RATE * 3;
let lp = 0;
const wind = Array.from({ length: N }, (_, i) => {
  lp += 0.04 * ((Math.random() * 2 - 1) - lp);
  const swell = 0.7 + 0.3 * Math.sin((2 * Math.PI * i) / N);
  return lp * swell * 2.2;
});
const fade = Math.floor(RATE * 0.15);
for (let i = 0; i < fade; i++) {
  const u = i / fade;
  wind[N - fade + i] = wind[N - fade + i] * (1 - u) + wind[i] * u;
}
writeFileSync(outDir + 'wind.wav', wav(wind));

console.log('wrote chime.wav and wind.wav');
