import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'
import * as zlib from 'zlib'
import { invariant } from 'outvariant'
import { Logger } from '@open-draft/logger'
import { DeferredPromise } from '@open-draft/deferred-promise'

const logger = new Logger('http getIncomingMessageBody')

export function getIncomingMessageBody(
  response: IncomingMessage
): Promise<string> {
  const responseBodyPromise = new DeferredPromise<string>()
  logger.info('cloning the original response...')

  invariant(
    response.readable,
    'Failed to get IncomingMessage body: stream not readable'
  )

  console.log('?', response.readable)

  // Pipe the original response to support non-clone
  // "response" input. No need to clone the response,
  // as we always have access to the full "response" input,
  // either a clone or an original one (in tests).
  const responseClone = response.pipe(new PassThrough())
  const stream =
    response.headers['content-encoding'] === 'gzip'
      ? responseClone.pipe(zlib.createGunzip())
      : responseClone

  const encoding = response.readableEncoding || 'utf8'
  const responseBuffer: Array<Buffer> = []

  stream.on('data', (chunk) => {
    logger.info('response body chunk:', chunk)
    responseBuffer.push(chunk)
  })

  stream.once('end', () => {
    logger.info('response body end')
    responseBodyPromise.resolve(
      Buffer.concat(responseBuffer).toString(encoding)
    )
  })

  stream.once('error', (error) => {
    logger.info('error while reading response body:', error)
    responseBodyPromise.reject(error)
  })

  return responseBodyPromise
}
