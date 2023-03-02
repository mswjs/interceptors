import { WebpackHttpServer } from 'webpack-http-server'
import webpackConfig from './webpack.config'

declare global {
  var webpackServerPromise: Promise<WebpackHttpServer> | null
}

globalThis.webpackServerPromise = null

export function getWebpackHttpServer(): Promise<WebpackHttpServer> {
  if (global.webpackServerPromise) {
    return global.webpackServerPromise
  }

  globalThis.webpackServerPromise = startWebpackServer()

  return globalThis.webpackServerPromise
}

async function startWebpackServer(): Promise<WebpackHttpServer> {
  const server = new WebpackHttpServer({
    webpackConfig,
  })

  await server.listen()

  return server
}
