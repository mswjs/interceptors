import { createInterceptor } from 'node-request-interceptor'
import { interceptFetch } from 'node-request-interceptor/lib/interceptors/fetch'

const pool = []
const interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver(request) {
    pool.push({
      ...request,
      url: request.url.toString(),
    })
  },
})

interceptor.apply()

window.pool = pool
