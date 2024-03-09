// @ts-expect-error Tapping into Node.js internals.
import httpCommon from 'node:_http_common'

const HTTPParser = httpCommon.HTTPParser as NodeHttpParser<number>

export interface NodeHttpParser<Type extends number> {
  REQUEST: 0
  RESPONSE: 1
  readonly kOnHeadersComplete: unique symbol
  readonly kOnBody: unique symbol
  readonly kOnMessageComplete: unique symbol

  new (): NodeHttpParser<Type>

  // Headers complete callback has different
  // signatures for REQUEST and RESPONSE parsers.
  [HTTPParser.kOnHeadersComplete]: Type extends 0
    ? RequestHeadersCompleteCallback
    : ResponseHeadersCompleteCallback
  [HTTPParser.kOnBody]: (chunk: Buffer) => void
  [HTTPParser.kOnMessageComplete]: () => void

  initialize(type: Type, asyncResource: object): void
  execute(buffer: Buffer): void
  finish(): void
  free(): void
}

export type RequestHeadersCompleteCallback = (
  versionMajor: number,
  versionMinor: number,
  headers: Array<string>,
  idk: number,
  path: string,
  idk2: unknown,
  idk3: unknown,
  idk4: unknown,
  shouldKeepAlive: boolean
) => void

export type ResponseHeadersCompleteCallback = (
  versionMajor: number,
  versionMinor: number,
  headers: Array<string>,
  method: string | undefined,
  url: string | undefined,
  status: number,
  statusText: string,
  upgrade: boolean,
  shouldKeepAlive: boolean
) => void

export { HTTPParser }
