import { RequestError } from './RequestError'

it('extends the global Error class', () => {
  expect(new RequestError()).toBeInstanceOf(Error)
})

it('includes an error message', () => {
  expect(new RequestError('Error message')).toHaveProperty(
    'message',
    'Error message'
  )
})
