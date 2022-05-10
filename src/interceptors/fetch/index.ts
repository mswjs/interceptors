import {
  Headers,
  flattenHeadersObject,
  objectToHeaders,
  headersToObject,
} from 'headers-polyfill'
import type {
  HttpRequestEventMap,
  InteractiveIsomorphicRequest,
  IsomorphicResponse,
} from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { createLazyCallback } from '../../utils/createLazyCallback'
import { toIsoResponse } from '../../utils/toIsoResponse'
import { uuidv4 } from '../../utils/uuid'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('fetch')

  constructor() {
    super(FetchInterceptor.symbol)
  }

  protected checkEnvironment() {
    return typeof window !== 'undefined' && typeof window.fetch !== 'undefined'
  }

  protected setup() {
    const pureFetch = global.fetch

    global.fetch = async (input, init) => {
      const request = new Request(input, init)
      const url = typeof input === 'string' ? input : input.url
      const method = request.method

      this.log('[%s] %s', method, url)

      const isomorphicRequest: InteractiveIsomorphicRequest = {
        id: uuidv4(),
        url: new URL(url, location.origin),
        method: method,
        headers: new Headers(request.headers),
        credentials: request.credentials,
        body: await request.clone().text(),
        respondWith: createLazyCallback(),
      }

      this.log('isomorphic request', isomorphicRequest)

      this.log(
        'emitting the "request" event for %d listener(s)...',
        this.emitter.listenerCount('request')
      )
      this.emitter.emit('request', isomorphicRequest)

      this.log('awaiting for the mocked response...')

      await this.emitter.untilIdle('request')
      this.log('all request listeners have been resolved!')

      const [mockedResponse] = await isomorphicRequest.respondWith.invoked()
      this.log('event.respondWith called with:', mockedResponse)

      if (mockedResponse) {
        this.log('received mocked response:', mockedResponse)

        const isomorphicResponse = toIsoResponse(mockedResponse)
        this.log('derived isomorphic response:', isomorphicResponse)

        this.emitter.emit('response', isomorphicRequest, isomorphicResponse)

        return new Response(mockedResponse.body, {
          ...isomorphicResponse,
          // `Response.headers` cannot be instantiated with the `Headers` polyfill.
          // Apparently, it halts if the `Headers` class contains unknown properties
          // (i.e. the internal `Headers.map`).
          headers: flattenHeadersObject(mockedResponse.headers || {}),
        })
      }

      this.log('no mocked response received!')

      return pureFetch(request).then(async (response) => {
        const cloneResponse = response.clone()
        this.log('original fetch performed', cloneResponse)

        this.emitter.emit(
          'response',
          isomorphicRequest,
          await normalizeFetchResponse(cloneResponse)
        )
        return response
      })
    }

    this.subscriptions.push(() => {
      global.fetch = pureFetch
      this.log('restored native "window.fetch"!', global.fetch.name)
    })
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
