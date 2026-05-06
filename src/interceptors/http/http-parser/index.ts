import fs from 'node:fs'
import * as constants from './llhttp/constants.js'

export { constants }

export interface RequestHeadersComplete {
  versionMajor: number
  versionMinor: number
  rawHeaders: Array<string>
  method: string
  url: string
  upgrade: boolean
  shouldKeepAlive: boolean
}

export interface ResponseHeadersComplete {
  versionMajor: number
  versionMinor: number
  rawHeaders: Array<string>
  statusCode: number
  statusMessage: string
  upgrade: boolean
  shouldKeepAlive: boolean
}

const KIND_REQUEST = constants.TYPE.REQUEST
const KIND_RESPONSE = constants.TYPE.RESPONSE

type ParserKind = typeof KIND_REQUEST | typeof KIND_RESPONSE

export interface ParserCallbacks<K extends ParserKind> {
  onMessageBegin?: () => number | void
  onHeadersComplete?: (
    info: K extends typeof KIND_REQUEST
      ? RequestHeadersComplete
      : ResponseHeadersComplete
  ) => number | void
  onBody?: (body: Buffer) => number | void
  onMessageComplete?: () => number | void
}

export type RequestParserCallbacks = ParserCallbacks<typeof KIND_REQUEST>
export type ResponseParserCallbacks = ParserCallbacks<typeof KIND_RESPONSE>

const kPointer = Symbol('kPtr')
const kUrl = Symbol('kUrl')
const kStatusMessage = Symbol('kStatusMessage')
const kHeadersFields = Symbol('kHeadersFields')
const kHeadersValues = Symbol('kHeadersValues')
const kCallbacks = Symbol('kCallbacks')
const kType = Symbol('kType')

const parsersMap = new Map<number, HttpParser<any>>()

const methodNames = Object.fromEntries(
  Object.entries(constants.METHODS).map(([name, num]) => [num, name])
) as Record<number, string>

function readStringFrom(pointer: number, length: number): string {
  return Buffer.from(llhttp_memory.buffer, pointer, length).toString()
}

const llhttpModule = new WebAssembly.Module(
  fs.readFileSync(__dirname + '/llhttp/llhttp.wasm')
)

const llhttpInstance = new WebAssembly.Instance(llhttpModule, {
  env: {
    wasm_on_message_begin(parserPtr: number) {
      const parser = parsersMap.get(parserPtr)!
      parser[kUrl] = ''
      parser[kStatusMessage] = ''
      parser[kHeadersFields] = []
      parser[kHeadersValues] = []
      return parser[kCallbacks].onMessageBegin?.() ?? 0
    },
    // Request only
    wasm_on_url(parserPointer: number, at: number, length: number) {
      parsersMap.get(parserPointer)![kUrl] = readStringFrom(at, length)
      return 0
    },
    // Response only
    wasm_on_status(parserPointer: number, at: number, length: number) {
      parsersMap.get(parserPointer)![kStatusMessage] = readStringFrom(
        at,
        length
      )
      return 0
    },
    wasm_on_header_field(parserPointer: number, at: number, length: number) {
      parsersMap
        .get(parserPointer)!
        [kHeadersFields].push(readStringFrom(at, length))
      return 0
    },
    wasm_on_header_value(parserPointer: number, at: number, length: number) {
      parsersMap
        .get(parserPointer)!
        [kHeadersValues].push(readStringFrom(at, length))
      return 0
    },
    wasm_on_headers_complete(parserPtr: number) {
      const parser = parsersMap.get(parserPtr)!
      const versionMajor = llhttp_get_version_major(parserPtr)
      const versionMinor = llhttp_get_version_minor(parserPtr)
      const rawHeaders: Array<string> = []
      const upgrade = Boolean(llhttp_get_upgrade(parserPtr))
      const shouldKeepAlive = Boolean(llhttp_should_keep_alive(parserPtr))

      for (let c = 0; c < parser[kHeadersFields].length; c++) {
        rawHeaders.push(parser[kHeadersFields][c]!, parser[kHeadersValues][c]!)
      }

      if (parser[kType] === KIND_REQUEST) {
        const method = methodNames[llhttp_get_method(parserPtr)]
        const url = parser[kUrl]
        const callback = parser[kCallbacks] as ParserCallbacks<
          typeof KIND_REQUEST
        >

        return (
          callback.onHeadersComplete?.({
            versionMajor,
            versionMinor,
            rawHeaders,
            method,
            url,
            upgrade,
            shouldKeepAlive,
          }) ?? 0
        )
      } else {
        const statusCode = llhttp_get_status_code(parserPtr) as number
        const statusMessage = parser[kStatusMessage]
        const callback = parser[kCallbacks] as ParserCallbacks<
          typeof KIND_RESPONSE
        >

        return (
          callback.onHeadersComplete?.({
            versionMajor,
            versionMinor,
            rawHeaders,
            statusCode,
            statusMessage,
            upgrade,
            shouldKeepAlive,
          }) ?? 0
        )
      }
    },
    wasm_on_body(parserPtr: number, at: number, length: number) {
      const parser = parsersMap.get(parserPtr)!
      // Create a copy of the body chunk, as the underlying memory buffer is reused by llhttp and can be overwritten on the next callback call.
      // Maybe not the most efficient way, but it is simple and safe.
      const body = Buffer.from(new Uint8Array(llhttp_memory.buffer, at, length))
      return parser[kCallbacks].onBody?.(body) ?? 0
    },
    wasm_on_message_complete(parserPtr: number) {
      return parsersMap.get(parserPtr)![kCallbacks].onMessageComplete?.() ?? 0
    },
  },
})

