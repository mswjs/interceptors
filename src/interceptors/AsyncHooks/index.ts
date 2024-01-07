import type { ClientRequest, OutgoingHttpHeaders } from 'node:http'
import { createHook } from 'node:async_hooks'
import { HttpRequestEventMap, Interceptor } from '../..'
import { uuidv4 } from '../../utils/uuid'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'

export class AsyncHooksInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('AsyncHooksInterceptor')

  constructor() {
    super(AsyncHooksInterceptor.symbol)
  }

  protected setup(): void {
    const hook = createHook({
      init: (
        asyncId,
        type,
        triggerAsyncId,
        resource: { type: string; req: ClientRequest }
      ) => {
        // process.stdout.write(type + '\n')

        if (type === 'HTTPCLIENTREQUEST') {
          const clientRequest = resource.req

          // console.log(
          //   clientRequest.method,
          //   clientRequest.host,
          //   clientRequest.path
          // )

          const requestId = uuidv4()
          const request = hastilyWrittenClientRequestToRequest(clientRequest)
          const { interactiveRequest, requestController } =
            toInteractiveRequest(request)

          this.emitter.emit('request', {
            requestId,
            request: interactiveRequest,
          })
        }
      },
    })

    hook.enable()

    this.subscriptions.push(() => {
      hook.disable()
    })
  }
}

function hastilyWrittenClientRequestToRequest(message: ClientRequest): Request {
  const url = urlFromClientRequest(message)

  /**
   * @fixme How to know the "credentials" value when using XHR?
   * ClientRequest doesn't have that.
   */
  const request = new Request(url, {
    method: message.method,
    headers: toHeaders(message.getHeaders()),
    duplex: 'half',
    body:
      message.method === 'HEAD' || message.method === 'GET'
        ? null
        : new ReadableStream({
            start(controller) {
              /**
               * @fixme Relying on Node.js internals is not nice.
               */
              // First, flush all request body chunks written before
              // the async_hooks emitted its event.
              const [, ...bodyWrites] = message.outputData

              for (const bodyWrite of bodyWrites) {
                /**
                 * @note fetch request with a body writes
                 * an empty line on body finish but empty
                 * chunks cannot be queued to ReadableStream.
                 */
                if (bodyWrite.data !== '') {
                  controller.enqueue(bodyWrite.data)
                }
              }

              // Keep writing to the request body stream
              // in case the body stream is still open.
              message._write = (chunk, encoding, callback) => {
                /**
                 * @fixme It's likely a good idea to coerce all
                 * chunks to a Buffer and check its size.
                 * You can technically write an empty line as
                 * a Buffer to announce the stream end.
                 */
                if (chunk !== '') {
                  controller.enqueue(chunk)
                }

                callback()
              }

              message.once('finish', () => {
                controller.close()
              })
            },
          }),
  })

  return request
}

function urlFromClientRequest(request: ClientRequest): URL {
  const url = new URL(`${request.protocol}//${request.host}${request.path}`)

  /**
   * ClientRequest doesn't expose the "port" anywhere.
   * It does contain the port in the "Host" request header.
   * See if that one was set, and infer the host from there.
   */
  const host = request.getHeader('host')

  if (host) {
    url.host = host.toString()
  }

  return url
}

function toHeaders(outgoingHeaders: OutgoingHttpHeaders): Headers {
  const headers = new Headers()

  for (const headerName in outgoingHeaders) {
    const headerValue = outgoingHeaders[headerName]

    if (headerValue === 'undefined') {
      continue
    }

    const headerValuesList = Array.prototype.concat([], headerValue)

    for (const value of headerValuesList) {
      headers.append(headerName, value.toString())
    }
  }

  return headers
}
