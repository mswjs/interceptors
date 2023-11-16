import { it, expect } from 'vitest'
import { Logger } from '@open-draft/logger'
import { HttpRequestEventMap } from '../../..'
import { NodeClientRequest } from '../NodeClientRequest'
import { createRequest } from './createRequest'
import { Emitter } from 'strict-event-emitter'

const emitter = new Emitter<HttpRequestEventMap>()
const logger = new Logger('test')

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
      logger,
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
      logger,
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
      logger,
    }
  )
  clientRequest.write('')

  const request = createRequest(clientRequest)

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe('https://api.github.com/')
  expect(request.body).toBe(null)
})

it('creates a fetch Request with an empty password', async () => {
  const clientRequest = new NodeClientRequest(
    [
      new URL('https://api.github.com'),
      { auth: 'username:' },
      () => {},
    ],
    {
      emitter,
      logger,
    }
  )
  clientRequest.write('')

  const request = createRequest(clientRequest)

  expect(request.headers.get('Authorization')).toBe(`Basic ${btoa('username:')}`)
  expect(request.url).toBe('https://api.github.com/')
})

it('creates a fetch Request with an empty username', async () => {
  const clientRequest = new NodeClientRequest(
    [
      new URL('https://api.github.com'),
      { auth: ':password' },
      () => {},
    ],
    {
      emitter,
      logger,
    }
  )
  clientRequest.write('')

  const request = createRequest(clientRequest)

  expect(request.headers.get('Authorization')).toBe(`Basic ${btoa(':password')}`)
  expect(request.url).toBe('https://api.github.com/')
})

it('creates a fetch Request with falsy headers', async () => {
  const clientRequest = new NodeClientRequest(
    [
      new URL('https://api.github.com'),
      { headers: { 'foo': 0, 'empty': '' }}
    ],
    {
      emitter,
      logger,
    }
  )
  clientRequest.write('')

  const request = createRequest(clientRequest)

  expect(request.headers.get('foo')).toBe('0')
  expect(request.headers.get('empty')).toBe('')
})