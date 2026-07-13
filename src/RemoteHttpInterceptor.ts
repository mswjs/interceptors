import type { ChildProcess } from 'node:child_process'
import { type HttpRequestEventMap, HttpResponseEvent } from './events/http'
import { Interceptor } from './interceptor'
import { BatchInterceptor } from './BatchInterceptor'
import { ClientRequestInterceptor } from './interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from './interceptors/XMLHttpRequest/node'
import { FetchInterceptor } from './interceptors/fetch/node'
import { handleRequest } from './utils/handleRequest'
import { RequestController } from './RequestController'
import { FetchRequest, FetchResponse } from './utils/fetchUtils'
import { isResponseError } from './utils/responseUtils'
import { createLogger } from './utils/logger'

export interface SerializedRequest {
  id: string
  url: string
  method: string
  headers: Array<[string, string]>
  credentials: RequestCredentials
  body: string | null
}

interface RevivedRequest extends Omit<SerializedRequest, 'url' | 'headers'> {
  url: URL
  headers: Headers
}

export interface SerializedResponse {
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string | null
}

const logger = createLogger('remote-http')

export class RemoteHttpInterceptor extends BatchInterceptor<
  [ClientRequestInterceptor, XMLHttpRequestInterceptor, FetchInterceptor]
> {
  constructor() {
    super({
      name: 'remote-interceptor',
      interceptors: [
        new ClientRequestInterceptor(),
        new XMLHttpRequestInterceptor(),
        new FetchInterceptor(),
      ],
    })
  }

  protected setup() {
    super.setup()

    let handleParentMessage: NodeJS.MessageListener

    this.on('request', async ({ request, requestId, controller }) => {
      // Send the stringified intercepted request to
      // the parent process where the remote resolver is established.
      const serializedRequest = JSON.stringify({
        id: requestId,
        method: request.method,
        url: request.url,
        headers: Array.from(request.headers.entries()),
        credentials: request.credentials,
        body: ['GET', 'HEAD'].includes(request.method)
          ? null
          : await request.text(),
      } satisfies SerializedRequest)

      logger.verbose(
        'sent serialized request to child: %s',
        serializedRequest
      )

      process.send?.(`request:${serializedRequest}`)

      const responsePromise = new Promise<void>((resolve) => {
        handleParentMessage = (message) => {
          if (typeof message !== 'string') {
            return resolve()
          }

          if (message.startsWith(`response:${requestId}`)) {
            const [, serializedResponse] =
              message.match(/^response:.+?:(.+)$/) || []

            if (!serializedResponse) {
              return resolve()
            }

            const responseInit = JSON.parse(
              serializedResponse
            ) as SerializedResponse

            const mockedResponse = new FetchResponse(responseInit.body, {
              url: request.url,
              status: responseInit.status,
              statusText: responseInit.statusText,
              headers: responseInit.headers,
            })

            /**
             * @todo Support "errorWith" as well.
             * This response handling from the child is incomplete.
             */

            controller.respondWith(mockedResponse)
            return resolve()
          }
        }
      })

      // Listen for the mocked response message from the parent.
      logger.verbose(
        'add "message" listener to the parent process',
        handleParentMessage
      )
      process.addListener('message', handleParentMessage)

      return responsePromise
    })

    this.subscriptions.push(() => {
      process.removeListener('message', handleParentMessage)
    })
  }
}

export function requestReviver(key: string, value: any) {
  switch (key) {
    case 'url':
      return new URL(value)

    case 'headers':
      return new Headers(value)

    default:
      return value
  }
}

export interface RemoveResolverOptions {
  process: ChildProcess
}

export class RemoteHttpResolver extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('remote-http-resolver')
  private process: ChildProcess

  constructor(options: RemoveResolverOptions) {
    super()
    this.process = options.process
  }

  protected predicate(): boolean {
    return true
  }

  protected setup() {
    const handleChildMessage: NodeJS.MessageListener = async (message) => {
      logger.verbose('received message from child %o', message)

      if (typeof message !== 'string' || !message.startsWith('request:')) {
        logger.verbose('unknown message, ignoring')
        return
      }

      const [, serializedRequest] = message.match(/^request:(.+)$/) || []
      if (!serializedRequest) {
        return
      }

      const requestJson = JSON.parse(
        serializedRequest,
        requestReviver
      ) satisfies RevivedRequest

      logger.verbose('parsed intercepted request %o', requestJson)

      const request = new FetchRequest(requestJson.url, {
        method: requestJson.method,
        headers: new Headers(requestJson.headers),
        credentials: requestJson.credentials,
        body: requestJson.body,
      })

      const controller = new RequestController(request, {
        passthrough: () => {
          // Intentionally empty.
        },
        respondWith: async (response) => {
          if (isResponseError(response)) {
            logger.verbose('received a network error %o', { response })
            throw new Error('Not implemented')
          }

          const responseClone = FetchResponse.clone(response)
          const responseText = await responseClone.text()

          // Send the mocked response to the child process.
          const serializedResponse = JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            body: responseText,
          } satisfies SerializedResponse)

          this.process.send(
            `response:${requestJson.id}:${serializedResponse}`,
            async (error) => {
              if (error) {
                return
              }

              // Emit an optimistic "response" event at this point,
              // not to rely on the back-and-forth signaling for the sake of the event.
              await this.emitter.emitAsPromise(
                new HttpResponseEvent({
                  initiator: null,
                  request,
                  requestId: requestJson.id,
                  response: responseClone,
                  responseType: 'mock',
                })
              )
            }
          )

          logger.verbose(
            'sent serialized mocked response to parent: %s',
            serializedResponse
          )
        },
        errorWith: (reason) => {
          logger.verbose('request errored %o', { error: reason })
          throw new Error('Not implemented')
        },
      }, {
        logger,
        requestId: requestJson.id,
      })

      await handleRequest({
        initiator: null,
        request,
        requestId: requestJson.id,
        controller,
        emitter: this.emitter,
        logger,
      })
    }

    this.subscriptions.push(() => {
      this.process.removeListener('message', handleChildMessage)
      logger.verbose('removed "message" listener from child process')
    })

    logger.verbose('adding "message" listener to child process')
    this.process.addListener('message', handleChildMessage)

    this.process.once('error', () => this.dispose())
    this.process.once('exit', () => this.dispose())
  }
}
