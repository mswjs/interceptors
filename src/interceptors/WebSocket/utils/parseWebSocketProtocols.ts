import { invariant } from 'outvariant'

function getDuplicateItems<T>(array: T[]): T[] {
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
    `The subprotocol '%s' is invalid.`,
    protocols.toString()
  )

  const protocolsList = Array.isArray(protocols) ? protocols : [protocols]
  const duplicateProtocols = getDuplicateItems(protocolsList)

  invariant(
    duplicateProtocols.length === 0,
    `The subprotocol '%s' is duplicated.`,
    duplicateProtocols[0]
  )

  return protocols
}
