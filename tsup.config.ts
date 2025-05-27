import { Options, defineConfig } from 'tsup'

const nodeConfig: Options = {
  entry: [
    './src/index.ts',
    './src/presets/node.ts',
    './src/utils/node/index.ts',
    './src/RemoteHttpInterceptor.ts',
    './src/interceptors/ClientRequest/index.ts',
    './src/interceptors/XMLHttpRequest/index.ts',
    './src/interceptors/fetch/index.ts',
  ],
  outDir: './lib/node',
  platform: 'node',
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
  esbuildOptions(options) {
    options.alias = {
      [`internal:brotli-decompress`]:
        './src/interceptors/fetch/utils/brotli-decompress.ts',
    }
  },
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
  esbuildOptions(options) {
    options.alias = {
      [`internal:brotli-decompress`]:
        './src/interceptors/fetch/utils/brotli-decompress.browser.ts',
    }
  },
}

export default defineConfig([nodeConfig, browserConfig])
