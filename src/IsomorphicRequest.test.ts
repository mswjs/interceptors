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
})

it('reads request body as text', async () => {
  const request = new IsomorphicRequest(url, { body })

  expect(request.bodyUsed).toBe(false)
  expect(await request.text()).toEqual(JSON.stringify({ hello: 'world' }))
  expect(request.bodyUsed).toBe(true)
})

it('reads request body as array buffer', async () => {
  const request = new IsomorphicRequest(url, { body })

  expect(request.bodyUsed).toBe(false)
  expect(await request.arrayBuffer()).toEqual(encodeBuffer(`{"hello":"world"}`))
  expect(request.bodyUsed).toBe(true)
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
  const request2 = new IsomorphicRequest(request)
  expect(request.id).toEqual(request2.id)
  expect(request.url).toEqual(request2.url)
  expect(request['body']).toEqual(request2['body'])
  expect(request.headers).toEqual(request2.headers)
  expect(request.method).toEqual(request2.method)
  expect(request.credentials).toEqual(request2.credentials)
})
