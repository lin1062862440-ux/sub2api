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
