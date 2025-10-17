import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./src/**/*.test.ts'],
    typecheck: {
      enabled: true,
    },
  },
  esbuild: {
    target: 'es2022',
  },
})
