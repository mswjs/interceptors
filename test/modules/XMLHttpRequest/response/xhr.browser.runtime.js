import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

window.interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    window.dispatchEvent(
      new CustomEvent('test:request', {
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

    const { serverHttpUrl, serverHttpsUrl } = window

    if ([serverHttpUrl, serverHttpsUrl].includes(request.url.href)) {
      return {
        status: 201,
        statusText: 'Created',
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }
  },
})

window.interceptor.apply()
