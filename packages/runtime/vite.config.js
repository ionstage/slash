import { defineConfig } from 'vite';

// The sample project is served (and copied into the demo build) as static
// files at /, so the demo page can loadProject('/').
export default defineConfig({
  publicDir: '../../sample-project',
});
