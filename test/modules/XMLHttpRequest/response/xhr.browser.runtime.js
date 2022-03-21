import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

window.interceptor = createInterceptor({
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

    const { serverHttpUrl, serverHttpsUrl } = window

    if ([serverHttpUrl, serverHttpsUrl].includes(event.request.url.href)) {
      event.respondWith({
        status: 201,
        statusText: 'Created',
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      })
    }
  },
})

window.interceptor.apply()
