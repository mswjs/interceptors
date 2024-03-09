import http from 'node:http'
import https from 'node:https'
import { randomUUID } from 'node:crypto'
import { until } from '@open-draft/until'
import { Interceptor } from '../../Interceptor'
import type { HttpRequestEventMap } from '../../glossary'
import {
  MockAgent,
  MockHttpsAgent,
  type MockAgentOnRequestCallback,
  type MockAgentOnResponseCallback,
} from './agents'
import { emitAsync } from '../../utils/emitAsync'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

export class _ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('client-request-interceptor')

  constructor() {
    super(_ClientRequestInterceptor.symbol)
  }

  protected setup(): void {
    const { get: originalGet, request: originalRequest } = http
    const { get: originalHttpsGet, request: originalHttpsRequest } = http

    const onRequest = this.onRequest.bind(this)
    const onResponse = this.onResponse.bind(this)

    http.request = new Proxy(http.request, {
      apply: (target, thisArg, args: Parameters<typeof http.request>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          'http:',
          ...args
        )
        const mockAgent = new MockAgent({
          customAgent: options.agent,
          onRequest,
          onResponse,
        })
        options.agent = mockAgent

        return Reflect.apply(target, thisArg, [url, options, callback])
      },
    })

    http.get = new Proxy(http.get, {
      apply: (target, thisArg, args: Parameters<typeof http.get>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          'http:',
          ...args
        )

        const mockAgent = new MockAgent({
          customAgent: options.agent,
          onRequest,
          onResponse,
        })
        options.agent = mockAgent

        return Reflect.apply(target, thisArg, [url, options, callback])
      },
    })

    //
    // HTTPS.
    //

    https.request = new Proxy(https.request, {
      apply: (target, thisArg, args: Parameters<typeof https.request>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          'https:',
          ...args
        )

        const mockAgent = new MockHttpsAgent({
          customAgent: options.agent,
          onRequest,
          onResponse,
        })
        options.agent = mockAgent

        return Reflect.apply(target, thisArg, [url, options, callback])
      },
    })

    https.get = new Proxy(https.get, {
      apply: (target, thisArg, args: Parameters<typeof https.request>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          'https:',
          ...args
        )

        const mockAgent = new MockHttpsAgent({
          customAgent: options.agent,
          onRequest,
          onResponse,
        })
        options.agent = mockAgent

        return Reflect.apply(target, thisArg, [url, options, callback])
      },
    })

    this.subscriptions.push(() => {
      http.get = originalGet
      http.request = originalRequest

      https.get = originalHttpsGet
      https.request = originalHttpsRequest
    })
  }

  private onRequest: MockAgentOnRequestCallback = async ({
    request,
    socket,
  }) => {
    const requestId = randomUUID()
    const { interactiveRequest, requestController } =
      toInteractiveRequest(request)

    // TODO: Abstract this bit. We are using it everywhere.
    this.emitter.once('request', ({ requestId: pendingRequestId }) => {
      if (pendingRequestId !== requestId) {
        return
      }

      if (requestController.responsePromise.state === 'pending') {
        this.logger.info(
          'request has not been handled in listeners, executing fail-safe listener...'
        )

        requestController.responsePromise.resolve(undefined)
      }
    })

    const listenerResult = await until(async () => {
      await emitAsync(this.emitter, 'request', {
        requestId,
        request: interactiveRequest,
      })

      return await requestController.responsePromise
    })

    if (listenerResult.error) {
      socket.errorWith(listenerResult.error)
      return
    }

    const mockedResponse = listenerResult.data

    if (mockedResponse) {
      socket.respondWith(mockedResponse)
      return
    }

    socket.passthrough()
  }

  public onResponse: MockAgentOnResponseCallback = async ({ response }) => {
    console.log('RESPONSE:', response.status, response.statusText)
  }
}
