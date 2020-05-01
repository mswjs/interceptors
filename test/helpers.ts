import http, { ClientRequest, IncomingMessage, RequestOptions } from 'http'
import { InterceptedRequest } from '../src/glossary'
import { urlToOptions } from '../src/utils/urlToObject'
import { cleanUrl } from '../src/utils/cleanUrl'

export interface RequestAPI {
  ref: ClientRequest
  execute: () => Promise<IncomingMessage>
  findIn: (requests: InterceptedRequest[]) => InterceptedRequest | undefined
}

export function createRequest(config: {
  using: typeof http['request']
  url: string
  options?: RequestOptions
}): RequestAPI {
  const { using, url, options } = config
  const urlInstance = new URL(url)
  const optionsFromUrl = urlToOptions(urlInstance)
  const resolvedOptions = Object.assign({}, optionsFromUrl, options)
  const method = options?.method || 'GET'

  const req = using(resolvedOptions)

  return {
    ref: req,
    execute() {
      return new Promise((resolve, reject) => {
        req.once('response', resolve)
        req.once('error', reject)
        req.end()
      })
    },
    findIn(requests: InterceptedRequest[]) {
      return requests.find((request) => {
        return (
          request.method === method && request.url === cleanUrl(urlInstance)
        )
      })
    },
  }
}

export async function assertIntercepted(
  pool: InterceptedRequest[],
  request: RequestAPI
) {
  await request.execute()
  const intercepted = request.findIn(pool)
  expect(intercepted).toBeTruthy()
}

export async function assertHeaders(
  pool: InterceptedRequest[],
  request: RequestAPI
) {
  await request.execute()
  const intercepted = request.findIn(pool)
  expect(intercepted).toBeTruthy()
  expect(intercepted).toHaveProperty('headers', request.ref.getHeaders())
}

export async function assertQueryParameter(
  pool: InterceptedRequest[],
  request: RequestAPI,
  params: Record<string, string>
) {
  await request.execute()
  const intercepted = request.findIn(pool)

  Object.entries(params).forEach(([name, value]) => {
    expect(intercepted?.query.get(name)).toEqual(value)
  })
}

export async function assertBody(
  pool: InterceptedRequest[],
  request: RequestAPI,
  expectedBody: string
) {
  await request.execute()
  const intercepted = request.findIn(pool)
  expect(intercepted).toHaveProperty('body', expectedBody)
}
