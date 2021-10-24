import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'

const clonableProperties = ['headers', 'rawHeaders', 'trailers', 'rawTrailers']

export function cloneIncomingMessage(
  message: IncomingMessage
): IncomingMessage {
  const streamClone = message.pipe(new PassThrough())

  /**
   * Inherit the original message properties (i.e. "headers").
   * @note Cloning a readable stream is not sufficient,
   * libraries may depend on "res.headers" and such.
   */
  Object.defineProperties(
    streamClone,
    clonableProperties.reduce<PropertyDescriptorMap>(
      (properties, propertyName) => {
        properties[propertyName] = {
          // @ts-ignore
          value: message[propertyName],
        }
        return properties
      },
      {}
    )
  )

  return streamClone as unknown as IncomingMessage
}
