import { it, expectTypeOf } from 'vitest'
import { Interceptor } from '@mswjs/interceptors'
import {
  WebSocketInterceptor,
  WebSocketEventMap,
} from '@mswjs/interceptors/WebSocket'

it('standard interceptors extend the base Interceptor type', () => {
  function usage(interceptor: Interceptor<any>) {}

  usage(new WebSocketInterceptor())

  expectTypeOf(usage).parameter(0).toExtend<Interceptor<any>>()

  expectTypeOf(WebSocketInterceptor).instance.toExtend<Interceptor<any>>()
})

it('custom interceptors extend the base Interceptor type', () => {})
