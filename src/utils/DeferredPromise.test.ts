import { DeferredPromise } from './DeferredPromise'

it('resolves the promise when called "resolve()"', () => {
  const deferred = new DeferredPromise<string>()
  deferred.resolve('data')
  expect(deferred.promise).resolves.toBe('data')
})

it('rejects the promise when called "reject()"', () => {
  const deferred = new DeferredPromise()
  deferred.reject(new Error('Reject reason'))
  expect(deferred.promise).rejects.toThrowError('Reject reason')
})
