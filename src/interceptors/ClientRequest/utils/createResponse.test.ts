import { it, expect } from 'vitest'
import { Socket } from 'net'
import * as http from 'http'
import { createResponse } from './createResponse'
import { RESPONSE_STATUS_CODES_WITHOUT_BODY } from '../../../utils/responseUtils'

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

/**
 * @note Ignore 1xx response status code because those cannot
 * be used as the init to the "Response" constructor.
 */
const CONSTRUCTABLE_RESPONSE_STATUS_CODES = Array.from(
  RESPONSE_STATUS_CODES_WITHOUT_BODY
).filter((status) => status >= 200)

it.each(CONSTRUCTABLE_RESPONSE_STATUS_CODES)(
  'ignores message body for %i response status',
  (responseStatus) => {
    const message = new http.IncomingMessage(new Socket())
    message.statusCode = responseStatus

    const response = createResponse(message)

    // These chunks will be ignored: this response
    // cannot have body. We don't forward this error to
    // the consumer because it's us who converts the
    // internal stream to a Fetch API Response instance.
    // Consumers will rely on the Response API when constructing
    // mocked responses.
    message.emit('data', Buffer.from('hello'))
    message.emit('end')

    expect(response.status).toBe(responseStatus)
    expect(response.body).toBe(null)
  }
)
