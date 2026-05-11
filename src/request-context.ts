import { AsyncLocalStorage } from 'node:async_hooks'

interface RequestContext {
  initiator: unknown
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function runInRequestContext<T>(callback: () => T): T {
  const parentInitiator = requestContext.getStore()?.initiator

  if (parentInitiator) {
    return callback()
  }

  const context: RequestContext = { initiator: 'TEMP' }

  return requestContext.run(context, () => {
    const initiator = callback()
    context.initiator = initiator
    return initiator
  })
}
