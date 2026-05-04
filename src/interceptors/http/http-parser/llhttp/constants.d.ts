export type IntDict = Readonly<Record<string, number>>;
type Simplify<T> = T extends any[] | Date ? T : {
    [K in keyof T]: T[K];
} & {};
export declare const ERROR: {
    readonly OK: 0;
    readonly INTERNAL: 1;
    readonly STRICT: 2;
    readonly CR_EXPECTED: 25;
    readonly LF_EXPECTED: 3;
    readonly UNEXPECTED_CONTENT_LENGTH: 4;
    readonly UNEXPECTED_SPACE: 30;
    readonly CLOSED_CONNECTION: 5;
    readonly INVALID_METHOD: 6;
    readonly INVALID_URL: 7;
    readonly INVALID_CONSTANT: 8;
    readonly INVALID_VERSION: 9;
    readonly INVALID_HEADER_TOKEN: 10;
    readonly INVALID_CONTENT_LENGTH: 11;
    readonly INVALID_CHUNK_SIZE: 12;
    readonly INVALID_STATUS: 13;
    readonly INVALID_EOF_STATE: 14;
    readonly INVALID_TRANSFER_ENCODING: 15;
    readonly CB_MESSAGE_BEGIN: 16;
    readonly CB_HEADERS_COMPLETE: 17;
    readonly CB_MESSAGE_COMPLETE: 18;
    readonly CB_CHUNK_HEADER: 19;
    readonly CB_CHUNK_COMPLETE: 20;
    readonly PAUSED: 21;
    readonly PAUSED_UPGRADE: 22;
    readonly PAUSED_H2_UPGRADE: 23;
    readonly USER: 24;
    readonly CB_URL_COMPLETE: 26;
    readonly CB_STATUS_COMPLETE: 27;
    readonly CB_METHOD_COMPLETE: 32;
    readonly CB_VERSION_COMPLETE: 33;
    readonly CB_HEADER_FIELD_COMPLETE: 28;
    readonly CB_HEADER_VALUE_COMPLETE: 29;
    readonly CB_CHUNK_EXTENSION_NAME_COMPLETE: 34;
    readonly CB_CHUNK_EXTENSION_VALUE_COMPLETE: 35;
    readonly CB_RESET: 31;
    readonly CB_PROTOCOL_COMPLETE: 38;
};
export declare const TYPE: {
    readonly BOTH: 0;
    readonly REQUEST: 1;
    readonly RESPONSE: 2;
};
export declare const FLAGS: {
    readonly CONNECTION_KEEP_ALIVE: number;
    readonly CONNECTION_CLOSE: number;
    readonly CONNECTION_UPGRADE: number;
    readonly CHUNKED: number;
    readonly UPGRADE: number;
    readonly CONTENT_LENGTH: number;
    readonly SKIPBODY: number;
    readonly TRAILING: number;
    readonly TRANSFER_ENCODING: number;
};
export declare const LENIENT_FLAGS: {
    readonly HEADERS: number;
    readonly CHUNKED_LENGTH: number;
    readonly KEEP_ALIVE: number;
    readonly TRANSFER_ENCODING: number;
    readonly VERSION: number;
    readonly DATA_AFTER_CLOSE: number;
    readonly OPTIONAL_LF_AFTER_CR: number;
    readonly OPTIONAL_CRLF_AFTER_CHUNK: number;
    readonly OPTIONAL_CR_BEFORE_LF: number;
    readonly SPACES_AFTER_CHUNK_SIZE: number;
    readonly HEADER_VALUE_RELAXED: number;
};
export declare const STATUSES: {
    readonly CONTINUE: 100;
    readonly SWITCHING_PROTOCOLS: 101;
    readonly PROCESSING: 102;
    readonly EARLY_HINTS: 103;
    readonly RESPONSE_IS_STALE: 110;
    readonly REVALIDATION_FAILED: 111;
    readonly DISCONNECTED_OPERATION: 112;
    readonly HEURISTIC_EXPIRATION: 113;
    readonly MISCELLANEOUS_WARNING: 199;
    readonly OK: 200;
    readonly CREATED: 201;
    readonly ACCEPTED: 202;
    readonly NON_AUTHORITATIVE_INFORMATION: 203;
    readonly NO_CONTENT: 204;
    readonly RESET_CONTENT: 205;
    readonly PARTIAL_CONTENT: 206;
    readonly MULTI_STATUS: 207;
    readonly ALREADY_REPORTED: 208;
    readonly TRANSFORMATION_APPLIED: 214;
    readonly IM_USED: 226;
    readonly MISCELLANEOUS_PERSISTENT_WARNING: 299;
    readonly MULTIPLE_CHOICES: 300;
    readonly MOVED_PERMANENTLY: 301;
    readonly FOUND: 302;
    readonly SEE_OTHER: 303;
    readonly NOT_MODIFIED: 304;
    readonly USE_PROXY: 305;
    readonly SWITCH_PROXY: 306;
    readonly TEMPORARY_REDIRECT: 307;
    readonly PERMANENT_REDIRECT: 308;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly PAYMENT_REQUIRED: 402;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly METHOD_NOT_ALLOWED: 405;
    readonly NOT_ACCEPTABLE: 406;
    readonly PROXY_AUTHENTICATION_REQUIRED: 407;
    readonly REQUEST_TIMEOUT: 408;
    readonly CONFLICT: 409;
    readonly GONE: 410;
    readonly LENGTH_REQUIRED: 411;
    readonly PRECONDITION_FAILED: 412;
    readonly PAYLOAD_TOO_LARGE: 413;
    readonly URI_TOO_LONG: 414;
    readonly UNSUPPORTED_MEDIA_TYPE: 415;
    readonly RANGE_NOT_SATISFIABLE: 416;
    readonly EXPECTATION_FAILED: 417;
    readonly IM_A_TEAPOT: 418;
    readonly PAGE_EXPIRED: 419;
    readonly ENHANCE_YOUR_CALM: 420;
    readonly MISDIRECTED_REQUEST: 421;
    readonly UNPROCESSABLE_ENTITY: 422;
    readonly LOCKED: 423;
    readonly FAILED_DEPENDENCY: 424;
    readonly TOO_EARLY: 425;
    readonly UPGRADE_REQUIRED: 426;
    readonly PRECONDITION_REQUIRED: 428;
    readonly TOO_MANY_REQUESTS: 429;
    readonly REQUEST_HEADER_FIELDS_TOO_LARGE_UNOFFICIAL: 430;
    readonly REQUEST_HEADER_FIELDS_TOO_LARGE: 431;
    readonly LOGIN_TIMEOUT: 440;
    readonly NO_RESPONSE: 444;
    readonly RETRY_WITH: 449;
    readonly BLOCKED_BY_PARENTAL_CONTROL: 450;
    readonly UNAVAILABLE_FOR_LEGAL_REASONS: 451;
    readonly CLIENT_CLOSED_LOAD_BALANCED_REQUEST: 460;
    readonly INVALID_X_FORWARDED_FOR: 463;
    readonly REQUEST_HEADER_TOO_LARGE: 494;
    readonly SSL_CERTIFICATE_ERROR: 495;
    readonly SSL_CERTIFICATE_REQUIRED: 496;
    readonly HTTP_REQUEST_SENT_TO_HTTPS_PORT: 497;
    readonly INVALID_TOKEN: 498;
    readonly CLIENT_CLOSED_REQUEST: 499;
    readonly INTERNAL_SERVER_ERROR: 500;
    readonly NOT_IMPLEMENTED: 501;
    readonly BAD_GATEWAY: 502;
    readonly SERVICE_UNAVAILABLE: 503;
    readonly GATEWAY_TIMEOUT: 504;
    readonly HTTP_VERSION_NOT_SUPPORTED: 505;
    readonly VARIANT_ALSO_NEGOTIATES: 506;
    readonly INSUFFICIENT_STORAGE: 507;
    readonly LOOP_DETECTED: 508;
    readonly BANDWIDTH_LIMIT_EXCEEDED: 509;
    readonly NOT_EXTENDED: 510;
    readonly NETWORK_AUTHENTICATION_REQUIRED: 511;
    readonly WEB_SERVER_UNKNOWN_ERROR: 520;
    readonly WEB_SERVER_IS_DOWN: 521;
    readonly CONNECTION_TIMEOUT: 522;
    readonly ORIGIN_IS_UNREACHABLE: 523;
    readonly TIMEOUT_OCCURED: 524;
    readonly SSL_HANDSHAKE_FAILED: 525;
    readonly INVALID_SSL_CERTIFICATE: 526;
    readonly RAILGUN_ERROR: 527;
    readonly SITE_IS_OVERLOADED: 529;
    readonly SITE_IS_FROZEN: 530;
    readonly IDENTITY_PROVIDER_AUTHENTICATION_ERROR: 561;
    readonly NETWORK_READ_TIMEOUT: 598;
    readonly NETWORK_CONNECT_TIMEOUT: 599;
};
export declare const FINISH: {
    readonly SAFE: 0;
    readonly SAFE_WITH_CB: 1;
    readonly UNSAFE: 2;
};
export declare const HEADER_STATE: {
    readonly GENERAL: 0;
    readonly CONNECTION: 1;
    readonly CONTENT_LENGTH: 2;
    readonly TRANSFER_ENCODING: 3;
    readonly UPGRADE: 4;
    readonly CONNECTION_KEEP_ALIVE: 5;
    readonly CONNECTION_CLOSE: 6;
    readonly CONNECTION_UPGRADE: 7;
    readonly TRANSFER_ENCODING_CHUNKED: 8;
};
export declare const METHODS_HTTP1_HEAD: {
    readonly HEAD: 2;
};
/**
 * HTTP methods as defined by RFC-9110 and other specifications.
 * @see https://httpwg.org/specs/rfc9110.html#method.definitions
 */