const llhttp_memory = llhttpInstance.exports.memory as WebAssembly.Memory
const llhttp_alloc = llhttpInstance.exports.llhttp_alloc as CallableFunction
const llhttp_malloc = llhttpInstance.exports.malloc as CallableFunction
const llhttp_execute = llhttpInstance.exports.llhttp_execute as CallableFunction
const llhttp_get_type = llhttpInstance.exports
  .llhttp_get_type as CallableFunction
const llhttp_get_upgrade = llhttpInstance.exports
  .llhttp_get_upgrade as CallableFunction
const llhttp_should_keep_alive = llhttpInstance.exports
  .llhttp_should_keep_alive as CallableFunction
const llhttp_get_method = llhttpInstance.exports
  .llhttp_get_method as CallableFunction
const llhttp_get_status_code = llhttpInstance.exports
  .llhttp_get_status_code as CallableFunction
const llhttp_get_version_minor = llhttpInstance.exports
  .llhttp_get_http_minor as CallableFunction
const llhttp_get_version_major = llhttpInstance.exports
  .llhttp_get_http_major as CallableFunction
const llhttp_get_error_reason = llhttpInstance.exports
  .llhttp_get_error_reason as CallableFunction
const llhttp_get_error_pos = llhttpInstance.exports
  .llhttp_get_error_pos as CallableFunction
const llhttp_free = llhttpInstance.exports.free as CallableFunction

const initialize = llhttpInstance.exports._initialize as CallableFunction
initialize() // wasi reactor

export class HttpParser<K extends ParserKind> {
  [kPointer]: number;
  [kUrl]: string = '';
  [kStatusMessage]: string = '';
  [kHeadersFields]: Array<string> = [];
  [kHeadersValues]: Array<string> = [];
  [kCallbacks]: ParserCallbacks<K>;
  [kType]: ParserKind

  constructor(type: K, callbacks: ParserCallbacks<K>) {
    this[kType] = type
    this[kCallbacks] = callbacks
    this[kPointer] = llhttp_alloc(type)
    parsersMap.set(this[kPointer], this)
  }

  destroy() {
    // Guard against multiple calls to free/destroy.
    if (this[kPointer] === 0) {
      return
    }

    parsersMap.delete(this[kPointer])
    llhttp_free(this[kPointer])
    this[kPointer] = 0
  }

  execute(data: Buffer) {
    const pointer = llhttp_malloc(data.byteLength)
    const buffer = new Uint8Array(llhttp_memory.buffer)
    buffer.set(data, pointer)
    const ret = llhttp_execute(this[kPointer], pointer, data.length)

    if (ret === constants.ERROR.PAUSED_UPGRADE) {
      // Find how many bytes llhttp consumed
      const errorPos = llhttp_get_error_pos(this[kPointer])
      const consumed = errorPos - pointer
      llhttp_free(pointer)
      // Return the unconsumed trailing bytes (tunnel/protocol data)
      return data.subarray(consumed)
    }

    llhttp_free(pointer)
    this.checkErr(ret)

    return null // fully consumed
  }

  private checkErr(errorCode: number) {
    if (errorCode === constants.ERROR.OK) {
      return
    }

    const errorPointer = llhttp_get_error_reason(this[kPointer])
    const buffer = new Uint8Array(llhttp_memory.buffer)
    const length = buffer.indexOf(0, errorPointer) - errorPointer

    throw new Error(readStringFrom(errorPointer, length))
  }
}
