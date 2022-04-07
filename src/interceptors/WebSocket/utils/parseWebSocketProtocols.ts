import { invariant } from 'outvariant'
import { WEBSOCKET_CONSTRUCTOR_ERROR } from './parseWebSocketUrl'

function getDuplicateItems<ItemType extends unknown>(
  array: ItemType[]
): ItemType[] {
  const duplicates = []

  for (const item of array) {
    if (array.indexOf(item) !== array.lastIndexOf(item)) {
      duplicates.push(item)
    }
  }

  return duplicates
}

/**
 * Validate the given WebSocket protocols.
 */
export function parseWebSocketProtocols(
  protocols: string[] | string
): string[] | string {
  invariant(
    Array.isArray(protocols) || typeof protocols === 'string',
    `%s: The subprotocol '%s' is invalid.`,
    WEBSOCKET_CONSTRUCTOR_ERROR,
    protocols.toString()
  )

  const protocolsList = Array.isArray(protocols) ? protocols : [protocols]
  const duplicateProtocols = getDuplicateItems(protocolsList)

  invariant(
    duplicateProtocols.length === 0,
    `%s: The subprotocol '%s' is duplicated.`,
    WEBSOCKET_CONSTRUCTOR_ERROR,
    duplicateProtocols[0]
  )

  return protocols
}
