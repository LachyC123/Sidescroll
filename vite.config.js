import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Sidescroll/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
