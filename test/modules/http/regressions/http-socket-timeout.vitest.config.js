import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: __dirname,
    /**
     * @note Purposefully narrow this particular test configuration
     * to run a single test that's against the common test pattern.
     * I haven't found the way to override Vitest "include" value
     * via its CLI so here we are.
     */
    include: ['./http-socket-timeout.ts'],
  },
})
