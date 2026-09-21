import { iterateWebSocketExtensionResult } from './web-socket-extension'

it('yields a single value as-is', () => {
  expect(Array.from(iterateWebSocketExtensionResult('hello'))).toEqual([
    'hello',
  ])
})

it('yields nothing for an undefined result', () => {
  expect(Array.from(iterateWebSocketExtensionResult(undefined))).toEqual([])
})

it('treats iterables that are not iterators as a single value', () => {
  const buffer = new Uint8Array([1, 2, 3])

  expect(Array.from(iterateWebSocketExtensionResult(['event', 1]))).toEqual([
    ['event', 1],
  ])
  expect(Array.from(iterateWebSocketExtensionResult(buffer))).toEqual([buffer])
})

it('yields every value of an iterator', () => {
  const result = iterateWebSocketExtensionResult(
    (function* () {
      yield 'first'
      yield 'second'
    })()
  )

  expect(Array.from(result)).toEqual(['first', 'second'])
})

it('yields the return value of a generator as its last value', () => {
  const result = iterateWebSocketExtensionResult(
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
      iterateWebSocketExtensionResult(
        (function* () {
          return
        })()
      )
    )
  ).toEqual([])
})

it('closes the underlying generator when the consumer stops early', () => {
  const onCleanup = vi.fn()
  const result = iterateWebSocketExtensionResult(
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
  const result = iterateWebSocketExtensionResult(
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

  expect(Array.from(iterateWebSocketExtensionResult(generator))).toEqual([
    'first',
  ])
  expect(onReturn).not.toHaveBeenCalled()
})
