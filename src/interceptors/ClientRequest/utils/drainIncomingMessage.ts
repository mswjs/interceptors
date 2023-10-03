import { PassThrough } from 'stream'
import type { IncomingMessage } from 'http'

export function drainIncomingMessage(message: IncomingMessage): PassThrough {
  const drainStream = new PassThrough()

  message.once('error', (error) => {
    drainStream.emit('error', error)
  })

  message.pipe(drainStream)

  return drainStream
}
