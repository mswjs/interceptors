import {
  Interceptor,
  getGlobalSymbol,
  deleteGlobalSymbol,
  InterceptorReadyState,
} from './Interceptor'
import { nextTickAsync } from './utils/nextTick'
import { sleep } from './utils/sleep'

const symbol = Symbol('test')

afterEach(() => {
  deleteGlobalSymbol(symbol)
})

describe('readyState', () => {
  it('sets the state to "IDLE" when the interceptor is created', () => {
    const interceptor = new Interceptor(symbol)
    expect(interceptor['readyState']).toBe(InterceptorReadyState.IDLE)
  })

  it('leaves state as "IDLE" if the interceptor failed the environment check', async () => {
    class MyInterceptor extends Interceptor<any> {
      protected checkEnvironment(): boolean {
        return false
      }
    }
    const interceptor = new MyInterceptor(symbol)
    interceptor.apply()

    expect(interceptor['readyState']).toBe(InterceptorReadyState.IDLE)

    await nextTickAsync(() => {
      expect(interceptor['readyState']).toBe(InterceptorReadyState.IDLE)
    })
  })

  it('perfroms state transition when the interceptor is applying', async () => {
    const interceptor = new Interceptor(symbol)
    interceptor.apply()

    expect(interceptor['readyState']).toBe(InterceptorReadyState.APPLIED)
  })

  it('perfroms state transition when disposing of the interceptor', async () => {
    const interceptor = new Interceptor(symbol)
    interceptor.apply()
    interceptor.dispose()

    expect(interceptor['readyState']).toBe(InterceptorReadyState.DISPOSED)
  })
})

describe('apply', () => {
  it('stores global reference to the applied interceptor', () => {
    const interceptor = new Interceptor(symbol)
    interceptor.apply()

    expect(getGlobalSymbol(symbol)).toEqual(interceptor)
  })

  it('does not apply the same interceptor multiple times', () => {
    const interceptor = new Interceptor(symbol)
    const setupSpy = jest.spyOn(
      interceptor,
      // @ts-expect-error Protected property spy.
      'setup'
    )

    // Intentionally apply the same interceptor multiple times.
    interceptor.apply()
    interceptor.apply()
    interceptor.apply()

    // The "setup" must not be called repeatedly.
    expect(setupSpy).toHaveBeenCalledTimes(1)

    expect(getGlobalSymbol(symbol)).toEqual(interceptor)
  })

  it('does not call "apply" if the interceptor fails environment check', () => {
    class MyInterceptor extends Interceptor<{}> {
      checkEnvironment() {
        return false
      }
    }

    const interceptor = new MyInterceptor(Symbol('test'))
    const setupSpy = jest.spyOn(
      interceptor,
      // @ts-expect-error Protected property spy.
      'setup'
    )
    interceptor.apply()

    expect(setupSpy).not.toHaveBeenCalled()
  })

  it('proxies listeners from new interceptor to already running interceptor', () => {
    const firstInterceptor = new Interceptor(symbol)
    const secondInterceptor = new Interceptor(symbol)

    firstInterceptor.apply()
    const firstListener = jest.fn()
    firstInterceptor.on('test', firstListener)

    secondInterceptor.apply()
    const secondListener = jest.fn()
    secondInterceptor.on('test', secondListener)

    // Emitting event in the first interceptor will bubble to the second one.
    firstInterceptor['emitter'].emit('test', 'hello world')

    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(firstListener).toHaveBeenCalledWith('hello world')

    expect(secondListener).toHaveBeenCalledTimes(1)
    expect(secondListener).toHaveBeenCalledWith('hello world')

    expect(secondInterceptor['emitter'].listenerCount('test')).toBe(0)
  })
})

describe('dispose', () => {
  it('deletes global reference when the interceptor is disposed', () => {
    const interceptor = new Interceptor(symbol)

    interceptor.apply()
    interceptor.dispose()

    expect(getGlobalSymbol(symbol)).toBeUndefined()
  })

  it('removes all listeners when the interceptor is disposed', async () => {
    const interceptor = new Interceptor(symbol)

    interceptor.apply()
    const listener = jest.fn(() => {
      throw new Error('This listener must never be called')
    })
    interceptor.on('test', listener)
    interceptor.on('test', async () => {
      await sleep(200)
      listener()
    })
    interceptor.on('test', listener)
    interceptor.dispose()

    // Even after emitting an event, the listener must not get called.
    interceptor['emitter'].emit('test')
    expect(listener).not.toHaveBeenCalled()

    // The listener must not be called on the next tick either.
    await nextTickAsync(() => {
      interceptor['emitter'].emit('test')
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
