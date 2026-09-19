import { iterateWebSocketCodecResult } from './web-socket-codec'

it('yields a single value as-is', () => {
  expect(Array.from(iterateWebSocketCodecResult('hello'))).toEqual(['hello'])
})

it('yields nothing for an undefined result', () => {
  expect(Array.from(iterateWebSocketCodecResult(undefined))).toEqual([])
})

it('treats iterables that are not iterators as a single value', () => {
  const buffer = new Uint8Array([1, 2, 3])

  expect(Array.from(iterateWebSocketCodecResult(['event', 1]))).toEqual([
    ['event', 1],
  ])
  expect(Array.from(iterateWebSocketCodecResult(buffer))).toEqual([buffer])
})

it('yields every value of an iterator', () => {
  const result = iterateWebSocketCodecResult(
    (function* () {
      yield 'first'
      yield 'second'
    })()
  )

  expect(Array.from(result)).toEqual(['first', 'second'])
})

it('yields the return value of a generator as its last value', () => {
  const result = iterateWebSocketCodecResult(
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
      iterateWebSocketCodecResult(
        (function* () {
          return
        })()
      )
    )
  ).toEqual([])
})
