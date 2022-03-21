import { invariant } from 'outvariant'
import type {
  MaybePromise,
  ResolverEvent,
  HttpRequestEvent,
  WebSocketEvent,
  ResolverEventsMap,
} from '../createInterceptor'

export type EventProperties =
  | {
      source: HttpRequestEvent['source']
      target: HttpRequestEvent['target']
      request: HttpRequestEvent['request']
    }
  | {
      source: WebSocketEvent['source']
      target: WebSocketEvent['target']
      message: WebSocketEvent['message']
    }

export type EventReturnType<Properties extends EventProperties> =
  ExtractEventReturnType<ResolverEventsMap[Properties['source']]>

export type ExtractEventReturnType<Event extends ResolverEvent> = Parameters<
  Event['respondWith']
>[0] extends MaybePromise<infer DataType>
  ? DataType | undefined
  : never

export function createResolverEvent<Properties extends EventProperties>(
  properties: Properties
): [
  ResolverEventsMap[Properties['source']],
  () => Promise<EventReturnType<Properties>>
] {
  let calledTimes = 0
  let autoResolveTimeout: NodeJS.Timeout
  let remoteResolve: (data: EventReturnType<Properties>) => void
  const responsePromise = new Promise<EventReturnType<Properties>>(
    (resolve) => {
      remoteResolve = resolve
    }
  )
    .then((data) => {
      calledTimes++
      return data
    })
    .finally(() => {
      clearTimeout(autoResolveTimeout)
    })

  const event: ResolverEvent = {
    ...properties,
    timeStamp: Date.now(),
    respondWith(data: any) {
      invariant(
        calledTimes === 0,
        'Failed to call "event.respondWith": cannot respond to a resolver event multiple times.'
      )

      remoteResolve(data)
    },
  }

  function respondedWithCalled() {
    // Immediately resolve the "event.respondWith" Promise
    // unless "event.respondWith" is called in the resolver.
    // This prevents this Promise from hanging indefinitely
    // if "event.respondWith" was never called (introspection).
    autoResolveTimeout = setTimeout(() => {
      remoteResolve(undefined)
    }, 0)

    return responsePromise
  }

  return [event as ResolverEventsMap[Properties['source']], respondedWithCalled]
}
