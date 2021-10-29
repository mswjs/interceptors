import { Socket } from 'net'
import { IncomingMessage } from 'http'
import { cloneIncomingMessage } from './cloneIncomingMessage'

test('clones a given IncomingMessage', () => {
  const source = new IncomingMessage(new Socket())
  source.statusCode = 200
  source.statusMessage = 'OK'
  source.headers = { 'x-powered-by': 'msw' }
  const clone = cloneIncomingMessage(source)

  expect(clone.statusCode).toEqual(200)
  expect(clone.statusMessage).toEqual('OK')
  expect(clone.headers).toHaveProperty('x-powered-by', 'msw')

  expect(clone).toHaveProperty('_events')
})
