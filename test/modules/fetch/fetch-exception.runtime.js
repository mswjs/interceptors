import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', async (request) => {
  throw new Error('Network error')
})

interceptor.apply()
