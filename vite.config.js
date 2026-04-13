import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/lurker/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
