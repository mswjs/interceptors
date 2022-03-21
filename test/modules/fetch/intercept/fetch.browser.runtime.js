import { createInterceptor } from '@mswjs/interceptors'
import { interceptFetch } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = createInterceptor({
  modules: [interceptFetch],
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
