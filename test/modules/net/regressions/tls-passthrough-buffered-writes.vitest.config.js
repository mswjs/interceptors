import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    /**
     * @note Purposefully narrow this particular test configuration
     * to run a single test that's against the common test pattern.
     */
    include: ['./tls-passthrough-buffered-writes.ts'],
  },
})
