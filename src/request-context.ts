import { AsyncLocalStorage } from 'node:async_hooks'
import type { Logger } from './utils/logger'

interface RequestContext {
  initiator: unknown
  logger?: Logger
  prepareRequest?: (request: Request) => Request
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function runInRequestContext<T>(
  callback: () => T,
  logger?: Logger
): T {
  const parentInitiator = requestContext.getStore()?.initiator

  if (parentInitiator) {
    return callback()
  }

  const context: RequestContext = { initiator: 'TEMP', logger }

  return requestContext.run(context, () => {
    const initiator = callback()
    context.initiator = initiator
    return initiator
  })
}
