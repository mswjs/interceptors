import { Headers } from 'headers-polyfill/lib'
import { IsomorphicRequest } from './IsomorphicRequest'
import { encodeBuffer } from './utils/bufferCodec'

describe('Request', () => {
  const url = new URL('http://dummy')
  const body = encodeBuffer(JSON.stringify({ hello: 'world' }))

  it('returns JSON', async () => {
    const request = new IsomorphicRequest(url, { body })
    expect(await request.json()).toEqual({ hello: 'world' })
  })

  it('returns text', async () => {
    const request = new IsomorphicRequest(url, { body })
    expect(await request.text()).toEqual(JSON.stringify({ hello: 'world' }))
  })

  it('returns array buffer', async () => {
    const request = new IsomorphicRequest(url, { body })
    expect(await request.arrayBuffer()).toEqual(
      encodeBuffer(`{"hello":"world"}`)
    )
  })

  it('return default method', () => {
    const request = new IsomorphicRequest(url, { body })
    expect(request.method).toEqual('GET')
  })

  it('return given method', () => {
    const request = new IsomorphicRequest(url, { body, method: 'POST' })
    expect(request.method).toEqual('POST')
  })

  it('return given credentials', () => {
    const request = new IsomorphicRequest(url, { body, credentials: 'include' })
    expect(request.credentials).toEqual('include')
  })

  it('return default credentials', () => {
    const request = new IsomorphicRequest(url, { body })
    expect(request.credentials).toEqual('same-origin')
  })

  it('return empty headers if not provided', () => {
    const request = new IsomorphicRequest(url, { body })
    expect(request.headers).toEqual(new Headers())
  })

  it('return empty headers if not provided', () => {
    const request = new IsomorphicRequest(url, {
      body,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(request.headers).toEqual(
      new Headers({ 'Content-Type': 'application/json' })
    )
  })
})
