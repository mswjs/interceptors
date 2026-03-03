import { DeferredPromise } from '@open-draft/deferred-promise'

export function waitForXMLHttpRequest(request: XMLHttpRequest): Promise<void> {
  const pendingResponse = new DeferredPromise<void>()

  request.addEventListener('loadend', () => pendingResponse.resolve())
  request.addEventListener('abort', () =>
    pendingResponse.reject(new Error('Request aborted'))
  )

  return pendingResponse
}
