export interface ProxyOptions<Target extends Record<string, any>> {
  constructorCall?(args: Array<unknown>, next: NextFunction<Target>): Target

  methodCall?<F extends keyof Target>(
    this: Target,
    data: [methodName: F, args: Array<unknown>],
    next: NextFunction<void>
  ): void

  setProperty?(): void

  getProperty?(
    data: [propertyName: string | symbol, receiver: Target],
    next: NextFunction<void>
  ): void
}

export type NextFunction<ReturnType> = () => ReturnType

export function createProxy<Target extends object>(
  target: Target,
  options: ProxyOptions<Target>
): Target {
  const proxy = new Proxy(target, optionsToProxyHandler(options))
  return proxy
}

function optionsToProxyHandler<T extends Record<string, any>>(
  options: ProxyOptions<T>
): ProxyHandler<T> {
  const { constructorCall, methodCall, getProperty } = options
  const handler: ProxyHandler<T> = {}

  if (typeof constructorCall !== 'undefined') {
    handler.construct = function (target, args, newTarget) {
      const next = Reflect.construct.bind(null, target as any, args, newTarget)
      return constructorCall.call(newTarget, args, next)
    }
  }

  handler.get = function (target, propertyName, receiver) {
    const next = Reflect.get.bind(target, target, propertyName, receiver)

    const value =
      typeof getProperty !== 'undefined'
        ? getProperty.call(target, [propertyName, receiver], next)
        : next()

    if (typeof value === 'function') {
      return (...args: Array<any>) => {
        const next = Reflect.apply.bind(target, value, target, args)

        if (typeof methodCall !== 'undefined') {
          return methodCall.call(target, [propertyName as any, args], next)
        }

        return next()
      }
    }

    return value
  }

  return handler
}
