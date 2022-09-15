import { Headers } from 'headers-polyfill'
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
  const derivedRequest = new IsomorphicRequest(request)

  expect(request.id).toBe(derivedRequest.id)
  expect(request.url.href).toBe(derivedRequest.url.href)
  expect(request['_body']).toEqual(derivedRequest['_body'])
  expect(request.headers).toEqual(derivedRequest.headers)
  expect(request.method).toBe(derivedRequest.method)
  expect(request.credentials).toBe(derivedRequest.credentials)
  expect(request.bodyUsed).toBe(false)
})

it('clones current isomorphic request instance', () => {
  const request = new IsomorphicRequest(url, {
    body,
    headers: { foo: 'bar' },
  })
  const clonedRequest = request.clone()

  expect(clonedRequest.id).toBe(request.id)
  expect(clonedRequest.method).toBe(request.method)
  expect(clonedRequest.url.href).toBe(request.url.href)
  expect(clonedRequest.headers).toEqual(request.headers)
  expect(clonedRequest.credentials).toBe(request.credentials)
  expect(clonedRequest['_body']).toEqual(request['_body'])
  expect(clonedRequest.bodyUsed).toBe(false)
})
