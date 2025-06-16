declare var HTTPParser: {
  new (): HTTPParser<number>
  REQUEST: 0
  RESPONSE: 1
  readonly kOnHeaders: unique symbol
  readonly kOnHeadersComplete: unique symbol
  readonly kOnBody: unique symbol
  readonly kOnMessageComplete: unique symbol
}

export interface HTTPParser<ParserType extends number> {
  new (): HTTPParser<ParserType>

  [HTTPParser.kOnHeaders]: (headers: Array<string>, url: string) => void
  [HTTPParser.kOnHeadersComplete]: ParserType extends 0
    ? RequestHeadersCompleteCallback
    : ResponseHeadersCompleteCallback
  [HTTPParser.kOnBody]: (chunk: Buffer) => void
  [HTTPParser.kOnMessageComplete]: () => void
  maxHeadersPair: number

  initialize(type: ParserType, asyncResource: object, maxHeaderSize?: number, lenient?: number, headersTimeout?: number): void
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