export declare const METHODS_BASIC_HTTP: {
    readonly POST: 3;
    readonly PUT: 4;
    readonly CONNECT: 5;
    readonly OPTIONS: 6;
    readonly TRACE: 7;
    /**
     * @see https://www.rfc-editor.org/rfc/rfc5789.html
     */
    readonly PATCH: 28;
    readonly LINK: 31;
    readonly UNLINK: 32;
    readonly HEAD: 2;
    readonly DELETE: 0;
    readonly GET: 1;
};
export declare const METHODS_WEBDAV: {
    readonly COPY: 8;
    readonly LOCK: 9;
    readonly MKCOL: 10;
    readonly MOVE: 11;
    readonly PROPFIND: 12;
    readonly PROPPATCH: 13;
    readonly SEARCH: 14;
    readonly UNLOCK: 15;
    readonly BIND: 16;
    readonly REBIND: 17;
    readonly UNBIND: 18;
    readonly ACL: 19;
};
export declare const METHODS_SUBVERSION: {
    readonly REPORT: 20;
    readonly MKACTIVITY: 21;
    readonly CHECKOUT: 22;
    readonly MERGE: 23;
};
export declare const METHODS_UPNP: {
    readonly 'M-SEARCH': 24;
    readonly NOTIFY: 25;
    readonly SUBSCRIBE: 26;
    readonly UNSUBSCRIBE: 27;
};
export declare const METHODS_CALDAV: {
    readonly MKCALENDAR: 30;
};
export declare const METHODS_NON_STANDARD: {
    /**
     * Not defined in any RFC but commonly used
     */
    readonly PURGE: 29;
    readonly QUERY: 46;
};
export declare const METHODS_ICECAST: {
    readonly SOURCE: 33;
};
export declare const METHODS_AIRPLAY: Simplify<Pick<typeof METHODS_BASIC_HTTP, "GET" | "POST">>;
export declare const METHODS_RAOP: {
    readonly FLUSH: 45;
};
export declare const METHODS_RTSP: {
    readonly FLUSH: 45;
    readonly GET: 1;
    readonly POST: 3;
    readonly OPTIONS: 6;
    readonly DESCRIBE: 35;
    readonly ANNOUNCE: 36;
    readonly SETUP: 37;
    readonly PLAY: 38;
    readonly PAUSE: 39;
    readonly TEARDOWN: 40;
    readonly GET_PARAMETER: 41;
    readonly SET_PARAMETER: 42;
    readonly REDIRECT: 43;
    readonly RECORD: 44;
};
export declare const METHODS_HTTP1: {
    readonly SOURCE: 33;
    /**
     * Not defined in any RFC but commonly used
     */
    readonly PURGE: 29;
    readonly QUERY: 46;
    readonly MKCALENDAR: 30;
    readonly 'M-SEARCH': 24;
    readonly NOTIFY: 25;
    readonly SUBSCRIBE: 26;
    readonly UNSUBSCRIBE: 27;
    readonly REPORT: 20;
    readonly MKACTIVITY: 21;
    readonly CHECKOUT: 22;
    readonly MERGE: 23;
    readonly COPY: 8;
    readonly LOCK: 9;
    readonly MKCOL: 10;
    readonly MOVE: 11;
    readonly PROPFIND: 12;
    readonly PROPPATCH: 13;
    readonly SEARCH: 14;
    readonly UNLOCK: 15;
    readonly BIND: 16;
    readonly REBIND: 17;
    readonly UNBIND: 18;
    readonly ACL: 19;
    readonly POST: 3;
    readonly PUT: 4;
    readonly CONNECT: 5;
    readonly OPTIONS: 6;
    readonly TRACE: 7;
    /**
     * @see https://www.rfc-editor.org/rfc/rfc5789.html
     */
    readonly PATCH: 28;
    readonly LINK: 31;
    readonly UNLINK: 32;
    readonly HEAD: 2;
    readonly DELETE: 0;
    readonly GET: 1;
};
export declare const METHODS_HTTP2: {
    /**
     * RFC-9113, section 11.6
     * @see https://www.rfc-editor.org/rfc/rfc9113.html#preface
     */
    readonly PRI: 34;
};
export declare const METHODS_HTTP: {
    /**
     * RFC-9113, section 11.6
     * @see https://www.rfc-editor.org/rfc/rfc9113.html#preface
     */
    readonly PRI: 34;
    readonly SOURCE: 33;
    /**
     * Not defined in any RFC but commonly used
     */
    readonly PURGE: 29;
    readonly QUERY: 46;
    readonly MKCALENDAR: 30;
    readonly 'M-SEARCH': 24;
    readonly NOTIFY: 25;
    readonly SUBSCRIBE: 26;
    readonly UNSUBSCRIBE: 27;
    readonly REPORT: 20;
    readonly MKACTIVITY: 21;
    readonly CHECKOUT: 22;
    readonly MERGE: 23;
    readonly COPY: 8;
    readonly LOCK: 9;
    readonly MKCOL: 10;
    readonly MOVE: 11;
    readonly PROPFIND: 12;
    readonly PROPPATCH: 13;
    readonly SEARCH: 14;
    readonly UNLOCK: 15;
    readonly BIND: 16;
    readonly REBIND: 17;
    readonly UNBIND: 18;
    readonly ACL: 19;
    readonly POST: 3;
    readonly PUT: 4;
    readonly CONNECT: 5;
    readonly OPTIONS: 6;
    readonly TRACE: 7;
    /**
     * @see https://www.rfc-editor.org/rfc/rfc5789.html
     */
    readonly PATCH: 28;
    readonly LINK: 31;
    readonly UNLINK: 32;
    readonly HEAD: 2;
    readonly DELETE: 0;
    readonly GET: 1;
};
export declare const METHODS: {
    readonly FLUSH: 45;
    readonly GET: 1;
    readonly POST: 3;
    readonly OPTIONS: 6;
    readonly DESCRIBE: 35;
    readonly ANNOUNCE: 36;
    readonly SETUP: 37;
    readonly PLAY: 38;
    readonly PAUSE: 39;
    readonly TEARDOWN: 40;
    readonly GET_PARAMETER: 41;
    readonly SET_PARAMETER: 42;
    readonly REDIRECT: 43;
    readonly RECORD: 44;
    /**
     * RFC-9113, section 11.6
     * @see https://www.rfc-editor.org/rfc/rfc9113.html#preface
     */
    readonly PRI: 34;
    readonly SOURCE: 33;
    /**
     * Not defined in any RFC but commonly used
     */
    readonly PURGE: 29;
    readonly QUERY: 46;
    readonly MKCALENDAR: 30;
    readonly 'M-SEARCH': 24;
    readonly NOTIFY: 25;
    readonly SUBSCRIBE: 26;
    readonly UNSUBSCRIBE: 27;
    readonly REPORT: 20;
    readonly MKACTIVITY: 21;
    readonly CHECKOUT: 22;
    readonly MERGE: 23;
    readonly COPY: 8;
    readonly LOCK: 9;
    readonly MKCOL: 10;
    readonly MOVE: 11;
    readonly PROPFIND: 12;
    readonly PROPPATCH: 13;
    readonly SEARCH: 14;
    readonly UNLOCK: 15;
    readonly BIND: 16;
    readonly REBIND: 17;
    readonly UNBIND: 18;
    readonly ACL: 19;
    readonly PUT: 4;
    readonly CONNECT: 5;
    readonly TRACE: 7;
    /**
     * @see https://www.rfc-editor.org/rfc/rfc5789.html
     */
    readonly PATCH: 28;
    readonly LINK: 31;
    readonly UNLINK: 32;
    readonly HEAD: 2;
    readonly DELETE: 0;
};
export declare const ALPHA: readonly ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z"];
export declare const NUM_MAP: {
    readonly 0: 0;
    readonly 1: 1;
    readonly 2: 2;
    readonly 3: 3;
    readonly 4: 4;
    readonly 5: 5;
    readonly 6: 6;
    readonly 7: 7;
    readonly 8: 8;
    readonly 9: 9;
};
export declare const HEX_MAP: {
    readonly 0: 0;
    readonly 1: 1;
    readonly 2: 2;
    readonly 3: 3;
    readonly 4: 4;
    readonly 5: 5;
    readonly 6: 6;
    readonly 7: 7;
    readonly 8: 8;
    readonly 9: 9;
    readonly A: 10;
    readonly B: 11;
    readonly C: 12;
    readonly D: 13;
    readonly E: 14;
    readonly F: 15;
    readonly a: 10;
    readonly b: 11;
    readonly c: 12;
    readonly d: 13;
    readonly e: 14;
    readonly f: 15;
};
export declare const DIGIT: readonly ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
export declare const ALPHANUM: readonly ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
export declare const MARK: readonly ["-", "_", ".", "!", "~", "*", "'", "(", ")"];
export declare const USERINFO_CHARS: readonly ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "_", ".", "!", "~", "*", "'", "(", ")", "%", ";", ":", "&", "=", "+", "$", ","];
export declare const URL_CHAR: readonly ["!", "\"", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/", ":", ";", "<", "=", ">", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}", "~", "A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
export declare const HEX: readonly ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"];
export declare const TOKEN: readonly ["!", "#", "$", "%", "&", "'", "*", "+", "-", ".", "^", "_", "`", "|", "~", "A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
export declare const HTAB: readonly ["\t"];
export declare const SP: readonly [" "];
export declare const HTAB_SP_VCHAR_OBS_TEXT: readonly ["\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
export declare const HEADER_CHARS: readonly ["\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
export declare const RELAXED_HEADER_CHARS: readonly [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 127, "\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
export declare const CONNECTION_TOKEN_CHARS: readonly ["\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
export declare const QDTEXT: readonly ["\t", " ", 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
export declare const MAJOR: {
    readonly 0: 0;
    readonly 1: 1;
    readonly 2: 2;
    readonly 3: 3;
    readonly 4: 4;
    readonly 5: 5;
    readonly 6: 6;
    readonly 7: 7;
    readonly 8: 8;
    readonly 9: 9;
};
export declare const MINOR: {
    readonly 0: 0;
    readonly 1: 1;
    readonly 2: 2;
    readonly 3: 3;
    readonly 4: 4;
    readonly 5: 5;
    readonly 6: 6;
    readonly 7: 7;
    readonly 8: 8;
    readonly 9: 9;
};
export declare const SPECIAL_HEADERS: {
    readonly connection: 1;
    readonly 'content-length': 2;
    readonly 'proxy-connection': 1;
    readonly 'transfer-encoding': 3;
    readonly upgrade: 4;
};
declare const _default: {
    ERROR: {
        readonly OK: 0;
        readonly INTERNAL: 1;
        readonly STRICT: 2;
        readonly CR_EXPECTED: 25;
        readonly LF_EXPECTED: 3;
        readonly UNEXPECTED_CONTENT_LENGTH: 4;
        readonly UNEXPECTED_SPACE: 30;
        readonly CLOSED_CONNECTION: 5;
        readonly INVALID_METHOD: 6;
        readonly INVALID_URL: 7;
        readonly INVALID_CONSTANT: 8;
        readonly INVALID_VERSION: 9;
        readonly INVALID_HEADER_TOKEN: 10;
        readonly INVALID_CONTENT_LENGTH: 11;
        readonly INVALID_CHUNK_SIZE: 12;
        readonly INVALID_STATUS: 13;
        readonly INVALID_EOF_STATE: 14;
        readonly INVALID_TRANSFER_ENCODING: 15;
        readonly CB_MESSAGE_BEGIN: 16;
        readonly CB_HEADERS_COMPLETE: 17;
        readonly CB_MESSAGE_COMPLETE: 18;
        readonly CB_CHUNK_HEADER: 19;
        readonly CB_CHUNK_COMPLETE: 20;
        readonly PAUSED: 21;
        readonly PAUSED_UPGRADE: 22;
        readonly PAUSED_H2_UPGRADE: 23;
        readonly USER: 24;
        readonly CB_URL_COMPLETE: 26;
        readonly CB_STATUS_COMPLETE: 27;
        readonly CB_METHOD_COMPLETE: 32;
        readonly CB_VERSION_COMPLETE: 33;
        readonly CB_HEADER_FIELD_COMPLETE: 28;
        readonly CB_HEADER_VALUE_COMPLETE: 29;
        readonly CB_CHUNK_EXTENSION_NAME_COMPLETE: 34;
        readonly CB_CHUNK_EXTENSION_VALUE_COMPLETE: 35;
        readonly CB_RESET: 31;
        readonly CB_PROTOCOL_COMPLETE: 38;
    };
    TYPE: {
        readonly BOTH: 0;
        readonly REQUEST: 1;
        readonly RESPONSE: 2;
    };
    FLAGS: {
        readonly CONNECTION_KEEP_ALIVE: number;
        readonly CONNECTION_CLOSE: number;
        readonly CONNECTION_UPGRADE: number;
        readonly CHUNKED: number;
        readonly UPGRADE: number;
        readonly CONTENT_LENGTH: number;
        readonly SKIPBODY: number;
        readonly TRAILING: number;
        readonly TRANSFER_ENCODING: number;
    };
    LENIENT_FLAGS: {
        readonly HEADERS: number;
        readonly CHUNKED_LENGTH: number;
        readonly KEEP_ALIVE: number;
        readonly TRANSFER_ENCODING: number;
        readonly VERSION: number;
        readonly DATA_AFTER_CLOSE: number;
        readonly OPTIONAL_LF_AFTER_CR: number;
        readonly OPTIONAL_CRLF_AFTER_CHUNK: number;
        readonly OPTIONAL_CR_BEFORE_LF: number;
        readonly SPACES_AFTER_CHUNK_SIZE: number;
        readonly HEADER_VALUE_RELAXED: number;
    };
    STATUSES: {
        readonly CONTINUE: 100;
        readonly SWITCHING_PROTOCOLS: 101;
        readonly PROCESSING: 102;
        readonly EARLY_HINTS: 103;
        readonly RESPONSE_IS_STALE: 110;
        readonly REVALIDATION_FAILED: 111;
        readonly DISCONNECTED_OPERATION: 112;
        readonly HEURISTIC_EXPIRATION: 113;
        readonly MISCELLANEOUS_WARNING: 199;
        readonly OK: 200;
        readonly CREATED: 201;
        readonly ACCEPTED: 202;
        readonly NON_AUTHORITATIVE_INFORMATION: 203;
        readonly NO_CONTENT: 204;
        readonly RESET_CONTENT: 205;
        readonly PARTIAL_CONTENT: 206;
        readonly MULTI_STATUS: 207;
        readonly ALREADY_REPORTED: 208;
        readonly TRANSFORMATION_APPLIED: 214;
        readonly IM_USED: 226;
        readonly MISCELLANEOUS_PERSISTENT_WARNING: 299;
        readonly MULTIPLE_CHOICES: 300;
        readonly MOVED_PERMANENTLY: 301;
        readonly FOUND: 302;
        readonly SEE_OTHER: 303;
        readonly NOT_MODIFIED: 304;
        readonly USE_PROXY: 305;
        readonly SWITCH_PROXY: 306;
        readonly TEMPORARY_REDIRECT: 307;
        readonly PERMANENT_REDIRECT: 308;
        readonly BAD_REQUEST: 400;
        readonly UNAUTHORIZED: 401;
        readonly PAYMENT_REQUIRED: 402;
        readonly FORBIDDEN: 403;
        readonly NOT_FOUND: 404;
        readonly METHOD_NOT_ALLOWED: 405;
        readonly NOT_ACCEPTABLE: 406;
        readonly PROXY_AUTHENTICATION_REQUIRED: 407;
        readonly REQUEST_TIMEOUT: 408;
        readonly CONFLICT: 409;
        readonly GONE: 410;
        readonly LENGTH_REQUIRED: 411;
        readonly PRECONDITION_FAILED: 412;
        readonly PAYLOAD_TOO_LARGE: 413;
        readonly URI_TOO_LONG: 414;
        readonly UNSUPPORTED_MEDIA_TYPE: 415;
        readonly RANGE_NOT_SATISFIABLE: 416;
        readonly EXPECTATION_FAILED: 417;
        readonly IM_A_TEAPOT: 418;
        readonly PAGE_EXPIRED: 419;
        readonly ENHANCE_YOUR_CALM: 420;
        readonly MISDIRECTED_REQUEST: 421;
        readonly UNPROCESSABLE_ENTITY: 422;
        readonly LOCKED: 423;
        readonly FAILED_DEPENDENCY: 424;
        readonly TOO_EARLY: 425;
        readonly UPGRADE_REQUIRED: 426;
        readonly PRECONDITION_REQUIRED: 428;
        readonly TOO_MANY_REQUESTS: 429;
        readonly REQUEST_HEADER_FIELDS_TOO_LARGE_UNOFFICIAL: 430;
        readonly REQUEST_HEADER_FIELDS_TOO_LARGE: 431;
        readonly LOGIN_TIMEOUT: 440;
        readonly NO_RESPONSE: 444;
        readonly RETRY_WITH: 449;
        readonly BLOCKED_BY_PARENTAL_CONTROL: 450;
        readonly UNAVAILABLE_FOR_LEGAL_REASONS: 451;
        readonly CLIENT_CLOSED_LOAD_BALANCED_REQUEST: 460;
        readonly INVALID_X_FORWARDED_FOR: 463;
        readonly REQUEST_HEADER_TOO_LARGE: 494;
        readonly SSL_CERTIFICATE_ERROR: 495;
        readonly SSL_CERTIFICATE_REQUIRED: 496;
        readonly HTTP_REQUEST_SENT_TO_HTTPS_PORT: 497;
        readonly INVALID_TOKEN: 498;
        readonly CLIENT_CLOSED_REQUEST: 499;
        readonly INTERNAL_SERVER_ERROR: 500;
        readonly NOT_IMPLEMENTED: 501;
        readonly BAD_GATEWAY: 502;
        readonly SERVICE_UNAVAILABLE: 503;
        readonly GATEWAY_TIMEOUT: 504;
        readonly HTTP_VERSION_NOT_SUPPORTED: 505;
        readonly VARIANT_ALSO_NEGOTIATES: 506;
        readonly INSUFFICIENT_STORAGE: 507;
        readonly LOOP_DETECTED: 508;
        readonly BANDWIDTH_LIMIT_EXCEEDED: 509;
        readonly NOT_EXTENDED: 510;
        readonly NETWORK_AUTHENTICATION_REQUIRED: 511;
        readonly WEB_SERVER_UNKNOWN_ERROR: 520;
        readonly WEB_SERVER_IS_DOWN: 521;
        readonly CONNECTION_TIMEOUT: 522;
        readonly ORIGIN_IS_UNREACHABLE: 523;
        readonly TIMEOUT_OCCURED: 524;
        readonly SSL_HANDSHAKE_FAILED: 525;
        readonly INVALID_SSL_CERTIFICATE: 526;
        readonly RAILGUN_ERROR: 527;
        readonly SITE_IS_OVERLOADED: 529;
        readonly SITE_IS_FROZEN: 530;
        readonly IDENTITY_PROVIDER_AUTHENTICATION_ERROR: 561;
        readonly NETWORK_READ_TIMEOUT: 598;
        readonly NETWORK_CONNECT_TIMEOUT: 599;
    };
    FINISH: {
        readonly SAFE: 0;
        readonly SAFE_WITH_CB: 1;
        readonly UNSAFE: 2;
    };
    HEADER_STATE: {
        readonly GENERAL: 0;
        readonly CONNECTION: 1;
        readonly CONTENT_LENGTH: 2;
        readonly TRANSFER_ENCODING: 3;
        readonly UPGRADE: 4;
        readonly CONNECTION_KEEP_ALIVE: 5;
        readonly CONNECTION_CLOSE: 6;
        readonly CONNECTION_UPGRADE: 7;
        readonly TRANSFER_ENCODING_CHUNKED: 8;
    };
    ALPHA: readonly ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z"];
    NUM_MAP: {
        readonly 0: 0;
        readonly 1: 1;
        readonly 2: 2;
        readonly 3: 3;
        readonly 4: 4;
        readonly 5: 5;
        readonly 6: 6;
        readonly 7: 7;
        readonly 8: 8;
        readonly 9: 9;
    };
    HEX_MAP: {
        readonly 0: 0;
        readonly 1: 1;
        readonly 2: 2;
        readonly 3: 3;
        readonly 4: 4;
        readonly 5: 5;
        readonly 6: 6;
        readonly 7: 7;
        readonly 8: 8;
        readonly 9: 9;
        readonly A: 10;
        readonly B: 11;
        readonly C: 12;
        readonly D: 13;
        readonly E: 14;
        readonly F: 15;
        readonly a: 10;
        readonly b: 11;
        readonly c: 12;
        readonly d: 13;
        readonly e: 14;
        readonly f: 15;
    };
    DIGIT: readonly ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    ALPHANUM: readonly ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    MARK: readonly ["-", "_", ".", "!", "~", "*", "'", "(", ")"];
    USERINFO_CHARS: readonly ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "_", ".", "!", "~", "*", "'", "(", ")", "%", ";", ":", "&", "=", "+", "$", ","];
    URL_CHAR: readonly ["!", "\"", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/", ":", ";", "<", "=", ">", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}", "~", "A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    HEX: readonly ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"];
    TOKEN: readonly ["!", "#", "$", "%", "&", "'", "*", "+", "-", ".", "^", "_", "`", "|", "~", "A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "F", "f", "G", "g", "H", "h", "I", "i", "J", "j", "K", "k", "L", "l", "M", "m", "N", "n", "O", "o", "P", "p", "Q", "q", "R", "r", "S", "s", "T", "t", "U", "u", "V", "v", "W", "w", "X", "x", "Y", "y", "Z", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    HEADER_CHARS: readonly ["\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
    RELAXED_HEADER_CHARS: readonly [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 127, "\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
    CONNECTION_TOKEN_CHARS: readonly ["\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
    QDTEXT: readonly ["\t", " ", 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
    HTAB_SP_VCHAR_OBS_TEXT: readonly ["\t", " ", 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
    MAJOR: {
        readonly 0: 0;
        readonly 1: 1;
        readonly 2: 2;
        readonly 3: 3;
        readonly 4: 4;
        readonly 5: 5;
        readonly 6: 6;
        readonly 7: 7;
        readonly 8: 8;
        readonly 9: 9;
    };
    MINOR: {
        readonly 0: 0;
        readonly 1: 1;
        readonly 2: 2;
        readonly 3: 3;
        readonly 4: 4;
        readonly 5: 5;
        readonly 6: 6;
        readonly 7: 7;
        readonly 8: 8;
        readonly 9: 9;
    };
    SPECIAL_HEADERS: {
        readonly connection: 1;
        readonly 'content-length': 2;
        readonly 'proxy-connection': 1;
        readonly 'transfer-encoding': 3;
        readonly upgrade: 4;
    };
    METHODS: {
        readonly FLUSH: 45;
        readonly GET: 1;
        readonly POST: 3;
        readonly OPTIONS: 6;
        readonly DESCRIBE: 35;
        readonly ANNOUNCE: 36;
        readonly SETUP: 37;
        readonly PLAY: 38;
        readonly PAUSE: 39;
        readonly TEARDOWN: 40;
        readonly GET_PARAMETER: 41;
        readonly SET_PARAMETER: 42;
        readonly REDIRECT: 43;
        readonly RECORD: 44;
        /**
         * RFC-9113, section 11.6
         * @see https://www.rfc-editor.org/rfc/rfc9113.html#preface
         */
        readonly PRI: 34;
        readonly SOURCE: 33;
        /**
         * Not defined in any RFC but commonly used
         */
        readonly PURGE: 29;
        readonly QUERY: 46;
        readonly MKCALENDAR: 30;
        readonly 'M-SEARCH': 24;
        readonly NOTIFY: 25;
        readonly SUBSCRIBE: 26;
        readonly UNSUBSCRIBE: 27;
        readonly REPORT: 20;
        readonly MKACTIVITY: 21;
        readonly CHECKOUT: 22;
        readonly MERGE: 23;
        readonly COPY: 8;
        readonly LOCK: 9;
        readonly MKCOL: 10;
        readonly MOVE: 11;
        readonly PROPFIND: 12;
        readonly PROPPATCH: 13;
        readonly SEARCH: 14;
        readonly UNLOCK: 15;
        readonly BIND: 16;
        readonly REBIND: 17;
        readonly UNBIND: 18;
        readonly ACL: 19;
        readonly PUT: 4;
        readonly CONNECT: 5;
        readonly TRACE: 7;
        /**
         * @see https://www.rfc-editor.org/rfc/rfc5789.html
         */
        readonly PATCH: 28;
        readonly LINK: 31;
        readonly UNLINK: 32;
        readonly HEAD: 2;
        readonly DELETE: 0;
    };
    METHODS_HTTP: {
        /**
         * RFC-9113, section 11.6
         * @see https://www.rfc-editor.org/rfc/rfc9113.html#preface
         */
        readonly PRI: 34;
        readonly SOURCE: 33;
        /**
         * Not defined in any RFC but commonly used
         */
        readonly PURGE: 29;
        readonly QUERY: 46;
        readonly MKCALENDAR: 30;
        readonly 'M-SEARCH': 24;
        readonly NOTIFY: 25;
        readonly SUBSCRIBE: 26;
        readonly UNSUBSCRIBE: 27;
        readonly REPORT: 20;
        readonly MKACTIVITY: 21;
        readonly CHECKOUT: 22;
        readonly MERGE: 23;
        readonly COPY: 8;
        readonly LOCK: 9;
        readonly MKCOL: 10;
        readonly MOVE: 11;
        readonly PROPFIND: 12;
        readonly PROPPATCH: 13;
        readonly SEARCH: 14;
        readonly UNLOCK: 15;
        readonly BIND: 16;
        readonly REBIND: 17;
        readonly UNBIND: 18;
        readonly ACL: 19;
        readonly POST: 3;
        readonly PUT: 4;
        readonly CONNECT: 5;
        readonly OPTIONS: 6;
        readonly TRACE: 7;
        /**
         * @see https://www.rfc-editor.org/rfc/rfc5789.html
         */
        readonly PATCH: 28;
        readonly LINK: 31;
        readonly UNLINK: 32;
        readonly HEAD: 2;
        readonly DELETE: 0;
        readonly GET: 1;
    };
    METHODS_HTTP1_HEAD: {
        readonly HEAD: 2;
    };
    METHODS_HTTP1: {
        readonly SOURCE: 33;
        /**
         * Not defined in any RFC but commonly used
         */
        readonly PURGE: 29;
        readonly QUERY: 46;
        readonly MKCALENDAR: 30;
        readonly 'M-SEARCH': 24;
        readonly NOTIFY: 25;
        readonly SUBSCRIBE: 26;
        readonly UNSUBSCRIBE: 27;
        readonly REPORT: 20;
        readonly MKACTIVITY: 21;
        readonly CHECKOUT: 22;
        readonly MERGE: 23;
        readonly COPY: 8;
        readonly LOCK: 9;
        readonly MKCOL: 10;
        readonly MOVE: 11;
        readonly PROPFIND: 12;
        readonly PROPPATCH: 13;
        readonly SEARCH: 14;
        readonly UNLOCK: 15;
        readonly BIND: 16;
        readonly REBIND: 17;
        readonly UNBIND: 18;
        readonly ACL: 19;
        readonly POST: 3;
        readonly PUT: 4;
        readonly CONNECT: 5;
        readonly OPTIONS: 6;
        readonly TRACE: 7;
        /**
         * @see https://www.rfc-editor.org/rfc/rfc5789.html
         */
        readonly PATCH: 28;
        readonly LINK: 31;
        readonly UNLINK: 32;
        readonly HEAD: 2;
        readonly DELETE: 0;
        readonly GET: 1;
    };
    METHODS_HTTP2: {
        /**
         * RFC-9113, section 11.6
         * @see https://www.rfc-editor.org/rfc/rfc9113.html#preface
         */
        readonly PRI: 34;
    };
    METHODS_ICECAST: {
        readonly SOURCE: 33;
    };
    METHODS_RTSP: {
        readonly FLUSH: 45;
        readonly GET: 1;
        readonly POST: 3;
        readonly OPTIONS: 6;
        readonly DESCRIBE: 35;
        readonly ANNOUNCE: 36;
        readonly SETUP: 37;
        readonly PLAY: 38;
        readonly PAUSE: 39;
        readonly TEARDOWN: 40;
        readonly GET_PARAMETER: 41;
        readonly SET_PARAMETER: 42;
        readonly REDIRECT: 43;
        readonly RECORD: 44;
    };
};
export default _default;
