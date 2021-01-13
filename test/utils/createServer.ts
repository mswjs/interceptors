import fs from 'fs'
import path from 'path'
import { AddressInfo } from 'net'
import http from 'http'
import https from 'https'
import cors from 'cors'
import express from 'express'

const SSL_KEY = fs.readFileSync(path.join(__dirname, 'server.key'))
const SSL_CERT = fs.readFileSync(path.join(__dirname, 'server.cert'))

type MakeUrlFunc = (path: string) => string

export interface ServerAPI {
  getHttpAddress(): string
  getHttpsAddress(): string
  makeHttpUrl: MakeUrlFunc
  makeHttpsUrl: MakeUrlFunc
  close(): Promise<void>
}

function untilServerReady<ServerType extends http.Server>(
  server: ServerType
): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    try {
      const serverRef = server.listen(() => {
        resolve(serverRef)
      })
    } catch (error) {
      reject(error)
    }
  })
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        return reject(error)
      }

      resolve()
    })
  })
}

function getServerAddress(server: http.Server | https.Server): () => string {
  return () => {
    const protocol = server.hasOwnProperty('key') ? 'https:' : 'http:'
    const { port } = server.address() as AddressInfo

    return new URL(`${protocol}//localhost:${port}`).href
  }
}

function makeServerUrl(server: http.Server): MakeUrlFunc {
  const serverUrl = getServerAddress(server)()

  return (path) => {
    const url = new URL(path, serverUrl)
    return url.href
  }
}

/**
 * A custom HTTPS agent to support requestst to the local HTTPS server
 * with a self-signed SSL certificate.
 */
export const httpsAgent = new https.Agent({ rejectUnauthorized: false })

/**
 * Creates and runs a local HTTP and HTTPS servers meant to act as actual production servers
 * living outside of the mocked domain.
 */
export async function createServer(
  withRoutes?: (app: express.Express) => void
): Promise<ServerAPI> {
  const app = express()
  app.use(cors())

  withRoutes?.(app)

  const httpServer = await untilServerReady(http.createServer(app))
  const httpsServer = await untilServerReady(
    https.createServer(
      {
        key: SSL_KEY,
        cert: SSL_CERT,
      },
      app
    )
  )

  return {
    getHttpAddress: getServerAddress(httpServer),
    getHttpsAddress: getServerAddress(httpsServer),
    makeHttpUrl: makeServerUrl(httpServer),
    makeHttpsUrl: makeServerUrl(httpsServer),
    async close() {
      await Promise.all([closeServer(httpServer), closeServer(httpsServer)])
    },
  }
}
