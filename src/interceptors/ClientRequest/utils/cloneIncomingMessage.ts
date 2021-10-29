import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'

const IS_CLONE = Symbol('isClone')

export function cloneIncomingMessage(
  message: IncomingMessage
): IncomingMessage {
  const stream = message.pipe(new PassThrough())
  const properties = [
    ...Object.getOwnPropertyNames(message),
    ...Object.getOwnPropertySymbols(message),
  ] as Array<keyof IncomingMessage>

  for (const propertyName of properties) {
    if (stream.hasOwnProperty(propertyName)) {
      continue
    }

    const propertyDescriptor = Object.getOwnPropertyDescriptor(
      message,
      propertyName
    )

    Object.defineProperty(stream, propertyName, {
      ...propertyDescriptor,
      value: message[propertyName],
    })
  }

  Object.defineProperty(stream, IS_CLONE, {
    enumerable: true,
    value: true,
  })

  return stream as unknown as IncomingMessage
}
