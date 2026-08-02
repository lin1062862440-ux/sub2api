import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist-installer',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./windows-installer.html', import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
  },
})
