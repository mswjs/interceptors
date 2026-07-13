import { TypedEvent } from 'rettime'
import { Interceptor, InterceptorReadyState } from './interceptor'
import { BatchInterceptor } from './BatchInterceptor'

afterEach(() => {
  vi.resetAllMocks()
})

it('applies child interceptors', () => {
  class PrimaryInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  class SecondInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const instances = {
    primary: new PrimaryInterceptor(),
    secondary: new SecondInterceptor(),
  }

  const interceptor = new BatchInterceptor({
    name: 'batch-apply',
    interceptors: [instances.primary, instances.secondary],
  })

  const primaryApplySpy = vi.spyOn(instances.primary, 'apply')
  const secondaryApplySpy = vi.spyOn(instances.secondary, 'apply')

  interceptor.apply()

  expect(primaryApplySpy).toHaveBeenCalledTimes(1)
  expect(secondaryApplySpy).toHaveBeenCalledTimes(1)
})

it('proxies event listeners to the interceptors', () => {
  class PrimaryInterceptor extends Interceptor<{
    hello: TypedEvent<string>
  }> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  class SecondInterceptor extends Interceptor<{
    goodbye: TypedEvent<string>
  }> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const instances = {
    primary: new PrimaryInterceptor(),
    secondary: new SecondInterceptor(),
  }

  const interceptor = new BatchInterceptor({
    name: 'batch-proxy',
    interceptors: [instances.primary, instances.secondary],
  })

  const helloListener = vi.fn()
  interceptor.on('hello', helloListener)

  const goodbyeListener = vi.fn()
  interceptor.on('goodbye', goodbyeListener)

  // Emulate the child interceptor emitting events.
  const helloEvent = new TypedEvent('hello', { data: 'John' })
  instances.primary['emitter'].emit(helloEvent)

  const goodbyeEvent = new TypedEvent('goodbye', { data: 'Kate' })
  instances.secondary['emitter'].emit(goodbyeEvent)

  // Must call the batch interceptor listener.
  expect(helloListener).toHaveBeenCalledExactlyOnceWith(helloEvent)
  expect(goodbyeListener).toHaveBeenCalledExactlyOnceWith(goodbyeEvent)
})

it('disposes of child interceptors', async () => {
  class PrimaryInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  class SecondInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const instances = {
    primary: new PrimaryInterceptor(),
    secondary: new SecondInterceptor(),
  }

  const interceptor = new BatchInterceptor({
    name: 'batch-dispose',
    interceptors: [instances.primary, instances.secondary],
  })

  const primaryDisposeSpy = vi.spyOn(instances.primary, 'dispose')
  const secondaryDisposeSpy = vi.spyOn(instances.secondary, 'dispose')

  interceptor.apply()
  interceptor.dispose()

  expect(primaryDisposeSpy).toHaveBeenCalledTimes(1)
  expect(secondaryDisposeSpy).toHaveBeenCalledTimes(1)
})

it('forwards listeners added via "on()"', () => {
  class FirstInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }
  class SecondInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const firstInterceptor = new FirstInterceptor()
  const secondInterceptor = new SecondInterceptor()

  const interceptor = new BatchInterceptor({
    name: 'batch',
    interceptors: [firstInterceptor, secondInterceptor],
  })

  const listener = vi.fn()
  interceptor.on('foo', listener)

  expect(firstInterceptor['emitter'].listenerCount('foo')).toBe(1)
  expect(secondInterceptor['emitter'].listenerCount('foo')).toBe(1)
  expect(
    interceptor['emitter'].listenerCount('foo'),
    'Does not add the listener onto the batch interceptor'
  ).toBe(0)
})

it('forwards listeners removal via "removeListener()"', () => {
  type Events = {
    foo: []
  }

  class FirstInterceptor extends Interceptor<Events> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }
  class SecondInterceptor extends Interceptor<Events> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const firstInterceptor = new FirstInterceptor()
  const secondInterceptor = new SecondInterceptor()

  const interceptor = new BatchInterceptor({
    name: 'batch',
    interceptors: [firstInterceptor, secondInterceptor],
  })

  const listener = vi.fn()
  interceptor.on('foo', listener)
  interceptor.removeListener('foo', listener)

  expect(firstInterceptor['emitter'].listenerCount('foo')).toBe(0)
  expect(secondInterceptor['emitter'].listenerCount('foo')).toBe(0)
})

