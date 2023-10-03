import { invariant } from 'outvariant'
import { PassThrough, Readable } from 'stream'

export function cloneReadable(source: Readable): Readable {
  invariant(source.readable, 'Failed to clone Readable: stream not readable')

  invariant(
    !source.readableEnded,
    'Failed to clone Readable: stream already read'
  )

  const clone = source.pipe(new PassThrough())
  return clone
}
