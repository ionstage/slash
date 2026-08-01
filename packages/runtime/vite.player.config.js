import { defineConfig } from 'vite';

// Builds the self-contained player bundle that the editor embeds into
// exported story sites (npm run build:player). Output is imported by the
// editor as a raw string (see packages/editor/src/export.js).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-player',
    minify: 'esbuild',
    lib: {
      entry: 'src/export-main.js',
      formats: ['es'],
      fileName: () => 'player.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
