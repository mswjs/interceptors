import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    name: 'node',
    entry: [
      './src/index.ts',
      './src/presets/node.ts',
      './src/RemoteHttpInterceptor.ts',
      './src/interceptors/http/index.ts',
      './src/interceptors/ClientRequest/index.ts',
      './src/interceptors/XMLHttpRequest/node.ts',
      './src/interceptors/fetch/index.ts',
    ],
    external: ['_http_common'],
    outDir: './lib/node',
    platform: 'node',
    target: 'node20',
    outExtensions: (context) => ({
      js: context.format === 'cjs' ? '.cjs' : '.mjs',
      dts: context.format === 'cjs' ? '.d.cts' : '.d.mts',
    }),
    format: ['cjs', 'esm'],
    sourcemap: true,
    dts: true,
    tsconfig: './tsconfig.src.json',
  },
  {
    name: 'browser',
    entry: [
      './src/index.ts',
      './src/presets/browser.ts',
      './src/interceptors/XMLHttpRequest/web.ts',
      './src/interceptors/fetch/index.ts',
      './src/interceptors/WebSocket/index.ts',
    ],
    outDir: './lib/browser',
    platform: 'browser',
    target: 'chrome120',
    format: ['cjs', 'esm'],
    outExtensions: (context) => ({
      js: context.format === 'cjs' ? '.cjs' : '.mjs',
      dts: context.format === 'cjs' ? '.d.cts' : '.d.mts',
    }),
    sourcemap: true,
    dts: true,
    tsconfig: './tsconfig.browser.json',
  },
])
