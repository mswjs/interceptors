import http from 'node:http'
import https from 'node:https'
import { Interceptor } from '../../Interceptor'
import type { HttpRequestEventMap } from '../../glossary'
import {
  kRequestId,
  MockHttpSocketRequestCallback,
  MockHttpSocketResponseCallback,
} from './MockHttpSocket'
import { MockAgent, MockHttpsAgent } from './agents'
import { RequestController } from '../../RequestController'
import { emitAsync } from '../../utils/emitAsync'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'
import { handleRequest } from '../../utils/handleRequest'

export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('client-request-interceptor')

  constructor() {
    super(ClientRequestInterceptor.symbol)
  }

  protected setup(): void {
    const { get: originalGet, request: originalRequest } = http
    const { get: originalHttpsGet, request: originalHttpsRequest } = https

    const onRequest = this.onRequest.bind(this)
    const onResponse = this.onResponse.bind(this)

    http.request = new Proxy(http.request, {
      apply: (target, thisArg, args: Parameters<typeof http.request>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          'http:',
          args
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
          args
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
          args
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
      apply: (target, thisArg, args: Parameters<typeof https.get>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          'https:',
          args
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

  private onRequest: MockHttpSocketRequestCallback = async ({
    request,
    socket,
  }) => {
    const requestId = Reflect.get(request, kRequestId)
    const controller = new RequestController(request)

    const isRequestHandled = await handleRequest({
      request,
      requestId,
      controller,
      emitter: this.emitter,
      onResponse: (response) => {
        socket.respondWith(response)
      },
      onRequestError: (response) => {
        socket.respondWith(response)
      },
      onAborted: (reason) => {
        if (reason instanceof Error) {
          socket.errorWith(reason)
        }
      },
    })

    if (!isRequestHandled) {
      return socket.passthrough()
    }
  }

  public onResponse: MockHttpSocketResponseCallback = async ({
    requestId,
    request,
    response,
    isMockedResponse,
  }) => {
    // Return the promise to when all the response event listeners
    // are finished.
    return emitAsync(this.emitter, 'response', {
      requestId,
      request,
      response,
      isMockedResponse,
    })
  }
}
