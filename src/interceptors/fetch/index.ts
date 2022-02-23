import {
  Headers,
  headersToObject,
  objectToHeaders,
  flattenHeadersObject,
} from 'headers-polyfill'
import {
  Interceptor,
  IsomorphicRequest,
  IsomorphicResponse,
} from '../../createInterceptor'
import { toIsoResponse } from '../../utils/toIsoResponse'
import { uuidv4 } from '../../utils/uuid'

const debug = require('debug')('fetch')

export const interceptFetch: Interceptor = (observer, resolver) => {
  const pureFetch = window.fetch

  debug('replacing "window.fetch"...')

  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = typeof input === 'string' ? input : input.url
    const method = request.method

    debug('[%s] %s', method, url)

    const isoRequest: IsomorphicRequest = {
      id: uuidv4(),
      url: new URL(url, location.origin),
      method: method,
      headers: new Headers(request.headers),
      credentials: request.credentials,
      body: await request.clone().text(),
    }
    debug('isomorphic request', isoRequest)
    observer.emit('request', isoRequest)

    debug('awaiting for the mocked response...')
    const response = await resolver(isoRequest, request)
    debug('mocked response', response)

    if (response) {
      const isomorphicResponse = toIsoResponse(response)
      debug('derived isomorphic response', isomorphicResponse)

      observer.emit('response', isoRequest, isomorphicResponse)

      return new Response(response.body, {
        ...isomorphicResponse,
        // `Response.headers` cannot be instantiated with the `Headers` polyfill.
        // Apparently, it halts if the `Headers` class contains unknown properties
        // (i.e. the internal `Headers.map`).
        headers: flattenHeadersObject(response.headers || {}),
      })
    }

    debug('no mocked response found, bypassing...')

    return pureFetch(request).then(async (response) => {
      const cloneResponse = response.clone()
      debug('original fetch performed', cloneResponse)

      observer.emit(
        'response',
        isoRequest,
        await normalizeFetchResponse(cloneResponse)
      )
      return response
    })
  }

  return () => {
    debug('restoring modules...')
    window.fetch = pureFetch
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
