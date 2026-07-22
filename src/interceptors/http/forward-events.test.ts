import { Emitter } from 'rettime'
import {
  HttpResponseEvent,
  type HttpRequestEventMap,
} from '#/src/events/http'
import { Interceptor } from '#/src/interceptor'
import { forwardHttpEvents } from './forward-events'

class HttpRequestSource extends Interceptor<HttpRequestEventMap> {
  protected predicate(): boolean {
    return true
  }

  protected setup(): void {}

  public emitResponse(event: HttpResponseEvent) {
    return this.emitter.emitAsPromise(event)
  }
}

it('forwards the canonical event instance to every interceptor', async () => {
  const source = new HttpRequestSource()
  const firstEmitter = new Emitter<HttpRequestEventMap>()
  const secondEmitter = new Emitter<HttpRequestEventMap>()
  const firstListener = vi.fn()
  const secondListener = vi.fn()

  firstEmitter.on('response', firstListener)
  secondEmitter.on('response', secondListener)

  const disposeFirstForwarding = forwardHttpEvents({
    source,
    emitter: firstEmitter,
    predicate: () => {
      return true
    },
  })
  const disposeSecondForwarding = forwardHttpEvents({
    source,
    emitter: secondEmitter,
    predicate: () => {
      return true
    },
  })
  const responseEvent = new HttpResponseEvent({
    request: new Request('https://example.com'),
    requestId: 'request-id',
    initiator: null,
    response: new Response(),
    responseType: 'mock',
  })

  await source.emitResponse(responseEvent)

  expect(firstListener).toHaveBeenCalledExactlyOnceWith(responseEvent)
  expect(secondListener).toHaveBeenCalledExactlyOnceWith(responseEvent)

  disposeFirstForwarding()
  disposeSecondForwarding()
})

it('removes lazy source listeners with the consumer listener', () => {
  const source = new HttpRequestSource()
  const emitter = new Emitter<HttpRequestEventMap>()
  const listener = vi.fn()

  emitter.on('response', listener)
  const disposeForwarding = forwardHttpEvents({
    source,
    emitter,
    predicate: () => {
      return true
    },
  })

  expect(source.listenerCount('request')).toBe(1)
  expect(source.listenerCount('response')).toBe(1)

  emitter.removeListener('response', listener)

  expect(source.listenerCount('response')).toBe(0)

  disposeForwarding()

  expect(source.listenerCount('request')).toBe(0)
})
