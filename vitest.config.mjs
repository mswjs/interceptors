import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./src/**/*.test.ts'],
    globals: true,
  },
  esbuild: {
    target: 'es2022',
  },
})
