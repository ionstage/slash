import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from '../src/zip.js';

test('produces a zip that unzip can read back intact', async () => {
  const encoder = new TextEncoder();
  const entries = [
    { path: 'index.html', data: encoder.encode('<!doctype html><p>hi</p>') },
    { path: 'scenes/meadow.json', data: encoder.encode('{"id":"meadow"}\n') },
    { path: 'assets/models/x.bin', data: new Uint8Array([0, 1, 2, 250, 251, 252]) },
  ];
  const blob = buildZip(entries);
  const dir = mkdtempSync(join(tmpdir(), 'slash-zip-'));
  const zipPath = join(dir, 'out.zip');
  writeFileSync(zipPath, new Uint8Array(await blob.arrayBuffer()));

  // -t verifies CRCs of every entry; throws on failure.
  const report = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  for (const entry of entries) assert.match(report, new RegExp(entry.path));
  assert.match(report, /No errors detected/);
});
