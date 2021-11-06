import { createInterceptor } from '@mswjs/interceptors'
import { interceptFetch } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = createInterceptor({
  modules: [interceptFetch],
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
