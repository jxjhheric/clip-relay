import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  css: {
    postcss: {
      plugins: [],
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
