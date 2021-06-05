import { createBrowser, CreateBrowserApi } from 'page-with'
import webpackConfig from './webpack.config'

let browser: CreateBrowserApi
const originalSetImmediate = global.setImmediate

beforeAll(async () => {
  // @ts-ignore
  // Jest@27 removes `setImmediate` without any guidance as to what to do
  // with the third-party code that still uses it.
  global.setImmediate = (cb) => {
    setTimeout(cb, 0)
  }

  browser = await createBrowser({
    launchOptions: {
      args: ['--allow-insecure-localhost'],
    },
    serverOptions: {
      webpackConfig,
    },
  })
})

afterAll(async () => {
  await browser.cleanup()
  global.setImmediate = originalSetImmediate
})
