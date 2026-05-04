import { readFileSync } from 'fs';
import * as constants from './llhttp/constants.js';

export { constants };
export interface RequestHeadersComplete {
  versionMajor: number;
  versionMinor: number;
  rawHeaders: string[];
  method: string;
  url: string;
  upgrade: boolean;
  shouldKeepAlive: boolean;
}

export interface ResponseHeadersComplete {
  versionMajor: number;
  versionMinor: number;
  rawHeaders: string[];
  statusCode: number;
  statusMessage: string;
  upgrade: boolean;
  shouldKeepAlive: boolean;
}

const KIND_REQUEST = constants.TYPE.REQUEST;
const KIND_RESPONSE = constants.TYPE.RESPONSE;
type ParserKind = typeof KIND_REQUEST | typeof KIND_RESPONSE;

export interface ParserCallbacks<K extends ParserKind> {
  onMessageBegin?: () => number | void;
  onHeadersComplete?: (info: K extends typeof KIND_REQUEST
    ? RequestHeadersComplete
    : ResponseHeadersComplete
  ) => number | void;
  onBody?: (body: Buffer) => number | void;
  onMessageComplete?: () => number | void;
}

export type RequestParserCallbacks = ParserCallbacks<typeof KIND_REQUEST>;
export type ResponseParserCallbacks = ParserCallbacks<typeof KIND_RESPONSE>;

const kPtr = Symbol('kPtr');
const kUrl = Symbol('kUrl');
const kStatusMessage = Symbol('kStatusMessage');
const kHeadersFields = Symbol('kHeadersFields');
const kHeadersValues = Symbol('kHeadersValues');
const kCallbacks = Symbol('kCallbacks');
const kType = Symbol('kType');

const parsersMap = new Map<number, HTTPParser>();

const methodNames = Object.fromEntries(
  Object.entries(constants.METHODS).map(([name, num]) => [num, name]),
) as Record<number, string>;

const readStringFrom = (ptr: number, len: number): string =>
  Buffer.from(llhttp_memory.buffer, ptr, len).toString();

const module = new WebAssembly.Module(readFileSync(__dirname + '/llhttp/llhttp.wasm'));
const inst = new WebAssembly.Instance(module, {
  env: {
    wasm_on_message_begin(parserPtr: number) {
      const parser = parsersMap.get(parserPtr)!;
      parser[kUrl] = '';
      parser[kStatusMessage] = '';
      parser[kHeadersFields] = [];
      parser[kHeadersValues] = [];
      return parser[kCallbacks].onMessageBegin?.() ?? 0;
    },
    // Request only
    wasm_on_url(parserPtr: number, at: number, length: number) {
      parsersMap.get(parserPtr)![kUrl] = readStringFrom(at, length);
      return 0;
    },
    // Response only
    wasm_on_status(parserPtr: number, at: number, length: number) {
      parsersMap.get(parserPtr)![kStatusMessage] = readStringFrom(at, length);
      return 0;
    },
    wasm_on_header_field(parserPtr: number, at: number, length: number) {
      parsersMap.get(parserPtr)![kHeadersFields].push(readStringFrom(at, length));
      return 0;
    },
    wasm_on_header_value(parserPtr: number, at: number, length: number) {
      parsersMap.get(parserPtr)![kHeadersValues].push(readStringFrom(at, length));
      return 0;
    },
    wasm_on_headers_complete(parserPtr: number) {
      const parser = parsersMap.get(parserPtr)!;
      const versionMajor = llhttp_get_version_major(parserPtr);
      const versionMinor = llhttp_get_version_minor(parserPtr);
      const rawHeaders: string[] = [];
      const upgrade = Boolean(llhttp_get_upgrade(parserPtr));
      const shouldKeepAlive = Boolean(llhttp_should_keep_alive(parserPtr));

      for (let c = 0; c < parser[kHeadersFields].length; c++) {
        rawHeaders.push(parser[kHeadersFields][c]!, parser[kHeadersValues][c]!);
      }

      if (parser[kType] === KIND_REQUEST) {
        const method = methodNames[llhttp_get_method(parserPtr)];
        const url = parser[kUrl];
        const cb = parser[kCallbacks] as ParserCallbacks<typeof KIND_REQUEST>;
        return cb.onHeadersComplete?.({
          versionMajor, versionMinor, rawHeaders, method, url, upgrade, shouldKeepAlive,
        }) ?? 0;
      } else {
        const statusCode = llhttp_get_status_code(parserPtr) as number;
        const statusMessage = parser[kStatusMessage];
        const cb = parser[kCallbacks] as ParserCallbacks<typeof KIND_RESPONSE>;
        return cb.onHeadersComplete?.({
          versionMajor, versionMinor, rawHeaders, statusCode, statusMessage, upgrade, shouldKeepAlive,
        }) ?? 0;
      }
    },
    wasm_on_body(parserPtr: number, at: number, length: number) {
      const parser = parsersMap.get(parserPtr)!;
      // Create a copy of the body chunk, as the underlying memory buffer is reused by llhttp and can be overwritten on the next callback call.
      // Maybe not the most efficient way, but it is simple and safe.
      const body = Buffer.from(new Uint8Array(llhttp_memory.buffer, at, length));
      return parser[kCallbacks].onBody?.(body) ?? 0;
    },
    wasm_on_message_complete(parserPtr: number) {
      return parsersMap.get(parserPtr)![kCallbacks].onMessageComplete?.() ?? 0;
    },
  },
});

