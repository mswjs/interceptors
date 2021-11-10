import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    window.dispatchEvent(
      new CustomEvent('resolver', {
        detail: JSON.stringify({
          id: request.id,
          method: request.method,
          url: request.url.href,
          headers: request.headers.all(),
          credentials: request.credentials,
          body: request.body,
        }),
      })
    )
  },
})

interceptor.apply()
