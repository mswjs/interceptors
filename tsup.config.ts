import { Options, defineConfig } from 'tsup'

const nodeConfig: Options = {
  entry: [
    './src/index.ts',
    './src/presets/node.ts',
    './src/RemoteHttpInterceptor.ts',
    './src/interceptors/ClientRequest/index.ts',
    './src/interceptors/XMLHttpRequest/index.ts',
    './src/interceptors/fetch/index.ts',
  ],
  outDir: './lib/node',
  platform: 'node',
  inject: ['./src/crypto-shim.ts'],
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
}

const browserConfig: Options = {
  entry: [
    './src/index.ts',
    './src/presets/browser.ts',
    './src/interceptors/XMLHttpRequest/index.ts',
    './src/interceptors/fetch/index.ts',
    './src/interceptors/WebSocket/index.ts',
  ],
  outDir: './lib/browser',
  platform: 'browser',
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
}

export default defineConfig([nodeConfig, browserConfig])
