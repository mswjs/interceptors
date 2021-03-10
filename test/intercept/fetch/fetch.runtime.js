import { createInterceptor } from 'node-request-interceptor'
import { interceptFetch } from 'node-request-interceptor/lib/interceptors/fetch'

const pool = []
const interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver(request, ref) {
    pool.push({
      request: {
        ...request,
        url: request.url.toString(),
      },
      ref: {
        isRequestInstance: ref instanceof Request,
        url: ref.url,
        method: ref.method,
      },
    })
  },
})

interceptor.apply()

window.pool = pool
