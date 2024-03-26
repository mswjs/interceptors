import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: __dirname,
    include: ['**/*.test.ts'],
    exclude: ['**/*.browser.test.ts'],
    /**
     * @note `crypto` is shimmed by tsup.
     * Do the same for tests.
     */
    setupFiles: ['./test/vitest.setup.crypto.ts'],
    alias: {
      'vitest-environment-node-with-websocket': './envs/node-with-websocket',
      'vitest-environment-react-native-like': './envs/react-native-like',
    },
  },
})
