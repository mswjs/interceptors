import { invariant } from 'outvariant'
import net from 'node:net'
import zlib from 'node:zlib'
import { Readable } from 'node:stream'
import http from 'node:http'
import { RequestHandler } from 'express'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { Page } from '@playwright/test'
import { MockedFunction } from 'node_modules/vitest/dist'
import { SerializedRequest } from '#/src/RemoteHttpInterceptor'
import { FetchResponse } from '#/src/utils/fetchUtils'

export const REQUEST_ID_REGEXP = /^\w{9,}$/

export async function readBlob(
  blob: Blob
): Promise<string | ArrayBuffer | null> {
  const pendingResult = new DeferredPromise<string | ArrayBuffer | null>()

  const reader = new FileReader()
  reader.addEventListener('loadend', () => {
    pendingResult.resolve(reader.result)
  })
  reader.addEventListener('abort', () => pendingResult.reject())
  reader.addEventListener('error', () => pendingResult.reject())
  reader.readAsText(blob)

  return pendingResult
}

export interface XMLHttpResponse {
  status: number
  statusText: string
  headers: string
  body: string
}

export interface BrowserXMLHttpRequestInit {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  withCredentials?: boolean
  async?: boolean
}

export async function extractRequestFromPage(page: Page): Promise<Request> {
  const requestJson = await page.evaluate(() => {
    return new Promise<SerializedRequest>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        reject(
          new Error(
            'Browser runtime module did not dispatch the custom "resolver" event'
          )
        )
      }, 5000)

      window.addEventListener(
        'resolver' as any,
        (event: CustomEvent<SerializedRequest>) => {
          clearTimeout(timeoutTimer)
          resolve(event.detail)
        }
      )
    })
  })

  const request = new Request(requestJson.url, {
    method: requestJson.method,
    headers: new Headers(requestJson.headers),
    credentials: requestJson.credentials,
    body: ['GET', 'HEAD'].includes(requestJson.method)
      ? null
      : requestJson.body,
  })

  return request
}

export function createRawBrowserXMLHttpRequest(page: Page) {
  return (requestInit: BrowserXMLHttpRequestInit) => {
    const { method, url, headers, body, withCredentials, async } = requestInit

    return page.evaluate<
      XMLHttpResponse,
      [
        string,
        string,
        Record<string, string> | undefined,
        string | undefined,
        boolean | undefined,
        boolean,
      ]
    >(
      (args) => {
        return new Promise((resolve, reject) => {
          // Can't use array destructuring because Playwright will explode.
          const method = args[0]
          const url = args[1]
          const headers = args[2] || {}
          const body = args[3]
          const withCredentials = args[4]

          const request = new XMLHttpRequest()
          if (typeof withCredentials !== 'undefined') {
            Reflect.set(request, 'withCredentials', withCredentials)
          }
          request.open(method, url, args[5])

          for (const headerName in headers) {
            request.setRequestHeader(headerName, headers[headerName])
          }

          request.addEventListener('load', function () {
            resolve({
              status: this.status,
              statusText: this.statusText,
              headers: this.getAllResponseHeaders(),
              body: this.response,
            })
          })
          request.addEventListener('error', reject)
          request.send(body)
        })
      },
      [method, url, headers, body, withCredentials, async ?? true]
    )
  }
}

export function createBrowserXMLHttpRequest(page: Page) {
  return async (
    requestInit: BrowserXMLHttpRequestInit
  ): Promise<[Request, XMLHttpResponse]> => {
    return Promise.all([
      extractRequestFromPage(page),
      createRawBrowserXMLHttpRequest(page)(requestInit),
    ])
  }
}

export async function toWebResponse(
  request: http.ClientRequest
): Promise<[Response, http.IncomingMessage]> {
  const pendingResponse = new DeferredPromise<
    [Response, http.IncomingMessage]
  >()

  request
    .on('response', (response) => {
      const responseBody = response.destroyed
        ? null
        : (Readable.toWeb(response) as ReadableStream)

      const fetchResponse = new FetchResponse(responseBody, {
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: FetchResponse.parseRawHeaders(response.rawHeaders),
      })

      pendingResponse.resolve([fetchResponse, response])
    })
    .on('error', (error) => pendingResponse.reject(error))
    .on('abort', () => pendingResponse.reject(new Error('Request aborted')))

  return pendingResponse
}

export const useCors: RequestHandler = (_req, res, next) => {
  res.set({
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  })
  return next()
}

/**
 * Compress the given data using the specified `Content-Encoding` codings
 * left-to-right.
 */
export function compressResponse(
  codings: Array<'gzip' | 'x-gzip' | 'deflate' | 'br'>,
  input: string
) {
  let output = Buffer.from(input)

  for (const coding of codings) {
    if (coding === 'gzip' || coding === 'x-gzip') {
      output = zlib.gzipSync(output)
    } else if (coding === 'deflate') {
      output = zlib.deflateSync(output)
    } else if (coding === 'br') {
      output = zlib.brotliCompressSync(output)
    }
  }

  return output
}

export async function createTestServer<T extends net.Server>(
  createServer: () => T
): Promise<
  AsyncDisposable & {
    instance: T
    port: number
    hostname: string
    http: {
      url: (path: string) => URL
    }
    https: {
      url: (path: string) => URL
    }
  }
> {
  const server = createServer()

  const pendingListen = new DeferredPromise<void>()

  server
    .listen(0, '127.0.0.1', () => pendingListen.resolve())
    .once('error', (error) => pendingListen.reject(error))

  await pendingListen

  const rawAddress = server.address()

  invariant(
    rawAddress != null,
    'Failed to open a test server: server address is null'
  )
  invariant(
    typeof rawAddress === 'object' && 'port' in rawAddress,
    'Failed to open a test server: server address is not AddressInfo'
  )

  const createUrlHelper = (protocol: 'https' | 'http') => {
    return (path: string): URL => {
      return new URL(
        path,
        new URL(`${protocol}://${rawAddress.address}:${rawAddress.port}`)
      )
    }
  }

  return {
    async [Symbol.asyncDispose]() {
      const pendingClose = new DeferredPromise<void>()
      server.close((error) => {
        if (error) {
          return pendingClose.reject(error)
        }

        pendingClose.resolve()
      })
    },
    instance: server,
    port: rawAddress.port,
    hostname: rawAddress.address,
    http: {
      url: createUrlHelper('http'),
    },
    https: {
      url: createUrlHelper('https'),
    },
  }
}

export function spyOnSocket(socket: net.Socket) {
  const eventNames = [
    'lookup',
    'connectionAttempt',
    'connectionAttemptFailed',
    'connectionAttemptTimeout',
    'connect',
    'ready',
    'data',
    'drain',
    'end',
    'error',
    'timeout',
    'close',
  ] as const

  const events: Array<any> = []
  const listeners = {} as Record<
    (typeof eventNames)[number],
    MockedFunction<any>
  >

  for (const eventName of eventNames) {
    listeners[eventName] = vi.fn((...args) => events.push([eventName, ...args]))
    socket.on(eventName, listeners[eventName])
  }

  return {
    events,
    listeners,
  }
}
