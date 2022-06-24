import { until } from '@open-draft/until'
import { Headers } from 'headers-polyfill/lib'
import * as http from 'http'
import { Socket } from 'net'
import { invariant } from 'outvariant'
import { ClientRequestEmitter } from '.'
import {
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
  MockedResponse,
} from '../../glossary'
import { createLazyCallback } from '../../utils/createLazyCallback'
import { uuidv4 } from '../../utils/uuid'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

export function createHttpGetHandler(emitter: ClientRequestEmitter) {
  return (
    target: typeof http.get,
    context: typeof http,
    args: Parameters<typeof http.get>
  ) => {
    const [url, options, callback] = normalizeClientRequestArgs(
      'http:',
      ...args
    )
    const nextOptions: http.RequestOptions = {
      ...options,
      // Inject mock agent into all constructed requests.
      agent: new HttpMockAgent({
        url,
        emitter,
      }),
    }

    return Reflect.apply(target, context, [url, nextOptions, callback])
  }
}

interface HttpMockAgentOptions {
  url: URL
  emitter: ClientRequestEmitter
}

class HttpMockAgent extends http.Agent {
  private url: URL
  private emitter: ClientRequestEmitter

  constructor(options: HttpMockAgentOptions) {
    super()
    this.url = options.url
    this.emitter = options.emitter
  }

  async addRequest(
    request: http.ClientRequest,
    options: http.RequestOptions
  ): Promise<void> {
    const socket = new Socket()
    // @ts-expect-error Writing to a readonly property.
    request.socket = socket
    request.emit('socket', socket)

    socket.emit('connect')
    socket.emit('resume')
    socket.emit('lookup')

    // Lookup a mocked response for this request.
    const isomorphicRequest = toIsomorphicRequest(
      this.url,
      request,
      /**
       * @todo Extract request body.
       */
      ''
    )
    const interactiveIsomorphicRequest: InteractiveIsomorphicRequest = {
      ...isomorphicRequest,
      respondWith: createLazyCallback({
        maxCalls: 1,
        maxCallsCallback() {
          throw new Error('request event already responses to.')
        },
      }),
    }

    this.emitter.emit('request', interactiveIsomorphicRequest)

    const [resolverException, mockedResponse] = await until(async () => {
      await this.emitter.untilIdle('request', ({ args: [request] }) => {
        return request.id === interactiveIsomorphicRequest.id
      })

      const [mockedResponse] =
        await interactiveIsomorphicRequest.respondWith.invoked()
      return mockedResponse
    })

    if (resolverException) {
      /**
       * @todo Check if socket error propagates to the request error.
       * May be no need to emit both here, socket will be enough.
       */
      // request.emit('error', resolverException)
      socket.emit('end')
      socket.emit('close', resolverException)
      terminateRequest(request)
      return
    }

    if (mockedResponse) {
      console.warn('should respond with mocks!')
      respondWith(request, mockedResponse)
      socket.emit('end')
      socket.emit('close')
      return
    }

    /**
     * @fixme Handle mock sockets better as this now
     * will emit socket events twice:
     * - once for the mock socket;
     * - the second time for the actual socket below.
     */
    // Perform the request as-is at this point.
    // @ts-expect-error Internal method.
    return super['addRequest'](request, options)
  }
}

function terminateRequest(request: http.ClientRequest): void {
  const agent =
    // @ts-expect-error Accessing private property.
    request.agent as http.Agent
  agent.destroy()
}

function toIsomorphicRequest(
  url: URL,
  request: http.ClientRequest,
  body: string
): IsomorphicRequest {
  const outgoingHeaders = request.getHeaders()
  const headers = new Headers()
  for (const [headerName, headerValue] of Object.entries(outgoingHeaders)) {
    if (!headerValue) {
      continue
    }

    headers.set(headerName.toLowerCase(), headerValue.toString())
  }

  const isomorphicRequest: IsomorphicRequest = {
    /**
     * @todo uuid can be replaced with the native solution.
     * See what we use in MSW instead.
     */
    id: uuidv4(),
    url,
    method: request.method || 'GET',
    credentials: 'same-origin',
    headers,
    body,
  }

  return isomorphicRequest
}

function respondWith(
  request: http.ClientRequest,
  mockedResponse: MockedResponse
): void {
  invariant(
    request.socket,
    'Cannot respond to a request without an active socket connection'
  )

  const response = new http.IncomingMessage(request.socket)

  response.statusCode = mockedResponse.status || 200
  response.statusMessage =
    mockedResponse.statusText || http.STATUS_CODES[response.statusCode]

  if (mockedResponse.headers) {
    response.headers = {}

    for (const [headerName, headerValue] of Object.entries(
      mockedResponse.headers
    )) {
      response.rawHeaders.push(
        headerName,
        ...Array.prototype.concat([], headerValue)
      )

      const insensitiveHeaderName = headerName.toLowerCase()
      const prevHeaders = response.headers[insensitiveHeaderName]
      response.headers[insensitiveHeaderName] = prevHeaders
        ? Array.prototype.concat([], prevHeaders, headerValue)
        : headerValue
    }
  }

  if (mockedResponse.body) {
    response.push(Buffer.from(mockedResponse.body))
  }

  response.push(null)
  response.complete = true

  Object.defineProperties(request, {
    res: {
      value: response,
      enumerable: true,
      configurable: true,
    },
    // Set the deprecated "finished" property for compatibility reasons.
    finished: {
      value: true,
      enumerable: true,
      configurable: true,
    },
    writableEnded: {
      value: true,
      enumerable: true,
      configurable: true,
    },
  })

  request.emit('finish')
  request.emit('response', response)

  terminateRequest(request)
}
