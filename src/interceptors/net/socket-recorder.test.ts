// @vitest-environment node
import net from 'node:net'
import { vi, describe, it, expect } from 'vitest'
import {
  createSocketRecorder,
  inspectSocketRecorder,
  SocketRecorderEntry,
} from './socket-recorder'

describe('set', () => {
  it('ignores unknown property setters', () => {
    const { socket } = createSocketRecorder(new net.Socket())
    Object.defineProperty(socket, 'foo', { value: 'abc' })

    expect(
      inspectSocketRecorder(socket),
      'Must not record unknown property setters'
    ).not.toEqual(
      expect.arrayContaining<SocketRecorderEntry>([
        {
          type: 'set',
          metadata: expect.objectContaining({ property: 'foo' }),
          replay: expect.any(Function),
        },
      ])
    )
  })

  it('ignores symbol setters', () => {
    const { socket } = createSocketRecorder(new net.Socket())
    // Calling `.setTimeout()` updates the value of the internal `[kTimeout]` symbol.
    socket.setTimeout(1000)

    expect(
      inspectSocketRecorder(socket),
      'Must not record symbol setters'
    ).not.toEqual(
      expect.arrayContaining<SocketRecorderEntry>([
        {
          type: 'set',
          metadata: expect.objectContaining({
            property: expect.any(Symbol),
          }),
          replay: expect.any(Function),
        },
      ])
    )
  })

  it('ignores internal setters', () => {
    const { socket } = createSocketRecorder(new net.Socket())
    socket.on('error', () => {})

    expect(
      inspectSocketRecorder(socket),
      'Must not record implied internal setter'
    ).toEqual<SocketRecorderEntry[]>([
      {
        type: 'apply',
        metadata: { property: 'on' },
        replay: expect.any(Function),
      },
    ])
  })
})

describe('apply', () => {
  it('records a single method call', () => {
    const { socket } = createSocketRecorder(new net.Socket())
    socket.setTimeout(1000)

    expect(inspectSocketRecorder(socket)).toEqual<SocketRecorderEntry[]>([
      {
        type: 'apply',
        metadata: { property: 'setTimeout' },
        replay: expect.any(Function),
      },
    ])
  })

  it('records multiple method calls', () => {
    const { socket } = createSocketRecorder(new net.Socket())
    socket.setTimeout(1000)
    socket.setKeepAlive(true)
    socket.setEncoding('base64')

    expect(inspectSocketRecorder(socket)).toEqual<SocketRecorderEntry[]>([
      {
        type: 'apply',
        metadata: { property: 'setTimeout' },
        replay: expect.any(Function),
      },
      {
        type: 'apply',
        metadata: { property: 'setKeepAlive' },
        replay: expect.any(Function),
      },
      {
        type: 'apply',
        metadata: { property: 'setEncoding' },
        replay: expect.any(Function),
      },
    ])
  })

  it('ignores internal method calls', () => {
    const { socket } = createSocketRecorder(new net.Socket())
    // Calling `.write()` triggers the internal `._write()`.
    socket.write('hello')
    socket.on('error', () => void 0)

    expect(
      inspectSocketRecorder(socket),
      'Must not record internal method calls'
    ).not.toEqual(
      expect.arrayContaining<SocketRecorderEntry>([
        {
          type: 'apply',
          metadata: { property: '_write' },
          replay: expect.any(Function),
        },
      ])
    )
  })
})

describe('replay', () => {
  it('replays method recordings', () => {
    const { socket, replay } = createSocketRecorder(new net.Socket())
    socket.setTimeout(123)

    const target = new net.Socket()
    replay(target)

    expect(target.timeout, 'Must replay the recorded method call').toBe(123)
    expect(
      inspectSocketRecorder(socket),
      'Must exhaust the records array'
    ).toEqual([])
  })

  it('replays attached listeners', () => {
    const { socket, replay } = createSocketRecorder(new net.Socket())
    const connectListener = vi.fn()
    socket.on('connect', connectListener)

    const target = new net.Socket()
    replay(target)
    target.emit('connect')

    expect(
      target.listeners('connect'),
      'Must replay attached listener'
    ).toEqual([connectListener])
    expect(connectListener).toHaveBeenCalledOnce()
  })
})
