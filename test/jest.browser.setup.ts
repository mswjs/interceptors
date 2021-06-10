import { createBrowser, CreateBrowserApi } from 'page-with'
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
  })
})

afterAll(async () => {
  await browser.cleanup()
})
