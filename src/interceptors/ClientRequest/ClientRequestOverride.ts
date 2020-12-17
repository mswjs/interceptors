import { inherits } from 'util'
import { Socket } from 'net'
import http from 'http'
import { until } from '@open-draft/until'
import { HeadersObject, reduceHeadersObject } from 'headers-utils'
import {
  RequestMiddleware,
  InterceptedRequest,
  RequestInterceptorContext,
} from '../../glossary'
import { SocketPolyfill } from './polyfills/SocketPolyfill'

/* Utils */
import { DEFAULT_PATH } from '../../utils/getUrlByRequestOptions'
import { bodyBufferToString } from './utils/bodyBufferToString'
import { concatChunkToBuffer } from './utils/concatChunkToBuffer'
import { inheritRequestHeaders } from './utils/inheritRequestHeaders'
import { normalizeHttpRequestParams } from './utils/normalizeHttpRequestParams'
import { normalizeHttpRequestEndParams } from './utils/normalizeHttpRequestEndParams'

const createDebug = require('debug')

export function createClientRequestOverrideClass(
  middleware: RequestMiddleware,
  context: RequestInterceptorContext,
  performOriginalRequest: typeof http.request,
  originalClientRequest: typeof http.ClientRequest
) {
  function ClientRequestOverride(
    this: http.ClientRequest,
    ...args: Parameters<typeof http.request>
  ) {
    const [url, options, callback] = normalizeHttpRequestParams(...args)
    const usesHttps = url.protocol === 'https:'
    let requestBodyBuffer: Buffer[] = []

    const debug = createDebug(`http ${options.method} ${url.href}`)

    // Inherit ClientRequest properties from RequestOptions.
    this.method = options.method || 'GET'
    this.path = options.path || DEFAULT_PATH

    debug('intercepted %s %s (%s)', options.method, url.href, url.protocol)
    http.OutgoingMessage.call(this)

    // Propagate options headers to the request instance.
    inheritRequestHeaders(this, options.headers)

    const socket = (new SocketPolyfill(options, {
      usesHttps,
    }) as any) as Socket & {
      authorized: boolean
    }

    this.socket = this.connection = socket

    if (options.timeout) {
      debug('setting socket timeout to %a', options.timeout)
      socket.setTimeout(options.timeout)
    }

    // Create a mocked response instance.
    const response = new http.IncomingMessage(socket)

    if (options.headers?.expect === '100-continue') {
      debug('encountered "100 Continue" header')
      this.emit('continue')
    }

    process.nextTick(() => {
      this.emit('socket', socket)
      socket.emit('connect')

      if (socket.authorized) {
        debug('emitting authorized socket event')
        socket.emit('secureConnect')
      }
    })

    if (callback) {
      this.once('response', callback)
    }

    const emitError = (error: Error) => {
      process.nextTick(() => {
        this.emit('error', error)
      })
    }

    this.write = (chunk: string | Buffer, ...args: any[]): boolean => {
      debug('write', chunk, args)

      const callback = typeof args[1] === 'function' ? args[1] : args[2]

      if (this.aborted) {
        debug('cannot write: request aborted')
        emitError(new Error('Request aborted'))
      } else {
        if (chunk) {
          debug('request write: concat chunk to buffer', chunk)
          requestBodyBuffer = concatChunkToBuffer(chunk, requestBodyBuffer)
        }

        if (typeof callback === 'function') {
          callback()
        }
      }

      setImmediate(() => {
        this.emit('drain')
      })

      return false
    }

    this.end = async (...args: any) => {
      const [chunk, encoding, callback] = normalizeHttpRequestEndParams(...args)

      debug('end', { chunk, encoding, callback })
      debug('request headers', options.headers)

      const writtenRequestBody = bodyBufferToString(
        Buffer.concat(requestBodyBuffer)
      )
      debug('request written body', writtenRequestBody)

      // Resolve the entire request body, including:
      // - buffer written via `req.write()`
      // - chunk provided to `req.end(chunk)`
      // So that the request middleware has access to the resolved body.
      const resolvedRequestBody = bodyBufferToString(
        Buffer.concat(
          chunk
            ? concatChunkToBuffer(chunk, requestBodyBuffer)
            : requestBodyBuffer
        )
      )

      debug('request resolved body', resolvedRequestBody)

      const outHeaders = this.getHeaders()
      const resolvedRequestHeaders = Object.assign(
        {},
        outHeaders,
        options.headers
      )

      const requestHeaders = resolvedRequestHeaders
        ? reduceHeadersObject<HeadersObject>(
            resolvedRequestHeaders as HeadersObject,
            (headers, name, value) => {
              headers[name.toLowerCase()] = value
              return headers
            },
            {}
          )
        : {}

      debug('request headers', requestHeaders)

      // Construct the intercepted request instance exposed to the request middleware.
      const formattedRequest: InterceptedRequest = {
        url,
        method: options.method || 'GET',
        headers: requestHeaders,
        body: resolvedRequestBody,
      }

      debug('awaiting mocked response...')

      const [middlewareException, mockedResponse] = await until(async () =>
        middleware(formattedRequest, response)
      )

      // When the request middleware throws an exception, error the request.
      // This cancels the request and is similar to a network error.
      if (middlewareException) {
        debug('middleware function threw an exception!', middlewareException)
        this.emit('error', middlewareException)

        return this
      }

      if (mockedResponse) {
        debug('received mocked response:', mockedResponse)

        // Prevent modifying an already finished response.
        if (!response.complete) {
          const { headers = {} } = mockedResponse

          response.statusCode = mockedResponse.status
          response.statusMessage = mockedResponse.statusText

          debug('writing response headers...')

          // Converts mocked response headers to actual headers
          // (lowercases header names and merges duplicates).
          response.headers = Object.entries(
            headers
          ).reduce<http.IncomingHttpHeaders>((acc, [name, value]) => {
            const headerName = name.toLowerCase()
            const headerValue = acc.hasOwnProperty(headerName)
              ? ([] as string[]).concat(acc[headerName] as string, value)
              : value

            acc[headerName] = headerValue
            return acc
          }, {})

          // Converts mocked response headers to raw headers.
          // @see https://nodejs.org/api/http.html#http_message_rawheaders
          response.rawHeaders = Object.entries(headers).reduce<string[]>(
            (acc, [name, value]) => {
              return acc.concat(name, value)
            },
            []
          )

          if (mockedResponse.body) {
            debug('writing response body...')
            response.push(Buffer.from(mockedResponse.body))
          }
        }

        debug('response is complete, finishing request...')

        // Invoke the "req.end()" callback.
        callback?.()

        this.finished = true
        this.emit('finish')
        this.emit('response', response)

        // Pushing `null` indicates that the response body is complete
        // and must not be modified anymore.
        response.push(null)
        response.complete = true

        context.emitter.emit('response', formattedRequest, mockedResponse)

        return this
      }

      debug('no mocked response received')

      debug(
        'performing original %s %s (%s)',
        options.method,
        url.href,
        url.protocol
      )
      debug('original request options', options)
      debug('original request body (written)', writtenRequestBody)
      debug('original request body (end)', chunk)

      let req: http.ClientRequest
      debug('using', performOriginalRequest)

      // Decide whether to use HTTPS based on the URL protocol.
      // XHR can trigger http.request for HTTPS URL.
      if (url.protocol === 'https:') {
        debug('reverting patches...')
        const { ClientRequest } = http

        // @ts-ignore
        http.ClientRequest = originalClientRequest

        req = performOriginalRequest(options)

        debug('re-applying patches...')

        // @ts-ignore
        http.ClientRequest = ClientRequest
      } else {
        req = performOriginalRequest(options)
      }

      // Propagate headers set after `ClientRequest` is constructed
      // onto the original request instance.
      inheritRequestHeaders(req, outHeaders)

      // Propagate a request body buffer written via `req.write()`
      // to the original request.
      if (requestBodyBuffer.length > 0 && req.writable) {
        req.write(Buffer.concat(requestBodyBuffer))
      }

      req.on('finish', () => {
        this.emit('finish')
      })

      req.on('response', (response) => {
        debug(response.statusCode, options.method, url.href)
        this.emit('response', response)

        context.emitter.emit('response', formattedRequest, {
          status: response.statusCode,
          statusText: response.statusMessage,
          headers: response.headers,
          /**
           * @todo Retreive the response body.
           */
          body: '???',
        })
      })

      req.on('error', (error) => {
        debug('original request error', error)
        this.emit('error', error)
      })

      // Provide a callback when an original request is finished,
      // so it can be debugged.
      req.end(
        ...[
          chunk,
          encoding as any,
          () => {
            debug('request ended', this.method, url.href)
            callback?.()
          },
        ].filter(Boolean)
      )

      return req
    }

    this.abort = () => {
      debug('abort')

      if (this.aborted) {
        debug('already aborted')
        return
      }

      this.aborted = Date.now()

      const error = new Error() as NodeJS.ErrnoException
      error.code = 'aborted'

      response.emit('close', error)
      socket.destroy()
      this.emit('abort')
    }

    return this
  }

  inherits(ClientRequestOverride, originalClientRequest)

  return ClientRequestOverride
}
