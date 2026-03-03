import { playwright } from '@vitest/browser-playwright'
import { defineConfig, defaultExclude } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          root: './src',
          include: ['**/*.test.ts'],
        },
        esbuild: {
          target: 'es2022',
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          root: './test',
          include: ['**/*.test.ts'],
          exclude: [
            ...defaultExclude,
            '**/*.browser.test.ts',
            '**/*.v-browser.test.ts',
          ],
          alias: {
            'vitest-environment-node-with-websocket':
              './envs/node-with-websocket',
            'vitest-environment-react-native-like': './envs/react-native-like',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          root: './test',
          include: ['**/*.v-browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ name: '', browser: 'chromium' }],
            headless: true,
          },
          testTimeout: 5000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      // Create a manual alias for Vitest so it could resolve this
      // internal environment-dependent module in tests.
      'internal:brotli-decompress':
        '../../../../src/interceptors/fetch/utils/brotli-decompress.ts',
    },
  },
})
