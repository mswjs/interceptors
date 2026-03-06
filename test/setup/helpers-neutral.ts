import { DeferredPromise } from '@open-draft/deferred-promise'

export function waitForXMLHttpRequest(request: XMLHttpRequest): Promise<void> {
  const pendingResponse = new DeferredPromise<void>()

  request.addEventListener('loadend', () => pendingResponse.resolve())
  request.addEventListener('abort', () =>
    pendingResponse.reject(new Error('Request aborted'))
  )

  return pendingResponse
}

export function spyOnXMLHttpRequest(request: XMLHttpRequest) {
  const events: Array<[string, number] | [string, number, any]> = []

  const addEvent = (name: string) => {
    return (event: unknown) => {
      console.log('EVENT:', name, event, request.readyState)

      if (event instanceof ProgressEvent) {
        events.push([
          name,
          request.readyState,
          { loaded: event.loaded, total: event.total },
        ])
      } else {
        events.push([name, request.readyState])
      }
    }
  }

  request.onreadystatechange = addEvent('readystatechange')
  request.onprogress = addEvent('progress')
  request.onloadstart = addEvent('loadstart')
  request.onload = addEvent('load')
  request.onload = addEvent('loadend')
  request.ontimeout = addEvent('timeout')
  request.onerror = addEvent('error')
  request.onabort = addEvent('abort')

  return {
    events,
  }
}
