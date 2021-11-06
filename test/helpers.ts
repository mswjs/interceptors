import https from 'https'
import http, { ClientRequest, IncomingMessage, RequestOptions } from 'http'
import nodeFetch, { Response, RequestInfo, RequestInit } from 'node-fetch'
import { Headers } from 'headers-utils'
import { Page, ScenarioApi } from 'page-with'
import { getRequestOptionsByUrl } from '../src/utils/getRequestOptionsByUrl'
import { getCleanUrl } from '../src/utils/getCleanUrl'
import { getIncomingMessageBody } from '../src/interceptors/ClientRequest/utils/getIncomingMessageBody'
import { IsomorphicRequest, RequestCredentials } from '../src/createInterceptor'

export interface PromisifiedResponse {
  req: ClientRequest
  res: IncomingMessage
  resBody: string
  url: string
  options: RequestOptions
}

export function httpGet(
  url: string,
  options?: RequestOptions
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve, reject) => {
    const req = http.get(resolvedOptions, async (res) => {
      res.setEncoding('utf8')
      const resBody = await getIncomingMessageBody(res)
      resolve({ req, res, resBody, url, options: resolvedOptions })
    })

    req.on('error', reject)
  })
}

export function httpsGet(
  url: string,
  options?: RequestOptions
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve, reject) => {
    const req = https.get(resolvedOptions, async (res) => {
      res.setEncoding('utf8')
      const resBody = await getIncomingMessageBody(res)
      resolve({ req, res, resBody, url, options: resolvedOptions })
    })

    req.on('error', reject)
  })
}

export function httpRequest(
  url: string,
  options?: RequestOptions,
  body?: string
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve) => {
    const req = http.request(resolvedOptions, async (res) => {
      res.setEncoding('utf8')
      const resBody = await getIncomingMessageBody(res)
      resolve({ req, res, resBody, url, options: resolvedOptions })
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

export function httpsRequest(
  url: string,
  options?: RequestOptions,
  body?: string
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve) => {
    const req = https.request(resolvedOptions, async (res) => {
      res.setEncoding('utf8')
      const resBody = await getIncomingMessageBody(res)
      resolve({ req, res, resBody, url, options: resolvedOptions })
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

interface PromisifiedFetchPayload {
  res: Response
  url: string
  init?: RequestInit
}

export async function fetch(
  info: RequestInfo,
  init?: RequestInit
): Promise<PromisifiedFetchPayload> {
  let url: string = ''
  const res = await nodeFetch(info, init)

  if (typeof info === 'string') {
    url = info
  } else if ('href' in info) {
    url = info.href
  } else if ('url' in info) {
    url = info.url
  }

  return {
    res,
    url,
    init,
  }
}

export function findRequest(
  pool: IsomorphicRequest[],
  method: string = 'GET',
  url: string
): IsomorphicRequest | undefined {
  const parsedUrl = new URL(url)
  const expectedUrl = getCleanUrl(parsedUrl)

  return pool.find((request) => {
    const isMethodEqual = request.method === method
    const isUrlEqual = getCleanUrl(request.url) === expectedUrl

    return isMethodEqual && isUrlEqual
  })
}

export async function prepare(
  promise: Promise<PromisifiedResponse>,
  pool: IsomorphicRequest[]
): Promise<IsomorphicRequest | undefined> {
  const { url, options } = await promise
  return findRequest(pool, options.method, url)
}

export async function readBlob(
  blob: Blob
): Promise<string | ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('loadend', () => {
      resolve(reader.result)
    })
    reader.addEventListener('abort', reject)
    reader.addEventListener('error', reject)
    reader.readAsText(blob)
  })
}

export function createXMLHttpRequest(
  middleware: (req: XMLHttpRequest) => void
): Promise<XMLHttpRequest> {
  const req = new XMLHttpRequest()
  middleware(req)

  if (req.readyState < 1) {
    throw new Error(
      'Failed to create an XMLHttpRequest. Did you forget to call `req.open()` in the middleware function?'
    )
  }

  if (req.readyState < 2) {
    // Send the request only if it hasn't been sent
    // as a part of the middleware function.
    req.send()
  }

  return new Promise((resolve, reject) => {
    req.addEventListener('loadend', () => {
      resolve(req)
    })

    req.addEventListener('error', reject)
    req.addEventListener('abort', reject)
  })
}

export interface XMLHttpResponse {
  status: number
  statusText: string
  headers: string
  body: string
}

export interface StringifiedIsomorphicRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  credentials: RequestCredentials
  body?: string
}

interface BrowserXMLHttpRequestInit {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  withCredentials?: boolean
}

export async function extractRequestFromPage(
  page: Page
): Promise<IsomorphicRequest> {
  const request = await page.evaluate(() => {
    return new Promise<StringifiedIsomorphicRequest>((resolve) => {
      window.addEventListener(
        'resolver' as any,
        (event: CustomEvent<string>) => {
          resolve(JSON.parse(event.detail))
        }
      )
    })
  })

  return {
    id: request.id,
    method: request.method,
    url: new URL(request.url),
    headers: new Headers(request.headers),
    credentials: request.credentials,
    body: request.body,
  }
}

export function createRawBrowserXMLHttpRequest(scenario: ScenarioApi) {
  return (requestInit: BrowserXMLHttpRequestInit) => {
    const { method, url, headers, body, withCredentials } = requestInit

    return scenario.page.evaluate<
      XMLHttpResponse,
      [
        string,
        string,
        Record<string, string> | undefined,
        string | undefined,
        boolean | undefined
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
            request.withCredentials = withCredentials
          }
          request.open(method, url)

          for (const headerName in headers) {
            request.setRequestHeader(headerName, headers[headerName])
          }

          request.addEventListener('load', function () {
            resolve({
              status: this.status,
              statusText: this.statusText,
              body: this.response,
              headers: this.getAllResponseHeaders(),
            })
          })
          request.addEventListener('error', reject)
          request.send(body)
        })
      },
      [method, url, headers, body, withCredentials]
    )
  }
}

export function createBrowserXMLHttpRequest(scenario: ScenarioApi) {
  return async (
    requestInit: BrowserXMLHttpRequestInit
  ): Promise<[IsomorphicRequest, XMLHttpResponse]> => {
    return Promise.all([
      extractRequestFromPage(scenario.page),
      createRawBrowserXMLHttpRequest(scenario)(requestInit),
    ])
  }
}
