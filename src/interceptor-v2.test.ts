import { TypedEvent } from 'rettime'
import { Interceptor } from './interceptor-v2'

it('nesting interceptors', async () => {
  const socketSetup = vi.fn()
  const protocolSetup = vi.fn()

  class SocketInterceptor extends Interceptor<{
    data: TypedEvent<string | number>
  }> {
    static symbol = Symbol.for('socket-interceptor')

    protected predicate(): boolean {
      return true
    }

    protected setup(): void {
      socketSetup()

      queueMicrotask(() => {
        this.emitter.emit(new TypedEvent('data', { data: 1 }))
        this.emitter.emit(new TypedEvent('data', { data: 'hello' }))
        this.emitter.emit(new TypedEvent('data', { data: 2 }))
      })
    }
  }

  class ProtocolInterceptor extends Interceptor<{
    request: TypedEvent<string | number>
  }> {
    static symbol = Symbol.for('protocol-interceptor')

    protected predicate(): boolean {
      return true
    }

    protected setup(): void {
      protocolSetup()

      const socket = Interceptor.singleton(SocketInterceptor)
      socket.apply()
      this.subscriptions.push(() => socket.dispose())

      const controller = new AbortController()
      this.subscriptions.push(() => controller.abort())

      socket.on(
        'data',
        ({ data }) => {
          this.emitter.emit(new TypedEvent('request', { data }))
        },
        { signal: controller.signal }
      )
    }
  }

  class NumberInterceptor extends Interceptor<{
    number: TypedEvent<number>
  }> {
    static symbol = Symbol.for('number-interceptor')

    protected predicate(): boolean {
      return true
    }

    protected setup(): void {
      const protocol = Interceptor.singleton(ProtocolInterceptor)
      protocol.apply()
      this.subscriptions.push(() => protocol.dispose())

      const controller = new AbortController()
      this.subscriptions.push(() => controller.abort())

      protocol.on(
        'request',
        ({ data }) => {
          if (typeof data === 'number') {
            this.emitter.emit(new TypedEvent('number', { data }))
          }
        },
        { signal: controller.signal }
      )
    }
  }

  class StringInterceptor extends Interceptor<{
    string: TypedEvent<string>
  }> {
    static symbol = Symbol.for('string-interceptor')

    protected predicate(): boolean {
      return true
    }

    protected setup(): void {
      const protocol = Interceptor.singleton(ProtocolInterceptor)
      protocol.apply()
      this.subscriptions.push(() => protocol.dispose())

      const controller = new AbortController()
      this.subscriptions.push(() => controller.abort())

      protocol.on(
        'request',
        ({ data }) => {
          if (typeof data === 'string') {
            this.emitter.emit(new TypedEvent('string', { data }))
          }
        },
        { signal: controller.signal }
      )
    }
  }

  const numberListener = vi.fn()
  const numberInterceptor = new NumberInterceptor()
  numberInterceptor.on('number', ({ data }) => numberListener(data))
  numberInterceptor.apply()

  const stringListener = vi.fn()
  const stringInterceptor = new StringInterceptor()
  stringInterceptor.on('string', ({ data }) => stringListener(data))
  stringInterceptor.apply()

  expect(socketSetup).toHaveBeenCalledOnce()
  expect(protocolSetup).toHaveBeenCalledOnce()

  await expect.poll(() => numberListener).toHaveBeenCalledTimes(2)

  numberInterceptor.dispose()
  stringInterceptor.dispose()

  expect(numberListener).toHaveBeenNthCalledWith(1, 1)
  expect(numberListener).toHaveBeenNthCalledWith(2, 2)
  expect(stringListener).toHaveBeenCalledExactlyOnceWith('hello')
})
