import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// publicDir serves the sample project at / (the "Sample" button in the
// topbar); preview.html is the runtime iframe used by the Preview overlay.
export default defineConfig({
  publicDir: '../../sample-project',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        preview: resolve(import.meta.dirname, 'preview.html'),
      },
    },
  },
});
