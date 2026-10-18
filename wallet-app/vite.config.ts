import { defineConfig } from 'vite'

// Content-hashed static build. base matches the deployed path on both origins.
export default defineConfig({
  base: '/wallet/app/',
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    minify: 'esbuild',
    emptyOutDir: true,
  },
  esbuild: { legalComments: 'none' },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
})
