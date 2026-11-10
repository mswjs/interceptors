// @vitest-environment happy-dom
import { createEvent } from './create-event'

const request = new XMLHttpRequest()
request.open('POST', '/user')

it('returns an Event instance for a non-progress event', () => {
  const event = createEvent(request, 'my-event')

  expect(event).toBeInstanceOf(Event)
  expect(event.type).toBe('my-event')
})

it('returns the ProgressEvent instance', () => {
  const event = createEvent(request, 'load', {
    loaded: 100,
    total: 500,
  })

  expect(event).toBeInstanceOf(ProgressEvent)
  expect(event).toHaveProperty('loaded', 100)
  expect(event).toHaveProperty('total', 500)
})
