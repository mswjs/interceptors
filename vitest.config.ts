import { playwright } from '@vitest/browser-playwright'
import { defineConfig, defaultExclude } from 'vitest/config'

declare module 'vitest' {
  export interface ProvidedContext {
    serverUrl: string
  }
}

export default defineConfig({
  test: {
    globals: true,
    hookTimeout: 5000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
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
          globalSetup: './vitest.setup.ts',
          include: ['test/**/*.test.ts'],
          exclude: [
            ...defaultExclude,
            '**/*.browser.test.ts',
            '**/*.memory.test.ts',
          ],
          alias: {
            'vitest-environment-node-with-websocket':
              './test/envs/node-with-websocket',
          },
        },
      },
      /**
       * Memory tests measure the interceptors for memory leaks.
       * They require garbage collection to be exposed.
       */
      {
        extends: true,
        test: {
          name: 'memory',
          include: ['test/**/*.memory.test.ts'],
          pool: 'forks',
          poolOptions: {
            forks: {
              execArgv: ['--expose-gc'],
            },
          },
        },
      },
      {
        extends: true,
        test: {
          globalSetup: './vitest.setup.ts',
          include: ['test/**/*.browser.test.ts', 'test/**/*.neutral.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ name: 'browser', browser: 'chromium' }],
            headless: true,
            screenshotFailures: false,
          },
          testTimeout: 4000,
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
