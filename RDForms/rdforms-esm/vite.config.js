// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Wichtig: RDForms hat JSX in .js in node_modules -> hiermit wird's korrekt vorgebundled
  optimizeDeps: {
    include: ['@entryscape/rdforms', '@entryscape/rdfjson'],
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  build: {
    commonjsOptions: { transformMixedEsModules: true },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
