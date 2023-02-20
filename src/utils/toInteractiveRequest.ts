import { format } from 'outvariant'
import { createLazyCallback, LazyCallback } from './createLazyCallback'

type LazyResponseCallback = (response: globalThis.Response) => void

export type InteractiveRequest = globalThis.Request & {
  respondWith: LazyCallback<LazyResponseCallback>
}

export function toInteractiveRequest(
  request: globalThis.Request
): InteractiveRequest {
  Object.defineProperty(request, 'respondWith', {
    writable: false,
    enumerable: true,
    value: createLazyCallback<LazyResponseCallback>({
      maxCalls: 1,
      maxCallsCallback() {
        throw new Error(
          format(
            'Failed to respond to "%s %s" request: the "request" event has already been responded to.',
            request.method,
            request.url
          )
        )
      },
    }),
  })

  return request as InteractiveRequest
}
