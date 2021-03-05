import { createInterceptor } from 'node-request-interceptor'
import { interceptFetch } from 'node-request-interceptor/lib/interceptors/fetch'

window.interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver(request) {
    const { serverHttpUrl, serverHttpsUrl } = window

    if ([serverHttpUrl, serverHttpsUrl].includes(request.url.href)) {
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }
  },
})

window.interceptor.apply()
