import https from 'https'
import http, { IncomingMessage, RequestOptions } from 'http'
import nodeFetch, { Response, RequestInfo, RequestInit } from 'node-fetch'
import { urlToOptions } from '../src/utils/urlToOptions'
import { InterceptedRequest } from '../src/glossary'
import { getCleanUrl } from '../src/utils/getCleanUrl'

interface PromisifiedResponse {
  res: IncomingMessage
  url: string
  options: RequestOptions
}

export function httpGet(
  url: string,
  options?: RequestOptions
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign({}, urlToOptions(parsedUrl), options)

  return new Promise((resolve, reject) => {
    http.get(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', () => null)
      res.on('error', reject)
      res.on('end', () => resolve({ res, url, options: resolvedOptions }))
    })
  })
}

export function httpsGet(
  url: string,
  options?: RequestOptions
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign({}, urlToOptions(parsedUrl), options)

  return new Promise((resolve, reject) => {
    https.get(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', () => null)
      res.on('error', reject)
      res.on('end', () => resolve({ res, url, options: resolvedOptions }))
    })
  })
}

export function httpRequest(
  url: string,
  options?: RequestOptions,
  body?: string
): Promise<PromisifiedResponse> {
  const parsedUrl = new URL(url)
  const resolvedOptions = Object.assign({}, urlToOptions(parsedUrl), options)

  return new Promise((resolve, reject) => {
    const req = http.request(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', () => null)
      res.on('error', reject)
      res.on('end', () => resolve({ res, url, options: resolvedOptions }))
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
  const resolvedOptions = Object.assign({}, urlToOptions(parsedUrl), options)

  return new Promise((resolve, reject) => {
    const req = https.request(resolvedOptions, (res) => {
      res.setEncoding('utf8')
      res.on('data', () => null)
      res.on('error', reject)
      res.on('end', () => resolve({ res, url, options: resolvedOptions }))
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
  method: string
  url: string
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

    req.onload = function () {
      resolve({ method, url })
    }

    if (options?.headers) {
      Object.entries(options.headers).forEach(([name, value]) => {
        req.setRequestHeader(
          name,
          Array.isArray(value) ? value.join('; ') : value
        )
      })
    }

    req.onerror = reject
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
