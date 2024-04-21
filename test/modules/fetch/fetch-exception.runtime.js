import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()
interceptor.apply()

window.interceptor = interceptor
