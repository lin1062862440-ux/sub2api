import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const visualPreview = mode === 'visual' || process.env.LINAI_VISUAL_PREVIEW === '1'

  return {
    plugins: [vue()],
    resolve: {
      alias: [
        ...(visualPreview
          ? [
              {
                find: /^@\/api$/,
                replacement: fileURLToPath(new URL('./src/test/visual/api.ts', import.meta.url)),
              },
              {
                find: /^@\/stores\/session$/,
                replacement: fileURLToPath(new URL('./src/test/visual/session.ts', import.meta.url)),
              },
              {
                find: /^@\/lib\/platform$/,
                replacement: fileURLToPath(new URL('./src/test/visual/platform.ts', import.meta.url)),
              },
              {
                find: /^@\/features\/usage-display\/core\/storage$/,
                replacement: fileURLToPath(new URL('./src/test/visual/usage-display-storage.ts', import.meta.url)),
              },
              {
                find: /^@\/features\/usage-display\/core\/host$/,
                replacement: fileURLToPath(new URL('./src/test/visual/usage-display-host.ts', import.meta.url)),
              },
            ]
          : []),
        { find: '@', replacement: sourceDirectory },
      ],
    },
    test: {
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
      clearMocks: true,
    },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          usagePopover: fileURLToPath(new URL('./usage-popover.html', import.meta.url)),
          usageFloatingWindow: fileURLToPath(new URL('./usage-floating-window.html', import.meta.url)),
        },
      },
    },
    // Tauri expects a fixed port and fails if it is already taken.
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  }
})
