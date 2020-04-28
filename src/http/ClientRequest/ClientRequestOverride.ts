import { inherits } from 'util'
import https from 'https'
import http, { IncomingMessage, ClientRequest, ClientRequestArgs } from 'http'
import { Socket } from './Socket'
import { RequestMiddleware, InterceptedRequest } from '../../glossary'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'

const debug = require('debug')('http:client-request')

export function createClientRequestOverrideClass(
  protocol: string,
  middleware: RequestMiddleware,
  getOriginalRequest: typeof http['request'],
  originalClientRequest: typeof ClientRequest
) {
  function ClientRequestOverride(
    this: ClientRequest,
    ...args: Parameters<typeof http['request']>
  ) {
    const [url, options, callback] = normalizeHttpRequestParams(...args)
    const usesHttps = protocol === 'https'

    debug('intercepted %s %s', options.method, url.href)
    http.OutgoingMessage.call(this)

    const socket = new Socket(options, {
      usesHttps,
    }) as any

    this.socket = this.connection = socket

    if (options.timeout) {
      debug('setting socket timeout to %a', options.timeout)
      socket.setTimeout(options.timeout)
    }

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
      debug('triggering given callback')
      this.once('response', callback)
    }

    const urlWithoutQuery = `${url.origin}${url.pathname}`

    debug('resolved clean URL:', urlWithoutQuery)

    this.end = async (cb?: () => void) => {
      debug('end')

      // Construct the intercepted request instance.
      // This request is what's exposed to the request middleware.
      const formattedRequest: InterceptedRequest = {
        url: urlWithoutQuery,
        method: options.method || 'GET',
        headers: (options.headers as Record<string, string | string[]>) || {},
        /**
         * @todo Get HTTP request body
         */
        body: undefined,
        query: url.searchParams,
      }

      debug('awaiting mocked response...')
      const mockedResponse = await middleware(formattedRequest, response)

      if (mockedResponse) {
        debug('received mocked response:', mockedResponse)

        if (!response.complete) {
          const { headers = {} } = mockedResponse

          response.statusCode = mockedResponse.status

          debug('writing response headers...')
          response.headers = Object.entries(headers).reduce<
            Record<string, string | string[]>
          >((acc, [name, value]) => {
            acc[name.toLowerCase()] = value
            return acc
          }, {})

          response.rawHeaders = Object.entries(headers).reduce<string[]>(
            (acc, [name, value]) => {
              return acc.concat(name.toLowerCase()).concat(value)
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

        // Delegate the ending of response to the request middleware
        // to support async logic
        this.emit('response', response)
        response.push(null)
        response.complete = true

        return this
      }

      debug('no mocked response received')

      /**
       * @todo In order to perform an original request one needs to detach the patches.
       * In particular, `http.ClientRequest`, because so that request is not intercepted,
       * and `https.request`, because for some reason when it goes through `handleRequest`
       * in `override` module it never resolves properly.
       */

      let req: ClientRequest

      if (usesHttps) {
        debug('performing original HTTPS %s %s', options.method, url.href)

        debug('reverting patches...')
        const { ClientRequest } = http
        http.ClientRequest = originalClientRequest

        debug('performing original request...')
        req = getOriginalRequest(options, callback)

        debug('restoring patches...')
        http.ClientRequest = ClientRequest
      } else {
        debug('performing original HTTP %s %s', options.method, url.href)

        req = getOriginalRequest(options, callback)
      }

      req.on('finish', () => {
        this.emit('finish')
      })

      req.on('response', (response) => {
        debug('returning original response...')
        this.emit('response', response)
      })

      req.on('error', (error) => {
        debug('original request error', error)
        this.emit('error', error)
      })

      req.end()
      return req
    }

    debug('returning original request...')

    return this
  }

  inherits(ClientRequestOverride, http.ClientRequest)

  return ClientRequestOverride
}
