import { debug } from 'debug'
import { HttpRequestEventMap } from '../../..'
import { AsyncEventEmitter } from '../../../utils/AsyncEventEmitter'
import { NodeClientRequest } from '../NodeClientRequest'
import { createRequest } from './createRequest'

const emitter = new AsyncEventEmitter<HttpRequestEventMap>()
const log = debug('test')

it('creates a fetch Request with a JSON body', async () => {
  const clientRequest = new NodeClientRequest(
    [
      new URL('https://api.github.com'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      () => {},
    ],
    {
      emitter,
      log,
    }
  )
  clientRequest.write(JSON.stringify({ firstName: 'John' }))

  const request = createRequest(clientRequest)

  expect(request.method).toBe('POST')
  expect(request.url).toBe('https://api.github.com/')
  expect(request.headers.get('Content-Type')).toBe('application/json')
  expect(await request.json()).toEqual({ firstName: 'John' })
})

it('creates a fetch Request with an empty body', async () => {
  const clientRequest = new NodeClientRequest(
    [
      new URL('https://api.github.com'),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      () => {},
    ],
    {
      emitter,
      log,
    }
  )

  const request = createRequest(clientRequest)

  expect(request.method).toBe('GET')
  expect(request.url).toBe('https://api.github.com/')
  expect(request.headers.get('Accept')).toBe('application/json')
  expect(request.body).toBe(null)
})
