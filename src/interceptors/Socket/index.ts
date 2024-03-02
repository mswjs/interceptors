import crypto from 'node:crypto'
import { createHook } from 'node:async_hooks'
import type { Socket } from 'node:net'
import { inspect } from 'node:util'
import { ClientRequest } from 'node:http'
import { until } from '@open-draft/until'
import { Interceptor } from '../../Interceptor'
import {
  InteractiveRequest,
  toInteractiveRequest,
} from '../../utils/toInteractiveRequest'
import { emitAsync } from '../../utils/emitAsync'
import {
  respondToOutgoingMessage,
  responseFromIncomingMessage,
} from './respondToOutgoingMessage'
import { isPropertyAccessible } from '../../utils/isPropertyAccessible'

export type SocketInterceptorEventsMap = {
  request: [args: { request: InteractiveRequest; requestId: string }]
  response: [args: { response: Response; request: Request; requestId: string }]
}

const log = (what: unknown) => process.stdout.write('\n' + what + '\n\n')

export class SocketInterceptor extends Interceptor<SocketInterceptorEventsMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const requestBodyMap = new WeakMap<Request, Array<Buffer>>()
    const mockedDnsLookups = new Set<number>()

    ClientRequest.prototype.write = new Proxy(ClientRequest.prototype.write, {
      apply(target, context, args) {
        const [chunk, encoding] = args

        if (Buffer.from(chunk).byteLength > 0) {
          requestBodyMap.set(
            context,
            Array.prototype.concat(
              requestBodyMap.get(context) ?? [],
              Buffer.from(chunk, encoding)
            )
          )
        }

        return Reflect.apply(target, context, args)
      },
    })
    ClientRequest.prototype.end = new Proxy(ClientRequest.prototype.end, {
      apply(target, context, args) {
        const [chunk, encoding] = args

        if (chunk != null) {
          requestBodyMap.set(
            context,
            Array.prototype.concat(
              requestBodyMap.get(context) ?? [],
              Buffer.from(chunk, encoding)
            )
          )
        }

        return Reflect.apply(target, context, args)
      },
    })

    const hook = createHook({
      init: (asyncId, type, triggerAsyncId, resource) => {
        // process.stdout.write(type + '\n')

        // Resolve non-existing addresses.
        if (type === 'GETADDRINFOREQWRAP') {
          log('GETADDRINFOREQWRAP')

          /**
           * @note This event is NOT even called for existing hostnames.
           */

          resource.oncomplete = function (
            error: number,
            addresses: Array<unknown>
          ) {
            log('dns lookup: ' + error + ' ' + addresses)
            log(JSON.stringify(resource, null, 2))

            /**
             * @fixme If the host exists and can be resolved, like
             * "http://error.me", this won't ever be called.
             */
            if (
              error !== 0 ||
              /**
               * @fixme Remove this workaround.
               * Resolving non-existing "localhost" has 0 family too.
               */
              resource.family === 0
            ) {
              mockedDnsLookups.add(triggerAsyncId)
              /**
               * @note No way to replay this in case we do want
               * to make the actual connection later on based on
               * the request listener.
               */
              this.callback(null, '::1', 6)
            }
          }
        }

        /**
         * @note @fixme This event is never called for TCP connections
         * where the family is 0 (only called for 4 or 6).
         * @see https://github.com/nodejs/node/blob/66556f53a7b36384bce305865c30ca43eaa0874b/lib/net.js#L1063
         */
        if (type === 'TCPCONNECTWRAP') {
          /**
           * @note `resource.oncomplete` already points to `afterConnect`.
           * Should we call that default callback in case of bypass requests?
           */

          log(new Date().toISOString() + ' TCPCONNECTWRAP ' + inspect(resource))

          const tcp = resource as {
            address: string
            port: number
            localAddress?: string
            localPort?: string
            oncomplete(
              status: number,
              handle: unknown,
              request: unknown,
              readable: true,
              writable: true
            ): void
          }

          tcp.oncomplete = async (
            status,
            tcpHandle,
            tcpConnectWrap,
            readable,
            writable
          ) => {
            const isConnectionMocked = mockedDnsLookups.has(triggerAsyncId)

            log(new Date() + ' TCPCONNECTWRAP COMPLETE')
            log('is mocked? ' + isConnectionMocked)

            const ownerSymbol = Object.getOwnPropertySymbols(tcpHandle).find(
              (symbol) => symbol.description === 'owner_symbol'
            )
            const socket = tcpHandle[ownerSymbol] as Socket

            /**
             * @fixme @note I think at this stage, the outgoing body
             * has been already written. The `socket.parser.finished` is true.
             */

            if (isConnectionMocked) {
              /**
               * @note Rewrite the "_writeGeneric" that's called on "Socket.connect()"
               * to prevent "EPIPE" errors when writing to a socket that connects to
               * a non-existig address.
               */
              socket._writeGeneric = (
                writev: boolean,
                data: Buffer,
                encoding: BufferEncoding,
                cb: (error: number | null) => void
              ) => {
                cb(null)
              }
            }

            if (isConnectionMocked) {
              socket.emit('lookup', null, '::1', 6)
            }

            if (tcp.port === 443) {
              /**
               * @note For TLS connections, emit the "secureConnect" socket event.
               * Otherwise, we will get "ERRCONNRESET" error.
               * @see https://github.com/nodejs/node/blob/66556f53a7b36384bce305865c30ca43eaa0874b/lib/_tls_wrap.js#L1711
               */
              socket.secureConnecting = false
              socket.emit('secureConnect')
            } else {
              /**
               * @note This MUST be set to false.
               * Connecting to localhost skips the DNS resolution phase
               * (nothing to resolve), and it seems the TCP/TLS Socket
               * has to finish connecting here.
               */
              socket.connecting = false
              socket.emit('connect')
            }

            socket.emit('ready')

            const { outgoing } = socket.parser

            const kOutHeaders = Object.getOwnPropertySymbols(outgoing).find(
              (symbol) => symbol.description === 'kOutHeaders'
            )
            const outgoingHeaders = outgoing[kOutHeaders]
            const requetHeaders = Object.keys(outgoingHeaders).reduce<Headers>(
              (headers, lowecaseHeaderName) => {
                const [originalHeaderName, headerValue] =
                  outgoingHeaders[lowecaseHeaderName]
                headers.append(originalHeaderName, headerValue)
                return headers
              },
              new Headers()
            )

            const url = new URL(
              outgoing.path,
              `${outgoing.protocol}//${outgoing.host}`
            )
            url.port = String(tcp.port)

            const fetchRequest = new Request(url, {
              method: outgoing.method,
              headers: requetHeaders,
              body:
                outgoing.method === 'HEAD' || outgoing.method === 'GET'
                  ? null
                  : Buffer.concat(requestBodyMap.get(outgoing) ?? []),
            })

            log(
              'FETCH REQUEST: ' + fetchRequest.method + ' ' + fetchRequest.url
            )

            const { interactiveRequest, requestController } =
              toInteractiveRequest(fetchRequest)

            const requestId = crypto.randomUUID()

            // Add the last "request" listener that always resolves
            // the pending response Promise. This way if the consumer
            // hasn't handled the request themselves, we will prevent
            // the response Promise from pending indefinitely.
            this.emitter.once('request', ({ requestId: pendingRequestId }) => {
              /**
               * @note Ignore request events emitted by irrelevant
               * requests. This happens when response patching.
               */
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

            const resolutionResult = await until(async () => {
              await emitAsync(this.emitter, 'request', {
                request: interactiveRequest,
                requestId,
              })

              log('waiting for the mocked response...')

              return requestController.responsePromise
            })

            log(
              'resolution result: ' + JSON.stringify(resolutionResult, null, 2)
            )

            if (resolutionResult.error) {
              outgoing.destroyed = true
              outgoing.emit('error', resolutionResult.error)
              outgoing.agent?.destroy()
              return
            }

            const { data: mockedResponse } = resolutionResult

            log('mocked response? ' + mockedResponse)

            if (mockedResponse) {
              if (
                /**
                 * @note Some environments, like Miniflare (Cloudflare) do not
                 * implement the "Response.type" property and throw on its access.
                 * Safely check if we can access "type" on "Response" before continuing.
                 * @see https://github.com/mswjs/msw/issues/1834
                 */
                isPropertyAccessible(mockedResponse, 'type') &&
                mockedResponse.type === 'error'
              ) {
                this.logger.info(
                  'received network error response, aborting request...'
                )

                /**
                 * There is no standardized error format for network errors
                 * in Node.js. Instead, emit a generic TypeError.
                 */
                outgoing.emit('error', new TypeError('Network error'))
                outgoing.destroyed = true
                outgoing.agent?.destroy()

                return
              }

              const responseClone = mockedResponse.clone()
              respondToOutgoingMessage(outgoing, mockedResponse)

              this.emitter.emit('response', {
                response: responseClone,
                request: fetchRequest,
                requestId,
              })

              return
            }

            socket.parser.onIncoming = new Proxy(socket.parser.onIncoming, {
              apply: (target, context, args) => {
                Reflect.apply(target, context, args)

                const [incoming] = args
                const response = responseFromIncomingMessage(incoming)

                this.emitter.emit('response', {
                  request: fetchRequest,
                  requestId,
                  response,
                })
              },
            })
          }
        }
      },
    })

    hook.enable()

    this.subscriptions.push(() => {
      hook.disable()
    })
  }
}
