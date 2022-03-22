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
import { createResolverEvent } from './utils/createResolverEvent'
import { toIsoResponse } from './utils/toIsoResponse'

export type CreateRemoteInterceptorOptions = Omit<
  InterceptorOptions<any[]>,
  'resolver'
>

export type RemoteResolverApi = Pick<InterceptorApi, 'on'>

export interface CreateRemoteResolverOptions {
  process: ChildProcess
  resolver: Resolver
}

function requestReviver(key: string, value: unknown) {
  switch (key) {
    case 'url':
      return new URL(value as string)

    case 'headers':
      return new Headers(value as Headers)

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
    resolver(event) {
      if (event.source !== 'http') {
        return
      }

      const { request } = event
      const serializedRequest = JSON.stringify(request)

      process.send?.(`request:${serializedRequest}`)

      handleParentMessage = (message) => {
        if (typeof message !== 'string') {
          return
        }

        if (message.startsWith(`response:${request.id}`)) {
          const [, responseText] = message.match(/^response:.+?:(.+)$/) || []

          if (!responseText) {
            return
          }

          const mockedResponse = JSON.parse(responseText)
          event.respondWith(mockedResponse)
        }
      }

      process.addListener('message', handleParentMessage)
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

      const isomorphicRequest: IsomorphicRequest = JSON.parse(
        requestString,
        requestReviver
      )

      observer.emit('request', isomorphicRequest)

      const [resolverEvent, respondedWithCalled] = createResolverEvent({
        source: 'http',
        request: isomorphicRequest,
        target: undefined as any,
      })

      // Execute the resolver.
      await options.resolver(resolverEvent)

      // Await for the "event.respondWith" to be called.
      const mockedResponse = await respondedWithCalled()

      // Send the mocked response to the child process.
      const serializedResponse = JSON.stringify(mockedResponse)

      options.process.send(
        `response:${isomorphicRequest.id}:${serializedResponse}`,
        (error) => {
          if (error) {
            return
          }

          if (mockedResponse) {
            // Emit an optimisting "response" event at this point,
            // not to rely on the back-and-forth signaling for the sake of the event.
            observer.emit(
              'response',
              isomorphicRequest,
              toIsoResponse(mockedResponse)
            )
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
