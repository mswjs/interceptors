import { invariant } from 'outvariant'
import { AnyFunction } from './createObservableFunction'

export function spyOnFunction<Target extends Object>(
  target: Target,
  functionName: keyof Target
) {
  invariant(
    functionName in target,
    'Cannot spy on unknown property "%s"',
    functionName
  )

  const fn = target[functionName] as unknown as AnyFunction
  invariant(
    typeof fn === 'function',
    'Cannot spy on a function "%s": given property is not a function',
    functionName
  )

  const stats = {
    haveBeenCalled: false,
  }

  Object.defineProperty(target, functionName, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function (...args: Parameters<typeof fn>): ReturnType<typeof fn> {
      stats.haveBeenCalled = true
      return fn(...args)
    },
  })

  return stats
}
