import { createInterceptor } from '@mswjs/interceptors'
import { interceptFetch } from '@mswjs/interceptors/lib/interceptors/fetch'

window.interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver(event) {
    const { serverHttpUrl, serverHttpsUrl } = window

    if ([serverHttpUrl, serverHttpsUrl].includes(event.request.url.href)) {
      event.respondWith({
        status: 201,
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      })
    }
  },
})

window.interceptor.apply()
