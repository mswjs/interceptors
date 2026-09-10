import { FetchResponse } from './fetch-utils'
import { copyRawHeaders } from '../interceptors/ClientRequest/utils/record-raw-headers'

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
          const cancellation = cancel(reason)

          if (onCancel) {
            // Caller cancellation owns both branches.
            await Promise.all([cancellation, onCancel(reason)])
          } else {
            // An observer must not wait for the caller to consume its branch:
            // Response delivery is still waiting for this listener to finish.
            void cancellation.catch(() => {})
          }
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
