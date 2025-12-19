import type { Socket } from 'node:net'
import { HTTPParser } from '_http_common'

/**
 * @see https://github.com/nodejs/node/blob/f3adc11e37b8bfaaa026ea85c1cf22e3a0e29ae9/lib/_http_common.js#L180
 */
export function freeParser(parser: HTTPParser<any>, socket?: Socket): void {
  if (parser._consumed) {
    parser.unconsume()
  }

  parser._headers = []
  parser._url = ''
  parser.socket = null
  parser.incoming = null
  parser.outgoing = null
  parser.maxHeaderPairs = 2000
  parser._consumed = false
  parser.onIncoming = null

  parser[HTTPParser.kOnHeaders] = null
  parser[HTTPParser.kOnHeadersComplete] = null
  parser[HTTPParser.kOnMessageBegin] = null
  parser[HTTPParser.kOnMessageComplete] = null
  parser[HTTPParser.kOnBody] = null
  parser[HTTPParser.kOnExecute] = null
  parser[HTTPParser.kOnTimeout] = null

  parser.remove()
  parser.free()

  if (socket) {
    // @ts-expect-error Node.js internals.
    socket.parser = null
  }
}
