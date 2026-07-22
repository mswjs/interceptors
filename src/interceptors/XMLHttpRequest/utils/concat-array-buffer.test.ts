import { concatArrayBuffer } from './concat-array-buffer'

const encoder = new TextEncoder()

it('concatenates two Uint8Array buffers', () => {
  const result = concatArrayBuffer(
    encoder.encode('hello'),
    encoder.encode('world')
  )
  expect(result).toEqual(encoder.encode('helloworld'))
})