const llhttp_memory = inst.exports.memory as WebAssembly.Memory;
const llhttp_alloc = inst.exports.llhttp_alloc as CallableFunction;
const llhttp_malloc = inst.exports.malloc as CallableFunction;
const llhttp_execute = inst.exports.llhttp_execute as CallableFunction;
const llhttp_get_type = inst.exports.llhttp_get_type as CallableFunction;
const llhttp_get_upgrade = inst.exports.llhttp_get_upgrade as CallableFunction;
const llhttp_should_keep_alive = inst.exports.llhttp_should_keep_alive as CallableFunction;
const llhttp_get_method = inst.exports.llhttp_get_method as CallableFunction;
const llhttp_get_status_code = inst.exports.llhttp_get_status_code as CallableFunction;
const llhttp_get_version_minor = inst.exports.llhttp_get_http_minor as CallableFunction;
const llhttp_get_version_major = inst.exports.llhttp_get_http_major as CallableFunction;
const llhttp_get_error_reason = inst.exports.llhttp_get_error_reason as CallableFunction;
const llhttp_get_error_pos = inst.exports.llhttp_get_error_pos as CallableFunction;
const llhttp_free = inst.exports.free as CallableFunction;

const initialize = inst.exports._initialize as CallableFunction;
initialize(); // wasi reactor

class HTTPParser {
  [kPtr]: number;
  [kUrl]: string = '';
  [kStatusMessage]: string = '';
  [kHeadersFields]: string[] = [];
  [kHeadersValues]: string[] = [];
  [kCallbacks]: ParserCallbacks<ParserKind>;
  [kType]: ParserKind;

  constructor(type: ParserKind, callbacks: ParserCallbacks<ParserKind>) {
    this[kType] = type;
    this[kCallbacks] = callbacks;
    this[kPtr] = llhttp_alloc(type);
    parsersMap.set(this[kPtr], this);
  }

  destroy() {
    // Guard against multiple calls to free/destroy.
    if (this[kPtr] === 0) {
      return;
    }
    parsersMap.delete(this[kPtr]);
    llhttp_free(this[kPtr]);
    this[kPtr] = 0;
  }

  execute(data: Buffer) {
    const ptr = llhttp_malloc(data.byteLength);
    const u8 = new Uint8Array(llhttp_memory.buffer);
    u8.set(data, ptr);
    const ret = llhttp_execute(this[kPtr], ptr, data.length);

    if (ret === constants.ERROR.PAUSED_UPGRADE) {
      // Find how many bytes llhttp consumed
      const errorPos = llhttp_get_error_pos(this[kPtr]);
      const consumed = errorPos - ptr;
      llhttp_free(ptr);
      // Return the unconsumed trailing bytes (tunnel/protocol data)
      return data.subarray(consumed);
    }

    llhttp_free(ptr);
    this.checkErr(ret);
    return null; // fully consumed
  }

  private checkErr(n: number) {
    if (n === constants.ERROR.OK) {
      return;
    }
    const errorPtr = llhttp_get_error_reason(this[kPtr]);
    const u8 = new Uint8Array(llhttp_memory.buffer);
    const len = u8.indexOf(0, errorPtr) - errorPtr;
    throw new Error(readStringFrom(errorPtr, len));
  }
}

export class HTTPRequestParser extends HTTPParser {
  constructor(callbacks: RequestParserCallbacks = {}) {
    super(KIND_REQUEST, callbacks);
  }
}

export class HTTPResponseParser extends HTTPParser {
  constructor(callbacks: ResponseParserCallbacks = {}) {
    super(KIND_RESPONSE, callbacks);
  }
}