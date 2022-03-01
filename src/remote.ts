import { ChildProcess } from 'child_process'
import { Headers } from 'headers-polyfill'
import { invariant } from 'outvariant'
import { StrictEventEmitter } from 'strict-event-emitter'
import {
  createInterceptor,
  InterceptorApi,
  InterceptorEventsMap,
  InterceptorOptions,
  IsomorphicRequest,
  Resolver,
} from './createInterceptor'
import { toIsoResponse } from './utils/toIsoResponse'

export type CreateRemoteInterceptorOptions = Omit<
  InterceptorOptions,
  'resolver'
>

export type RemoteResolverApi = Pick<InterceptorApi, 'on'>

export interface CreateRemoteResolverOptions {
  process: ChildProcess
  resolver: Resolver
}

function requestReviver(key: string, value: any) {
  switch (key) {
    case 'url':
      return new URL(value)

    case 'headers':
      return new Headers(value)

    default:
      return value
  }
}

/**
 * Creates a remote request interceptor that delegates
 * the mocked response resolution to the parent process.
 * The parent process must establish a remote resolver
 * by calling `createRemoteResolver` function.
 */
export function createRemoteInterceptor(
  options: CreateRemoteInterceptorOptions
): InterceptorApi {
  invariant(
    process.connected,
    `Failed to create a remote interceptor: the current process (%s) does not have a parent. Please make sure you're spawning this process as a child process in order to use remote request interception.`,
    process.pid
  )

  if (typeof process.send === 'undefined') {
    throw new Error(
      `\
Failed to create a remote interceptor: the current process (${process.pid}) does not have the IPC enabled. Please make sure you're spawning this process with the "ipc" stdio value set:

spawn('node', ['module.js'], { stdio: ['ipc'] })\
`
    )
  }

  let handleParentMessage: NodeJS.MessageListener

  const interceptor = createInterceptor({
    ...options,
    resolver(request) {
      const serializedRequest = JSON.stringify(request)
      process.send?.(`request:${serializedRequest}`)

      return new Promise((resolve) => {
        handleParentMessage = (message) => {
          if (typeof message !== 'string') {
            return
          }

          if (message.startsWith(`response:${request.id}`)) {
            const [, responseString] =
              message.match(/^response:.+?:(.+)$/) || []

            if (!responseString) {
              return resolve()
            }

            const mockedResponse = JSON.parse(responseString)

            return resolve(mockedResponse)
          }
        }

        process.addListener('message', handleParentMessage)
      })
    },
  })

  return {
    ...interceptor,
    restore() {
      interceptor.restore()
      process.removeListener('message', handleParentMessage)
    },
  }
}

/**
 * Creates a response resolver function attached to the given `ChildProcess`.
 * The child process must establish a remote interceptor by calling `createRemoteInterceptor` function.
 */
export function createRemoteResolver(
  options: CreateRemoteResolverOptions
): RemoteResolverApi {
  const observer = new StrictEventEmitter<InterceptorEventsMap>()

  const handleChildMessage: NodeJS.MessageListener = async (message) => {
    if (typeof message !== 'string') {
      return
    }

    if (message.startsWith('request:')) {
      const [, requestString] = message.match(/^request:(.+)$/) || []

      if (!requestString) {
        return
      }

      const isoRequest: IsomorphicRequest = JSON.parse(
        requestString,
        requestReviver
      )

      observer.emit('request', isoRequest)

      // Retrieve the mocked response.
      const mockedResponse = await options.resolver(
        isoRequest,
        undefined as any
      )

      // Send the mocked response to the child process.
      const serializedResponse = JSON.stringify(mockedResponse)
      options.process.send(
        `response:${isoRequest.id}:${serializedResponse}`,
        (error) => {
          if (error) {
            return
          }

          if (mockedResponse) {
            // Emit an optimisting "response" event at this point,
            // not to rely on the back-and-forth signaling for the sake of the event.
            observer.emit('response', isoRequest, toIsoResponse(mockedResponse))
          }
        }
      )
    }
  }

  const cleanup = () => {
    options.process.removeListener('message', handleChildMessage)
  }

  options.process.addListener('message', handleChildMessage)
  options.process.addListener('disconnect', cleanup)
  options.process.addListener('error', cleanup)
  options.process.addListener('exit', cleanup)

  return {
    on(event, listener) {
      observer.addListener(event, listener)
    },
  }
}
