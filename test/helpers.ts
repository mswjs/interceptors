import https from 'https'
import http, { IncomingMessage, RequestOptions } from 'http'
import nodeFetch, { Response, RequestInfo, RequestInit } from 'node-fetch'
import { getRequestOptionsByUrl } from '../src/utils/getRequestOptionsByUrl'
import { InterceptedRequest } from '../src/glossary'
import { getCleanUrl } from '../src/utils/getCleanUrl'

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
  let resBody = ''
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve, reject) => {
    const req = http.get(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk) => (resBody += chunk))
      res.on('error', reject)
      res.on('end', () =>
        resolve({ res, resBody, url, options: resolvedOptions })
      )
    })

    req.on('error', reject)
  })
}

export function httpsGet(
  url: string,
  options?: RequestOptions
): Promise<PromisifiedResponse> {
  let resBody = ''
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve, reject) => {
    const req = https.get(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk) => (resBody += chunk))
      res.on('error', reject)
      res.on('end', () =>
        resolve({ res, resBody, url, options: resolvedOptions })
      )
    })

    req.on('error', reject)
  })
}

export function httpRequest(
  url: string,
  options?: RequestOptions,
  body?: string
): Promise<PromisifiedResponse> {
  let resBody = ''
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve, reject) => {
    const req = http.request(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk) => (resBody += chunk))
      res.on('error', reject)
      res.on('end', () =>
        resolve({ res, resBody, url, options: resolvedOptions })
      )
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
  let resBody = ''
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign(
    {},
    getRequestOptionsByUrl(parsedUrl),
    options
  )

  return new Promise((resolve, reject) => {
    const req = https.request(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk) => (resBody += chunk))
      res.on('error', reject)
      res.on('end', () =>
        resolve({ res, resBody, url, options: resolvedOptions })
      )
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

interface PromisifiedXhrPayload {
  status: number
  statusText: string
  method: string
  url: string
  body: any
}

export async function xhr(
  method: string,
  url: string,
  options?: {
    body?: string
    headers?: Record<string, string | string[]>
  }
): Promise<PromisifiedXhrPayload> {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest()
    req.open(method, url)

    req.addEventListener('load', () => {
      resolve({
        method,
        url,
        body: req.response,
        status: req.status,
        statusText: req.statusText,
      })
    })

    if (options?.headers) {
      Object.entries(options.headers).forEach(([name, value]) => {
        req.setRequestHeader(
          name,
          Array.isArray(value) ? value.join('; ') : value
        )
      })
    }

    req.addEventListener('error', reject)
    req.addEventListener('abort', reject)

    req.send(options?.body)
  })
}

export function findRequest(
  pool: InterceptedRequest[],
  method: string = 'GET',
  url: string
): InterceptedRequest | undefined {
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
  pool: InterceptedRequest[]
): Promise<InterceptedRequest | undefined> {
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
  req.send()

  return new Promise((resolve, reject) => {
    req.addEventListener('loadend', () => {
      resolve(req)
    })

    req.addEventListener('error', reject)
    req.addEventListener('abort', reject)
  })
}
