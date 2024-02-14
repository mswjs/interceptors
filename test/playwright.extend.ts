import { test as base, expect } from '@playwright/test'
import {
  Compilation,
  CompilationOptions,
  WebpackHttpServer,
} from 'webpack-http-server'
import {
  BrowserXMLHttpRequestInit,
  createBrowserXMLHttpRequest,
  createRawBrowserXMLHttpRequest,
  XMLHttpResponse,
} from './helpers'
import { getWebpackHttpServer } from './webpackHttpServer'

interface TestFixutures {
  loadExample(entry: string, options?: CompilationOptions): Promise<Compilation>
  webpackServer: WebpackHttpServer
  callXMLHttpRequest: (
    init: BrowserXMLHttpRequestInit
  ) => Promise<[Request, XMLHttpResponse]>
  callRawXMLHttpRequest: ReturnType<typeof createRawBrowserXMLHttpRequest>
}

export const test = base.extend<TestFixutures>({
  async webpackServer({}, use) {
    use(await getWebpackHttpServer())
  },

  async loadExample({ webpackServer, page }, use) {
    let compilation: Compilation | undefined

    await use(async (entry, options) => {
      compilation = await webpackServer.compile(
        Array.prototype.concat([], entry),
        options
      )

      page.on('pageerror', console.error)
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.error('[RUNTIME ERROR]:', msg.text())
        }
      })

      await page.goto(compilation.previewUrl, { waitUntil: 'networkidle' })

      return compilation
    })

    await compilation?.dispose()
  },
  async callXMLHttpRequest({ page }, use) {
    await use(createBrowserXMLHttpRequest(page))
  },
  async callRawXMLHttpRequest({ page }, use) {
    await use(createRawBrowserXMLHttpRequest(page))
  },
})

export { expect }
