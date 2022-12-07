import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/RemoteHttpInterceptor.ts',
    './src/interceptors/ClientRequest/index.ts',
    './src/interceptors/fetch/index.ts',
    './src/interceptors/XMLHttpRequest/index.ts',
  ],
  outDir: './lib',
  format: ['cjs', 'esm'],
  dts: true,
})
