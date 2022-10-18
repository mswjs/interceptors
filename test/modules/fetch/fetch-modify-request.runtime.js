import { FetchInterceptor } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', async (request) => {
  request.headers.set('X-Appended-Header', 'modified')
})

interceptor.apply()
