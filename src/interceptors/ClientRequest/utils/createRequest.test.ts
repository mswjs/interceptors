import { it, expect } from 'vitest'
import { HttpRequestEventMap } from '../../..'
import { AsyncEventEmitter } from '../../../utils/AsyncEventEmitter'
import { NodeClientRequest } from '../NodeClientRequest'
import { createRequest } from './createRequest'
import { debug } from '../../../utils/debug'

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

it('creates a fetch Request with an empty string body', async () => {
  const clientRequest = new NodeClientRequest(
    [
      new URL('https://api.github.com'),
      {
        method: 'HEAD',
      },
      () => {},
    ],
    {
      emitter,
      log,
    }
  )
  clientRequest.write('')

  const request = createRequest(clientRequest)

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe('https://api.github.com/')
  expect(request.body).toBe(null)
})
