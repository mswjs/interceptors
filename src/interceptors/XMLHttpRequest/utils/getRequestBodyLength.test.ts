/**
 * @jest-environment jsdom
 */
import { getRequestBodyLength } from './getRequestBodyLength'

test('returns the length of the given string', () => {
  expect(getRequestBodyLength('hello world')).toEqual(11)
})

test('returns the length of the given buffer', () => {
  expect(getRequestBodyLength(Buffer.from('hello world'))).toEqual(11)
})

test('returns the size of the given Blob', () => {
  expect(getRequestBodyLength(new Blob(['hello', ' ', 'world']))).toEqual(11)
})

test('returns the length of the given URLSearchParams', () => {
  expect(getRequestBodyLength(new URLSearchParams({ a: '1', b: '2' }))).toEqual(
    7
  )
})

test('returns the byte length of the ArrayBuffer', () => {
  expect(getRequestBodyLength(new ArrayBuffer(4))).toEqual(4)
})

test('returns the length of the given FormData', () => {
  const createFormData = (callback: (data: FormData) => void): FormData => {
    const data = new FormData()
    callback(data)
    return data
  }

  // Plain text.
  expect(
    getRequestBodyLength(
      createFormData((data) => {
        data.set('file.txt', 'hello world')
      })
    )
  ).toEqual(11)

  // Blob.
  expect(
    getRequestBodyLength(
      createFormData((data) => {
        data.append('file.txt', new Blob(['hello']))
      })
    )
  ).toEqual(5)

  // File.
  expect(
    getRequestBodyLength(
      createFormData((data) => {
        data.append('file.txt', new File([new Blob(['hello'])], 'file.txt'))
      })
    )
  ).toEqual(5)
})

test('returns "textContent" length of the given Document', () => {
  const text = document.createElement('p')
  text.textContent = 'hello world'
  document.body.appendChild(text)
  expect(getRequestBodyLength(document)).toEqual(11)
})
