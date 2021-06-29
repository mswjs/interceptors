import { inherits } from 'util'
import { Socket } from 'net'
import http from 'http'
import { until } from '@open-draft/until'
import { Headers, HeadersObject, objectToHeaders } from 'headers-utils'
import { SocketPolyfill } from './polyfills/SocketPolyfill'

/* Utils */
import { DEFAULT_PATH } from '../../utils/getUrlByRequestOptions'
import { bodyBufferToString } from './utils/bodyBufferToString'
import { concatChunkToBuffer } from './utils/concatChunkToBuffer'
import { inheritRequestHeaders } from './utils/inheritRequestHeaders'
import { normalizeHttpRequestParams } from './utils/normalizeHttpRequestParams'
import { normalizeHttpRequestEndParams } from './utils/normalizeHttpRequestEndParams'
import { getIncomingMessageBody } from './utils/getIncomingMessageBody'
import { IsomorphicRequest, Observer, Resolver } from '../../createInterceptor'
import { toIsoResponse } from '../../utils/toIsoResponse'
import { uuidv4 } from '../../utils/uuid'

const createDebug = require('debug')

interface CreateClientRequestOverrideOptions {
  defaultProtocol: string
  pureClientRequest: typeof http.ClientRequest
  pureMethod: typeof http.get | typeof http.request
  observer: Observer
  resolver: Resolver
}

export function createClientRequestOverride(
  options: CreateClientRequestOverrideOptions
) {
  const { defaultProtocol, pureClientRequest, pureMethod, observer, resolver } =
    options

  function ClientRequestOverride(
    this: http.ClientRequest,
    ...args: Parameters<typeof http.request>
  ) {
    const [url, options, callback] = normalizeHttpRequestParams(
      defaultProtocol,
      ...args
    )

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

    const socket = new SocketPolyfill(options, {
      usesHttps,
    }) as any as Socket & {
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

      setTimeout(() => {
        this.emit('drain')
      }, 0)

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

      const outgoingHeaders = this.getHeaders()
      const resolvedRequestHeaders = Object.assign(
        {},
        outgoingHeaders,
        options.headers
      )

      const requesHeadersObject = Object.entries(
        resolvedRequestHeaders
      ).reduce<HeadersObject>((headersObject, [name, value]) => {
        if (value) {
          const corcedValue =
            typeof value === 'number' ? value.toString() : value
          headersObject[name.toLowerCase()] = corcedValue
        }

        return headersObject
      }, {})
      debug('request headers object', requesHeadersObject)

      const requestHeaders = new Headers(requesHeadersObject)
      debug('request headers', requestHeaders)

      // Construct the intercepted request instance exposed to the request middleware.
      const isoRequest: IsomorphicRequest = {
        id: uuidv4(),
        url,
        method: options.method || 'GET',
        headers: requestHeaders,
        body: resolvedRequestBody,
      }

      observer.emit('request', isoRequest)

      debug('awaiting mocked response...')

      const [resolverError, mockedResponse] = await until(async () =>
        resolver(isoRequest, response)
      )

      // When the request middleware throws an exception, error the request.
      // This cancels the request and is similar to a network error.
      if (resolverError) {
        debug('middleware function threw an exception!', resolverError)
        this.emit('error', resolverError)

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

        observer.emit('response', isoRequest, toIsoResponse(mockedResponse))

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

      let request: http.ClientRequest
      debug('using', pureMethod)

      // XMLHttpRequest can trigger "http.request" for https URL.
      request = pureMethod(url.toString(), options)

      // Propagate headers set after `ClientRequest` is constructed
      // onto the original request instance.
      inheritRequestHeaders(request, outgoingHeaders)

      // Propagate a request body buffer written via `req.write()`
      // to the original request.
      if (requestBodyBuffer.length > 0 && request.writable) {
        request.write(Buffer.concat(requestBodyBuffer))
      }

      request.on('finish', () => {
        this.emit('finish')
      })

      request.on('response', async (response) => {
        observer.emit('response', isoRequest, {
          status: response.statusCode || 200,
          statusText: response.statusMessage || 'OK',
          headers: objectToHeaders(response.headers),
          body: await getIncomingMessageBody(response),
        })
      })

      request.on('response', (response) => {
        debug(response.statusCode, options.method, url.href)
        this.emit('response', response)
      })

      request.on('error', (error) => {
        debug('original request error', error)
        this.emit('error', error)
      })

      // Provide a callback when an original request is finished,
      // so it can be debugged.
      request.end(
        ...[
          chunk,
          encoding as any,
          () => {
            debug('request ended', this.method, url.href)
            callback?.()
          },
        ].filter(Boolean)
      )

      return request
    }

    this.abort = () => {
      debug('abort')

      if (this.aborted) {
        debug('already aborted')
        return
      }

      this.aborted = true

      const error = new Error() as NodeJS.ErrnoException
      error.code = 'aborted'

      response.emit('close', error)
      socket.destroy()
      this.emit('abort')
    }

    return this
  }

  inherits(ClientRequestOverride, pureClientRequest)

  return ClientRequestOverride
}
