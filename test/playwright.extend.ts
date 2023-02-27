import { test as base, expect } from '@playwright/test'
import { Request } from '@remix-run/web-fetch'
import { Compilation, WebpackHttpServer } from 'webpack-http-server'
import {
  BrowserXMLHttpRequestInit,
  createBrowserXMLHttpRequest,
  createRawBrowserXMLHttpRequest,
  XMLHttpResponse,
} from './helpers'
import { getWebpackHttpServer } from './webpackHttpServer'

interface TestFixutures {
  loadExample(entry: string): Promise<Compilation>
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

    await use(async (entry) => {
      compilation = await webpackServer.compile(
        Array.prototype.concat([], entry)
      )

      page.on('pageerror', console.error)

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
