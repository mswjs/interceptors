import { iterateWebSocketProtocolResult } from './web-socket-protocol'

it('yields a single value as-is', () => {
  expect(Array.from(iterateWebSocketProtocolResult('hello'))).toEqual(['hello'])
})

it('yields nothing for an undefined result', () => {
  expect(Array.from(iterateWebSocketProtocolResult(undefined))).toEqual([])
})

it('treats iterables that are not iterators as a single value', () => {
  const buffer = new Uint8Array([1, 2, 3])

  expect(Array.from(iterateWebSocketProtocolResult(['event', 1]))).toEqual([
    ['event', 1],
  ])
  expect(Array.from(iterateWebSocketProtocolResult(buffer))).toEqual([buffer])
})

it('yields every value of an iterator', () => {
  const result = iterateWebSocketProtocolResult(
    (function* () {
      yield 'first'
      yield 'second'
    })()
  )

  expect(Array.from(result)).toEqual(['first', 'second'])
})

it('yields the return value of a generator as its last value', () => {
  const result = iterateWebSocketProtocolResult(
    (function* () {
      yield 'first'
      return 'second'
    })()
  )

  expect(Array.from(result)).toEqual(['first', 'second'])
})

it('yields nothing for an empty generator', () => {
  expect(
    Array.from(
      iterateWebSocketProtocolResult(
        (function* () {
          return
        })()
      )
    )
  ).toEqual([])
})

it('closes the underlying generator when the consumer stops early', () => {
  const onCleanup = vi.fn()
  const result = iterateWebSocketProtocolResult(
    (function* () {
      try {
        yield 'first'
        yield 'second'
      } finally {
        onCleanup()
      }
    })()
  )

  for (const value of result) {
    expect(value).toBe('first')
    break
  }

  expect(onCleanup).toHaveBeenCalledOnce()
})

it('closes the underlying generator when the consumer throws', () => {
  const onCleanup = vi.fn()
  const result = iterateWebSocketProtocolResult(
    (function* () {
      try {
        yield 'first'
        yield 'second'
      } finally {
        onCleanup()
      }
    })()
  )

  expect(() => {
    for (const value of result) {
      throw new Error(`Consumer error on "${value}"`)
    }
  }).toThrow('Consumer error on "first"')
  expect(onCleanup).toHaveBeenCalledOnce()
})

it('does not close the underlying generator once it completes', () => {
  const onReturn = vi.fn()
  const generator = (function* () {
    yield 'first'
  })()
  generator.return = onReturn

  expect(Array.from(iterateWebSocketProtocolResult(generator))).toEqual([
    'first',
  ])
  expect(onReturn).not.toHaveBeenCalled()
})
