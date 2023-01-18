import { Options, defineConfig } from 'tsup'

const nodeConfig: Options = {
  entry: [
    './src/index.ts',
    './src/RemoteHttpInterceptor.ts',
    './src/interceptors/ClientRequest/index.ts',
    './src/interceptors/XMLHttpRequest/index.ts',
    './src/interceptors/fetch/index.ts',
  ],
  outDir: './lib/node',
  platform: 'node',
  format: ['cjs', 'esm'],
  dts: true,
}

const browserConfig: Options = {
  entry: [
    './src/index.ts',
    './src/interceptors/XMLHttpRequest/index.ts',
    './src/interceptors/fetch/index.ts',
  ],
  outDir: './lib/browser',
  platform: 'browser',
  format: ['cjs', 'esm'],
  dts: true,
}

export default defineConfig([nodeConfig, browserConfig])
