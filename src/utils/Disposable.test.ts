import { Disposable } from './Disposable'

it('disposes of all subscriptions on "dispose"', () => {
  const disposable = new Disposable()

  const subscriptionA = jest.fn()
  disposable['subscriptions'].push(subscriptionA)
  const subscriptionB = jest.fn()
  disposable['subscriptions'].push(subscriptionB)

  disposable.dispose()

  expect(subscriptionA).toHaveBeenCalledTimes(1)
  expect(subscriptionB).toHaveBeenCalledTimes(1)
  expect(disposable['subscriptions']).toEqual([])
})

it('does nothing when calling dispose with no subscriptions', () => {
  const disposable = new Disposable()
  expect(() => disposable.dispose()).not.toThrow()
  expect(disposable['subscriptions']).toEqual([])
})

it('propagates subscription exceptions', () => {
  const disposable = new Disposable()
  const subscriptionA = jest.fn(() => {
    throw new Error('Subscription exception')
  })
  const subscriptionB = jest.fn()
  disposable['subscriptions'].push(subscriptionA)
  disposable['subscriptions'].push(subscriptionB)

  expect(() => disposable.dispose()).toThrow('Subscription exception')
  expect(subscriptionA).toHaveBeenCalledTimes(1)
  // Note that subscriptions are disposed of right-to-left.
  expect(subscriptionB).toHaveBeenCalledTimes(1)
})
