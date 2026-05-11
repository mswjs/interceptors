import { afterEach, expect, it } from 'vitest'
import { deleteGlobalSymbol } from '../../Interceptor'
import { XMLHttpRequestInterceptor } from './index'

afterEach(() => {
  deleteGlobalSymbol(XMLHttpRequestInterceptor.interceptorSymbol)
})

it('uses a stable global symbol to detect existing XHR interceptors', () => {
  expect(XMLHttpRequestInterceptor.interceptorSymbol).toBe(
    Symbol.for('mswjs.interceptors.XMLHttpRequest')
  )
})
