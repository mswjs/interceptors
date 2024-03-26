import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./src/**/*.test.ts'],
    /**
     * @note `crypto` is shimmed by tsup.
     * Do the same for tests.
     */
    setupFiles: ['./test/vitest.setup.crypto.ts'],
  },
})
