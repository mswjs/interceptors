import { AsyncLocalStorage } from 'node:async_hooks'
import type { Logger } from './utils/logger'

interface RequestContext {
  initiator: unknown
  logger?: Logger
  transformRequest?: (request: Request) => Request
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function runInRequestContext<T>(callback: () => T, logger?: Logger): T {
  /**
   * @note Never shadow an existing request context. Nested calls
   * (e.g. a patched entry point re-entered synchronously, or a request
   * made within the fetch/XMLHttpRequest interceptor context) must run
   * within the parent context so the sockets they create capture it.
   */
  if (requestContext.getStore()) {
    return callback()
  }

  /**
   * @note The initiator is the callback's return value (e.g. the
   * "ClientRequest" instance), so it cannot be known before running
   * the callback. The context is mutated in place once the callback
   * returns; readers hold the context object by reference and sample
   * "initiator" only after the request has been written.
   */
  const context: RequestContext = {
    initiator: undefined,
    logger,
  }

  return requestContext.run(context, () => {
    const initiator = callback()
    context.initiator = initiator
    return initiator
  })
}
