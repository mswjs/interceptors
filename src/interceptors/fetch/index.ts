import {
  flattenHeadersObject,
  Headers,
  headersToObject,
  objectToHeaders,
} from 'headers-utils'
import {
  Interceptor,
  IsomorphicRequest,
  IsomorphicResponse,
  MockedResponse,
} from '../../createInterceptor'

const debug = require('debug')('fetch')

export const interceptFetch: Interceptor = (observer, resolver) => {
  const pureFetch = window.fetch

  debug('replacing "window.fetch"...')

  window.fetch = async (input, init) => {
    const ref = new Request(input, init)
    const url = typeof input === 'string' ? input : input.url
    const method = init?.method || 'GET'

    debug('[%s] %s', method, url)

    const request: IsomorphicRequest = {
      url: new URL(url, location.origin),
      method: method,
      headers: init?.headers ? headersToObject(new Headers(init.headers)) : {},
      body: await ref.text(),
    }
    debug('isomorphic request', request)
    observer.emit('request', request)

    debug('awaiting for the mocked response...')
    const response = await resolver(request, ref)
    debug('mocked response', response)

    if (response) {
      const isomorphicResponse = normalizeMockedResponse(response)
      debug('derived isomorphic response', isomorphicResponse)

      observer.emit('response', request, isomorphicResponse)

      return new Response(response.body, {
        ...isomorphicResponse,
        // `Response.headers` cannot be instantiated with the `Headers` polyfill.
        // Apparently, it halts if the `Headers` class contains unknown properties
        // (i.e. the internal `Headers.map`).
        headers: flattenHeadersObject(response.headers || {}),
      })
    }

    debug('no mocked response found, bypassing...')

    return pureFetch(input, init).then(async (response) => {
      debug('original fetch performed', response)

      observer.emit('response', request, await normalizeFetchResponse(response))
      return response
    })
  }

  return () => {
    debug('restoring modules...')
    window.fetch = pureFetch
  }
}

function normalizeMockedResponse(response: MockedResponse): IsomorphicResponse {
  return {
    status: response.status || 200,
    statusText: response.statusText || 'OK',
    headers: objectToHeaders(response.headers || {}),
    body: response.body,
  }
}

async function normalizeFetchResponse(
  response: Response
): Promise<IsomorphicResponse> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: objectToHeaders(headersToObject(response.headers)),
    body: await response.text(),
  }
}
