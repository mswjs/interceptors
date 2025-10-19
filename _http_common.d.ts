declare var HTTPParser: {
  new (): HTTPParser<number>
  REQUEST: 0
  RESPONSE: 1

  /**
   * @see https://github.com/nodejs/node/blob/229cc3be28eab3153c16bc55bc67d1e81c4a7067/src/node_http_parser.cc#L76
   */
  readonly kOnMessageBegin: unique symbol
  readonly kOnHeaders: unique symbol
  readonly kOnHeadersComplete: unique symbol
  readonly kOnBody: unique symbol
  readonly kOnMessageComplete: unique symbol
  readonly kOnExecute: unique symbol
  readonly kOnTimeout: unique symbol
}

export interface HTTPParser<ParserType extends number> {
  new (): HTTPParser<ParserType>

  [HTTPParser.kOnMessageBegin]: () => void
  [HTTPParser.kOnHeaders]: HeadersCallback
  [HTTPParser.kOnHeadersComplete]: ParserType extends 0
    ? RequestHeadersCompleteCallback
    : ResponseHeadersCompleteCallback
  [HTTPParser.kOnBody]: (chunk: Buffer) => void
  [HTTPParser.kOnMessageComplete]: () => void
  [HTTPParser.kOnExecute]: () => void
  [HTTPParser.kOnTimeout]: () => void

  initialize(type: ParserType, asyncResource: object): void
  execute(buffer: Buffer): void
  finish(): void
  free(): void
}

export type HeadersCallback = (
  rawHeaders: Array<string>,
  url: string
) => void

export type RequestHeadersCompleteCallback = (
  versionMajor: number,
  versionMinor: number,
  rawHeaders: Array<string>,
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
