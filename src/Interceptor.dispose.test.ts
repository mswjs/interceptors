import { Interceptor, InterceptorReadyState } from './Interceptor'

const interceptor = new Interceptor(Symbol('test'))

beforeEach(() => {
  interceptor.apply()
  interceptor.on('request', function requestListener() {})
})

afterEach(() => {
  interceptor.dispose()
})

it.each(['first', 'second', 'third', 'fourth'])('%s test', () => {
  expect(interceptor['readyState']).toBe(InterceptorReadyState.APPLIED)
  expect(interceptor['emitter'].listenerCount('request')).toBe(1)
})
