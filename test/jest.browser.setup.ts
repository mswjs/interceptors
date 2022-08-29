import { createBrowser, CreateBrowserApi, server } from 'page-with'
import { patchServerConnectionInfo } from './patched/PageWithPreviewServer'
import webpackConfig from './webpack.config'

let browser: CreateBrowserApi

beforeAll(async () => {
  browser = await createBrowser({
    launchOptions: {
      args: ['--allow-insecure-localhost'],
    },
    serverOptions: {
      webpackConfig,
    },
  }).then(
    // NOTE: when upstream patch is fixed, remove this last promise handler
    (browser) => {
      patchServerConnectionInfo(
        // note: we know server connection is up because createBrowser waited `until`
        // it was up, meaning PreviewServer.listen() set `this.connectionInfo`
        server as NonNullable<typeof server> & {
          connectionInfo: NonNullable<typeof server['connectionInfo']>
        }
      )

      return browser
    }
  )
})

afterAll(async () => {
  await browser.cleanup()
})
