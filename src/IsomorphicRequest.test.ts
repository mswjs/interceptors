import { Headers } from 'headers-polyfill/lib'
import { IsomorphicRequest } from './IsomorphicRequest'
import { encodeBuffer } from './utils/bufferUtils'

const url = new URL('http://dummy')
const body = encodeBuffer(JSON.stringify({ hello: 'world' }))

it('reads request body as json', async () => {
  const request = new IsomorphicRequest(url, { body })

  expect(request.bodyUsed).toBe(false)
  expect(await request.json()).toEqual({ hello: 'world' })
  expect(request.bodyUsed).toBe(true)
  expect(() => request.json()).rejects.toThrow(
    'Failed to execute "json" on "IsomorphicRequest": body buffer already read'
  )
})

it('reads request body as text', async () => {
  const request = new IsomorphicRequest(url, { body })

  expect(request.bodyUsed).toBe(false)
  expect(await request.text()).toEqual(JSON.stringify({ hello: 'world' }))
  expect(request.bodyUsed).toBe(true)
  expect(() => request.text()).rejects.toThrow(
    'Failed to execute "text" on "IsomorphicRequest": body buffer already read'
  )
})

it('reads request body as array buffer', async () => {
  const request = new IsomorphicRequest(url, { body })

  expect(request.bodyUsed).toBe(false)
  expect(await request.arrayBuffer()).toEqual(encodeBuffer(`{"hello":"world"}`))
  expect(request.bodyUsed).toBe(true)
  expect(() => request.arrayBuffer()).rejects.toThrow(
    'Failed to execute "arrayBuffer" on "IsomorphicRequest": body buffer already read'
  )
})

it('returns default method', () => {
  const request = new IsomorphicRequest(url, { body })
  expect(request.method).toEqual('GET')
})

it('returns given method', () => {
  const request = new IsomorphicRequest(url, { body, method: 'POST' })
  expect(request.method).toEqual('POST')
})

it('returns given credentials', () => {
  const request = new IsomorphicRequest(url, { body, credentials: 'include' })
  expect(request.credentials).toEqual('include')
})

it('returns default credentials', () => {
  const request = new IsomorphicRequest(url, { body })
  expect(request.credentials).toEqual('same-origin')
})

it('returns empty headers if not provided', () => {
  const request = new IsomorphicRequest(url, { body })
  expect(request.headers).toEqual(new Headers())
})

it('returns given headers', () => {
  const request = new IsomorphicRequest(url, {
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  expect(request.headers).toEqual(
    new Headers({ 'Content-Type': 'application/json' })
  )
})

it('returns a copy of isomorphic request instance', () => {
  const request = new IsomorphicRequest(url, {
    body,
    headers: { foo: 'bar' },
  })
  const requestClone = new IsomorphicRequest(request)

  expect(request.id).toBe(requestClone.id)
  expect(request.url.href).toBe(requestClone.url.href)
  expect(request['body']).toEqual(requestClone['body'])
  expect(request.headers).toEqual(requestClone.headers)
  expect(request.method).toBe(requestClone.method)
  expect(request.credentials).toBe(requestClone.credentials)
  expect(request.bodyUsed).toBe(false)
})
