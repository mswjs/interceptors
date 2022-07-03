import { FetchInterceptor } from '@mswjs/interceptors/lib/interceptors/fetch'
import { decodeBuf } from '@mswjs/interceptors/lib/utils/bufferCodec'

const interceptor = new FetchInterceptor()
interceptor.on('request', (request) => {
  window.dispatchEvent(
    new CustomEvent('resolver', {
      detail: {
        id: request.id,
        method: request.method,
        url: request.url.href,
        headers: request.headers.all(),
        credentials: request.credentials,
        body: decodeBuf(request.body),
      },
    })
  )
})

interceptor.apply()
