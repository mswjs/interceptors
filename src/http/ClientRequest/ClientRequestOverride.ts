import { inherits } from 'util'
import { Socket as NetworkSocket } from 'net'
import http, { IncomingMessage, ClientRequest } from 'http'
import { until } from '@open-draft/until'
import { HeadersObject, reduceHeadersObject } from 'headers-utils'
import { RequestMiddleware, InterceptedRequest } from '../../glossary'
import { Socket } from './Socket'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'

const createDebug = require('debug')

function bodyBufferToString(buffer: Buffer) {
  const utfEncodedBuffer = buffer.toString('utf8')
  const bufferCopy = Buffer.from(utfEncodedBuffer)
  const isUtf8 = bufferCopy.equals(buffer)

  return isUtf8 ? utfEncodedBuffer : buffer.toString('hex')
}

export function createClientRequestOverrideClass(
  middleware: RequestMiddleware,
  performOriginalRequest: typeof http['request'],
  originalClientRequest: typeof ClientRequest
) {
  function ClientRequestOverride(
    this: ClientRequest,
    ...args: Parameters<typeof http['request']>
  ) {
    const [url, options, callback] = normalizeHttpRequestParams(...args)
    const usesHttps = url.protocol === 'https:'
    const requestBodyBuffer: any[] = []

    const debug = createDebug(`http ${options.method} ${url.href}`)

    debug('intercepted %s %s (%s)', options.method, url.href, url.protocol)
    http.OutgoingMessage.call(this)

    // Propagate options headers to the request instance.
    Object.entries(options.headers || {}).forEach(([name, value]) => {
      if (value != null) {
        this.setHeader(name, value)
      }
    })

    const socket = (new Socket(options, {
      usesHttps,
    }) as any) as NetworkSocket & {
      authorized: boolean
    }

    this.socket = this.connection = socket

    if (options.timeout) {
      debug('setting socket timeout to %a', options.timeout)
      socket.setTimeout(options.timeout)
    }

    // Create a mocked response instance.
    const response = new IncomingMessage(socket)

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

    this.write = (...args: any[]): boolean => {
      let chunk = args[0]
      const callback = typeof args[1] === 'function' ? args[1] : args[2]

      if (this.aborted) {
        emitError(new Error('Request aborted'))
      } else {
        if (chunk) {
          if (!Buffer.isBuffer(chunk)) {
            chunk = Buffer.from(chunk)
          }

          requestBodyBuffer.push(chunk)
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

    this.end = async () => {
      debug('end')
      debug('request headers', options.headers)

      const requestBody = bodyBufferToString(Buffer.concat(requestBodyBuffer))
      debug('request body', requestBody)

      const requestHeaders = options.headers
        ? reduceHeadersObject<HeadersObject>(
            options.headers as HeadersObject,
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
        body: requestBody,
      }

      debug('awaiting mocked response...')

      const [middlewareException, mockedResponse] = await until(async () =>
        middleware(formattedRequest, response)
      )

      // When the request middleware throws an exception, error the request.
      // This cancels the request and is similar to a network error.
      if (middlewareException) {
        debug('middleware function threw an exception!')
        this.emit('error', middlewareException)

        return this
      }

      if (mockedResponse) {
        debug('received mocked response:', mockedResponse)

        // Prevent modifying an already finished response.
        if (!response.complete) {
          const { headers = {} } = mockedResponse

          response.statusCode = mockedResponse.status

          debug('writing response headers...')

          // Converts mocked response headers to actual headers
          // (lowercases header names and merges duplicates).
          response.headers = Object.entries(headers).reduce<
            http.IncomingHttpHeaders
          >((acc, [name, value]) => {
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

        this.finished = true
        this.emit('finish')
        this.emit('response', response)

        // Pushing `null` indicates that the response body is complete
        // and must not be modified anymore.
        response.push(null)
        response.complete = true

        return this
      }

      debug(
        'performing original %s %s (%s)',
        options.method,
        url.href,
        url.protocol
      )

      let req: ClientRequest
      debug('using', performOriginalRequest)

      const { ClientRequest } = http

      // Decide whether to use HTTPS based on the URL protocol.
      // XHR can trigger http.request for HTTPS URL.
      if (url.protocol === 'https:') {
        debug('reverting patches...')

        http.ClientRequest = originalClientRequest

        // Override the global pointer to the original client request.
        // This way whenever a bypass call bubbles to `handleRequest`
        // it always performs respecting this `ClientRequest` restoration.
        originalClientRequest = null as any

        req = performOriginalRequest(options)

        debug('re-applying patches...')
        http.ClientRequest = ClientRequest
        originalClientRequest = ClientRequest
      } else {
        req = performOriginalRequest(options)
      }

      // Propagate the given request body on the original request.
      if (requestBodyBuffer.length > 0 && req.writable) {
        req.write(Buffer.concat(requestBodyBuffer))
      }

      req.on('finish', () => {
        this.emit('finish')
      })

      req.on('response', (response) => {
        debug(response.statusCode, options.method, url.href)
        this.emit('response', response)
      })

      req.on('error', (error) => {
        debug('original request error', error)
        this.emit('error', error)
      })

      // Provide a callback when an original request is finished,
      // so it can be debugged.
      req.end(() => {
        debug('request ended', options.method, url.href)
      })

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

  inherits(ClientRequestOverride, http.ClientRequest)

  return ClientRequestOverride
}