it('forwards removal of all listeners by name via ".removeAllListeners()"', () => {
  type Events = {
    foo: TypedEvent
    bar: TypedEvent
  }

  class FirstInterceptor extends Interceptor<Events> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }
  class SecondInterceptor extends Interceptor<Events> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const firstInterceptor = new FirstInterceptor()
  const secondInterceptor = new SecondInterceptor()

  const interceptor = new BatchInterceptor({
    name: 'batch',
    interceptors: [firstInterceptor, secondInterceptor],
  })

  const listener = vi.fn()
  interceptor.on('foo', listener)
  interceptor.on('foo', listener)
  interceptor.on('bar', listener)

  expect(firstInterceptor['emitter'].listenerCount('foo')).toBe(2)
  expect(firstInterceptor['emitter'].listenerCount('bar')).toBe(1)

  expect(secondInterceptor['emitter'].listenerCount('foo')).toBe(2)
  expect(secondInterceptor['emitter'].listenerCount('bar')).toBe(1)

  interceptor.removeAllListeners('foo')

  expect(firstInterceptor['emitter'].listenerCount('foo')).toBe(0)
  expect(firstInterceptor['emitter'].listenerCount('bar')).toBe(1)
  expect(secondInterceptor['emitter'].listenerCount('foo')).toBe(0)
  expect(secondInterceptor['emitter'].listenerCount('bar')).toBe(1)
})

it('forwards removal of all listeners via ".removeAllListeners()"', () => {
  class FirstInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }
  class SecondInterceptor extends Interceptor<any> {
    protected predicate(): boolean {
      return true
    }
    protected setup(): void {}
  }

  const firstInterceptor = new FirstInterceptor()
  const secondInterceptor = new SecondInterceptor()

  const interceptor = new BatchInterceptor({
    name: 'batch',
    interceptors: [firstInterceptor, secondInterceptor],
  })

  const listener = vi.fn()
  interceptor.on('foo', listener)
  interceptor.on('foo', listener)
  interceptor.on('bar', listener)

  expect(firstInterceptor['emitter'].listenerCount('foo')).toBe(2)
  expect(firstInterceptor['emitter'].listenerCount('bar')).toBe(1)
  expect(secondInterceptor['emitter'].listenerCount('foo')).toBe(2)
  expect(secondInterceptor['emitter'].listenerCount('bar')).toBe(1)

  interceptor.removeAllListeners()

  expect(firstInterceptor['emitter'].listenerCount('foo')).toBe(0)
  expect(secondInterceptor['emitter'].listenerCount('foo')).toBe(0)
  expect(firstInterceptor['emitter'].listenerCount('bar')).toBe(0)
  expect(secondInterceptor['emitter'].listenerCount('bar')).toBe(0)
})

it('keeps shared child interceptors active until all batches dispose', () => {
  type Events = {
    message: TypedEvent<string>
  }

  const setup = vi.fn()
  const teardown = vi.fn()

  class SharedInterceptor extends Interceptor<Events> {
    protected predicate(): boolean {
      return true
    }

    protected setup(): void {
      setup()
      this.subscriptions.push(teardown)
    }
  }

  const sharedInterceptor = new SharedInterceptor()
  const primaryBatch = new BatchInterceptor({
    name: 'primary-batch',
    interceptors: [sharedInterceptor],
  })
  const secondaryBatch = new BatchInterceptor({
    name: 'secondary-batch',
    interceptors: [sharedInterceptor],
  })
  const primaryListener = vi.fn()
  const secondaryListener = vi.fn()

  primaryBatch.apply()
  secondaryBatch.apply()
  primaryBatch.on('message', primaryListener)
  secondaryBatch.on('message', secondaryListener)

  expect(setup).toHaveBeenCalledOnce()

  sharedInterceptor['emitter'].emit(
    new TypedEvent('message', { data: 'first' })
  )

  expect(primaryListener).toHaveBeenCalledTimes(1)
  expect(secondaryListener).toHaveBeenCalledTimes(1)

  primaryBatch.dispose()

  expect(sharedInterceptor.readyState).toBe(InterceptorReadyState.ACTIVE)
  expect(teardown).not.toHaveBeenCalled()

  sharedInterceptor['emitter'].emit(
    new TypedEvent('message', { data: 'second' })
  )

  expect(primaryListener).toHaveBeenCalledTimes(1)
  expect(secondaryListener).toHaveBeenCalledTimes(2)

  secondaryBatch.dispose()

  expect(sharedInterceptor.readyState).toBe(InterceptorReadyState.DISPOSED)
  expect(teardown).toHaveBeenCalledOnce()
})

it('removes only listeners owned by the batch', () => {
  type Events = {
    message: TypedEvent<string>
  }

  class SharedInterceptor extends Interceptor<Events> {
    protected predicate(): boolean {
      return true
    }

    protected setup(): void {}
  }

  const sharedInterceptor = new SharedInterceptor()
  const primaryBatch = new BatchInterceptor({
    name: 'primary-batch',
    interceptors: [sharedInterceptor],
  })
  const secondaryBatch = new BatchInterceptor({
    name: 'secondary-batch',
    interceptors: [sharedInterceptor],
  })
  const primaryListener = vi.fn()
  const secondaryListener = vi.fn()

  primaryBatch.on('message', primaryListener)
  secondaryBatch.on('message', secondaryListener)

  primaryBatch.removeAllListeners()

  sharedInterceptor['emitter'].emit(
    new TypedEvent('message', { data: 'hello' })
  )

  expect(primaryListener).not.toHaveBeenCalled()
  expect(secondaryListener).toHaveBeenCalledOnce()
})
