import https from 'https'
import http, { IncomingMessage, RequestOptions } from 'http'
import nodeFetch, { Response, RequestInfo, RequestInit } from 'node-fetch'
import { getRequestOptionsByUrl } from '../src/utils/getRequestOptionsByUrl'
import { getCleanUrl } from '../src/utils/getCleanUrl'
import { getIncomingMessageBody } from '../src/interceptors/ClientRequest/utils/getIncomingMessageBody'
import { IsomorphicRequest } from '../src/createInterceptor'
import { ScenarioApi } from 'page-with'

interface PromisifiedResponse {
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
      resolve({ res, resBody, url, options: resolvedOptions })
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
      resolve({ res, resBody, url, options: resolvedOptions })
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
      resolve({ res, resBody, url, options: resolvedOptions })
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
      resolve({ res, resBody, url, options: resolvedOptions })
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

export interface ExpectedRequest {
  method: string
  url: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body: string
}

declare namespace window {
  export let expected: ExpectedRequest
}

export interface XMLHttpResponse {
  status: number
  statusText: string
  headers: string
  body: string
}

export function createBrowserXMLHttpRequest(scenario: ScenarioApi) {
  return async (
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: string,
    assertions?: { expected: ExpectedRequest },
    sync: boolean = false
  ): Promise<XMLHttpResponse> => {
    if (assertions?.expected) {
      await scenario.page.evaluate((expected) => {
        window.expected = expected
      }, assertions.expected)
    }

    return scenario.page.evaluate<
      XMLHttpResponse,
      [
        string,
        string,
        Record<string, string> | undefined,
        string | undefined,
        boolean
      ]
    >(
      (args) => {
        const request = new XMLHttpRequest()
        request.open(args[0], args[1], args[4])

        if (args[2]) {
          for (const headerName in args[2]) {
            request.setRequestHeader(headerName, args[2][headerName])
          }
        }

        if (args[4]) {
          request.send(args[3])
          return Promise.resolve({
            status: request.status,
            statusText: request.statusText,
            body: request.response,
            headers: request.getAllResponseHeaders(),
          })
        }

        return new Promise((resolve, reject) => {
          request.addEventListener('load', function () {
            resolve({
              status: this.status,
              statusText: this.statusText,
              body: this.response,
              headers: this.getAllResponseHeaders(),
            })
          })
          request.addEventListener('error', reject)
          request.send(args[3])
        })
      },
      [method, url, headers, body, sync]
    )
  }
}
