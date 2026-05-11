import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: __dirname,
    poolOptions: {
      forks: {
        execArgv: ['--expose-gc'],
      },
    },
    workspace: [
      {
        test: {
          name: 'node',
          root: __dirname,
          include: ['**/*.test.ts'],
          exclude: ['**/*.memory.test.ts', '**/*.browser.test.ts'],
          alias: {
            'vitest-environment-node-with-websocket': './envs/node-with-websocket',
            'vitest-environment-react-native-like': './envs/react-native-like',
          },
        },
      },
      {
        test: {
          name: 'memory',
          root: __dirname,
          include: ['**/*.memory.test.ts'],
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
