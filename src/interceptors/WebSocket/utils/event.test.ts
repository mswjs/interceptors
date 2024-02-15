/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { CancelableMessageEvent, CloseEvent } from './events'

describe(CancelableMessageEvent, () => {
  it('initiates with the right defaults', () => {
    const event = new CancelableMessageEvent('message', {
      data: 'hello',
    })

    expect(event).toBeInstanceOf(MessageEvent)
    expect(event.type).toBe('message')
    expect(event.data).toBe('hello')
    expect(event.cancelable).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('initiates a canceaable event', () => {
    const event = new CancelableMessageEvent('message', {
      data: 'hello',
      cancelable: true,
    })

    expect(event).toBeInstanceOf(MessageEvent)
    expect(event.type).toBe('message')
    expect(event.data).toBe('hello')
    expect(event.cancelable).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it('cancels a cancelable event when calling "preventDefault()"', () => {
    const event = new CancelableMessageEvent('message', {
      data: 'hello',
      cancelable: true,
    })

    expect(event.defaultPrevented).toBe(false)
    event.preventDefault()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does nothing when calling "preventDefault()" on a non-cancelable event', () => {
    const event = new CancelableMessageEvent('message', {
      data: 'hello',
    })

    expect(event.defaultPrevented).toBe(false)
    event.preventDefault()
    expect(event.defaultPrevented).toBe(false)
  })
})

describe(CloseEvent, () => {
  it('initiates with the right defaults', () => {
    const event = new CloseEvent('close')

    expect(event).toBeInstanceOf(Event)
    expect(event.type).toBe('close')
    expect(event.code).toBe(0)
    expect(event.reason).toBe('')
    expect(event.wasClean).toBe(false)
  })

  it('initiates with custom values', () => {
    const event = new CloseEvent('close', {
      code: 1003,
      reason: 'close reason',
      wasClean: true,
    })

    expect(event).toBeInstanceOf(Event)
    expect(event.type).toBe('close')
    expect(event.code).toBe(1003)
    expect(event.reason).toBe('close reason')
    expect(event.wasClean).toBe(true)
  })
})
