import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./src/**/*.test.ts'],
  },
  esbuild: {
    target: 'es2022',
  },
})
