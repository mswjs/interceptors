import { ChildProcess } from 'child_process'
import { HttpRequestEventMap } from './glossary'
import { Interceptor } from './Interceptor'
import { BatchInterceptor } from './BatchInterceptor'
import { ClientRequestInterceptor } from './interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from './interceptors/XMLHttpRequest'
import { toInteractiveRequest } from './utils/toInteractiveRequest'
import { emitAsync } from './utils/emitAsync'

export interface SerializedRequest {
  id: string
  url: string
  method: string
  headers: Array<[string, string]>
  credentials: RequestCredentials
  body: string
}

interface RevivedRequest extends Omit<SerializedRequest, 'url' | 'headers'> {
  url: URL
  headers: Headers
}

export interface SerializedResponse {
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string
}

export class RemoteHttpInterceptor extends BatchInterceptor<
  [ClientRequestInterceptor, XMLHttpRequestInterceptor]
> {
  constructor() {
    super({
      name: 'remote-interceptor',
      interceptors: [
        new ClientRequestInterceptor(),
        new XMLHttpRequestInterceptor(),
      ],
    })
  }

  protected setup() {
    super.setup()

    let handleParentMessage: NodeJS.MessageListener

    this.on('request', async ({ request, requestId }) => {
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
      } as SerializedRequest)

      this.logger.info(
        'sent serialized request to the child:',
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

            const mockedResponse = new Response(responseInit.body, {
              status: responseInit.status,
              statusText: responseInit.statusText,
              headers: responseInit.headers,
            })

            request.respondWith(mockedResponse)
            return resolve()
          }
        }
      })

      // Listen for the mocked response message from the parent.
      this.logger.info(
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
  static symbol = Symbol('remote-resolver')
  private process: ChildProcess

  constructor(options: RemoveResolverOptions) {
    super(RemoteHttpResolver.symbol)
    this.process = options.process
  }

  protected setup() {
    const logger = this.logger.extend('setup')

    const handleChildMessage: NodeJS.MessageListener = async (message) => {
      logger.info('received message from child!', message)

      if (typeof message !== 'string' || !message.startsWith('request:')) {
        logger.info('unknown message, ignoring...')
        return
      }

      const [, serializedRequest] = message.match(/^request:(.+)$/) || []
      if (!serializedRequest) {
        return
      }

      const requestJson = JSON.parse(
        serializedRequest,
        requestReviver
      ) as RevivedRequest
      logger.info('parsed intercepted request', requestJson)

      const capturedRequest = new Request(requestJson.url, {
        method: requestJson.method,
        headers: new Headers(requestJson.headers),
        credentials: requestJson.credentials,
        body: requestJson.body,
      })

      const { interactiveRequest, requestController } =
        toInteractiveRequest(capturedRequest)

      this.emitter.once('request', () => {
        if (requestController.responsePromise.state === 'pending') {
          requestController.respondWith(undefined)
        }
      })

      await emitAsync(this.emitter, 'request', {
        request: interactiveRequest,
        requestId: requestJson.id,
      })

      const mockedResponse = await requestController.responsePromise

      if (!mockedResponse) {
        return
      }

      logger.info('event.respondWith called with:', mockedResponse)
      const responseClone = mockedResponse.clone()
      const responseText = await mockedResponse.text()

      // Send the mocked response to the child process.
      const serializedResponse = JSON.stringify({
        status: mockedResponse.status,
        statusText: mockedResponse.statusText,
        headers: Array.from(mockedResponse.headers.entries()),
        body: responseText,
      } as SerializedResponse)

      this.process.send(
        `response:${requestJson.id}:${serializedResponse}`,
        (error) => {
          if (error) {
            return
          }

          // Emit an optimistic "response" event at this point,
          // not to rely on the back-and-forth signaling for the sake of the event.
          this.emitter.emit('response', {
            response: responseClone,
            isMockedResponse: true,
            request: capturedRequest,
            requestId: requestJson.id,
          })
        }
      )

      logger.info(
        'sent serialized mocked response to the parent:',
        serializedResponse
      )
    }

    this.subscriptions.push(() => {
      this.process.removeListener('message', handleChildMessage)
      logger.info('removed the "message" listener from the child process!')
    })

    logger.info('adding a "message" listener to the child process')
    this.process.addListener('message', handleChildMessage)

    this.process.once('error', () => this.dispose())
    this.process.once('exit', () => this.dispose())
  }
}
