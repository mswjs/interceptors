import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(event) {
    window.dispatchEvent(
      new CustomEvent('resolver', {
        detail: JSON.stringify({
          id: event.request.id,
          method: event.request.method,
          url: event.request.url.href,
          headers: event.request.headers.all(),
          credentials: event.request.credentials,
          body: event.request.body,
        }),
      })
    )
  },
})

interceptor.apply()
