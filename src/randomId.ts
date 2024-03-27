/**
 * Generate a random ID string.
 * @example
 * randomId()
 * // "f774b6c9c600f"
 */
export function randomId(): string {
  return Math.random().toString(16).slice(2)
}
