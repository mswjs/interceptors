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
      './src/interceptors/fetch/node.ts',
    ],
    copy: {
      from: './src/interceptors/http/http-parser/llhttp/**',
      to: './lib/node/llhttp',
    },
    outDir: './lib/node',
    platform: 'node',
    target: 'node22',
    format: ['esm'],
    fixedExtension: false,
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
      './src/interceptors/fetch/web.ts',
      './src/interceptors/WebSocket/index.ts',
    ],
    outDir: './lib/browser',
    platform: 'browser',
    target: 'chrome120',
    format: ['esm'],
    fixedExtension: false,
    sourcemap: true,
    dts: true,
    tsconfig: './tsconfig.browser.json',
  },
])
