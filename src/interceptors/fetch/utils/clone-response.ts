import { FetchResponse } from '../../../utils/fetch-utils'
import { copyRawHeaders } from '../../ClientRequest/utils/record-raw-headers'

/** Clone for observers without letting their unread body block caller cancellation. */
export function cloneResponse(response: Response): [Response, Response] {
  const clone = FetchResponse.clone(response)

  if (!response.body || !clone.body) {
    return [response, clone]
  }

  const observer = wrapResponse(clone)
  const caller = wrapResponse(response, observer.cancel)

  return [caller.response, observer.response]
}

function wrapResponse(
  response: Response,
  onCancel?: (reason: unknown) => Promise<void>
) {
  const body = response.body!
  const reader = body.getReader()
  const cancel = (reason: unknown) => {
    return body.locked ? reader.cancel(reason) : body.cancel(reason)
  }
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read()

          if (done) {
            controller.close()
            reader.releaseLock()
            return
          }

          controller.enqueue(value)
        } catch (error) {
          controller.error(error)
          reader.releaseLock()
        }
      },
      async cancel(reason) {
        try {
          // Both tee branches must cancel before either cancellation can settle.
          await Promise.all([cancel(reason), onCancel?.(reason)])
        } finally {
          reader.releaseLock()
        }
      },
    },
    { highWaterMark: 0 }
  )
  const wrappedResponse = new FetchResponse(stream, response)
  copyRawHeaders(response.headers, wrappedResponse.headers)
  Object.defineProperties(wrappedResponse, {
    type: { value: response.type },
    redirected: { value: response.redirected },
  })

  return { response: wrappedResponse, cancel }
}
