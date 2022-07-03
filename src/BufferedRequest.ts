import { Headers } from 'headers-polyfill/lib'
import { decodeBuf } from './utils/bufferCodec'
import { uuidv4 } from './utils/uuid'

export class BufferedRequest {
  public id = uuidv4()
  public readonly headers: Headers

  constructor(
    public readonly url: URL,
    private readonly body: ArrayBuffer,
    private readonly init: RequestInit
  ) {
    this.headers = new Headers(this.init.headers)
  }

  public get method(): string {
    return this.init.method || 'GET'
  }

  public text(): string {
    return decodeBuf(this.body)
  }

  public json<T = any>(): T {
    const text = this.text()
    return JSON.parse(text)
  }

  public arrayBuffer(): ArrayBuffer {
    return this.body
  }

  public get credentials(): RequestCredentials {
    return this.init.credentials || 'same-origin'
  }
}
