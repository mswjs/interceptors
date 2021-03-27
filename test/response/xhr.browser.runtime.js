import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

window.interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
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
