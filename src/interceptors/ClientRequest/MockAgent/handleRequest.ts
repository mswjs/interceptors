import * as http from 'http'
import { Socket } from 'net'
import { debug } from 'debug'
import type { HttpMockAgent } from './HttpMockAgent'
import { toIsomorphicResponse } from '../../../utils/toIsomorphicResponse'
import { createLazyCallback } from '../../../utils/createLazyCallback'
import { invariant } from 'outvariant'
import {
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
  IsomorphicResponse,
  MockedResponse,
} from '../../../glossary'
import { until } from '@open-draft/until'
import {
  HttpRequestEndArgs,
  normalizeClientRequestEndArgs,
} from '../utils/normalizeClientRequestEndArgs'
import {
  ClientRequestWriteArgs,
  normalizeClientRequestWriteArgs,
} from '../utils/normalizeClientRequestWriteArgs'
import { uuidv4 } from '../../../utils/uuid'
import { Headers, objectToHeaders } from 'headers-polyfill/lib'
import { cloneIncomingMessage } from '../utils/cloneIncomingMessage'
import { getIncomingMessageBody } from '../utils/getIncomingMessageBody'
import { pushChunk } from '../utils/pushChunk'

const log = debug('http:agent:addRequest')

export async function handleRequest(
  this: HttpMockAgent,
  request: http.ClientRequest,
  options?: http.RequestOptions
): Promise<void> {
  log(request.method, request.path)

  // return this.next(request, options)
  // console.error('[handleRequest]', request.method, this.requestUrl.href)

  // log('%s %s', request.method, this.requestUrl.href)

  // const { emitter } = this
  // const socket = new Socket()

  // Object.defineProperty(request, 'socket', {
  //   value: socket,
  //   enumerable: true,
  //   configurable: true,
  // })
  // request.emit('socket', socket)

  // socket.emit('connect')
  // socket.emit('resume')
  // socket.emit('lookup')

  // log('established mock socket connection!')

  // const encoding = getContentEncoding(request)
  // log('request body encoding:', encoding)

  // const reqIsClosed = new Promise((resolve) => {
  //   request.on('close', resolve)
  // })

  // const requestBodyBuffer = await drainRequestBody(request)
  // log('read request body:', requestBodyBuffer)

  // // Lookup a mocked response for this request.
  // const isomorphicRequest = toIsomorphicRequest(
  //   this.requestUrl,
  //   request,
  //   requestBodyBuffer
  // )
  // const interactiveIsomorphicRequest: InteractiveIsomorphicRequest = {
  //   ...isomorphicRequest,
  //   respondWith: createLazyCallback({
  //     maxCalls: 1,
  //     maxCallsCallback() {
  //       invariant(
  //         false,
  //         'Failed to respond to "%s %s" request: the "request" event has already been responded to.',
  //         isomorphicRequest.method,
  //         isomorphicRequest.url.href
  //       )
  //     },
  //   }),
  // }

  // log(
  //   'emitting "request" event for %d listeners...',
  //   emitter.listenerCount('request')
  // )
  // emitter.emit('request', interactiveIsomorphicRequest)

  // const [resolverException, mockedResponse] = await until(async () => {
  //   await emitter.untilIdle('request', ({ args: [request] }) => {
  //     /**
  //      * @note Await only the listeners relevant to this request.
  //      * This prevents extraneous parallel request from blocking the resolution
  //      * of sibling requests. For example, during response patching,
  //      * when request resolution is nested.
  //      */
  //     return request.id === interactiveIsomorphicRequest.id
  //   })

  //   const [mockedResponse] =
  //     await interactiveIsomorphicRequest.respondWith.invoked()
  //   return mockedResponse
  // })

  // log('request event resolved:', { resolverException, mockedResponse })

  // if (resolverException) {
  //   socket.emit('end')
  //   socket.emit('close', resolverException)
  //   request.emit('error', resolverException)
  //   terminateRequest(request)
  //   return
  // }

  // if (mockedResponse) {
  //   /**
  //    * @todo Is it possible to write response chunks to the socket?
  //    * So that we don't have to meddle with how ClientRequest handles
  //    * responses?
  //    */
  //   respondWith(request, mockedResponse)

  //   socket.emit('end')
  //   socket.emit('close')

  //   // Let the consumer know about the mocked response.
  //   emitter.emit(
  //     'response',
  //     isomorphicRequest,
  //     toIsomorphicResponse(mockedResponse)
  //   )
  //   return
  // }

  // log('perfroming request as-is...')

  // request.once('error', (error) => {
  //   log('original request error:', error)
  // })

  // request.once('abort', () => {
  //   log('original request aborted')
  // })

  // request.emit = new Proxy(request.emit, {
  //   async apply(target, thisArg, args) {
  //     const [eventName, ...eventArgs] = args

  //     if (eventName === 'response') {
  //       log('original request "response" event, cloning response...')

  //       const res = eventArgs[0] as http.IncomingMessage

  //       // Creating two clones of the original response:
  //       // - The first one will propagate to the consumer.
  //       // - The second one will be read by the interceptor.
  //       const preservedResponse = cloneIncomingMessage(res)
  //       const clonedResponse = cloneIncomingMessage(res)

  //       // Read the clone response body on the next tick.
  //       // This way the consumer reads the preserved response first.
  //       process.nextTick(async () => {
  //         const responseBody = await getIncomingMessageBody(clonedResponse)
  //         const isomorphicResponse: IsomorphicResponse = {
  //           status: clonedResponse.statusCode || 200,
  //           statusText: clonedResponse.statusMessage || 'OK',
  //           headers: objectToHeaders(clonedResponse.headers),
  //           body: responseBody,
  //         }

  //         log('original response:', isomorphicResponse)

  //         emitter.emit('response', isomorphicRequest, isomorphicResponse)
  //       })

  //       log('emitting the "response" event with clonsed response...')

  //       return Reflect.apply(target, thisArg, [
  //         eventName,
  //         preservedResponse,
  //         eventArgs.slice(1),
  //       ])
  //     }

  //     return Reflect.apply(target, thisArg, args)
  //   },
  // })

  // /**
  //  * @fixme Handle mock sockets better as this now
  //  * will emit socket events twice:
  //  * - once for the mock socket;
  //  * - the second time for the actual socket below.
  //  */
  // // Perform the request as-is at this point.
  // return this.next(request, options)
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
  requestBodyBuffer: Buffer
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
    /**
     * @todo Consider handling request body as Buffer
     * to prevent binary content distortion.
     */
    body: requestBodyBuffer.toString('utf8'),
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

  // Emit the "response" event immediately so that the consumer
  // starts reading it while the chunks are pushed. This way
  // consumer can influence the encoding of the body.
  request.emit('response', response)
  request.emit('finish')

  if (mockedResponse.body) {
    const responseBodyBuffer = Buffer.from(mockedResponse.body)
    response.push(responseBodyBuffer)
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

  terminateRequest(request)
}

/**
 * Extract request content encoding.
 * Respect the `Content-Encoding` request header if set,
 * otherwise return `undefined`.
 */
function getContentEncoding(
  request: http.ClientRequest
): BufferEncoding | undefined {
  const encodingHeader = request.getHeader('content-encoding')

  if (!encodingHeader || typeof encodingHeader === 'number') {
    return
  }

  return Array.prototype.concat([], encodingHeader)[0]
}

/**
 * Return written request body chunks.
 * Collects chunks from both `write()` and `end()` methods.
 */
function drainRequestBody(request: http.ClientRequest): Promise<Buffer> {
  log('reading request body...')

  let body = Buffer.from([])
  log('proxying request.write calls...')

  return new Promise((resolve, reject) => {
    request.write = new Proxy(request.write, {
      apply(target, thisArg, args: ClientRequestWriteArgs) {
        function readChunk() {}

        const [chunk, encoding] = normalizeClientRequestWriteArgs(args)
        body = pushChunk(body, chunk, encoding)

        console.log('write:', { chunk })
        resolve(body)
        return Reflect.apply(target, thisArg, args)
      },
    })

    log('proxying request.end calls...', request)

    request.end = new Proxy(request.end, {
      apply(target, thisArg, args: HttpRequestEndArgs) {
        const [chunk, encoding] = normalizeClientRequestEndArgs(...args)
        log('request.end()', { chunk, encoding })

        pushChunk(body, chunk, encoding)
        resolve(body)

        return Reflect.apply(target, thisArg, args)
      },
    })

    request.once('error', reject)
    request.once('close', reject)
  })
}
