import { defineConfig } from 'vite';
import { inlineSingleFile } from './tools/inlineSingleFile.ts';

export default defineConfig({
  // Relative base so the build works from any static host sub-path (or file://).
  base: './',
  build: {
    target: 'es2020',
    // Sprites, sounds, font and the tutorial hand are all inlined: the playable
    // ships as one self-contained HTML file with zero network requests.
    assetsInlineLimit: 4 * 1024 * 1024,
    cssCodeSplit: false,
    modulePreload: false,
    sourcemap: false,
    reportCompressedSize: true,
  },
  plugins: [inlineSingleFile()],
  server: {
    host: true,
  },
});
