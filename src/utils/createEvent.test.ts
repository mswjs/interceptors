/**
 * @jest-environment jsdom
 */
import { createEvent } from './createEvent'

it('creates a custom event type', () => {
  const event = createEvent(Event, 'hello')

  expect(event).toBeInstanceOf(Event)
  expect(event.type).toBe('hello')
})

it('creates a standard event with custom target', () => {
  const target = new EventTarget()
  const event = createEvent(MessageEvent, 'message', {
    target,
    data: 'hello',
  })

  expect(event).toBeInstanceOf(MessageEvent)
  expect(event.type).toBe('message')
  expect(event.target).toBeInstanceOf(EventTarget)
  expect(event.target).toEqual(target)
})
