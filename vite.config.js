import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJs from 'vite-plugin-css-injected-by-js';

// Dev server  -> root index.html (standalone, mock Geotab API)
// `vite build` -> single IIFE bundle dist/tms.js (registers geotab.addin.tms)
export default defineConfig({
  plugins: [react(), cssInjectedByJs()],
  // Bundle 100% ASCII: tidak rusak walau server hosting tidak mengirim charset UTF-8 untuk file .js
  esbuild: { charset: 'ascii' },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
    sourcemap: false,
    lib: {
      entry: 'src/addin.jsx',
      name: 'TMSAddin',
      formats: ['iife'],
      fileName: () => 'tms.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
