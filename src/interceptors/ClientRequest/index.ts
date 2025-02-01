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
import {
  recordRawFetchHeaders,
  restoreHeadersPrototype,
} from './utils/recordRawHeaders'
import { types } from 'node:util'

type MutableReqProxy<T extends Function> = T & {original: T, updateCallbacks: (onRequest: MockHttpSocketRequestCallback, onResponse: MockHttpSocketResponseCallback) => void}

function isMutableReqProxy<T extends Function>(target: T): target is MutableReqProxy<T> {
  return types.isProxy(target) && 'updateCallbacks' in target && typeof target.updateCallbacks === 'function';
}

export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('client-request-interceptor')

  constructor() {
    super(ClientRequestInterceptor.symbol)
  }

  protected buildProxy<T extends typeof http.request>(protocol: 'http:' | 'https:', target: T, onRequest: MockHttpSocketRequestCallback, onResponse: MockHttpSocketResponseCallback): MutableReqProxy<T> {
    return Object.assign(new Proxy(target, {
      apply: (target, thisArg, args: Parameters<typeof http.request>) => {
        const [url, options, callback] = normalizeClientRequestArgs(
          protocol,
          args
        )
        const agentOpts = {
          customAgent: options.agent,
          onRequest,
          onResponse,
        }
        const mockAgent = protocol === 'http:' ? new MockAgent(agentOpts) : new MockHttpsAgent(agentOpts)
        options.agent = mockAgent

        return Reflect.apply(target, thisArg, [url, options, callback])
      },
    }), {
      updateCallbacks: (_onRequest: MockHttpSocketRequestCallback, _onResponse: MockHttpSocketResponseCallback) => {
        onRequest = _onRequest
        onResponse = _onResponse
      },
      original: target,
    })
  }
  protected setup(): void {
    const { get: httpGet, request: httpRequest } = http
    const { get: httpsGet, request: httpsRequest } = https

    const onRequest = this.onRequest.bind(this)
    const onResponse = this.onResponse.bind(this)

    if (isMutableReqProxy(httpRequest)) {
      httpRequest.updateCallbacks(onRequest, onResponse)
      this.logger.info('found existing proxy - updating for new request handlers')
    } else {
      http.request = this.buildProxy('http:', httpRequest, onRequest, onResponse)
      this.subscriptions.push(() => {
        http.request = httpRequest
      })
    }

    if (isMutableReqProxy(httpGet)) {
      httpGet.updateCallbacks(onRequest, onResponse)
    } else {
      http.get = this.buildProxy('http:', httpGet, onRequest, onResponse)
      this.subscriptions.push(() => {
        http.get = httpGet
      })
    }

    if (isMutableReqProxy(httpsRequest)) {
      httpsRequest.updateCallbacks(onRequest, onResponse)
    } else {
      https.request = this.buildProxy('https:', httpsRequest, onRequest, onResponse)
      this.subscriptions.push(() => {
        https.request = httpsRequest
      })
    }

    if (isMutableReqProxy(httpsGet)) {
      httpsGet.updateCallbacks(onRequest, onResponse)
    } else {
      https.get = this.buildProxy('https:', httpsGet, onRequest, onResponse)
      this.subscriptions.push(() => {
        https.get = httpsGet
      })
    }

    // Spy on `Header.prototype.set` and `Header.prototype.append` calls
    // and record the raw header names provided. This is to support
    // `IncomingMessage.prototype.rawHeaders`.
    recordRawFetchHeaders()

    this.subscriptions.push(() => {
      restoreHeadersPrototype()
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
      onError: (error) => {
        if (error instanceof Error) {
          socket.errorWith(error)
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
