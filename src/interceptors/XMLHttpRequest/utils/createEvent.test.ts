import { createEvent } from './createEvent'
import { EventPolyfill } from '../polyfills/EventPolyfill'

interface XMLHttpRequestFlags {
  method: string
  uri: string
}

const request = new XMLHttpRequest()
request.open('POST', '/user')

test('returns an EventPolyfill instance with the given target set', () => {
  const event = createEvent(request, 'my-event')
  const target = event.target as XMLHttpRequest

  const [, flagSymbol] = Object.getOwnPropertySymbols(request)
  // @ts-ignore
  const flags = target[flagSymbol] as XMLHttpRequestFlags

  expect(event).toBeInstanceOf(EventPolyfill)
  expect(target).toBeInstanceOf(XMLHttpRequest)
  expect(flags.method).toBe('POST')
  expect(flags.uri).toBe(new URL('/user', location.href).toString())
})

test('returns the ProgressEvent instance', () => {
  const event = createEvent(request, 'load', {
    loaded: 100,
    total: 500,
  })

  expect(event).toBeInstanceOf(ProgressEvent)
  expect(event.loaded).toBe(100)
  expect(event.total).toBe(500)
})
