import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', async () => {
  throw new Error('Network error')
})

interceptor.apply()
