/**
 * @jest-environment node
 */
import { Socket } from 'net'
import * as http from 'http'
import { createResponse } from './createResponse'

it('creates a fetch api response from http incoming message', async () => {
  const message = new http.IncomingMessage(new Socket())
  message.statusCode = 201
  message.statusMessage = 'Created'
  message.headers['content-type'] = 'application/json'

  const response = createResponse(message)

  message.emit('data', Buffer.from('{"firstName":'))
  message.emit('data', Buffer.from('"John"}'))
  message.emit('end')

  expect(response.status).toBe(201)
  expect(response.statusText).toBe('Created')
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(await response.json()).toEqual({ firstName: 'John' })
})
