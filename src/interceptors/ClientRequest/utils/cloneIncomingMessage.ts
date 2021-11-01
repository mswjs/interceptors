import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'

export const IS_CLONE = Symbol('isClone')

export interface ClonedIncomingMessage extends IncomingMessage {
  [IS_CLONE]: boolean
}

export function cloneIncomingMessage(
  message: IncomingMessage
): ClonedIncomingMessage {
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

  return stream as unknown as ClonedIncomingMessage
}
