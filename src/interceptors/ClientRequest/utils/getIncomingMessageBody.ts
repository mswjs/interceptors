import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'
import * as zlib from 'zlib'

const gunzip = zlib.createGunzip()

/**
 * Returns the data of the given `IncomingMessage`.
 */
export function getIncomingMessageBody(
  response: IncomingMessage
): Promise<string> {
  return new Promise((resolve, reject) => {
    const responseClone = response.pipe(new PassThrough())
    const stream =
      response.headers['content-encoding'] === 'gzip'
        ? responseClone.pipe(gunzip)
        : responseClone

    stream.setEncoding(response.readableEncoding || 'utf8')
    stream.on('data', resolve)
    stream.on('error', reject)
  })
}
