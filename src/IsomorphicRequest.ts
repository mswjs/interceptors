import { Headers } from 'headers-polyfill/lib'
import { RequestInit } from './glossary'
import { decodeBuf } from './utils/bufferCodec'
import { uuidv4 } from './utils/uuid'

export class IsomorphicRequest {
  public id = uuidv4()
  public readonly headers: Headers

  constructor(url: URL)
  constructor(url: URL, init: RequestInit)
  constructor(
    public readonly url: URL,
    private readonly init: RequestInit = { body: new ArrayBuffer(0) }
  ) {
    this.headers = new Headers(this.init.headers)
  }

  public get method(): string {
    return this.init.method || 'GET'
  }

  public async text(): Promise<string> {
    const buf = await this.arrayBuffer()
    return decodeBuf(buf)
  }

  public async json<T = any>(): Promise<T> {
    const text = await this.text()
    return JSON.parse(text)
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    return this.init.body
  }

  public get credentials(): RequestCredentials {
    return this.init.credentials || 'same-origin'
  }
}
