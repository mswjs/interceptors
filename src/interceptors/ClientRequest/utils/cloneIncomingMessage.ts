import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'

/**
 * Clones a given `http.IncomingMessage` instance.
 */
export function cloneIncomingMessage(
  message: IncomingMessage
): IncomingMessage {
  const clone = message.pipe(new PassThrough())

  // Inherit all direct "IncomingMessage" properties.
  inheritProperties(message, clone)

  // Deeply inherit the message prototypes (Readable, Stream, EventEmitter, etc.).
  const clonedPrototype = Object.create(IncomingMessage.prototype)
  getPrototypes(clone).forEach((prototype) => {
    inheritProperties(prototype, clonedPrototype)
  })
  Object.setPrototypeOf(clone, clonedPrototype)

  return clone as unknown as IncomingMessage
}

/**
 * Returns a list of all prototypes the given object extends.
 */
function getPrototypes(source: object): object[] {
  const prototypes: object[] = []
  let current = source

  while ((current = Object.getPrototypeOf(current))) {
    prototypes.push(current)
  }

  return prototypes
}

/**
 * Inherits a given target object properties and symbols
 * onto the given source object.
 * @param source Object which should acquire properties.
 * @param target Object to inherit the properties from.
 */
function inheritProperties(source: object, target: object): void {
  const properties = [
    ...Object.getOwnPropertyNames(source),
    ...Object.getOwnPropertySymbols(source),
  ]

  for (const property of properties) {
    if (target.hasOwnProperty(property)) {
      continue
    }

    const descriptor = Object.getOwnPropertyDescriptor(source, property)
    if (!descriptor) {
      continue
    }

    Object.defineProperty(target, property, descriptor)
  }
}
